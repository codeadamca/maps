const DEFAULT_CENTER = [-79.86622015711724, 45.64789087148891];
const DEFAULT_ZOOM = 11;
const VIEW_STATE_KEY = 'map-poster:view';

const LAYER_OPTIONS = [
  { id: 'landcover', label: 'Land cover' },
  { id: 'parks', label: 'Parks' },
  { id: 'water', label: 'Water' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'roads', label: 'Roads' },
  { id: 'rail', label: 'Rail' }
];

const LAYER_IDS_BY_OPTION = {
  landcover: ['landcover'],
  parks: ['park', 'aeroway'],
  water: ['water', 'waterway'],
  buildings: ['building'],
  rail: ['rail'],
  roads: [
    'road-minor-overview-high',
    'road-minor-overview-mid',
    'road-minor-overview-low',
    'road-path-overview',
    'road-major-casing',
    'road-minor-high-casing',
    'road-minor-mid-casing',
    'road-path-casing',
    'road-major',
    'road-minor-high',
    'road-minor-mid',
    'road-minor-low',
    'road-path'
  ]
};

const state = {
  themeId: 'coral',
  layoutId: 'print_a4_portrait',
  city: 'Whitestone Lake',
  country: 'Ontario, Canada',
  fontFamily: 'Playfair Display',
  center: [...DEFAULT_CENTER],
  zoom: DEFAULT_ZOOM,
  mapLocked: false,
  layers: {
    landcover: true,
    parks: true,
    water: true,
    buildings: true,
    roads: true,
    rail: true
  }
};

let themesData = { themes: {} };
let layoutsData = { categories: [] };
let map = null;
let searchAbort = null;

const themeGrid = document.getElementById('theme-grid');
const layerList = document.getElementById('layer-list');
const layoutSelect = document.getElementById('layout-select');
const locationSearch = document.getElementById('location-search');
const searchResults = document.getElementById('search-results');
const labelCity = document.getElementById('label-city');
const labelCountry = document.getElementById('label-country');
const labelFont = document.getElementById('label-font');
const posterFrame = document.getElementById('poster-frame');
const posterCity = document.getElementById('poster-city');
const posterCountry = document.getElementById('poster-country');
const posterLabels = document.getElementById('poster-labels');
const exportButton = document.getElementById('export-png');
const mapLockButton = document.getElementById('map-lock');

function loadViewState() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_STATE_KEY) || 'null');
    if (!saved) return;

    const [lng, lat] = saved.center || [];
    const zoom = Number(saved.zoom);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(zoom)) {
      state.center = [lng, lat];
      state.zoom = zoom;
    }
  } catch (error) {
    // Ignore invalid storage.
  }
}

function saveViewState() {
  if (!map) return;
  const center = map.getCenter();
  localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
    center: [center.lng, center.lat],
    zoom: map.getZoom()
  }));
}

function getTheme() {
  return themesData.themes[state.themeId] || themesData.themes.coral;
}

function getLayout() {
  for (const category of layoutsData.categories || []) {
    const match = (category.layouts || []).find(layout => layout.id === state.layoutId);
    if (match) return match;
  }
  return { width: 21, height: 29.7, unit: 'cm' };
}

function getExportDimensions() {
  const layout = getLayout();
  if (layout.unit === 'px') {
    return { width: layout.width, height: layout.height };
  }
  const dpi = 300;
  const width = Math.round((layout.width / 2.54) * dpi);
  const height = Math.round((layout.height / 2.54) * dpi);
  return { width, height };
}

function buildMapStyle() {
  const theme = getTheme();
  return generateMapStyle(theme, {
    includeLandcover: state.layers.landcover,
    includeParks: state.layers.parks,
    includeWater: state.layers.water,
    includeBuildings: state.layers.buildings,
    includeAeroway: state.layers.parks,
    includeRail: state.layers.rail,
    includeRoads: state.layers.roads,
    includeRoadPath: state.layers.roads,
    includeRoadMinorLow: state.layers.roads,
    includeRoadOutline: state.layers.roads
  });
}

function applyThemeUi() {
  const theme = getTheme();
  document.documentElement.style.setProperty('--poster-bg', theme.ui.bg);
  document.documentElement.style.setProperty('--poster-text', theme.ui.text);
  posterLabels.style.fontFamily = `"${state.fontFamily}", sans-serif`;
}

function applyPosterAspect() {
  const layout = getLayout();
  posterFrame.style.setProperty('--poster-aspect', `${layout.width} / ${layout.height}`);
}

