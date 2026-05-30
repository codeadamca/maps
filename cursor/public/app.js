const DEFAULT_CENTER = [-79.86622015711724, 45.64789087148891];
const DEFAULT_ZOOM = 11;
const MAPBOX_BUILDING_FOCUS_ZOOM = 16;
const VIEW_STATE_KEY = 'map-poster:view';
const EXPORT_DPI = 96;
const MAX_EXPORT_DIMENSION = 1600;
const EXPORT_TEXT_SCALE_ADJUSTMENT = 1.08;
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

const LAYER_OPTIONS = [
  { id: 'landcover', label: 'Land cover' },
  { id: 'parks', label: 'Parks' },
  { id: 'water', label: 'Water' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'roads', label: 'Roads' },
  { id: 'rail', label: 'Rail' },
  { id: 'compass', label: 'Compass' }
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
  layoutId: 'poster_18x24_portrait',
  orientation: 'portrait',
  city: 'Whitestone Lake',
  country: 'Ontario, Canada',
  fontFamily: 'Playfair Display',
  center: [...DEFAULT_CENTER],
  zoom: DEFAULT_ZOOM,
  bearing: 0,
  layers: {
    landcover: true,
    parks: true,
    water: true,
    buildings: true,
    roads: true,
    rail: true,
    compass: true
  }
};

let themesData = { themes: {} };
let layoutsData = { categories: [] };
let map = null;
let searchAbort = null;
const svgFontFaceCache = new Map();
const svgFontDataCache = new Map();
let appConfig = {
  tileProvider: 'openfreemap',
  mapboxToken: '',
  debug: false
};

const themeGrid = document.getElementById('theme-grid');
const layerList = document.getElementById('layer-list');
const layoutSelect = document.getElementById('layout-select');
const orientationSelect = document.getElementById('orientation-select');
const locationSearch = document.getElementById('location-search');
const searchResults = document.getElementById('search-results');
const labelCity = document.getElementById('label-city');
const labelCountry = document.getElementById('label-country');
const labelFont = document.getElementById('label-font');
const posterFrame = document.getElementById('poster-frame');
const posterCompass = document.getElementById('poster-compass');
const posterCompassRose = document.getElementById('poster-compass-rose');
const posterDebug = document.getElementById('poster-debug');
const posterCity = document.getElementById('poster-city');
const posterCountry = document.getElementById('poster-country');
const posterLabels = document.getElementById('poster-labels');
const exportButton = document.getElementById('export-png');
const exportSvgButton = document.getElementById('export-svg');
const rotateLeftButton = document.getElementById('rotate-left');
const rotateRightButton = document.getElementById('rotate-right');

const ROTATION_STEP = 15;

function loadViewState() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_STATE_KEY) || 'null');
    if (!saved) return;

    const [lng, lat] = saved.center || [];
    const zoom = Number(saved.zoom);
    const bearing = Number(saved.bearing);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(zoom)) {
      state.center = [lng, lat];
      state.zoom = zoom;
    }

    if (Number.isFinite(bearing)) {
      state.bearing = bearing;
    }

    if (typeof saved.themeId === 'string') state.themeId = saved.themeId;
    if (typeof saved.layoutId === 'string') state.layoutId = saved.layoutId;
    if (saved.orientation === 'portrait' || saved.orientation === 'landscape') {
      state.orientation = saved.orientation;
    }
    if (typeof saved.city === 'string') state.city = saved.city;
    if (typeof saved.country === 'string') state.country = saved.country;
    if (typeof saved.fontFamily === 'string') state.fontFamily = saved.fontFamily;

    if (saved.layers && typeof saved.layers === 'object') {
      for (const option of LAYER_OPTIONS) {
        if (typeof saved.layers[option.id] === 'boolean') {
          state.layers[option.id] = saved.layers[option.id];
        }
      }
    }
  } catch (error) {
    // Ignore invalid storage.
  }
}

