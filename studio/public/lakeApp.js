// Lake application
// Completely independent from map application

// Global variables
let state = {};
let searchDebounceTimer = null;
// Display rotation used for animation (may exceed 0-359 during animation)
let displayRotation = 0;

// DOM Elements
const lakeSearchInput = document.getElementById('lake-search');
const lakeSearchResults = document.getElementById('lake-search-results');
const labelLakeName = document.getElementById('label-lake-name');
const labelRegion = document.getElementById('label-region');
const labelCoordinates = document.getElementById('label-coordinates');
const lakeLabelName = document.getElementById('lake-label-name');
const lakeLabelRegion = document.getElementById('lake-label-region');
const lakeLabelCoordinates = document.getElementById('lake-label-coordinates');
const lakeFrame = document.getElementById('lake-frame');
const lakeSilhouetteSvg = document.getElementById('lake-silhouette-svg');
const previewContainer = document.getElementById('preview-container');
const documentViewport = document.getElementById('document-viewport');
const lakeSilhouetteArea = document.getElementById('lake-silhouette-area');
const exportPngButton = document.getElementById('export-png');
const exportSvgButton = document.getElementById('export-svg');
const accordion = document.getElementById('sidebar-accordion');
const rotateLeftButton = document.getElementById('rotate-left');
const rotateRightButton = document.getElementById('rotate-right');
const resetButton = document.getElementById('reset-app-button');
const deleteButton = document.getElementById('delete-button');

// Create debug overlay for rotated bounds visualization
// Position with fixed/absolute so we can manually apply screen-space transforms
const debugBoundingBox = document.createElement('div');
debugBoundingBox.id = 'debug-rotated-bounds';
debugBoundingBox.style.cssText = `
  position: fixed;
  /*border: 2px solid red;*/
  pointer-events: none;
  display: none;
  z-index: 9999;
  box-sizing: border-box;
`;
document.body.appendChild(debugBoundingBox);

// Normalize region strings to: City, Province/State, Country
function normalizeRegion(region) {
  if (!region || typeof region !== 'string') return '';

  const countryCandidates = new Set(['canada', 'united states', 'united states of america', 'usa', 'us']);

  const provincesStates = new Set([
    // Canadian provinces + territories
    'ontario','quebec','nova scotia','new brunswick','manitoba','british columbia','prince edward island','saskatchewan','alberta','newfoundland and labrador','northwest territories','yukon','nunavut',
    // US states (lowercased short list for matching)
    'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming'
  ]);

  const parts = region.split(',').map(s => s.trim()).filter(Boolean);
  // dedupe
  const unique = parts.filter((v, i, a) => a.indexOf(v) === i);

  let country = '';
  let province = '';
  let city = '';

  // find country (last matching)
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i].toLowerCase();
    if (countryCandidates.has(p)) {
      country = unique.splice(i, 1)[0];
      break;
    }
  }

  // find province/state
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i].toLowerCase();
    // handle cases like 'Ontario' or 'Province of Ontario'
    const simple = p.replace(/^province of |^state of /, '').trim();
    if (provincesStates.has(simple)) {
      province = unique.splice(i, 1)[0];
      break;
    }
  }

  // remaining parts: prefer the most specific (first non-empty)
  if (unique.length > 0) {
    // try to pick a part that doesn't look like 'district' or 'county municipality' unless nothing else
    const candidate = unique.find(u => !/district|municipality|county|region/i.test(u)) || unique[0];
    city = candidate;
  }

  const outParts = [];
  if (city) outParts.push(city);
  if (province) outParts.push(province);
  if (country) outParts.push(country);

  // fallback: if nothing matched province but there are still parts, join remaining
  if (outParts.length === 0 && unique.length > 0) {
    return unique.join(', ');
  }

  return outParts.join(', ');
}

