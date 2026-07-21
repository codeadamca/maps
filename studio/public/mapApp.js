// Center set to Manicouagan Reservoir (Quebec, Canada)
const DEFAULT_CENTER = [-68.703754, 51.417865];
const DEFAULT_ZOOM = 8.5;
const MAPBOX_BUILDING_FOCUS_ZOOM = 16;
const VIEW_STATE_KEY = 'map-poster:view';
const EXPORT_DPI = 96;
const MAX_EXPORT_DIMENSION = 1600;
const EXPORT_TEXT_SCALE_ADJUSTMENT = 1.08;

let layersData = { options: [] };

const state = {
  themeId: 'coral',
  layoutId: 'poster_18x24_portrait',
  orientation: 'portrait',
  city: 'Manicouagan Reservoir',
  country: 'Quebec, Canada',
  fontFamily: 'Inter',
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
let fontsData = { fonts: [] };
let iconsData = { icons: {} };
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
const previewContainer = document.getElementById('preview-container');
const documentViewport = document.getElementById('document-viewport');
const posterCompass = document.getElementById('poster-compass');
const posterCompassRose = document.getElementById('poster-compass-rose');
const posterCity = document.getElementById('poster-city');
const posterCountry = document.getElementById('poster-country');
const posterLabels = document.getElementById('poster-labels');
const exportButton = document.getElementById('export-png');
const exportSvgButton = document.getElementById('export-svg');
const rotateLeftButton = document.getElementById('rotate-left');
const rotateRightButton = document.getElementById('rotate-right');
const debugCoordsInput = document.getElementById('debug-coords');
const debugZoomInput = document.getElementById('debug-zoom');

const ROTATION_STEP = 15;

// ── Points of Interest ────────────────────────────────────────────────────────
// Icons are loaded from /data/icons.json into `iconsData`. Use `iconsList()` to
// access an ordered array view for numeric indexes stored in POIs.

function iconsList() {
  return Object.values(iconsData.icons || {});
}

function getIconClass(idx) {
  const it = iconsList()[idx];
  return it ? it.icon || '' : '';
}

function getIconSvg(idx) {
  const it = iconsList()[idx];
  return it ? it.svg || null : null;
}

let poiList = [];          // [{ id, name, iconIdx, lng, lat }]
let poiLegendMode = false; // true = show legend; false = show callout labels
let poiPickerActive = false;
let poiIdCounter = 0;

const poiAddBtn = document.getElementById('poi-add');
const poiLegendCheck = document.getElementById('poi-legend-mode');
const poiListEl = document.getElementById('poi-list');
const poiOverlay = document.getElementById('poi-overlay');
const poiLegendEl = document.getElementById('poi-legend');
const poiDialog = document.getElementById('poi-dialog');
const poiNameInput = document.getElementById('poi-name-input');
const poiDialogCancel = document.getElementById('poi-dialog-cancel');
// ─────────────────────────────────────────────────────────────────────────────

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
      for (const optionId of Object.keys(state.layers)) {
        if (typeof saved.layers[optionId] === 'boolean') {
          state.layers[optionId] = saved.layers[optionId];
        }
      }
    }

    if (Array.isArray(saved.pois)) {
      poiList = saved.pois.filter(p =>
        p && typeof p.id === 'number' &&
        typeof p.name === 'string' &&
        typeof p.iconIdx === 'number' &&
        typeof p.lng === 'number' &&
        typeof p.lat === 'number'
      ).map(p => ({
        ...p,
        labelDx: typeof p.labelDx === 'number' ? p.labelDx : 0,
        labelDy: typeof p.labelDy === 'number' ? p.labelDy : -12
      }));
    }
    if (typeof saved.poiIdCounter === 'number') poiIdCounter = saved.poiIdCounter;
    if (typeof saved.poiLegendMode === 'boolean') {
      poiLegendMode = saved.poiLegendMode;
      poiLegendCheck.checked = poiLegendMode;
      poiOverlay.classList.toggle('legend-mode', poiLegendMode);
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
    layers: state.layers,
    pois: poiList,
    poiLegendMode,
    poiIdCounter
  }));
}

function getTheme() {
  return themesData.themes[state.themeId] || themesData.themes.coral;
}

// (helpers removed) keep theme text values as defined in `themes.json`

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
  
  if (layout.unit === 'ratio') {
    // For aspect ratio, use a fixed export width and calculate height from ratio
    const EXPORT_WIDTH = 1200;
    const rawWidth = EXPORT_WIDTH;
    const rawHeight = Math.round(EXPORT_WIDTH * (layout.height / layout.width));
    const largestDimension = Math.max(rawWidth, rawHeight);
    
    if (largestDimension <= MAX_EXPORT_DIMENSION) {
      return { width: rawWidth, height: rawHeight };
    }
    
    const scale = MAX_EXPORT_DIMENSION / largestDimension;
    return {
      width: Math.round(rawWidth * scale),
      height: Math.round(rawHeight * scale)
    };
  }
  
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

  if (layout.unit === 'ratio') {
    const BASE_WIDTH = 600; // Base width in pixels for ratio-based layouts
    const width = BASE_WIDTH;
    const height = Math.round(BASE_WIDTH * (layout.height / layout.width));
    return {
      width: `${width}px`,
      height: `${height}px`
    };
  }

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
  // label color used for the text in the white label band under the map
  document.documentElement.style.setProperty('--poster-label', theme.ui.label || theme.ui.text);
  document.documentElement.style.setProperty('--compass-bg', theme.ui.bg);
  document.documentElement.style.setProperty('--compass-ring', theme.ui.text);
  document.documentElement.style.setProperty('--compass-accent', theme.map.water || theme.ui.text);
  document.documentElement.style.setProperty('--compass-muted', theme.map.land || theme.ui.bg);
  posterLabels.style.fontFamily = `"${state.fontFamily}", sans-serif`;
}