function applyLabels() {
  posterCity.textContent = state.city;
  posterCountry.textContent = state.country;
  labelCity.value = state.city;
  labelCountry.value = state.country;
}

function setMapLocked(locked) {
  state.mapLocked = locked;
  map.dragPan.enable(!locked);
  map.scrollZoom.enable(!locked);
  map.boxZoom.enable(!locked);
  map.doubleClickZoom.enable(!locked);
  map.touchZoomRotate.enable(!locked);
  mapLockButton.classList.toggle('is-active', locked);
  mapLockButton.textContent = locked ? 'Locked' : 'Lock';
  mapLockButton.title = locked ? 'Unlock map' : 'Lock map';
}

function setLayerVisibility(layerIds, visible) {
  if (!map || !map.isStyleLoaded()) return;

  const visibility = visible ? 'visible' : 'none';
  layerIds.forEach(layerId => {
    if (!map.getLayer(layerId)) return;
    try {
      map.setLayoutProperty(layerId, 'visibility', visibility);
    } catch (error) {
      // Ignore layers that do not support visibility toggles.
    }
  });
}

function applyLayerVisibility() {
  LAYER_OPTIONS.forEach(option => {
    const layerIds = LAYER_IDS_BY_OPTION[option.id] || [];
    setLayerVisibility(layerIds, state.layers[option.id]);
  });
}

function reloadMapStyle() {
  if (!map) return;

  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing();

  const restoreView = () => {
    map.jumpTo({ center, zoom, bearing });
    applyLayerVisibility();
  };

  map.once('style.load', restoreView);
  map.setStyle(buildMapStyle());
}

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: buildMapStyle(),
    center: state.center,
    zoom: state.zoom,
    attributionControl: false,
    preserveDrawingBuffer: true,
    dragRotate: false,
    pitchWithRotate: false
  });

  map.on('moveend', () => {
    const center = map.getCenter();
    state.center = [center.lng, center.lat];
    state.zoom = map.getZoom();
    saveViewState();
  });

  map.once('load', applyLayerVisibility);

  setMapLocked(false);

  map.on('error', (event) => {
    console.error('Map error:', event.error || event);
  });

  requestAnimationFrame(() => {
    map.resize();
  });
}

function renderThemeGrid() {
  themeGrid.replaceChildren();
  const entries = Object.entries(themesData.themes || {});

  entries.forEach(([id, theme]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `theme-swatch${id === state.themeId ? ' is-active' : ''}`;
    button.title = theme.description || theme.name;

    const preview = document.createElement('span');
    preview.className = 'theme-swatch-preview';
    preview.style.background = `linear-gradient(135deg, ${theme.ui.bg} 50%, ${theme.map.water} 50%)`;

    const name = document.createElement('span');
    name.className = 'theme-swatch-name';
    name.textContent = theme.name;

    button.append(preview, name);
    button.addEventListener('click', () => {
      state.themeId = id;
      applyThemeUi();
      renderThemeGrid();
      reloadMapStyle();
    });

    themeGrid.append(button);
  });
}

function renderLayerList() {
  layerList.replaceChildren();

  LAYER_OPTIONS.forEach(option => {
    const label = document.createElement('label');
    label.className = 'layer-toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.layers[option.id];
    input.addEventListener('change', () => {
      state.layers[option.id] = input.checked;
      setLayerVisibility(LAYER_IDS_BY_OPTION[option.id] || [], input.checked);
    });

    const text = document.createElement('span');
    text.textContent = option.label;

    label.append(input, text);
    layerList.append(label);
  });
}

function renderLayoutSelect() {
  layoutSelect.replaceChildren();

  (layoutsData.categories || []).forEach(category => {
    const group = document.createElement('optgroup');
    group.label = category.name;

    (category.layouts || []).forEach(layout => {
      const option = document.createElement('option');
      option.value = layout.id;
      option.textContent = layout.name;
      group.append(option);
    });

    layoutSelect.append(group);
  });

  layoutSelect.value = state.layoutId;
}

function hideSearchResults() {
  searchResults.hidden = true;
  searchResults.replaceChildren();
}

function showSearchResults(results) {
  searchResults.replaceChildren();

  if (results.length === 0) {
    hideSearchResults();
    return;
  }

  results.forEach(result => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = result.label;
    button.addEventListener('click', () => {
      flyToLocation(result);
      locationSearch.value = result.label;
      hideSearchResults();
    });
    item.append(button);
    searchResults.append(item);
  });

  searchResults.hidden = false;
}