// Update export/template links to include current design ID from URL
function updateExportLinks() {
  try {
    if (typeof designId !== 'string' || !designId) return;

    const btnCeramic = document.getElementById('btn-ceramic');
    const btnNotebook = document.getElementById('btn-notebook');
    const btnLakeSvg = document.getElementById('btn-lake-svg');
    const btnLakePng = document.getElementById('btn-lake-png');
    const btnShop = document.getElementById('btn-shop');

    if (btnCeramic) btnCeramic.href = `https://api.lakelines.co/design/ceramic-mug/${designId}`;
    if (btnNotebook) btnNotebook.href = `https://api.lakelines.co/design/spiral-notebook/${designId}`;
    if (btnLakeSvg) btnLakeSvg.href = `https://api.lakelines.co/design/lake/svg/${designId}`;
    if (btnLakePng) btnLakePng.href = `https://api.lakelines.co/design/lake/png/${designId}?width=800&height=800`;
    if (btnShop) btnShop.href = `https://shop.lakelines.co/?design_id=${designId}`;
  } catch (err) {
    console.warn('Failed to update export links:', err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// State Management
// ────────────────────────────────────────────────────────────────────────────

/*
 * Load the lake state using API
 */
async function loadLakeState() {

  try {

    // Load https://api.lakelines.co/design/:id and populate state with response
    const response = await fetch(`https://api.lakelines.co/design/${designId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Design state load failed with status ${response.status}`);
    }

    const data = await response.json();
    const newState = data.design.state_json;

    if (!newState) {
      throw new Error('API response missing state field');
    }

    // Save state to global variable
    state = Object.assign({}, newState);

    // Normalize region formatting for older saved states
    if (state.region) {
      state.region = normalizeRegion(state.region);
    }

    // Backward compatibility: remove customer-controlled font and colour properties
    // These are now controlled by template configuration, not stored in design state
    delete state.colourId;
    delete state.fontFamily;

    console.log('[Load Lake State] Lake state loaded:', designId);

  } catch (error) {
    throw new Error(`Failed to load design state: ${error.message}`);
  }

}

/*
 * Save the lake state using the API
 */
async function saveLakeState() {

  try {

    // Load https://api.lakelines.co/design/edit and data with designId and state
    const response = await fetch(`https://api.lakelines.co/design/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ design_id: designId, state: state })
    });

    if (!response.ok) {
      throw new Error(`Design state save failed with status ${response.status}`);
    }

    console.log('[Save Lake State] Lake state saved:', designId);

  } catch (error) {
    throw new Error(`Failed to save design state: ${error.message}`);
  }
  
}

/*
 * Reset the lake state back to the default
 */
async function resetLakeState() {

  try {

    // Load https://api.lakelines.co/design/reset and data with designId and state
    const response = await fetch(`https://api.lakelines.co/design/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ design_id: designId })
    });

    if (!response.ok) {
      throw new Error(`Design state reset failed with status ${response.status}`);
    }

    console.log('[Reset Lake State] Lake state reset:', designId);

  } catch (error) {
    throw new Error(`Failed to save design state: ${error.message}`);
  }

}

/*
 * Delete the current design
 */
async function deleteDesign() {

  console.log('[Delete Design] Attempting to delete design:', designId);

  const confirmed = await showConfirm({
    title: 'Delete Design',
    message: 'Are you sure you want to permanently delete this design? This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    danger: true
  });

  if (!confirmed) {
    console.log('[Delete Design] Delete cancelled by user');
    return;
  }

  try {

    console.log('[Delete Design] Sending delete request for design:', designId);

    // Call the delete endpoint
    const response = await fetch(`https://api.lakelines.co/design/delete/${designId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ design_id: designId })
    });

    if (!response.ok) {
      throw new Error(`Design deletion failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log('[Delete Design] Design deleted successfully:', data);

    // Navigate back to home page after successful deletion
    console.log('[Delete Design] Redirecting to home page');
    window.location.href = '/';

  } catch (error) {
    console.error('[Delete Design] Error deleting design:', error);
    alert(`Failed to delete design: ${error.message}`);
  }

}

// ────────────────────────────────────────────────────────────────────────────
// Document Scaling
// ────────────────────────────────────────────────────────────────────────────

const ROTATION_STEP = 15;
const ANIMATION_DURATION = 300;
// const ZOOM_STEP = 0.1;
// const MIN_ZOOM = 0.5;
// const MAX_ZOOM = 3;

function updateDocumentScale() {

  if (!previewContainer) return;

  // 3:4 portrait aspect ratio
  const ASPECT_WIDTH = 3;
  const ASPECT_HEIGHT = 4;
  const docWidth = 600;
  const docHeight = Math.round(docWidth * (ASPECT_HEIGHT / ASPECT_WIDTH));

  // Set CSS variables for document size
  previewContainer.style.setProperty('--doc-width', `${docWidth}px`);
  previewContainer.style.setProperty('--doc-height', `${docHeight}px`);

  const availableWidth = previewContainer.clientWidth;
  const availableHeight = previewContainer.clientHeight;

  if (availableWidth <= 0 || availableHeight <= 0) return;

  // Calculate scale to fit within available space
  const scaleX = availableWidth / docWidth;
  const scaleY = availableHeight / docHeight;
  const scale = Math.min(scaleX, scaleY);

  // Apply scale via CSS variable
  previewContainer.style.setProperty('--doc-scale', String(scale));

}

function setupDocumentScaleObserver() {

  if (!previewContainer || typeof ResizeObserver === 'undefined') return;

  const observer = new ResizeObserver(() => {
    updateDocumentScale();
    // Reapply auto-fit layout when container resizes
    if (state.geojson) {
      applyAutoFitLayout();
    }
  });

  observer.observe(previewContainer);

  // Initial scale calculation
  updateDocumentScale();
  
  // Apply any saved rotation to silhouette
  // Disable transitions during initial hydration to prevent animation on load
  if (lakeSilhouetteArea) {
    lakeSilhouetteArea.classList.add('no-transition');
    applyTransforms();
    
    // NOTE: Do NOT call applyAutoFitLayout() here - SVG viewBox is not yet set.
    // It will be called by renderPreview() once lake geometry is loaded.
    
    // Re-enable transitions after a frame so user interactions animate normally
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (lakeSilhouetteArea) {
          lakeSilhouetteArea.classList.remove('no-transition');
        }
      });
    });
  } else {
    applyTransforms();
  }

}