function updateDocumentScale() {
  if (!previewContainer) return;
  
  // Get document dimensions from current layout
  const layout = getLayoutDimensions();
  
  let docWidth, docHeight;
  
  if (layout.unit === 'ratio') {
    // For aspect ratio, use a base width and calculate height from ratio
    const BASE_WIDTH = 600; // Base width in pixels for ratio-based layouts
    docWidth = BASE_WIDTH;
    docHeight = Math.round(BASE_WIDTH * (layout.height / layout.width));
  } else {
    // For cm or other units, convert to pixels
    docWidth = Math.round((layout.width / 2.54) * EXPORT_DPI);
    docHeight = Math.round((layout.height / 2.54) * EXPORT_DPI);
  }
  
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

function updatePositioningMetrics() {
  if (!posterFrame) return;
  
  const layout = getLayout(); // Get the layout with minWidth, minHeight
  if (layout.unit !== 'ratio' || !layout.minWidth || !layout.minHeight) {
    return; // Only for ratio-based layouts with min dimensions
  }
  
  // Calculate positioning as percentages of poster dimensions
  // All dimensions are based on the minimum reference dimensions
  
  // White label area: 1.5 inches high
  const labelBandHeight = (1.5 / layout.minHeight) * 100;
  
  // Legend: 0.25 inches from right and 0.25 inches above white label area
  const legendRight = (0.25 / layout.minWidth) * 100;
  const legendBottom = ((1.5 + 0.25) / layout.minHeight) * 100;
  
  // Compass: 1.875 inch diameter (increased by 50%), positioned 0.25 inches from top and right
  const compassSize = (1.875 / layout.minHeight) * 100;  // 1.875" diameter
  const compassTop = (0.25 / layout.minHeight) * 100;
  const compassRight = (0.25 / layout.minWidth) * 100;
  
  // Set CSS variables for use in positioning
  posterFrame.style.setProperty('--label-band-height', `${labelBandHeight}%`);
  posterFrame.style.setProperty('--legend-right', `${legendRight}%`);
  posterFrame.style.setProperty('--legend-bottom', `${legendBottom}%`);
  posterFrame.style.setProperty('--compass-size', `${compassSize}%`);
  posterFrame.style.setProperty('--compass-top', `${compassTop}%`);
  posterFrame.style.setProperty('--compass-right', `${compassRight}%`);
}

function applyPosterAspect() {
  const layout = getLayoutDimensions();
  posterFrame.style.setProperty('--poster-aspect', `${layout.width} / ${layout.height}`);
}

function updatePosterLayout() {
  applyPosterAspect();
  // Recalculate document scale (updates CSS vars) so layout/orientation
  // changes take effect immediately in the preview without a reload.
  updateDocumentScale();
  // Update positioning metrics for legend, compass, etc.
  updatePositioningMetrics();
  if (map) {
    requestAnimationFrame(() => map.resize());
  }
}

function getPosterMetrics() {
  const { width, height } = getExportDimensions();
  
  // Calculate label band height based on layout reference dimensions
  const layout = getLayout();
  let labelBandPercent = 0.14; // Default fallback
  if (layout.unit === 'ratio' && layout.minHeight) {
    // Label area is 1.5 inches high
    labelBandPercent = (1.5 / layout.minHeight);
  }
  const labelBand = Math.round(height * labelBandPercent);
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
  const size = Math.max(108, Math.round(Math.min(width, mapHeight) * 0.195));
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

// debug overlay removed

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

function getLayerIds(optionId) {
  const opt = (layersData.options || []).find(o => o.id === optionId);
  return (opt && Array.isArray(opt.ids)) ? opt.ids : [];
}

function applyLayerOption(optionId) {
  if (optionId === 'compass') {
    applyCompassVisibility();
    return;
  }
  const layerIds = getLayerIds(optionId);
  setLayerVisibility(layerIds, state.layers[optionId]);
}

function applyLayerVisibility() {
  (layersData.options || []).forEach(option => {
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
    saveViewState();
  });

  // Update debug coordinate display on move
  function updateMapCoordsInput() {
    if (!map) return;
    const c = map.getCenter();
    const val = `${c.lng.toFixed(6)}, ${c.lat.toFixed(6)}`;
    if (debugCoordsInput) debugCoordsInput.value = val;
    if (debugZoomInput && typeof map.getZoom === 'function') {
      const z = map.getZoom();
      debugZoomInput.value = z.toFixed(2);
    }
  }

  map.on('move', updateMapCoordsInput);
  map.on('zoom', updateMapCoordsInput);
  map.once('load', updateMapCoordsInput);

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

    // three-color preview: main road, water, land
    const roadColor = (theme.map && theme.map.roads && theme.map.roads.major) || theme.ui.text || '#000';
    const waterColor = (theme.map && theme.map.water) || theme.ui.bg || '#aaddff';
    const landColor = (theme.map && theme.map.land) || theme.ui.bg || '#fff';

    const swRoad = document.createElement('span');
    swRoad.className = 'theme-swatch-color theme-swatch-color--road';
    swRoad.style.background = roadColor;

    const swWater = document.createElement('span');
    swWater.className = 'theme-swatch-color theme-swatch-color--water';
    swWater.style.background = waterColor;

    const swLand = document.createElement('span');
    swLand.className = 'theme-swatch-color theme-swatch-color--land';
    swLand.style.background = landColor;

    preview.append(swRoad, swWater, swLand);

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
  (layersData.options || []).forEach(option => {
    const label = document.createElement('label');
    label.className = 'layer-toggle';

    const text = document.createElement('span');
    text.textContent = option.label;

    const switchWrap = document.createElement('span');
    switchWrap.className = 'layer-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.layers[option.id];
    input.addEventListener('change', () => {
      state.layers[option.id] = input.checked;
      applyLayerOption(option.id);
      saveViewState();
    });

    const track = document.createElement('span');
    track.className = 'layer-track';
    const thumb = document.createElement('span');
    thumb.className = 'layer-thumb';
    track.append(thumb);
    switchWrap.append(input, track);

    label.append(text, switchWrap);
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

// Reset app: clear localStorage and reload (with confirmation)
const resetButton = document.getElementById('reset-app-button');
if (resetButton) {
  resetButton.addEventListener('click', async () => {
    const confirmed = await showConfirm({
      title: 'Reset Design',
      message: 'Clear all saved settings and start fresh? This will remove local storage.',
      confirmText: 'Reset',
      cancelText: 'Cancel',
      danger: true
    });
    if (!confirmed) return;
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Error clearing storage', e);
    }
    location.reload();
  });
}

// ── Points of Interest logic ──────────────────────────────────────────────────

function poiNextId() {
  return ++poiIdCounter;
}

/**
 * Convert a [lng, lat] pair to a CSS percentage position inside the poster frame.
 * Returns null if the map is not ready or the point is outside the viewport.
 */
function poiLngLatToPercent(lng, lat) {
  if (!map) return null;
  const pt = map.project([lng, lat]);
  // Use the poster-frame dimensions so percentages are relative to the
  // containing element of .poi-overlay (which has inset: 0 on the frame).
  const fw = posterFrame.clientWidth  || 1;
  const fh = posterFrame.clientHeight || 1;
  return {
    x: (pt.x / fw) * 100,
    y: (pt.y / fh) * 100
  };
}

/** Re-render every POI callout / legend overlay on the poster. */
function renderPoiOverlays() {
  poiOverlay.innerHTML = '';

  if (poiLegendMode) {
    // In legend mode: place just a tiny icon dot at the clicked spot.
    poiList.forEach(poi => {
      const pos = poiLngLatToPercent(poi.lng, poi.lat);
      if (!pos) return;
      const pin = document.createElement('div');
      pin.className = 'poi-pin';
      pin.style.left = `${pos.x}%`;
      pin.style.top  = `${pos.y}%`;
      pin.innerHTML = `<div class="poi-pin-body"><div class="poi-pin-circle"><i class="${getIconClass(poi.iconIdx)}"></i></div></div>`;
      poiOverlay.append(pin);
    });

    // Build legend panel.
    poiLegendEl.hidden = false;
    poiLegendEl.innerHTML = '';
    poiLegendEl.style.fontFamily = `"${state.fontFamily}", sans-serif`;

    // Position legend at bottom-right based on calculated metrics
    // Get the CSS variable values that were calculated in updatePositioningMetrics
    const posterFrameStyles = getComputedStyle(posterFrame);
    const legendRightVal = posterFrameStyles.getPropertyValue('--legend-right').trim() || '5.56%';
    const legendBottomVal = posterFrameStyles.getPropertyValue('--legend-bottom').trim() || '8.33%';
    
    poiLegendEl.style.right  = legendRightVal;
    poiLegendEl.style.bottom = legendBottomVal;
    poiLegendEl.style.left   = 'auto';
    poiLegendEl.style.top    = 'auto';

    poiList.forEach(poi => {
      const row = document.createElement('div');
      row.className = 'poi-legend-row';
      row.innerHTML = `<span class="poi-legend-icon"><i class="${getIconClass(poi.iconIdx)}"></i></span><span class="poi-legend-name">${escapeHtml(poi.name)}</span>`;
      poiLegendEl.append(row);
    });
    if (!poiList.length) {
      // Hide the legend entirely when there are no POIs.
      poiLegendEl.hidden = true;
      return;
    }
  } else {
    // Legend mode is OFF: show callout labels with tails and dots.
    poiLegendEl.hidden = true;

    // One SVG layer for all tails (drawn beneath the boxes).
    const tailSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tailSvg.setAttribute('class', 'poi-line-svg');
    tailSvg.setAttribute('aria-hidden', 'true');
    
    // Set SVG dimensions to match rendered frame so coordinates align
    const frameRect = posterFrame.getBoundingClientRect();
    const svgW = Math.round(frameRect.width || 1);
    const svgH = Math.round(frameRect.height || 1);
    tailSvg.setAttribute('width', svgW);
    tailSvg.setAttribute('height', svgH);
    tailSvg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    
    poiOverlay.append(tailSvg);

    poiList.forEach(poi => {
      const anchor = poiLngLatToPercent(poi.lng, poi.lat);
      if (!anchor) return;

      // Get rendered frame dimensions for tail calculations
      const frameRect = posterFrame.getBoundingClientRect();
      const fw = frameRect.width || 1;
      const fh = frameRect.height || 1;

      function tailPoints(labelX, labelY) {
        const ax = (anchor.x / 100) * fw;
        const ay = (anchor.y / 100) * fh;
        const lx = (labelX  / 100) * fw;
        const ly = (labelY  / 100) * fh;
        const half = Math.max(4, fw * 0.009);
        return `${lx - half},${ly} ${lx + half},${ly} ${ax},${ay}`;
      }

      const labelX = anchor.x + poi.labelDx;
      const labelY = anchor.y + poi.labelDy;

      // Filled triangle tail.
      const tail = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      tail.setAttribute('points', tailPoints(labelX, labelY));
      tail.setAttribute('class', 'poi-tail');
      tailSvg.append(tail);

      // Anchor dot.
      const dot = document.createElement('div');
      dot.className = 'poi-callout-dot';
      dot.style.left = `${anchor.x}%`;
      dot.style.top  = `${anchor.y}%`;
      poiOverlay.append(dot);

      // Draggable label box.
      const box = document.createElement('div');
      box.className = 'poi-callout-box';
      box.style.left = `${labelX}%`;
      box.style.top  = `${labelY}%`;
      box.style.fontFamily = `"${state.fontFamily}", sans-serif`;
      box.innerHTML =
        `<span class="poi-callout-icon"><i class="${getIconClass(poi.iconIdx)}"></i></span>` +
        `<span class="poi-callout-name">${escapeHtml(poi.name)}</span>`;

      // Drag logic.
      let dragging = false;
      let startPx, startPy, startDx, startDy;
      let dragFrameW = 1, dragFrameH = 1;

      box.addEventListener('pointerdown', e => {
        e.stopPropagation();
        dragging = true;
        box.setPointerCapture(e.pointerId);
        startPx = e.clientX;
        startPy = e.clientY;
        startDx = poi.labelDx;
        startDy = poi.labelDy;
        // Capture rendered frame dimensions at drag start
        const frameRect = posterFrame.getBoundingClientRect();
        dragFrameW = frameRect.width || 1;
        dragFrameH = frameRect.height || 1;
        box.classList.add('is-dragging');
      });

      box.addEventListener('pointermove', e => {
        if (!dragging) return;
        poi.labelDx = startDx + ((e.clientX - startPx) / dragFrameW) * 100;
        poi.labelDy = startDy + ((e.clientY - startPy) / dragFrameH) * 100;
        const nx = anchor.x + poi.labelDx;
        const ny = anchor.y + poi.labelDy;
        box.style.left = `${nx}%`;
        box.style.top  = `${ny}%`;
        tail.setAttribute('points', tailPoints(nx, ny));
      });

      box.addEventListener('pointerup', e => {
        if (!dragging) return;
        dragging = false;
        box.classList.remove('is-dragging');
        box.releasePointerCapture(e.pointerId);
        saveViewState();
      });

      poiOverlay.append(box);
    });
  }
}
function renderPoiList() {
  poiListEl.innerHTML = '';
  poiList.forEach(poi => {
    const li = document.createElement('li');
    li.className = 'poi-list-item';

    const iconBtn = document.createElement('button');
    iconBtn.type = 'button';
    iconBtn.className = 'poi-icon-btn';
    iconBtn.title = 'Click to change icon';
    iconBtn.innerHTML = `<i class="${getIconClass(poi.iconIdx)}"></i>`;
    iconBtn.addEventListener('click', () => {
      const iconsLen = iconsList().length || 1;
      poi.iconIdx = (poi.iconIdx + 1) % iconsLen;
      iconBtn.innerHTML = `<i class="${getIconClass(poi.iconIdx)}"></i>`;
      renderPoiOverlays();
      saveViewState();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'poi-item-name';
    nameSpan.textContent = poi.name;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'poi-delete-btn';
    delBtn.title = 'Remove POI';
    delBtn.setAttribute('aria-label', `Remove ${poi.name}`);
    delBtn.innerHTML = '×';
    delBtn.addEventListener('click', () => {
      poiList = poiList.filter(p => p.id !== poi.id);
      renderPoiList();
      renderPoiOverlays();
      saveViewState();
    });

    li.append(iconBtn, nameSpan, delBtn);
    poiListEl.append(li);
  });
}

/** Add a new POI at the given map coordinates. */
function addPoi(lng, lat, name) {
  poiList.push({ id: poiNextId(), name, iconIdx: 0, lng, lat, labelDx: 0, labelDy: -12 });
  renderPoiList();
  renderPoiOverlays();
  saveViewState();
}

/** Activate picker: cursor becomes crosshair and next map click places a POI. */
function activatePoiPicker() {
  if (poiPickerActive) return;
  poiPickerActive = true;
  poiAddBtn.classList.add('is-active');
  map.getCanvas().style.cursor = 'crosshair';

  function onMapClick(e) {
    const { lng, lat } = e.lngLat;
    deactivatePoiPicker();
    openPoiNameDialog(lng, lat);
  }

  map.once('click', onMapClick);

  // Allow Escape to cancel.
  function onKey(e) {
    if (e.key === 'Escape') {
      map.off('click', onMapClick);
      deactivatePoiPicker();
    }
  }
  document.addEventListener('keydown', onKey, { once: true });
}

function deactivatePoiPicker() {
  poiPickerActive = false;
  poiAddBtn.classList.remove('is-active');
  if (map) map.getCanvas().style.cursor = '';
}

/** Open the name dialog; on confirm add the POI. */
function openPoiNameDialog(lng, lat) {
  poiNameInput.value = '';
  poiDialog.showModal();

  function onConfirm(e) {
    e.preventDefault();
    const name = poiNameInput.value.trim();
    poiDialog.close();
    cleanup();
    if (name) addPoi(lng, lat, name);
  }

  function onCancel() {
    poiDialog.close();
    cleanup();
  }

  function cleanup() {
    poiDialog.querySelector('form').removeEventListener('submit', onConfirm);
    poiDialogCancel.removeEventListener('click', onCancel);
  }

  poiDialog.querySelector('form').addEventListener('submit', onConfirm);
  poiDialogCancel.addEventListener('click', onCancel);
  setTimeout(() => poiNameInput.focus(), 50);
}

// Update overlay positions whenever the map moves.
function bindPoiMapEvents() {
  map.on('move',       renderPoiOverlays);
  map.on('zoom',       renderPoiOverlays);
  map.on('rotate',     renderPoiOverlays);
  map.on('moveend',    renderPoiOverlays);
  map.on('zoomend',    renderPoiOverlays);
  map.on('rotateend',  renderPoiOverlays);
}

poiAddBtn.addEventListener('click', () => {
  if (poiPickerActive) { deactivatePoiPicker(); return; }
  activatePoiPicker();
});

poiLegendCheck.addEventListener('change', () => {
  poiLegendMode = poiLegendCheck.checked;
  poiOverlay.classList.toggle('legend-mode', poiLegendMode);
  renderPoiOverlays();
  saveViewState();
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────

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

async function waitForCanvasTextFonts(fontFamily) {
  if (!document.fonts?.load) return;

  const config = getSvgFontConfig(fontFamily);
  const weights = [...new Set([
    700,
    pickClosestFontWeight(config.weights, 500)
  ])].filter(Boolean);

  try {
    await Promise.all(weights.map(weight => document.fonts.load(`${weight} 32px "${config.family}"`)));
    await document.fonts.ready;
  } catch (error) {
    console.warn('Canvas font preload failed, falling back to installed fonts.', error);
  }
}

async function exportPng() {
  exportButton.disabled = true;
  exportButton.textContent = 'Exporting…';

  try {
    await waitForMapReadyForExport();
    await waitForCanvasTextFonts(state.fontFamily);

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

    drawPoiPng(ctx, width, mapHeight);

    ctx.fillStyle = theme.ui.label || theme.ui.text;
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

  // Compute bounding box for lake features (water/waterway) and add a visible rect
  let lakeBbox = null;
  const lakeLayerIds = ['water', 'waterway'];
  function expandBbox(x, y) {
    if (!lakeBbox) lakeBbox = { minX: x, minY: y, maxX: x, maxY: y };
    else {
      lakeBbox.minX = Math.min(lakeBbox.minX, x);
      lakeBbox.minY = Math.min(lakeBbox.minY, y);
      lakeBbox.maxX = Math.max(lakeBbox.maxX, x);
      lakeBbox.maxY = Math.max(lakeBbox.maxY, y);
    }
  }

  for (const lid of lakeLayerIds) {
    const features = queryLayer(lid);
    for (const f of features) {
      const g = f.geometry;
      if (!g) continue;

      const processRing = (coords) => {
        for (let i = 0; i < coords.length; i++) {
          const [lng, lat] = coords[i];
          const [x, y] = project([lng, lat]);
          expandBbox(x, y);
        }
      };

      if (g.type === 'Polygon') {
        g.coordinates.forEach(r => processRing(r));
      } else if (g.type === 'MultiPolygon') {
        g.coordinates.forEach(p => p.forEach(r => processRing(r)));
      } else if (g.type === 'LineString') {
        processRing(g.coordinates);
      } else if (g.type === 'MultiLineString') {
        g.coordinates.forEach(l => processRing(l));
      }
    }
  }

  if (lakeBbox) {
    const pad = 4; // small padding in export pixels
    const x = Math.max(0, lakeBbox.minX - pad);
    const y = Math.max(0, lakeBbox.minY - pad);
    const w = Math.max(0, Math.min(width, lakeBbox.maxX + pad) - x);
    const h = Math.max(0, Math.min(mapHeight, lakeBbox.maxY + pad) - y);
    parts.push(`  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="#00ccff" stroke-width="2" stroke-opacity="0.9" />`);
  }

  return parts.join('\n');
}

/** Convert lng/lat → export-pixel {x, y} within the map area. */
function poiLngLatToExportPx(lng, lat, exportWidth, exportMapHeight) {
  if (!map) return null;
  const pt = map.project([lng, lat]);
  const canvas = map.getCanvas();
  const cw = canvas.clientWidth  || canvas.width;
  const ch = canvas.clientHeight || canvas.height;
  return {
    x: (pt.x / cw) * exportWidth,
    y: (pt.y / ch) * exportMapHeight
  };
}

/** Draw a POI icon using its SVG path onto a Canvas 2D context, centered at (cx, cy) within a square of `size` px. */
function drawPathIcon(ctx, iconIdx, cx, cy, size, color) {
  const icon = getIconSvg(iconIdx);
  if (!icon) return;
  const scale = size / Math.max(icon.vbW, icon.vbH);
  const ox = cx - (icon.vbW * scale) / 2;
  const oy = cy - (icon.vbH * scale) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(icon.d));
  ctx.restore();
}

/** Return an SVG <path> element for a POI icon, centered at (cx, cy) within a square of `size` px. */
function svgPathIcon(iconIdx, cx, cy, size, color) {
  const icon = getIconSvg(iconIdx);
  if (!icon) return '';
  const scale = size / Math.max(icon.vbW, icon.vbH);
  const ox = (cx - (icon.vbW * scale) / 2).toFixed(2);
  const oy = (cy - (icon.vbH * scale) / 2).toFixed(2);
  return `<path d="${icon.d}" transform="translate(${ox},${oy}) scale(${scale.toFixed(6)})" fill="${escapeXml(color)}"/>`;
}

function drawRoundedRect(ctx, x, y, width, height, radius, color) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw POI overlays onto a Canvas 2D context for PNG export. */
function drawPoiPng(ctx, exportWidth, mapHeight) {
  if (!poiList.length) return;

  const theme     = getTheme();
  const textColor = theme.ui.text;
  const bgColor   = theme.ui.bg;
  const { height } = getPosterMetrics(); // full poster height (map + label band)
  const boxRadius = 2;

  const fontSize = Math.max(18, Math.round(exportWidth * 0.024));
  const padH     = Math.round(exportWidth * 0.018);
  const padV     = Math.round(exportWidth * 0.016);
  const dotR     = Math.round(exportWidth * 0.005);

  if (poiLegendMode) {
    // ── Legend mode: teardrop pins ────────────────────────────────────────────
    const pinR   = Math.round(exportWidth * 0.040);
    const innerR = Math.round(pinR * 0.58);
    const triH   = Math.round(pinR * 0.75);
    const triW   = Math.round(pinR * 0.7);
    const iconF  = Math.round(innerR * 1.0);

    poiList.forEach(poi => {
      const pos = poiLngLatToExportPx(poi.lng, poi.lat, exportWidth, mapHeight);
      if (!pos || pos.x < 0 || pos.x > exportWidth || pos.y < 0 || pos.y > mapHeight) return;

      const tipX  = pos.x;
      const tipY  = pos.y;
      const bodyY = tipY - triH - pinR;

      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur    = Math.round(exportWidth * 0.008);
      ctx.shadowOffsetY = Math.round(exportWidth * 0.003);

      // Triangle (drawn first, behind circle)
      ctx.beginPath();
      ctx.moveTo(tipX - triW, bodyY);
      ctx.lineTo(tipX + triW, bodyY);
      ctx.lineTo(tipX, tipY);
      ctx.closePath();
      ctx.fillStyle = textColor;
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Outer coloured circle
      ctx.beginPath();
      ctx.arc(tipX, bodyY, pinR, 0, Math.PI * 2);
      ctx.fillStyle = textColor;
      ctx.fill();

      // Inner circle
      ctx.beginPath();
      ctx.arc(tipX, bodyY, innerR, 0, Math.PI * 2);
      ctx.fillStyle = bgColor;
      ctx.fill();

      // Icon centred in inner circle
      drawPathIcon(ctx, poi.iconIdx, tipX, bodyY, iconF, textColor);

      ctx.restore();
    });

    // ── Legend panel ─────────────────────────────────────────────────────────
    const lf       = Math.max(17, Math.round(exportWidth * 0.022));
    const rowH     = lf * 1.4;
    const lPadH    = Math.round(exportWidth * 0.018);
    const lPadV    = Math.round(exportWidth * 0.016);
    const iconColW = lf * 1.4;

    ctx.save();
    ctx.font = `700 ${lf}px "${state.fontFamily}", sans-serif`;
    const maxTextW = Math.max(...poiList.map(p => ctx.measureText(p.name).width));
    const boxW = iconColW + maxTextW + lPadH * 2 + 6;
    const boxH = Math.max(rowH, rowH * poiList.length + lPadV * 2);

    const _margin = Math.round(exportWidth * 0.02);
    let bx, by;
    if (poiLegendPos) {
      bx = (poiLegendPos.x / 100) * exportWidth;
      by = (poiLegendPos.y / 100) * height;
    } else {
      bx = exportWidth - boxW - _margin;
      by = mapHeight   - boxH - _margin;
    }
    bx = Math.max(0, Math.min(bx, exportWidth - boxW));
    by = Math.max(0, Math.min(by, mapHeight - boxH));

    drawRoundedRect(ctx, bx, by, boxW, boxH, boxRadius, textColor);

    poiList.forEach((poi, i) => {
      const ty = by + lPadV + rowH * i + rowH / 2;
      drawPathIcon(ctx, poi.iconIdx, bx + lPadH + lf * 0.5, ty, lf * 0.9, bgColor);
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.fillStyle    = bgColor;
      ctx.font = `700 ${lf}px "${state.fontFamily}", sans-serif`;
      ctx.fillText(poi.name, bx + lPadH + iconColW, ty);
    });
    ctx.restore();

  } else {
    // ── Callout mode: theme-coloured box + triangle tail + anchor dot ─────────
    const half = Math.max(4, Math.round(exportWidth * 0.007));

    poiList.forEach(poi => {
      const anchor = poiLngLatToExportPx(poi.lng, poi.lat, exportWidth, mapHeight);
      if (!anchor) return;

      // Convert % offsets (relative to full poster frame) to export px
      const dx = ((poi.labelDx || 0)  / 100) * exportWidth;
      const dy = ((poi.labelDy || -12) / 100) * height;
      const lx = anchor.x + dx;
      const ly = anchor.y + dy;

      ctx.save();
      ctx.font = `700 ${fontSize}px "${state.fontFamily}", sans-serif`;
      const textW  = ctx.measureText(poi.name).width;
      const iconW  = fontSize * 1.1;
      const totalW = iconW + 6 + textW + padH * 2;
      const boxH   = fontSize + padV * 2;
      const bx     = lx - totalW / 2;
      const by     = ly - boxH;

      // Triangle tail (drawn first so box paints over the base)
      ctx.beginPath();
      ctx.moveTo(bx + totalW / 2 - half, by + boxH);
      ctx.lineTo(bx + totalW / 2 + half, by + boxH);
      ctx.lineTo(anchor.x, anchor.y);
      ctx.closePath();
      ctx.fillStyle = textColor;
      ctx.fill();

      // Box
      drawRoundedRect(ctx, bx, by, totalW, boxH, boxRadius, textColor);

      // Icon
      drawPathIcon(ctx, poi.iconIdx, bx + padH + iconW / 2, by + boxH / 2, fontSize * 0.9, bgColor);

      // Label text
      ctx.font      = `700 ${fontSize}px "${state.fontFamily}", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = bgColor;
      ctx.fillText(poi.name, bx + padH + iconW + 6, by + boxH / 2);

      // Anchor dot
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = textColor;
      ctx.fill();

      ctx.restore();
    });
  }
}

/** Return an SVG string with POI overlays for SVG export. */
function buildPoiSvg(exportWidth, mapHeight) {
  if (!poiList.length) return '';

  const theme     = getTheme();
  const textColor = theme.ui.text;
  const bgColor   = theme.ui.bg;
  const { height } = getPosterMetrics();

  const fontSize = Math.max(18, Math.round(exportWidth * 0.024));
  const padH     = Math.round(exportWidth * 0.012);
  const padV     = Math.round(exportWidth * 0.012);
  const dotR     = Math.round(exportWidth * 0.005);

  const lines = [];
  lines.push('<g id="poi-layer">');

  if (poiLegendMode) {
    // ── Legend mode: teardrop pins ────────────────────────────────────────────
    const pinR   = Math.round(exportWidth * 0.040);
    const innerR = Math.round(pinR * 0.58);
    const triH   = Math.round(pinR * 0.75);
    const triW   = Math.round(pinR * 0.7);
    const iconF  = Math.round(innerR * 1.0);

    poiList.forEach(poi => {
      const pos = poiLngLatToExportPx(poi.lng, poi.lat, exportWidth, mapHeight);
      if (!pos) return;
      const tipX  = pos.x;
      const tipY  = pos.y;
      const bodyY = tipY - triH - pinR;
      lines.push(`<g filter="drop-shadow(0 3px 7px rgba(0,0,0,.45))">`);
      lines.push(`  <polygon points="${(tipX-triW).toFixed(1)},${bodyY.toFixed(1)} ${(tipX+triW).toFixed(1)},${bodyY.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)}" fill="${escapeXml(textColor)}"/>`);
      lines.push(`  <circle cx="${tipX.toFixed(1)}" cy="${bodyY.toFixed(1)}" r="${pinR}" fill="${escapeXml(textColor)}"/>`);
      lines.push(`  <circle cx="${tipX.toFixed(1)}" cy="${bodyY.toFixed(1)}" r="${innerR}" fill="${escapeXml(bgColor)}"/>`);
      lines.push(svgPathIcon(poi.iconIdx, tipX, bodyY, iconF * 0.9, textColor));
      lines.push(`</g>`);
    });

    // ── Legend panel ─────────────────────────────────────────────────────────
    const lf       = Math.max(17, Math.round(exportWidth * 0.022));
    const rowH     = lf * 1.4;
    const lPadH    = Math.round(exportWidth * 0.014);
    const lPadV    = Math.round(exportWidth * 0.012);
    const iconColW = lf * 1.4;
    const _svgMeasCtx = document.createElement('canvas').getContext('2d');
    _svgMeasCtx.font = `700 ${lf}px "${state.fontFamily}", sans-serif`;
    const maxTextW = Math.max(...poiList.map(p => _svgMeasCtx.measureText(p.name).width));
    const boxW = iconColW + maxTextW + lPadH * 2 + 6;
    const boxH = Math.max(rowH, rowH * poiList.length + lPadV * 2);

    const _svgMargin = Math.round(exportWidth * 0.02);
    let bx, by;
    if (poiLegendPos) {
      bx = (poiLegendPos.x / 100) * exportWidth;
      by = (poiLegendPos.y / 100) * height;
    } else {
      bx = exportWidth - boxW - _svgMargin;
      by = mapHeight   - boxH - _svgMargin;
    }
    bx = Math.max(0, Math.min(bx, exportWidth - boxW));
    by = Math.max(0, Math.min(by, mapHeight - boxH));

    lines.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="2" ry="2" fill="${escapeXml(textColor)}"/>`);
    poiList.forEach((poi, i) => {
      const rowCy = by + lPadV + rowH * i + rowH / 2;
      const ty = (rowCy + lf * 0.36).toFixed(1);
      lines.push(svgPathIcon(poi.iconIdx, bx + lPadH + lf * 0.5, rowCy, lf * 0.75, bgColor));
      lines.push(`<text x="${(bx + lPadH + iconColW).toFixed(1)}" y="${ty}" font-size="${lf}" font-weight="700" font-family="${escapeXml(state.fontFamily)}, sans-serif" fill="${escapeXml(bgColor)}">${escapeXml(poi.name)}</text>`);
    });

  } else {
    // ── Callout mode: themed box + triangle tail + anchor dot ────────────────
    const half = Math.max(4, Math.round(exportWidth * 0.007));

    // Use a temporary canvas context to measure actual text width
    const _measCtx = document.createElement('canvas').getContext('2d');
    _measCtx.font = `700 ${fontSize}px "${state.fontFamily}", sans-serif`;

    poiList.forEach(poi => {
      const anchor = poiLngLatToExportPx(poi.lng, poi.lat, exportWidth, mapHeight);
      if (!anchor) return;

      const dx = ((poi.labelDx || 0)  / 100) * exportWidth;
      const dy = ((poi.labelDy || -12) / 100) * height;
      const lx = anchor.x + dx;
      const ly = anchor.y + dy;

      const textW  = _measCtx.measureText(poi.name).width + 10;
      const iconW  = fontSize * 1.1;
      const totalW = iconW + 6 + textW + padH * 2;
      const boxH   = fontSize + padV * 2;
      const bx     = lx - totalW / 2;
      const by     = ly - boxH;
      const midX   = lx;
      const textBaseY = (by + boxH / 2 + fontSize * 0.36).toFixed(1);

      lines.push(`<g>`);
      lines.push(`  <polygon points="${(midX-half).toFixed(1)},${(by+boxH).toFixed(1)} ${(midX+half).toFixed(1)},${(by+boxH).toFixed(1)} ${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}" fill="${escapeXml(textColor)}"/>`);
      lines.push(`  <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${totalW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="2" ry="2" fill="${escapeXml(textColor)}"/>`);
      lines.push(svgPathIcon(poi.iconIdx, bx + padH + iconW / 2, by + boxH / 2, fontSize * 0.75, bgColor));
      lines.push(`  <text x="${(bx+padH+iconW+6).toFixed(1)}" y="${textBaseY}" font-size="${fontSize}" font-weight="700" font-family="${escapeXml(state.fontFamily)}, sans-serif" fill="${escapeXml(bgColor)}">${escapeXml(poi.name)}</text>`);
      lines.push(`  <circle cx="${anchor.x.toFixed(1)}" cy="${anchor.y.toFixed(1)}" r="${dotR}" fill="${escapeXml(textColor)}"/>`);
      lines.push(`</g>`);
    });
  }

  lines.push('</g>');
  return lines.join('\n');
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

async function buildSvgFontStyle(fontFamily, extraFaces = []) {
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
    [...fontFaces, ...extraFaces].join('\n'),
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
      const extraFaces = [];
      embeddedFontStyle = await buildSvgFontStyle(fontConfig.family, extraFaces);
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
      `  <rect x="0" y="0" width="${width}" height="${mapHeight}" fill="none" stroke="#ff0066" stroke-width="2" stroke-opacity="0.9" />`,
      buildCompassSvg(theme, width, mapHeight),
      buildPoiSvg(width, mapHeight),
      `  <rect x="0" y="${mapHeight}" width="${width}" height="${labelBand}" fill="${escapeXml(theme.ui.bg)}" />`,
      `  <text x="${Math.round(width / 2)}" y="${titleY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(theme.ui.label || theme.ui.text)}" font-family="${escapeXml(fontConfig.family)}, sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(state.city)}</text>`,
      `  <text x="${Math.round(width / 2)}" y="${subtitleY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(theme.ui.label || theme.ui.text)}" fill-opacity="0.85" font-family="${escapeXml(fontConfig.family)}, sans-serif" font-size="${subtitleSize}" font-weight="${subtitleFontWeight}" letter-spacing="0.04em">${escapeXml(state.country)}</text>`,
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
  // Initialize owner and design on app startup
  await initApp();

  // Initialize confirmation overlay
  initConfirmationOverlay();

  loadViewState();

  const [configResponse, themesResponse, layoutsResponse, fontsResponse, iconsResponse, layersResponse] = await Promise.all([
    fetch('/api/config'),
    fetch('/data/themes.json'),
    fetch('/data/layouts.json'),
    fetch('/data/fonts.json'),
    fetch('/data/icons.json'),
    fetch('/data/layers.json')
  ]);

  appConfig = await configResponse.json();
  themesData = await themesResponse.json();
  layoutsData = await layoutsResponse.json();
  fontsData = await fontsResponse.json();
  iconsData = await iconsResponse.json();
  layersData = await layersResponse.json();

  // iconsData is available; numeric POI icon indexes reference the ordered
  // array returned by `iconsList()`.

  if (!themesData.themes[state.themeId]) {
    state.themeId = Object.keys(themesData.themes)[0];
  }

  const hasLayout = (layoutsData.categories || []).some(category => (
    (category.layouts || []).some(layout => layout.id === state.layoutId)
  ));

  if (!hasLayout) {
    state.layoutId = layoutsData.defaultLayoutId || 'ratio_3_4_portrait';
  }

  labelFont.value = state.fontFamily;
  applyThemeUi();
  updatePosterLayout();
  applyLabels();
  applyCompassVisibility();
  renderThemeGrid();
  renderLayerList();
  renderLayoutSelect();
  initAccordion();
  initMap();
  bindPoiMapEvents();
  renderPoiList();
  // Render overlays once the map tiles are loaded so projections are accurate.
  map.once('load', renderPoiOverlays);
  setupDocumentScaleObserver();
  saveViewState();
}

window.addEventListener('resize', () => {
  if (map) map.resize();
});

boot().catch(error => {
  console.error(error);
  alert('Failed to start the app. Check the console for details.');
});
