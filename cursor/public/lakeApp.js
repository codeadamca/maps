// Lake Silhouette Application
// Completely independent from map application

const STATE_KEY = 'lake-silhouette:state';
const LAKE_SEARCH_DEBOUNCE_MS = 300;
const LAKE_DOCUMENT_BASE_WIDTH = 600; // Base width in px for 3:4 aspect ratio

// Font configuration (reused from mapApp.js)
const SVG_FONT_CONFIG = {
  'Playfair Display': {
    family: 'Playfair Display',
    weights: [600, 700],
    url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf'
  },
  Inter: {
    family: 'Inter',
    weights: [500, 700],
    url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter%5Bopsz,wght%5D.ttf'
  },
  'Roboto Condensed': {
    family: 'Roboto Condensed',
    weights: [400, 500, 700],
    url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/robotocondensed/RobotoCondensed%5Bwght%5D.ttf'
  },
  'Cormorant Garamond': {
    family: 'Cormorant Garamond',
    weights: [500, 600, 700],
    url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf'
  }
};

const state = {
  colourId: 'navy',
  fontFamily: 'Playfair Display',
  lakeId: null,
  lakeName: '',
  region: '',
  lat: null,
  lon: null,
  osmType: null,
  osmId: null,
  geojson: null
};

let searchDebounceTimer = null;
let coloursData = { colours: {} };

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
const exportPngButton = document.getElementById('export-png');
const exportSvgButton = document.getElementById('export-svg');
const accordion = document.getElementById('sidebar-accordion');

// ────────────────────────────────────────────────────────────────────────────
// State Management (persistence like /map)
// ────────────────────────────────────────────────────────────────────────────

function loadLakeState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (!saved) return;

    if (typeof saved.colourId === 'string' && saved.colourId in coloursData.colours) {
      state.colourId = saved.colourId;
    }
    if (typeof saved.fontFamily === 'string') {
      state.fontFamily = saved.fontFamily;
    }
    if (typeof saved.lakeName === 'string') state.lakeName = saved.lakeName;
    if (typeof saved.region === 'string') state.region = saved.region;
    if (typeof saved.lat === 'number') state.lat = saved.lat;
    if (typeof saved.lon === 'number') state.lon = saved.lon;
    if (typeof saved.osmType === 'string') state.osmType = saved.osmType;
    if (typeof saved.osmId === 'string') state.osmId = saved.osmId;
  } catch (error) {
    // Ignore invalid storage
  }
}

function saveLakeState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    colourId: state.colourId,
    fontFamily: state.fontFamily,
    lakeName: state.lakeName,
    region: state.region,
    lat: state.lat,
    lon: state.lon,
    osmType: state.osmType,
    osmId: state.osmId
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Document Scaling (reused pattern from /map)
// ────────────────────────────────────────────────────────────────────────────

function updateDocumentScale() {
  if (!previewContainer) return;

  // 3:4 portrait aspect ratio
  const ASPECT_WIDTH = 3;
  const ASPECT_HEIGHT = 4;
  const docWidth = LAKE_DOCUMENT_BASE_WIDTH;
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
    lakeSearchResults.innerHTML = '<li>No lakes found</li>';
    lakeSearchResults.hidden = false;
    return;
  }

  lakeSearchResults.innerHTML = results.map((lake, idx) => `
    <li role="button" tabindex="0" data-idx="${idx}" class="search-result-item">
      <div class="result-label">${escapeHtml(lake.name)}</div>
      <div class="result-region">${escapeHtml(lake.region)}</div>
    </li>
  `).join('');

  lakeSearchResults.hidden = false;

  // Attach click handlers
  Array.from(lakeSearchResults.querySelectorAll('li')).forEach((item, idx) => {
    item.addEventListener('click', () => selectLakeFromSearch(results[idx]));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectLakeFromSearch(results[idx]);
      }
    });
  });
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

function formatCoordinates(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '';
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

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

  // Compute bounding box
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

  // Normalize coordinates to SVG space (0-100) with padding
  const padding = 5;
  function coordToSvg(lon, lat) {
    const x = ((lon - minLon) / lonRange) * (100 - 2 * padding) + padding;
    const y = ((maxLat - lat) / latRange) * (100 - 2 * padding) + padding;
    return { x, y };
  }

  // Create SVG paths for each ring (NO STROKE)
  rings.forEach((ring, ringIdx) => {
    if (ring.length < 2) return;

    const pathData = ring.map(([lon, lat], ptIdx) => {
      const { x, y } = coordToSvg(lon, lat);
      return `${ptIdx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ') + ' Z';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', colour.primary);
    // NO stroke - clean silhouette
    
    lakeSilhouetteSvg.appendChild(path);
  });

  // Set viewBox to capture all content
  lakeSilhouetteSvg.setAttribute('viewBox', '0 0 100 100');
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
// Export
// ────────────────────────────────────────────────────────────────────────────

exportPngButton.addEventListener('click', () => {
  alert('PNG export coming soon');
});

exportSvgButton.addEventListener('click', () => {
  alert('SVG export coming soon');
});

// ────────────────────────────────────────────────────────────────────────────
// Search Event Handlers
// ────────────────────────────────────────────────────────────────────────────

lakeSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchLakeSearch(query);
  }, LAKE_SEARCH_DEBOUNCE_MS);
});

lakeSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    lakeSearchInput.value = '';
    lakeSearchResults.hidden = true;
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ────────────────────────────────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Load colours data first
  try {
    const response = await fetch('/colours.json');
    if (response.ok) {
      coloursData = await response.json();
    }
  } catch (error) {
    console.error('Failed to load colours.json:', error);
  }

  // Load saved state
  loadLakeState();

  // Setup UI
  setupDocumentScaleObserver();
  initAccordion();

  // Render colour grid
  renderThemeGrid();

  // Apply saved colour and font
  applyColour(state.colourId);
  labelFont.value = state.fontFamily;
  applyFont(state.fontFamily);

  // Restore label inputs from state
  labelLakeName.value = state.lakeName;
  labelRegion.value = state.region;
  labelCoordinates.value = formatCoordinates(state.lat, state.lon);

  // If a lake was previously selected, reload its geometry for rendering
  if (state.osmType && state.osmId && state.lakeName) {
    await loadLakeGeometry();
  }

  renderPreview();
});