function applyTransforms() {

  if (!lakeSilhouetteSvg) return;
  // Only apply rotation; use displayRotation (may be animated)
  const transform = `rotate(${displayRotation}deg)`;
  lakeSilhouetteSvg.style.transform = transform;

}

/**
 * Calculate rotated bounding box of all points
 * Returns {minX, maxX, minY, maxY} in the rotated coordinate space
 */
function calculateRotatedBounds(points, centerLon, centerLat, rotationDegrees) {

  if (!points || points.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  const angle = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  points.forEach(([lon, lat]) => {
    const dx = lon - centerLon;
    const dy = lat - centerLat;
    const rotX = cos * dx - sin * dy;
    const rotY = sin * dx + cos * dy;

    minX = Math.min(minX, rotX);
    maxX = Math.max(maxX, rotX);
    minY = Math.min(minY, rotY);
    maxY = Math.max(maxY, rotY);
  });

  return { minX, maxX, minY, maxY };

}

/**
 * Calculate auto-fit layout (scale and offsets) for SVG rendering
 * Ensures lake fits within canvas with consistent padding, accounting for rotation
 * Returns scale, translate, and debug bounds for containment validation
 */
function calculateAutoFitLayout(svgElement, rotationDegrees) {

  if (!svgElement) {
    return { scale: 1, translateX: 0, translateY: 0, rotW: 100, rotH: 100, rotCenterX: 50, rotCenterY: 50 };
  }

  // Get current viewBox
  const viewBox = svgElement.getAttribute('viewBox');
  if (!viewBox) {
    return { scale: 1, translateX: 0, translateY: 0, rotW: 100, rotH: 100, rotCenterX: 50, rotCenterY: 50 };
  }

  const parts = viewBox.split(/[\s,]+/);
  const vbX = parseFloat(parts[0]) || 0;
  const vbY = parseFloat(parts[1]) || 0;
  const vbW = parseFloat(parts[2]) || 100;
  const vbH = parseFloat(parts[3]) || 100;

  // Get container size and accurately account for element padding
  const rect = lakeSilhouetteArea.getBoundingClientRect();
  const cs = window.getComputedStyle(lakeSilhouetteArea);
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const padRight = parseFloat(cs.paddingRight) || 0;
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const containerW = Math.max(0, rect.width - padLeft - padRight);
  const containerH = Math.max(0, rect.height - padTop - padBottom);

  if (containerW <= 0 || containerH <= 0) {
    return { scale: 1, translateX: 0, translateY: 0, rotW: 100, rotH: 100, rotCenterX: 50, rotCenterY: 50 };
  }

  // Model the rendered lake content in the same pixel space the SVG uses on screen.
  // The SVG element itself fills the silhouette area, while the viewBox content is
  // centered inside it via preserveAspectRatio="xMidYMid meet".
  const angle = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const viewBoxAspect = vbW / vbH;
  const containerAspect = containerW / containerH;

  // Calculate how the viewBox content actually renders in pixel space
  // with preserveAspectRatio="xMidYMid meet"
  let renderedW = containerW;
  let renderedH = containerH;

  if (viewBoxAspect > containerAspect) {
    // ViewBox is wider than container: scale to fit width, center vertically
    renderedH = containerW / viewBoxAspect;
  } else {
    // Container is wider than viewBox: scale to fit height, center horizontally
    renderedW = containerH * viewBoxAspect;
  }

  // CRITICAL: Use actual rendered dimensions for scale calculation
  // The rendered dimensions are now based on the corrected viewBox from the lake geometry
  // DO NOT apply rotation to calculate scale - let the container and viewBox aspect ratio determine it
  // Rotation is applied by CSS transform AFTER scaling
  // Use a small internal padding (as pixels) to avoid touching edges
  const internalPadding = Math.max(8, Math.min(containerW, containerH) * 0.02);
  
  // Calculate scale to fit rendered lake within container with padding
  const scaleX = (containerW - 2 * internalPadding) / renderedW;
  const scaleY = (containerH - 2 * internalPadding) / renderedH;
  const scale = Math.max(0.05, Math.min(1.0, scaleX, scaleY));

  // Calculate center point for centering
  const rotCenterX = vbW / 2;
  const rotCenterY = vbH / 2;

  // The SVG content is already centered within the silhouette area by
  // preserveAspectRatio="xMidYMid meet", so re-fit only needs to scale.
  // Keep translation at zero to avoid drift during rotation.
  const translateX = 0;
  const translateY = 0;

  return { 
    scale, 
    translateX, 
    translateY, 
    rotW: renderedW,
    rotH: renderedH,
    rotCenterX,
    rotCenterY,
    containerW,
    containerH
  };

}

/**
 * Visualize the rotated bounding box for debugging
 * Shows actual rendered bounds of the lake paths (after all CSS transforms)
 * If the lake extends outside this box, the math in calculateAutoFitLayout() is wrong
 */
function visualizeDebugBounds(layout) {
  
  if (!debugBoundingBox || !lakeSilhouetteSvg) {
    return;
  }

  // Get all the path elements (the actual lake geometry)
  const paths = lakeSilhouetteSvg.querySelectorAll('path');
  if (paths.length === 0) {
    debugBoundingBox.style.display = 'none';
    return;
  }

  // Get bounding client rect of all paths
  // This gives us screen coordinates AFTER all CSS transforms are applied
  let minScreenX = Infinity, minScreenY = Infinity;
  let maxScreenX = -Infinity, maxScreenY = -Infinity;
  
  paths.forEach(path => {
    const rect = path.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      minScreenX = Math.min(minScreenX, rect.left);
      minScreenY = Math.min(minScreenY, rect.top);
      maxScreenX = Math.max(maxScreenX, rect.right);
      maxScreenY = Math.max(maxScreenY, rect.bottom);
    }
  });

  if (!isFinite(minScreenX)) {
    debugBoundingBox.style.display = 'none';
    return;
  }

  // Get container position for reference
  const containerRect = lakeSilhouetteArea.getBoundingClientRect();
  
  console.log('[DebugBounds] Lake paths screen bounds:', {
    minX: minScreenX, minY: minScreenY,
    maxX: maxScreenX, maxY: maxScreenY,
    w: maxScreenX - minScreenX, h: maxScreenY - minScreenY
  });
  console.log('[DebugBounds] Container bounds:', {
    left: containerRect.left, top: containerRect.top,
    right: containerRect.right, bottom: containerRect.bottom,
    w: containerRect.width, h: containerRect.height
  });
  
  // Check if lake is within container
  const withinX = minScreenX >= containerRect.left && maxScreenX <= containerRect.right;
  const withinY = minScreenY >= containerRect.top && maxScreenY <= containerRect.bottom;
  console.log('[DebugBounds] Lake within container:', { withinX, withinY });

  // Position debug box to exactly match rendered lake bounds
  debugBoundingBox.style.left = `${minScreenX}px`;
  debugBoundingBox.style.top = `${minScreenY}px`;
  debugBoundingBox.style.width = `${maxScreenX - minScreenX}px`;
  debugBoundingBox.style.height = `${maxScreenY - minScreenY}px`;
  debugBoundingBox.style.display = 'block';

}