function saveViewState() {
  const center = map ? map.getCenter() : { lng: state.center[0], lat: state.center[1] };
  localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
    center: [center.lng, center.lat],
    zoom: map ? map.getZoom() : state.zoom,
    bearing: map ? map.getBearing() : state.bearing,
    themeId: state.themeId,
    layoutId: state.layoutId,
    orientation: state.orientation,
    city: state.city,
    country: state.country,
    fontFamily: state.fontFamily,
    layers: state.layers
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

function getLayoutDimensions() {
  const layout = getLayout();
  const longSide = Math.max(layout.width, layout.height);
  const shortSide = Math.min(layout.width, layout.height);

  if (state.orientation === 'landscape') {
    return {
      ...layout,
      width: longSide,
      height: shortSide
    };
  }

  return {
    ...layout,
    width: shortSide,
    height: longSide
  };
}

function getExportDimensions() {
  const layout = getLayoutDimensions();
  if (layout.unit === 'px') {
    const largestDimension = Math.max(layout.width, layout.height);
    if (largestDimension <= MAX_EXPORT_DIMENSION) {
      return { width: layout.width, height: layout.height };
    }

    const scale = MAX_EXPORT_DIMENSION / largestDimension;
    return {
      width: Math.round(layout.width * scale),
      height: Math.round(layout.height * scale)
    };
  }
  const rawWidth = Math.round((layout.width / 2.54) * EXPORT_DPI);
  const rawHeight = Math.round((layout.height / 2.54) * EXPORT_DPI);
  const largestDimension = Math.max(rawWidth, rawHeight);

  if (largestDimension <= MAX_EXPORT_DIMENSION) {
    return { width: rawWidth, height: rawHeight };
  }

  const scale = MAX_EXPORT_DIMENSION / largestDimension;
  const width = Math.round(rawWidth * scale);
  const height = Math.round(rawHeight * scale);
  return { width, height };
}

function getSvgDocumentSize() {
  const layout = getLayoutDimensions();

  if (layout.unit === 'px') {
    return {
      width: `${layout.width}px`,
      height: `${layout.height}px`
    };
  }

  return {
    width: `${layout.width}cm`,
    height: `${layout.height}cm`
  };
}

function buildMapStyle() {
  const theme = getTheme();
  return generateMapStyle(theme, {
    provider: appConfig.tileProvider,
    mapboxToken: appConfig.mapboxToken,
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
  document.documentElement.style.setProperty('--compass-bg', theme.ui.bg);
  document.documentElement.style.setProperty('--compass-ring', theme.ui.text);
  document.documentElement.style.setProperty('--compass-accent', theme.map.water || theme.ui.text);
  document.documentElement.style.setProperty('--compass-muted', theme.map.land || theme.ui.bg);
  posterLabels.style.fontFamily = `"${state.fontFamily}", sans-serif`;
}

function applyPosterAspect() {
  const layout = getLayoutDimensions();
  posterFrame.style.setProperty('--poster-aspect', `${layout.width} / ${layout.height}`);
}

function updatePosterLayout() {
  applyPosterAspect();
  if (map) {
    requestAnimationFrame(() => map.resize());
  }
}

function getPosterMetrics() {
  const { width, height } = getExportDimensions();
  const labelBand = Math.round(height * 0.14);
  const mapHeight = height - labelBand;
  const posterFrameRect = posterFrame ? posterFrame.getBoundingClientRect() : null;
  const renderedPosterWidth = posterFrameRect ? posterFrameRect.width : 0;
  const renderedPosterHeight = posterFrameRect ? posterFrameRect.height : 0;
  const exportScaleX = renderedPosterWidth > 0 ? width / renderedPosterWidth : 1;
  const exportScaleY = renderedPosterHeight > 0 ? height / renderedPosterHeight : exportScaleX;
  const exportScale = Math.max(exportScaleX, exportScaleY);
  const previewTitleSize = posterCity ? parseFloat(getComputedStyle(posterCity).fontSize) : NaN;
  const previewSubtitleSize = posterCountry ? parseFloat(getComputedStyle(posterCountry).fontSize) : NaN;
  const posterCityRect = posterCity ? posterCity.getBoundingClientRect() : null;
  const posterCountryRect = posterCountry ? posterCountry.getBoundingClientRect() : null;
  const titleSize = Number.isFinite(previewTitleSize)
    ? Math.round(previewTitleSize * exportScale * EXPORT_TEXT_SCALE_ADJUSTMENT)
    : Math.round(width * 0.055);
  const subtitleSize = Number.isFinite(previewSubtitleSize)
    ? Math.round(previewSubtitleSize * exportScale * EXPORT_TEXT_SCALE_ADJUSTMENT)
    : Math.round(width * 0.028);
  const titleY = posterFrameRect && posterCityRect
    ? Math.round((posterCityRect.top - posterFrameRect.top + posterCityRect.height / 2) * exportScale)
    : Math.round(mapHeight + labelBand * 0.52);
  const subtitleY = posterFrameRect && posterCountryRect
    ? Math.round((posterCountryRect.top - posterFrameRect.top + posterCountryRect.height / 2) * exportScale)
    : Math.round(mapHeight + labelBand * 0.82);

  return {
    width,
    height,
    labelBand,
    mapHeight,
    titleSize,
    subtitleSize,
    titleY,
    subtitleY
  };
}

function getCompassPalette(theme) {
  return {
    bg: theme.ui.bg,
    ring: theme.ui.text,
    accent: theme.map.water || theme.ui.text,
    muted: theme.map.land || theme.ui.bg
  };
}

function getCompassMetrics(width, mapHeight) {
  const size = Math.max(72, Math.round(Math.min(width, mapHeight) * 0.13));
  const radius = Math.round(size / 2);
  const inset = Math.max(28, Math.round(size * 0.32));

  return {
    size,
    radius,
    centerX: width - inset - radius,
    centerY: inset + radius
  };
}

function getCompassAngle() {
  return map ? -map.getBearing() : 0;
}

function applyCompassRotation() {
  if (!posterCompassRose) return;
  posterCompassRose.setAttribute('transform', `rotate(${getCompassAngle()} 50 50)`);
}

function drawCompass(ctx, theme, width, mapHeight) {
  if (!state.layers.compass) return;

  const palette = getCompassPalette(theme);
  const compass = getCompassMetrics(width, mapHeight);
  const sideOffset = compass.radius * 0.32;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = compass.size * 0.22;
  ctx.shadowOffsetY = compass.size * 0.08;

  ctx.beginPath();
  ctx.fillStyle = palette.bg;
  ctx.globalAlpha = 0.92;
  ctx.arc(compass.centerX, compass.centerY, compass.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';

  ctx.beginPath();
  ctx.lineWidth = Math.max(3, compass.size * 0.045);
  ctx.strokeStyle = palette.ring;
  ctx.arc(compass.centerX, compass.centerY, compass.radius * 0.95, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(compass.centerX, compass.centerY);
  ctx.rotate((getCompassAngle() * Math.PI) / 180);
  ctx.translate(-compass.centerX, -compass.centerY);

  ctx.fillStyle = palette.ring;
  ctx.beginPath();
  ctx.moveTo(compass.centerX, compass.centerY - compass.radius * 0.88);
  ctx.lineTo(compass.centerX + sideOffset, compass.centerY);
  ctx.lineTo(compass.centerX, compass.centerY - compass.radius * 0.2);
  ctx.lineTo(compass.centerX - sideOffset, compass.centerY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(compass.centerX, compass.centerY + compass.radius * 0.88);
  ctx.lineTo(compass.centerX + sideOffset, compass.centerY);
  ctx.lineTo(compass.centerX, compass.centerY + compass.radius * 0.2);
  ctx.lineTo(compass.centerX - sideOffset, compass.centerY);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = palette.muted;
  ctx.arc(compass.centerX, compass.centerY, compass.radius * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.lineWidth = Math.max(2, compass.size * 0.03);
  ctx.strokeStyle = palette.ring;
  ctx.arc(compass.centerX, compass.centerY, compass.radius * 0.12, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function buildCompassSvg(theme, width, mapHeight) {
  if (!state.layers.compass) return '';

  const palette = getCompassPalette(theme);
  const compass = getCompassMetrics(width, mapHeight);
  const sideOffset = compass.radius * 0.32;

  return [
    '  <g>',
    `    <circle cx="${compass.centerX}" cy="${compass.centerY}" r="${compass.radius}" fill="${escapeXml(palette.bg)}" fill-opacity="0.92" />`,
    `    <circle cx="${compass.centerX}" cy="${compass.centerY}" r="${compass.radius * 0.95}" fill="none" stroke="${escapeXml(palette.ring)}" stroke-width="${Math.max(3, compass.size * 0.045)}" />`,
    `    <g transform="rotate(${getCompassAngle()} ${compass.centerX} ${compass.centerY})">`,
    `    <path d="M ${compass.centerX} ${compass.centerY - compass.radius * 0.88} L ${compass.centerX + sideOffset} ${compass.centerY} L ${compass.centerX} ${compass.centerY - compass.radius * 0.2} L ${compass.centerX - sideOffset} ${compass.centerY} Z" fill="${escapeXml(palette.ring)}" />`,
    `    <path d="M ${compass.centerX} ${compass.centerY + compass.radius * 0.88} L ${compass.centerX + sideOffset} ${compass.centerY} L ${compass.centerX} ${compass.centerY + compass.radius * 0.2} L ${compass.centerX - sideOffset} ${compass.centerY} Z" fill="${escapeXml(palette.accent)}" />`,
    `    <circle cx="${compass.centerX}" cy="${compass.centerY}" r="${compass.radius * 0.12}" fill="${escapeXml(palette.muted)}" stroke="${escapeXml(palette.ring)}" stroke-width="${Math.max(2, compass.size * 0.03)}" />`,
    '    </g>',
    '  </g>'
  ].join('\n');
}

function applyLabels() {
  posterCity.textContent = state.city;
  posterCountry.textContent = state.country;
  labelCity.value = state.city;
  labelCountry.value = state.country;
}

function formatZoomValue(zoom) {
  return Number.isFinite(zoom) ? zoom.toFixed(2) : '0.00';
}

function applyDebugOverlay() {
  if (!posterDebug) return;
  posterDebug.hidden = !appConfig.debug;
  if (!appConfig.debug) return;
  posterDebug.textContent = `Zoom: ${formatZoomValue(state.zoom)}`;
}

function rotateMapBy(delta) {
  if (!map) return;

  map.rotateTo(map.getBearing() + delta, {
    duration: 300
  });
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

function applyCompassVisibility() {
  posterCompass.hidden = !state.layers.compass;
  applyCompassRotation();
}

function applyLayerOption(optionId) {
  if (optionId === 'compass') {
    applyCompassVisibility();
    return;
  }

  const layerIds = LAYER_IDS_BY_OPTION[optionId] || [];
  setLayerVisibility(layerIds, state.layers[optionId]);
}

function applyLayerVisibility() {
  LAYER_OPTIONS.forEach(option => {
    applyLayerOption(option.id);
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
    bearing: state.bearing,
    attributionControl: false,
    preserveDrawingBuffer: true,
    dragRotate: false,
    pitchWithRotate: false
  });

  map.on('moveend', () => {
    const center = map.getCenter();
    state.center = [center.lng, center.lat];
    state.zoom = map.getZoom();
    state.bearing = map.getBearing();
    applyDebugOverlay();
    saveViewState();
  });

  map.on('rotate', applyCompassRotation);
  map.on('rotateend', () => {
    state.bearing = map.getBearing();
    saveViewState();
  });

  map.once('load', applyLayerVisibility);

  map.on('error', (event) => {
    console.error('Map error:', event.error || event);
  });

  requestAnimationFrame(() => {
    map.resize();
    applyCompassRotation();
    applyDebugOverlay();
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
      saveViewState();
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
      applyLayerOption(option.id);
      saveViewState();
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
  orientationSelect.value = state.orientation;
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

  const targetZoom = appConfig.tileProvider === 'mapbox' && state.layers.buildings
    ? MAPBOX_BUILDING_FOCUS_ZOOM
    : 10;

  map.flyTo({
    center: state.center,
    zoom: Math.max(map.getZoom(), targetZoom),
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
  saveViewState();
});

labelCountry.addEventListener('input', () => {
  state.country = labelCountry.value;
  posterCountry.textContent = state.country;
  saveViewState();
});

labelFont.addEventListener('change', () => {
  state.fontFamily = labelFont.value;
  applyThemeUi();
  saveViewState();
});

layoutSelect.addEventListener('change', () => {
  state.layoutId = layoutSelect.value;
  updatePosterLayout();
  saveViewState();
});

orientationSelect.addEventListener('change', () => {
  state.orientation = orientationSelect.value;
  updatePosterLayout();
  saveViewState();
});

document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn({ duration: 300 }));
document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut({ duration: 300 }));
rotateLeftButton.addEventListener('click', () => rotateMapBy(-ROTATION_STEP));
rotateRightButton.addEventListener('click', () => rotateMapBy(ROTATION_STEP));

function waitForNextFrame() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function waitForMapReadyForExport() {
  if (!map) return;

  if (!map.loaded()) {
    await new Promise(resolve => {
      map.once('load', resolve);
    });
  }

  if (map.isMoving()) {
    await new Promise(resolve => {
      map.once('moveend', resolve);
    });
  }

  map.triggerRepaint();
  await waitForNextFrame();
}

async function exportPng() {
  exportButton.disabled = true;
  exportButton.textContent = 'Exporting…';

  try {
    await waitForMapReadyForExport();

    const theme = getTheme();
    const { width, height, labelBand, mapHeight, titleSize, subtitleSize, titleY, subtitleY } = getPosterMetrics();

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

    drawCompass(ctx, theme, width, mapHeight);

    ctx.fillStyle = theme.ui.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${titleSize}px "${state.fontFamily}", sans-serif`;
    ctx.fillText(state.city, width / 2, titleY);
    ctx.font = `500 ${subtitleSize}px "${state.fontFamily}", sans-serif`;
    ctx.fillText(state.country, width / 2, subtitleY);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error('PNG export failed'));
      }, 'image/png');
    });

    downloadBlob(blob, `${slugify(state.city || 'map')}-poster.png`);
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = 'Download PNG';
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getSvgFontConfig(fontFamily) {
  return SVG_FONT_CONFIG[fontFamily] || SVG_FONT_CONFIG.Inter;
}

function pickClosestFontWeight(weights, targetWeight) {
  return weights.reduce((closest, current) => {
    if (closest === null) return current;
    return Math.abs(current - targetWeight) < Math.abs(closest - targetWeight)
      ? current
      : closest;
  }, null);
}

// Evaluates a MapLibre GL "interpolate linear zoom" expression at the given zoom.
// Returns the plain number if expr is already a number; returns null for unknown expressions.
function evalGlInterpolateAtZoom(expr, zoom) {
  if (typeof expr === 'number') return expr;
  if (
    Array.isArray(expr) &&
    expr[0] === 'interpolate' &&
    Array.isArray(expr[2]) && expr[2][0] === 'zoom'
  ) {
    const stops = [];
    for (let i = 3; i + 1 < expr.length; i += 2) {
      stops.push([expr[i], expr[i + 1]]);
    }
    if (!stops.length) return 0;
    if (zoom <= stops[0][0]) return stops[0][1];
    if (zoom >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [z0, v0] = stops[i];
      const [z1, v1] = stops[i + 1];
      if (zoom >= z0 && zoom <= z1) {
        return v0 + ((zoom - z0) / (z1 - z0)) * (v1 - v0);
      }
    }
    return stops[stops.length - 1][1];
  }
  return null;
}

// Renders the map as vector SVG paths by querying MapLibre's rendered features
// and projecting their GeoJSON coordinates into the SVG coordinate system.
function buildVectorMapSvg(theme, width, mapHeight) {
  const zoom = map.getZoom();
  const canvas = map.getCanvas();
  // clientWidth/Height are CSS pixels; map.project() also returns CSS pixels.
  const cw = canvas.clientWidth || canvas.width;
  const ch = canvas.clientHeight || canvas.height;
  const sx = width / cw;
  const sy = mapHeight / ch;

  function project(coord) {
    const pt = map.project({ lng: coord[0], lat: coord[1] });
    return [pt.x * sx, pt.y * sy];
  }

  function ringToD(coords, close) {
    const parts = [];
    for (let i = 0; i < coords.length; i++) {
      const [x, y] = project(coords[i]);
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (close) parts.push('Z');
    return parts.join('');
  }

  function featureToD(feature) {
    const g = feature.geometry;
    if (!g) return '';
    switch (g.type) {
      case 'Polygon':
        return g.coordinates.map(r => ringToD(r, true)).join('');
      case 'MultiPolygon':
        return g.coordinates.flatMap(p => p.map(r => ringToD(r, true))).join('');
      case 'LineString':
        return ringToD(g.coordinates, false);
      case 'MultiLineString':
        return g.coordinates.map(l => ringToD(l, false)).join('');
      default:
        return '';
    }
  }

  function queryLayer(layerId) {
    if (!map.getLayer(layerId)) return [];
    return map.queryRenderedFeatures({ layers: [layerId] });
  }

  function safeGetPaint(layerId, prop) {
    try { return map.getPaintProperty(layerId, prop); } catch (_) { return null; }
  }

  function evalPaintNumber(layerId, prop, fallback) {
    const val = safeGetPaint(layerId, prop);
    if (val == null) return fallback;
    const evaled = evalGlInterpolateAtZoom(val, zoom);
    if (evaled != null) return evaled;
    if (typeof val === 'number') return val;
    return fallback;
  }

  function renderFillLayer(layerId) {
    const opacity = evalPaintNumber(layerId, 'fill-opacity', 1);
    if (opacity <= 0) return '';
    const features = queryLayer(layerId);
    if (!features.length) return '';
    const paths = features.map(f => featureToD(f)).filter(Boolean);
    if (!paths.length) return '';
    const fill = safeGetPaint(layerId, 'fill-color') || '#ffffff';
    const opAttr = Math.abs(opacity - 1) > 0.001 ? ` fill-opacity="${opacity.toFixed(3)}"` : '';
    return `  <path d="${paths.join('')}" fill="${escapeXml(String(fill))}"${opAttr}/>`;
  }

  function renderLineLayer(layerId) {
    const opacity = evalPaintNumber(layerId, 'line-opacity', 1);
    if (opacity <= 0) return '';
    const features = queryLayer(layerId);
    if (!features.length) return '';
    const paths = features.map(f => featureToD(f)).filter(Boolean);
    if (!paths.length) return '';
    const stroke = safeGetPaint(layerId, 'line-color') || '#000000';
    const widthPx = evalPaintNumber(layerId, 'line-width', 1);
    const strokeWidth = (widthPx * sx).toFixed(2);
    const opAttr = Math.abs(opacity - 1) > 0.001 ? ` stroke-opacity="${opacity.toFixed(3)}"` : '';
    // MapLibre line-dasharray values are multiples of line-width, so scale accordingly.
    const dashRaw = safeGetPaint(layerId, 'line-dasharray');
    const dashAttr = Array.isArray(dashRaw) && dashRaw.length >= 2
      ? ` stroke-dasharray="${dashRaw.map(v => (v * widthPx * sx).toFixed(2)).join(',')}"`
      : '';
    let lineCap = 'butt';
    let lineJoin = 'miter';
    try {
      const capRaw = map.getLayoutProperty(layerId, 'line-cap');
      const joinRaw = map.getLayoutProperty(layerId, 'line-join');
      if (typeof capRaw === 'string') lineCap = capRaw;
      if (typeof joinRaw === 'string') lineJoin = joinRaw;
    } catch (_) {}
    return `  <path d="${paths.join('')}" fill="none" stroke="${escapeXml(String(stroke))}" stroke-width="${strokeWidth}" stroke-linecap="${lineCap}" stroke-linejoin="${lineJoin}"${opAttr}${dashAttr}/>`;
  }

  const ALL_LAYER_IDS = [
    'landcover', 'park', 'water', 'waterway', 'aeroway',
    'rail',
    'road-minor-overview-low', 'road-minor-overview-mid', 'road-minor-overview-high',
    'road-path-overview',
    'road-path-casing', 'road-minor-mid-casing', 'road-minor-high-casing', 'road-major-casing',
    'road-minor-low', 'road-minor-mid', 'road-minor-high', 'road-path', 'road-major',
    'building'
  ];
  const FILL_LAYER_IDS = new Set(['landcover', 'park', 'water', 'aeroway', 'building']);

  const parts = [
    `<defs><clipPath id="map-clip"><rect x="0" y="0" width="${width}" height="${mapHeight}"/></clipPath></defs>`,
    `<g clip-path="url(#map-clip)">`,
    `  <rect x="0" y="0" width="${width}" height="${mapHeight}" fill="${escapeXml(theme.map.land)}"/>`,
    ...ALL_LAYER_IDS.map(id => FILL_LAYER_IDS.has(id) ? renderFillLayer(id) : renderLineLayer(id)),
    `</g>`
  ].filter(Boolean);

  return parts.join('\n');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read font data'));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read font data'));
    reader.readAsDataURL(blob);
  });
}

async function fetchEmbeddedFontFace(fontFamily, weight) {
  const config = getSvgFontConfig(fontFamily);
  const cacheKey = `${config.family}:${weight}`;
  if (svgFontFaceCache.has(cacheKey)) {
    return svgFontFaceCache.get(cacheKey);
  }

  let dataUrl = svgFontDataCache.get(config.url);

  if (!dataUrl) {
    const fontResponse = await fetch(config.url);
    if (!fontResponse.ok) {
      throw new Error(`Failed to download font file for ${config.family}`);
    }

    dataUrl = await blobToDataUrl(await fontResponse.blob());
    svgFontDataCache.set(config.url, dataUrl);
  }

  const fontFace = [
    '@font-face {',
    `  font-family: '${config.family}';`,
    '  font-style: normal;',
    `  font-weight: ${weight};`,
    `  src: url('${dataUrl}') format('truetype');`,
    '}'
  ].join('\n');

  svgFontFaceCache.set(cacheKey, fontFace);
  return fontFace;
}

async function buildSvgFontStyle(fontFamily) {
  const config = getSvgFontConfig(fontFamily);
  const requestedWeights = [...new Set([
    700,
    pickClosestFontWeight(config.weights, 500)
  ])];
  const fontFaces = await Promise.all(
    requestedWeights.map(weight => fetchEmbeddedFontFace(config.family, weight))
  );

  return [
    '  <defs>',
    '    <style type="text/css"><![CDATA[',
    fontFaces.join('\n'),
    '    ]]></style>',
    '  </defs>'
  ].join('\n');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

async function exportSvg() {
  exportSvgButton.disabled = true;
  exportSvgButton.textContent = 'Exporting…';

  try {
    await waitForMapReadyForExport();

    const theme = getTheme();
    const { width, height, labelBand, mapHeight, titleSize, subtitleSize, titleY, subtitleY } = getPosterMetrics();
    const svgSize = getSvgDocumentSize();
    const fontConfig = getSvgFontConfig(state.fontFamily);
    const subtitleFontWeight = pickClosestFontWeight(fontConfig.weights, 500);
    let embeddedFontStyle = '';

    try {
      embeddedFontStyle = await buildSvgFontStyle(fontConfig.family);
    } catch (error) {
      console.warn('Failed to embed SVG font, falling back to installed fonts.', error);
    }

    const mapVectorSvg = buildVectorMapSvg(theme, width, mapHeight);

    const svg = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgSize.width}" height="${svgSize.height}" viewBox="0 0 ${width} ${height}">`,
      embeddedFontStyle,
      `  <rect width="${width}" height="${height}" fill="${escapeXml(theme.ui.bg)}" />`,
      mapVectorSvg,
      buildCompassSvg(theme, width, mapHeight),
      `  <rect x="0" y="${mapHeight}" width="${width}" height="${labelBand}" fill="${escapeXml(theme.ui.bg)}" />`,
      `  <text x="${Math.round(width / 2)}" y="${titleY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(theme.ui.text)}" font-family="${escapeXml(fontConfig.family)}, sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(state.city)}</text>`,
      `  <text x="${Math.round(width / 2)}" y="${subtitleY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(theme.ui.text)}" fill-opacity="0.85" font-family="${escapeXml(fontConfig.family)}, sans-serif" font-size="${subtitleSize}" font-weight="${subtitleFontWeight}" letter-spacing="0.04em">${escapeXml(state.country)}</text>`,
      '</svg>'
    ].filter(Boolean).join('\n');

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${slugify(state.city || 'map')}-poster.svg`);
  } finally {
    exportSvgButton.disabled = false;
    exportSvgButton.textContent = 'Download SVG';
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'map';
}

exportButton.addEventListener('click', exportPng);
exportSvgButton.addEventListener('click', exportSvg);

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

  const [configResponse, themesResponse, layoutsResponse] = await Promise.all([
    fetch('/api/config'),
    fetch('themes.json'),
    fetch('layouts.json')
  ]);

  appConfig = await configResponse.json();
  themesData = await themesResponse.json();
  layoutsData = await layoutsResponse.json();

  if (!themesData.themes[state.themeId]) {
    state.themeId = Object.keys(themesData.themes)[0];
  }

  const hasLayout = (layoutsData.categories || []).some(category => (
    (category.layouts || []).some(layout => layout.id === state.layoutId)
  ));

  if (!hasLayout) {
    state.layoutId = layoutsData.defaultLayoutId || 'poster_18x24_portrait';
  }

  labelFont.value = state.fontFamily;
  applyThemeUi();
  updatePosterLayout();
  applyLabels();
  applyDebugOverlay();
  applyCompassVisibility();
  renderThemeGrid();
  renderLayerList();
  renderLayoutSelect();
  initAccordion();
  initMap();
  saveViewState();
}

window.addEventListener('resize', () => {
  if (map) map.resize();
});

boot().catch(error => {
  console.error(error);
  alert('Failed to start the app. Check the console for details.');
});
