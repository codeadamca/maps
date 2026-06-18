// Lake application
// Completely independent from map application

// Global variables
let state = {};
let searchDebounceTimer = null;

// DOM Elements
const lakeSearchInput = document.getElementById('lake-search');
const lakeSearchResults = document.getElementById('lake-search-results');
const themeGrid = document.getElementById('theme-grid');
const labelFont = document.getElementById('label-font');
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
const zoomInButton = document.getElementById('zoom-in');
const zoomOutButton = document.getElementById('zoom-out');
const rotateLeftButton = document.getElementById('rotate-left');
const rotateRightButton = document.getElementById('rotate-right');
const resetButton = document.getElementById('reset-app-button');

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

// ────────────────────────────────────────────────────────────────────────────
// Document Scaling
// ────────────────────────────────────────────────────────────────────────────

const ROTATION_STEP = 15;
const ANIMATION_DURATION = 300;
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

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
  });

  observer.observe(previewContainer);

  // Initial scale calculation
  updateDocumentScale();
  
  // Apply any saved rotation, zoom, and pan to silhouette only
  // Disable transitions during initial hydration to prevent animation on load
  if (lakeSilhouetteArea) {
    lakeSilhouetteArea.classList.add('no-transition');
    applyTransforms();
    
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

  if (!lakeSilhouetteArea) return;
  const transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom}) rotate(${state.rotation}deg)`;
  lakeSilhouetteArea.style.transform = transform;

}

function applyRotation(deltaDegrees) {

  state.rotation = ((state.rotation || 0) + deltaDegrees) % 360;
  applyTransforms();
  saveLakeState();

}

function zoomIn() {

  state.zoom = Math.min(state.zoom + ZOOM_STEP, MAX_ZOOM);
  applyTransforms();
  saveLakeState();

}

function zoomOut() {

  state.zoom = Math.max(state.zoom - ZOOM_STEP, MIN_ZOOM);
  applyTransforms();
  saveLakeState();

}

function applyPan(dx, dy) {

  state.panX += dx;
  state.panY += dy;
  applyTransforms();
  saveLakeState();

}

async function resetApp() {

  if (!confirm('Reset app and all settings to default? This cannot be undone.')) return;
  
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

// ────────────────────────────────────────────────────────────────────────────
// Mouse Wheel Zoom (matching /map behavior)
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Colour System
// ────────────────────────────────────────────────────────────────────────────

function getColour() {

  return coloursData.colours[state.colourId] || coloursData.colours.navy;

}

function applyColour(colourId) {

  if (!(colourId in coloursData.colours)) return;

  state.colourId = colourId;
  const colour = getColour();

  // Update document background
  lakeFrame.style.background = colour.background;

  // Apply the same primary colour to all labels so they match the silhouette
  if (lakeLabelName) lakeLabelName.style.color = colour.primary;
  if (lakeLabelRegion) lakeLabelRegion.style.color = colour.primary;
  if (lakeLabelCoordinates) lakeLabelCoordinates.style.color = colour.primary;

  // Re-render silhouette with new colour
  if (state.geojson) {
    renderLakeSilhouette(state.geojson);
  }

  saveLakeState();

}

function renderThemeGrid() {

  if (!themeGrid) return;

  themeGrid.innerHTML = Object.entries(coloursData.colours).map(([colourId, colour]) => `
    <button type="button" class="theme-item ${state.colourId === colourId ? 'theme-item--active' : ''}" data-colour-id="${colourId}" title="${colour.name}">
      <div class="theme-swatch">
        <div class="theme-color" style="background-color: ${colour.primary};"></div>
      </div>
      <span class="theme-label">${colour.name}</span>
    </button>
  `).join('');

  // Attach click handlers
  Array.from(themeGrid.querySelectorAll('.theme-item')).forEach(btn => {
    btn.addEventListener('click', () => {
      const colourId = btn.dataset.colourId;
      applyColour(colourId);
      renderThemeGrid(); // Re-render to show active state
    });
  });

}

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
  state.region = lake.region;
  state.lat = lake.lat;
  state.lon = lake.lon;
  state.osmType = lake.osmType;
  state.osmId = lake.osmId;

  // Update label inputs
  labelLakeName.value = state.lakeName;
  labelRegion.value = state.region;
  labelCoordinates.value = formatCoordinates(state.lat, state.lon);

  saveLakeState();

  // Load lake geometry
  await loadLakeGeometry();
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

  const colour = getColour();
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
  const basePadding = 5;
  function coordToSvg(lon, lat) {
    const x = ((lon - minLon) / lonRange) * (100 - 2 * basePadding) + basePadding;
    const y = ((maxLat - lat) / latRange) * (100 - 2 * basePadding) + basePadding;
    return { x, y };
  }

  // Create SVG paths for each ring (NO STROKE)
  // Track the overall drawn bounds in SVG coordinates so we can zoom to-fit.
  let drawMinX = Infinity, drawMinY = Infinity, drawMaxX = -Infinity, drawMaxY = -Infinity;

  rings.forEach((ring, ringIdx) => {
    if (ring.length < 2) return;
    const pts = ring.map(([lon, lat]) => coordToSvg(lon, lat));
    pts.forEach(p => {
      drawMinX = Math.min(drawMinX, p.x);
      drawMinY = Math.min(drawMinY, p.y);
      drawMaxX = Math.max(drawMaxX, p.x);
      drawMaxY = Math.max(drawMaxY, p.y);
    });

    const pathData = pts.map((p, ptIdx) => `${ptIdx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', colour.primary);
    lakeSilhouetteSvg.appendChild(path);
  });

  // If we found bounds, compute a tight viewBox with a small padding so the silhouette
  // fills the available SVG area as much as possible while remaining fully visible.
  if (isFinite(drawMinX) && isFinite(drawMinY) && isFinite(drawMaxX) && isFinite(drawMaxY)) {
    const w = drawMaxX - drawMinX || 1;
    const h = drawMaxY - drawMinY || 1;
    // add a small padding proportional to the larger dimension (2% of max dimension)
    const pad = Math.max(1, Math.min(5, Math.max(w, h) * 0.02));
    const vbX = Math.max(0, drawMinX - pad);
    const vbY = Math.max(0, drawMinY - pad);
    const vbW = Math.min(100, w + pad * 2);
    const vbH = Math.min(100, h + pad * 2);
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

function applyFont(fontFamily) {

  state.fontFamily = fontFamily;
  
  // Apply font to all label text elements
  if (lakeLabelName) lakeLabelName.style.fontFamily = `"${fontFamily}", serif`;
  if (lakeLabelRegion) lakeLabelRegion.style.fontFamily = `"${fontFamily}", sans-serif`;
  if (lakeLabelCoordinates) lakeLabelCoordinates.style.fontFamily = `"${fontFamily}", mono`;
  
  saveLakeState();
}

labelFont.addEventListener('change', (e) => {
  applyFont(e.target.value);
});

// ────────────────────────────────────────────────────────────────────────────
// Top right buttons
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Lake Initialization
// ────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  
  await initApp();
  await initOwner();
  await initDesign();

  // Load saved state
  await loadLakeState();

  // Setup UI
  setupDocumentScaleObserver();
  initAccordion();

  // Render colour grid
  renderThemeGrid();

  // Apply saved colour and font
  applyColour(state.colourId);

  // Populate font select from loaded fonts.json
  if (labelFont && fontsData && fontsData.fonts) {
    labelFont.innerHTML = Object.keys(fontsData.fonts).map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
    labelFont.value = state.fontFamily;
    applyFont(state.fontFamily);
  }

  // Restore label inputs from state
  labelLakeName.value = state.lakeName;
  labelRegion.value = state.region;
  labelCoordinates.value = formatCoordinates(state.lat, state.lon);

  // Setup drag/pan functionality
  setupDragPan();

  // Setup mouse wheel zoom
  setupMouseWheelZoom();

  // If a lake was previously selected, reload its geometry for rendering
  if (state.osmType && state.osmId && state.lakeName) {
    await loadLakeGeometry();
  }

  renderPreview();

});