/**
 * Apply auto-fit layout based on current container size and rotation
 * Applies correct transform order: translate, scale, rotate
 */
function applyAutoFitLayout() {

  if (!lakeSilhouetteArea || !lakeSilhouetteSvg) return;
  if (!state.geojson) return;

  const layout = calculateAutoFitLayout(lakeSilhouetteSvg, state.rotation || 0);
  
  // Apply complete transform in correct order: translate → scale → rotate
  // This ensures the lake scales around its rotated bounds center and stays centered
  const transform = `translate(${layout.translateX}px, ${layout.translateY}px) scale(${layout.scale}) rotate(${state.rotation || 0}deg)`;
  lakeSilhouetteSvg.style.transform = transform;
  lakeSilhouetteSvg.style.transformOrigin = 'center center';
  
  // Update debug visualization
  visualizeDebugBounds(layout);

}

/**
 * Reframe lake after rotation
 * Triggers smooth animated rotation, scaling, and translation to fit within bounds
 */
async function reframeAfterRotation() {

  if (!lakeSilhouetteArea || !lakeSilhouetteSvg) return;

  // Get auto-fit layout with complete transform for rotated bounds
  // Use displayRotation when computing layout to match animated/display angle
  const layout = calculateAutoFitLayout(lakeSilhouetteSvg, displayRotation || state.rotation);

  // Enable smooth animation for all transform components
  lakeSilhouetteSvg.style.transition = 'transform 300ms ease-out';
  lakeSilhouetteSvg.style.transformOrigin = 'center center';
  
  // Apply complete transform in correct order: translate → scale → rotate
  const transform = `translate(${layout.translateX}px, ${layout.translateY}px) scale(${layout.scale}) rotate(${displayRotation || state.rotation}deg)`;
  lakeSilhouetteSvg.style.transform = transform;

  console.log('[Reframe After Rotation] Applied transform:', transform, 'scale:', layout.scale, 'rotate:', state.rotation);

  // Update debug visualization
  visualizeDebugBounds(layout);

  // After transition ends, remove transition to avoid interfering with future animations
  return new Promise((resolve) => {
    const onTransitionEnd = () => {
      lakeSilhouetteSvg.removeEventListener('transitionend', onTransitionEnd);
      lakeSilhouetteSvg.style.transition = '';
      resolve();
    };
    lakeSilhouetteSvg.addEventListener('transitionend', onTransitionEnd);
    // Fallback timeout in case transitionend doesn't fire
    setTimeout(() => {
      lakeSilhouetteSvg.removeEventListener('transitionend', onTransitionEnd);
      lakeSilhouetteSvg.style.transition = '';
      resolve();
    }, 350);
  });

}