function flyToLocation(result) {
  state.center = [result.lon, result.lat];
  state.city = result.city || state.city;
  state.country = result.country || state.country;
  applyLabels();

  map.flyTo({
    center: state.center,
    zoom: Math.max(map.getZoom(), 10),
    duration: 1200
  });
}

async function searchLocations(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal: searchAbort.signal
  });

  if (!response.ok) {
    throw new Error('Search failed');
  }

  return response.json();
}

let searchTimer = null;
locationSearch.addEventListener('input', () => {
  const query = locationSearch.value.trim();
  clearTimeout(searchTimer);

  if (query.length < 2) {
    hideSearchResults();
    return;
  }

  searchTimer = setTimeout(async () => {
    try {
      const results = await searchLocations(query);
      showSearchResults(results);
    } catch (error) {
      if (error.name !== 'AbortError') hideSearchResults();
    }
  }, 280);
});

locationSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideSearchResults();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) hideSearchResults();
});

labelCity.addEventListener('input', () => {
  state.city = labelCity.value;
  posterCity.textContent = state.city;
});

labelCountry.addEventListener('input', () => {
  state.country = labelCountry.value;
  posterCountry.textContent = state.country;
});

labelFont.addEventListener('change', () => {
  state.fontFamily = labelFont.value;
  applyThemeUi();
});

layoutSelect.addEventListener('change', () => {
  state.layoutId = layoutSelect.value;
  applyPosterAspect();
});

document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn({ duration: 300 }));
document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut({ duration: 300 }));

mapLockButton.addEventListener('click', () => {
  setMapLocked(!state.mapLocked);
});

async function exportPng() {
  exportButton.disabled = true;
  exportButton.textContent = 'Exporting…';

  try {
    await new Promise(resolve => {
      if (map.loaded()) {
        map.once('idle', resolve);
      } else {
        map.once('load', resolve);
      }
    });

    const theme = getTheme();
    const { width, height } = getExportDimensions();
    const labelBand = Math.round(height * 0.14);
    const mapHeight = height - labelBand;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = theme.ui.bg;
    ctx.fillRect(0, 0, width, height);

    const mapCanvas = map.getCanvas();
    ctx.drawImage(mapCanvas, 0, 0, width, mapHeight);

    ctx.fillStyle = theme.ui.bg;
    ctx.fillRect(0, mapHeight, width, labelBand);

    const titleSize = Math.round(width * 0.055);
    const subtitleSize = Math.round(width * 0.028);
    ctx.fillStyle = theme.ui.text;
    ctx.textAlign = 'center';
    ctx.font = `700 ${titleSize}px "${state.fontFamily}", sans-serif`;
    ctx.fillText(state.city, width / 2, mapHeight + labelBand * 0.52);
    ctx.font = `500 ${subtitleSize}px "${state.fontFamily}", sans-serif`;
    ctx.fillText(state.country, width / 2, mapHeight + labelBand * 0.82);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error('PNG export failed'));
      }, 'image/png');
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(state.city || 'map')}-poster.png`;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = 'Download PNG';
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'map';
}

exportButton.addEventListener('click', exportPng);

function initAccordion() {
  const accordion = document.getElementById('sidebar-accordion');
  if (!accordion) return;

  const items = [...accordion.querySelectorAll('.accordion-item')];

  function setItemOpen(item, isOpen) {
    const trigger = item.querySelector('.accordion-trigger');
    const panel = item.querySelector('.accordion-panel');

    item.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
    panel.hidden = !isOpen;
  }

  function toggleItem(item) {
    setItemOpen(item, !item.classList.contains('is-open'));

    if (map) {
      requestAnimationFrame(() => map.resize());
    }
  }

  items.forEach(item => {
    setItemOpen(item, false);
    item.querySelector('.accordion-trigger').addEventListener('click', () => {
      toggleItem(item);
    });
  });
}

async function boot() {
  loadViewState();

  const [themesResponse, layoutsResponse] = await Promise.all([
    fetch('themes.json'),
    fetch('layouts.json')
  ]);

  themesData = await themesResponse.json();
  layoutsData = await layoutsResponse.json();

  if (!themesData.themes[state.themeId]) {
    state.themeId = Object.keys(themesData.themes)[0];
  }

  labelFont.value = state.fontFamily;
  applyThemeUi();
  applyPosterAspect();
  applyLabels();
  renderThemeGrid();
  renderLayerList();
  renderLayoutSelect();
  initAccordion();
  initMap();
}

window.addEventListener('resize', () => {
  if (map) map.resize();
});

boot().catch(error => {
  console.error(error);
  alert('Failed to start the app. Check the console for details.');
});