function applyRotation(deltaDegrees) {
  const prevLogical = (state.rotation || 0);
  const logicalTarget = prevLogical + deltaDegrees; // Allow unbounded accumulation

  // Save logical rotation immediately (for persistence) but keep displayRotation for animation
  state.rotation = logicalTarget;
  saveLakeState();

  // Compute shortest angular delta from current displayed angle to target logical angle
  const curDisplay = displayRotation;
  // Smallest difference in range -180..180
  const diff = ((logicalTarget - curDisplay + 540) % 360) - 180;
  const targetDisplay = curDisplay + diff;

  console.log('[Rotation] Previous:', curDisplay, 'TargetLogical:', logicalTarget, 'Animated Delta:', diff);

  // Animate to computed target display angle
  animateRotationTo(targetDisplay, logicalTarget);

}

/**
 * Animate rotation to a display angle (may be outside 0-359) then normalize
 * @param {number} targetDisplay - target angle for animation (can exceed 360)
 * @param {number} logicalTarget - normalized logical angle 0-359 to store
 */
function animateRotationTo(targetDisplay, logicalTarget) {
  if (!lakeSilhouetteSvg) return Promise.resolve();

  // Set transition and compute layout for the animated target angle
  lakeSilhouetteSvg.style.transition = `transform ${ANIMATION_DURATION}ms ease-out`;
  const layout = calculateAutoFitLayout(lakeSilhouetteSvg, targetDisplay);
  const transform = `translate(${layout.translateX}px, ${layout.translateY}px) scale(${layout.scale}) rotate(${targetDisplay}deg)`;

  // Apply transform to start animation
  // Ensure displayRotation reflects start->end animation tracking
  lakeSilhouetteSvg.style.transform = transform;

  // Log debug info
  console.log('[Rotation][Animate] From:', displayRotation, 'To(display):', targetDisplay, 'Logical target:', logicalTarget);

  return new Promise((resolve) => {
    const onEnd = () => {
      lakeSilhouetteSvg.removeEventListener('transitionend', onEnd);
      lakeSilhouetteSvg.style.transition = '';

      // After animation, displayRotation matches the animation target (unbounded)
      displayRotation = targetDisplay;

      // Re-apply final layout with animation target angle (no transition)
      const finalLayout = calculateAutoFitLayout(lakeSilhouetteSvg, displayRotation);
      lakeSilhouetteSvg.style.transform = `translate(${finalLayout.translateX}px, ${finalLayout.translateY}px) scale(${finalLayout.scale}) rotate(${displayRotation}deg)`;

      resolve();
    };

    lakeSilhouetteSvg.addEventListener('transitionend', onEnd);

    // Fallback in case transitionend doesn't fire
    setTimeout(() => {
      lakeSilhouetteSvg.removeEventListener('transitionend', onEnd);
      lakeSilhouetteSvg.style.transition = '';
      displayRotation = targetDisplay;
      const finalLayout = calculateAutoFitLayout(lakeSilhouetteSvg, displayRotation);
      lakeSilhouetteSvg.style.transform = `translate(${finalLayout.translateX}px, ${finalLayout.translateY}px) scale(${finalLayout.scale}) rotate(${displayRotation}deg)`;
      resolve();
    }, ANIMATION_DURATION + 120);
  });
}

function applyPan(dx, dy) {

  state.panX += dx;
  state.panY += dy;
  applyTransforms();
  saveLakeState();

}

async function resetApp() {

  const confirmed = await showConfirm({
    title: 'Reset Design',
    message: 'Are you sure you want to reset this design? This action cannot be undone.',
    confirmText: 'Reset',
    cancelText: 'Cancel',
    danger: true
  });

  if (!confirmed) return;
  
  await resetLakeState();
  await loadLakeState();

  applyTransforms();
  
  loadLakeGeometry().then(() => {
    renderPreview();
  });

}

// ────────────────────────────────────────────────────────────────────────────
// Drag / Pan Functionality
// ────────────────────────────────────────────────────────────────────────────

/*
function setupDragPan() {

  if (!lakeSilhouetteArea) return;
  
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let lastPanX = 0;
  let lastPanY = 0;
  
  lakeSilhouetteArea.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    lastPanX = state.panX;
    lastPanY = state.panY;
    lakeSilhouetteArea.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    state.panX = lastPanX + dx;
    state.panY = lastPanY + dy;
    applyTransforms();
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      lakeSilhouetteArea.style.cursor = '';
      saveLakeState();
    }
  });
  
  // Restore cursor if mouse leaves window while dragging
  document.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      lakeSilhouetteArea.style.cursor = '';
    }
  });

}
  */

// ────────────────────────────────────────────────────────────────────────────
// Mouse Wheel Zoom (matching /map behavior)
// ────────────────────────────────────────────────────────────────────────────

/*
function setupMouseWheelZoom() {

  if (!lakeSilhouetteArea) return;
  
  // Use non-passive listener to allow preventDefault
  lakeSilhouetteArea.addEventListener('wheel', (e) => {
    // Only zoom if wheel is over the silhouette area
    e.preventDefault();
    
    // Normalize deltaY: positive = scroll down (zoom out), negative = scroll up (zoom in)
    // Divide by ~100 to make zoom feel similar to button clicks (which are 0.1 steps)
    const zoomDelta = -(e.deltaY / 100) * ZOOM_STEP;
    
    // Apply zoom
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom + zoomDelta));
    
    if (newZoom !== state.zoom) {
      state.zoom = newZoom;
      applyTransforms();
      saveLakeState();
    }
  }, { passive: false });

}
*/

// ────────────────────────────────────────────────────────────────────────────
// Note: Colour and font customization is now controlled by template configuration
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Lake Search
// ────────────────────────────────────────────────────────────────────────────

async function fetchLakeSearch(query) {

  if (query.length < 2) {
    lakeSearchResults.innerHTML = '';
    lakeSearchResults.hidden = true;
    return;
  }

  try {
    const response = await fetch(`/api/lake-search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Search failed');
    
    const results = await response.json();
    renderLakeSearchResults(results);
  } catch (error) {
    console.error('Lake search error:', error);
    lakeSearchResults.innerHTML = '<li>Search failed. Try again.</li>';
    lakeSearchResults.hidden = false;
  }

}

function renderLakeSearchResults(results) {
  
  if (!Array.isArray(results) || results.length === 0) {
    lakeSearchResults.replaceChildren();
    const item = document.createElement('li');
    item.textContent = 'No lakes found';
    lakeSearchResults.append(item);
    lakeSearchResults.hidden = false;
    return;
  }

  lakeSearchResults.replaceChildren();

  results.forEach((lake, idx) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    
    // Create a two-line display: name on first line, region on second
    const nameSpan = document.createElement('div');
    nameSpan.className = 'result-label';
    nameSpan.textContent = lake.name;
    
    const regionSpan = document.createElement('div');
    regionSpan.className = 'result-region';
    regionSpan.textContent = lake.region;
    
    button.append(nameSpan, regionSpan);
    item.append(button);
    lakeSearchResults.append(item);
    
    button.addEventListener('click', () => selectLakeFromSearch(lake));
  });

  lakeSearchResults.hidden = false;

}

async function selectLakeFromSearch(lake) {

  lakeSearchInput.value = '';
  lakeSearchResults.hidden = true;

  state.lakeId = `${lake.osmType}:${lake.osmId}`;
  state.lakeName = lake.name;
  
  // Set region: use reverse geocoding from server to get "City, Province/State, Country" format
  // The server's formatLakeResult() extracts city/town/village, province/state, and country
  // Fallback to normalized format if server doesn't provide formatted region
  state.region = normalizeRegion(lake.region || '');
  
  state.lat = lake.lat;
  state.lon = lake.lon;
  state.osmType = lake.osmType;
  state.osmId = lake.osmId;

  // Update label inputs (second label defaults to "City, Province/State, Country" from reverse geocoding)
  labelLakeName.value = state.lakeName;
  labelRegion.value = state.region;
  labelCoordinates.value = formatCoordinates(state.lat, state.lon);

  await saveLakeState();

  // Load lake geometry
  await loadLakeGeometry();

  // Save again now that geometry is loaded
  await saveLakeState();

  renderPreview();

}

function selectLakeSearchResult(result) {

  selectLakeFromSearch(result);

}

async function loadLakeGeometry() {

  if (!state.osmType || !state.osmId) {
    console.error('Lake selection incomplete');
    return;
  }

  try {
    const response = await fetch(
      `/api/lake-geometry?osmType=${encodeURIComponent(state.osmType)}&osmId=${encodeURIComponent(state.osmId)}`
    );
    if (!response.ok) throw new Error('Geometry load failed');

    const data = await response.json();
    state.geojson = data.geojson;
  } catch (error) {
    console.error('Lake geometry load error:', error);
    alert('Could not load lake silhouette. Try another lake.');
  }

}

lakeSearchInput.addEventListener('input', (e) => {

  const query = e.target.value.trim();

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchLakeSearch(query);
  }, 300);

});

lakeSearchInput.addEventListener('keydown', (e) => {

  if (e.key === 'Escape') {
    lakeSearchInput.value = '';
    lakeSearchResults.hidden = true;
  }
  
});

// ────────────────────────────────────────────────────────────────────────────
// Label Management
// ────────────────────────────────────────────────────────────────────────────

labelLakeName.addEventListener('change', (e) => {

  state.lakeName = e.target.value;
  saveLakeState();
  renderPreview();

});

labelRegion.addEventListener('change', (e) => {

  state.region = e.target.value;
  saveLakeState();
  renderPreview();

});

// ────────────────────────────────────────────────────────────────────────────
// Preview Rendering
// ────────────────────────────────────────────────────────────────────────────

function renderPreview() {

  // Update labels
  lakeLabelName.textContent = state.lakeName;
  lakeLabelRegion.textContent = state.region;
  lakeLabelCoordinates.textContent = formatCoordinates(state.lat, state.lon);

  // Render silhouette
  if (state.geojson) {
    renderLakeSilhouette(state.geojson);
    
    // Defer layout calculation to ensure container has been measured by browser
    // This prevents getBoundingClientRect() from returning 0 or stale dimensions
    requestAnimationFrame(() => {
      applyAutoFitLayout();
    });
  }

}

function fitLakeSilhouette(geojson) {

  if (!geojson || !geojson.coordinates) return { minLon: 0, maxLon: 100, minLat: 0, maxLat: 100, lonRange: 100, latRange: 100 };
  
  const type = geojson.type || '';
  let coordinates = geojson.coordinates;
  let rings = [];
  
  if (type === 'Polygon') {
    rings = coordinates;
  } else if (type === 'MultiPolygon') {
    coordinates.forEach(polygon => {
      rings.push(...polygon);
    });
  }
  
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  
  rings.forEach(ring => {
    ring.forEach(([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
  });
  
  const lonRange = maxLon - minLon || 1;
  const latRange = maxLat - minLat || 1;
  
  return { minLon, maxLon, minLat, maxLat, lonRange, latRange };

}

function renderLakeSilhouette(geojson) {

  lakeSilhouetteSvg.innerHTML = '';

  if (!geojson || !geojson.coordinates) {
    console.warn('Invalid GeoJSON for lake silhouette');
    return;
  }

  // Use a default primary colour; customer-selected colours are now controlled by template configuration
  const defaultColour = { primary: '#1e4d7b', background: '#ffffff' };
  const colour = defaultColour;
  const type = geojson.type || '';
  let coordinates = geojson.coordinates;

  // Normalize to array of rings
  let rings = [];
  if (type === 'Polygon') {
    rings = coordinates;
  } else if (type === 'MultiPolygon') {
    coordinates.forEach(polygon => {
      rings.push(...polygon);
    });
  } else {
    console.warn('Unsupported GeoJSON type for lake:', type);
    return;
  }

  if (rings.length === 0) return;

  // Get bounding box via fitLakeSilhouette
  const { minLon, maxLon, minLat, maxLat, lonRange, latRange } = fitLakeSilhouette(geojson);

  // Normalize coordinates to SVG space (0-100) with padding
  // CRITICAL: Correct longitude for latitude convergence (meridian convergence)
  // At higher latitudes, degrees of longitude represent shorter physical distances than degrees of latitude
  // Apply cosine correction based on center latitude to preserve true geographic aspect ratio
  const centerLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  const correctedLonRange = lonRange * cosLat;
  const maxGeoRange = Math.max(correctedLonRange, latRange);
  
  // Use fixed small padding in coordinate conversion to ensure full lake is visible
  const coordPadding = 2;
  
  console.log('[Lake Render] Geo ranges - lonRange:', lonRange, 'latRange:', latRange, 'centerLat:', centerLat, 'cosLat:', cosLat, 'correctedLonRange:', correctedLonRange, 'maxGeoRange:', maxGeoRange, 'aspect ratio:', correctedLonRange / latRange);
  
  function coordToSvg(lon, lat) {
    // Apply longitude correction: multiply by cosLat to account for meridian convergence
    const x = (((lon - minLon) * cosLat) / maxGeoRange) * (100 - 2 * coordPadding) + coordPadding;
    const y = ((maxLat - lat) / maxGeoRange) * (100 - 2 * coordPadding) + coordPadding;
    return { x, y };
  }

  // Create a single SVG path combining all rings (boundary + islands/holes)
  // Use fill-rule="evenodd" so the SVG engine automatically treats subsequent rings as holes
  // This displays islands as transparent cutouts in the lake
  let drawMinX = Infinity, drawMinY = Infinity, drawMaxX = -Infinity, drawMaxY = -Infinity;

  // Combine all rings into a single path data string
  const allPathCommands = [];
  
  rings.forEach((ring, ringIdx) => {
    if (ring.length < 2) return;
    
    const pts = ring.map(([lon, lat]) => coordToSvg(lon, lat));
    pts.forEach(p => {
      drawMinX = Math.min(drawMinX, p.x);
      drawMinY = Math.min(drawMinY, p.y);
      drawMaxX = Math.max(drawMaxX, p.x);
      drawMaxY = Math.max(drawMaxY, p.y);
    });

    // For each ring, generate M (moveto) → L (lineto) commands → Z (closepath)
    const ringCommands = pts.map((p, ptIdx) => `${ptIdx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z';
    allPathCommands.push(ringCommands);
  });

  // Create single path element with all rings combined
  if (allPathCommands.length > 0) {
    const combinedPathData = allPathCommands.join(' ');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', combinedPathData);
    path.setAttribute('fill', colour.primary);
    path.setAttribute('fill-rule', 'evenodd');
    lakeSilhouetteSvg.appendChild(path);
  }

  // If we found bounds, compute a tight viewBox with a small padding so the silhouette
  // fills the available SVG area as much as possible while remaining fully visible.
  if (isFinite(drawMinX) && isFinite(drawMinY) && isFinite(drawMaxX) && isFinite(drawMaxY)) {
    const w = drawMaxX - drawMinX || 1;
    const h = drawMaxY - drawMinY || 1;
    
    // CRITICAL: Apply padding proportionally to preserve aspect ratio
    // Instead of adding absolute pixel padding, scale both dimensions by the same factor
    // This ensures the viewBox maintains the original geographic aspect ratio
    const padPercent = 0.03; // 3% proportional padding on each dimension
    const vbW = Math.min(100, w * (1 + padPercent));
    const vbH = Math.min(100, h * (1 + padPercent));
    
    // Calculate viewBox origin with proportional inset
    const insetX = (w * padPercent) / 2;
    const insetY = (h * padPercent) / 2;
    const vbX = Math.max(0, drawMinX - insetX);
    const vbY = Math.max(0, drawMinY - insetY);
    
    console.log('[Lake Render] Draw bounds - w:', w, 'h:', h, 'aspect:', w/h, 'viewBox:', `${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}`, 'vb aspect:', vbW/vbH);
    lakeSilhouetteSvg.setAttribute('viewBox', `${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}`);
  } else {
    lakeSilhouetteSvg.setAttribute('viewBox', '0 0 100 100');
  }

}

// ────────────────────────────────────────────────────────────────────────────
// Accordion UI
// ────────────────────────────────────────────────────────────────────────────

function initAccordion() {

  if (!accordion) return;

  Array.from(accordion.querySelectorAll('.accordion-trigger')).forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      const item = trigger.closest('.accordion-item');
      const panel = item.querySelector('.accordion-panel');
      const isExpanded = trigger.getAttribute('aria-expanded') === 'true';

      // Close all other panels
      Array.from(accordion.querySelectorAll('.accordion-item')).forEach(other => {
        if (other !== item) {
          const otherTrigger = other.querySelector('.accordion-trigger');
          const otherPanel = other.querySelector('.accordion-panel');
          otherTrigger.setAttribute('aria-expanded', 'false');
          otherPanel.hidden = true;
        }
      });

      // Toggle current panel
      trigger.setAttribute('aria-expanded', !isExpanded);
      panel.hidden = isExpanded;
    });
  });

}

// ────────────────────────────────────────────────────────────────────────────
// Font Management
// ────────────────────────────────────────────────────────────────────────────

// Font application removed - fonts are now controlled by template configuration

// ────────────────────────────────────────────────────────────────────────────
// Top right buttons
// ────────────────────────────────────────────────────────────────────────────

/*
if (zoomInButton) {
  zoomInButton.addEventListener('click', () => {
    zoomIn();
  });
}

if (zoomOutButton) {
  zoomOutButton.addEventListener('click', () => {
    zoomOut();
  });
}
*/

if (rotateLeftButton) {
  rotateLeftButton.addEventListener('click', () => {
    applyRotation(ROTATION_STEP);
  });
}

if (rotateRightButton) {
  rotateRightButton.addEventListener('click', () => {
    applyRotation(-ROTATION_STEP);
  });
}

if (resetButton) {
  resetButton.addEventListener('click', () => {
    resetApp();
  });
}

if (deleteButton) {
  deleteButton.addEventListener('click', () => {
    deleteDesign();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Lake Initialization
// ────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  
  await initApp();
  await initOwner();
  await initDesign();

  // Populate export/template links now that `designId` is available
  updateExportLinks();

  // Initialize confirmation overlay
  initConfirmationOverlay();

  // Load saved state
  await loadLakeState();

  // Setup UI
  setupDocumentScaleObserver();
  initAccordion();

  // Restore label inputs from state
  labelLakeName.value = state.lakeName;
  labelRegion.value = state.region;
  labelCoordinates.value = formatCoordinates(state.lat, state.lon);

  // Setup drag/pan functionality
  // setupDragPan();

  // Setup mouse wheel zoom
  // setupMouseWheelZoom();

  // If a lake was previously selected, reload its geometry for rendering
  if (state.osmType && state.osmId && state.lakeName) {
    await loadLakeGeometry();
  }

  // Initialize displayRotation from logical state before first render
  displayRotation = typeof state.rotation === 'number' ? state.rotation : 0;

  renderPreview();

});
