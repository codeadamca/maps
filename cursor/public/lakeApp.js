const EXPORT_DPI = 96;
const MAX_EXPORT_DIMENSION = 1600;
const EXPORT_TEXT_SCALE_ADJUSTMENT = 1.08;
const VIEW_STATE_KEY = 'lake-poster:view';
const FIXED_LAYOUT_CM = { width: 61, height: 91, unit: 'cm' };
const DEFAULT_LAKE_ZOOM = 1;
const DEFAULT_LAKE_BEARING = 0;
const ZOOM_STEP = 0.225;
const MIN_LAKE_ZOOM = 0.7;
const MAX_LAKE_ZOOM = 2.5;
const ROTATION_STEP = 15;
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
  themeId: 'coral',
  city: 'Whitestone Lake',
  country: 'Ontario, Canada',
  fontFamily: 'Playfair Display',
  zoom: DEFAULT_LAKE_ZOOM,
  bearing: DEFAULT_LAKE_BEARING,
  panX: 0,
  panY: 0,
  selectedLake: null
};

let themesData = { themes: {} };
let searchAbort = null;
let searchTimer = null;
let activeLakeRequestId = 0;
let bearingAnimationFrame = 0;
let zoomAnimationFrame = 0;
let dragState = null;
const svgFontFaceCache = new Map();
const svgFontDataCache = new Map();

const themeGrid = document.getElementById('theme-grid');
const locationSearch = document.getElementById('location-search');
const searchResults = document.getElementById('search-results');
const labelCity = document.getElementById('label-city');
const labelCountry = document.getElementById('label-country');
const labelFont = document.getElementById('label-font');
const posterFrame = document.getElementById('poster-frame');
const posterLabels = document.getElementById('poster-labels');
const posterCity = document.getElementById('poster-city');
const posterCountry = document.getElementById('poster-country');
const lakeStage = document.getElementById('lake-stage');
const lakeStageSvg = document.getElementById('lake-stage-svg');
const lakeEmpty = document.getElementById('lake-empty');
const exportButton = document.getElementById('export-png');
const exportSvgButton = document.getElementById('export-svg');
const rotateLeftButton = document.getElementById('rotate-left');
const rotateRightButton = document.getElementById('rotate-right');
const zoomInButton = document.getElementById('zoom-in');
const zoomOutButton = document.getElementById('zoom-out');

function isSavedLakeSelection(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.label === 'string'
    && typeof value.name === 'string'
    && typeof value.region === 'string'
    && typeof value.country === 'string'
    && typeof value.osmType === 'string'
    && typeof value.osmId === 'string'
  );
}

function getSelectedLakeSnapshot(lake) {
  if (!lake || typeof lake !== 'object') return null;

  return {
    label: String(lake.label || ''),
    name: String(lake.name || ''),
    region: String(lake.region || ''),
    country: String(lake.country || ''),
    osmType: String(lake.osmType || ''),
    osmId: String(lake.osmId || '')
  };
}

function loadViewState() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_STATE_KEY) || 'null');
    if (!saved) return;

    if (typeof saved.themeId === 'string') state.themeId = saved.themeId;
    if (typeof saved.city === 'string') state.city = saved.city;
    if (typeof saved.country === 'string') state.country = saved.country;
    if (typeof saved.fontFamily === 'string') state.fontFamily = saved.fontFamily;
    if (Number.isFinite(Number(saved.zoom))) state.zoom = Number(saved.zoom);
    if (Number.isFinite(Number(saved.bearing))) state.bearing = Number(saved.bearing);
    if (Number.isFinite(Number(saved.panX))) state.panX = Number(saved.panX);
    if (Number.isFinite(Number(saved.panY))) state.panY = Number(saved.panY);
    if (isSavedLakeSelection(saved.selectedLake)) state.selectedLake = saved.selectedLake;
  } catch (_error) {
    // Ignore invalid saved state.
  }
}

function saveViewState() {
  localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
    themeId: state.themeId,
    city: state.city,
    country: state.country,
    fontFamily: state.fontFamily,
    zoom: state.zoom,
    bearing: state.bearing,
    panX: state.panX,
    panY: state.panY,
    selectedLake: getSelectedLakeSnapshot(state.selectedLake)
  }));
}

function clampLakeZoom(zoom) {
  return Math.min(MAX_LAKE_ZOOM, Math.max(MIN_LAKE_ZOOM, zoom));
}

function normalizeBearing(bearing) {
  return ((bearing % 360) + 360) % 360;
}

function clampLakePan(value) {
  return Math.min(0.75, Math.max(-0.75, value));
}

function getLakeSelectionKey(lake) {
  if (!lake) return '';
  return `${lake.osmType || ''}:${lake.osmId || ''}`;
}

function getShortestBearingDelta(from, to) {
  let delta = normalizeBearing(to) - normalizeBearing(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function animateLakeBearingTo(targetBearing, duration = 300) {
  if (bearingAnimationFrame) {
    cancelAnimationFrame(bearingAnimationFrame);
    bearingAnimationFrame = 0;
  }

  const startBearing = state.bearing;
  const delta = getShortestBearingDelta(startBearing, targetBearing);
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = easeInOutCubic(progress);
    state.bearing = normalizeBearing(startBearing + delta * eased);
    renderLakePreview();

    if (progress < 1) {
      bearingAnimationFrame = requestAnimationFrame(step);
      return;
    }

    state.bearing = normalizeBearing(targetBearing);
    bearingAnimationFrame = 0;
    renderLakePreview();
    saveViewState();
  }

  bearingAnimationFrame = requestAnimationFrame(step);
}

function animateLakeZoomTo(targetZoom, duration = 300) {
  if (zoomAnimationFrame) {
    cancelAnimationFrame(zoomAnimationFrame);
    zoomAnimationFrame = 0;
  }

  const startZoom = state.zoom;
  const endZoom = clampLakeZoom(targetZoom);
  const delta = endZoom - startZoom;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = easeInOutCubic(progress);
    state.zoom = clampLakeZoom(startZoom + delta * eased);
    renderLakePreview();

    if (progress < 1) {
      zoomAnimationFrame = requestAnimationFrame(step);
      return;
    }

    state.zoom = endZoom;
    zoomAnimationFrame = 0;
    renderLakePreview();
    saveViewState();
  }

  zoomAnimationFrame = requestAnimationFrame(step);
}

function beginLakeDrag(event) {
  if (!state.selectedLake?.geojson) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  if (zoomAnimationFrame) {
    cancelAnimationFrame(zoomAnimationFrame);
    zoomAnimationFrame = 0;
  }

  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startPanX: state.panX,
    startPanY: state.panY
  };

  lakeStage.classList.add('is-dragging');
  lakeStage.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateLakeDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const stageRect = lakeStage.getBoundingClientRect();
  const dragScale = Math.max(1, Math.min(stageRect.width, stageRect.height));
  state.panX = clampLakePan(dragState.startPanX + (event.clientX - dragState.startX) / dragScale);
  state.panY = clampLakePan(dragState.startPanY + (event.clientY - dragState.startY) / dragScale);
  renderLakePreview();
}

function endLakeDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  lakeStage.classList.remove('is-dragging');
  lakeStage.releasePointerCapture?.(event.pointerId);
  dragState = null;
  saveViewState();
}

function handleLakeWheel(event) {
  if (!state.selectedLake?.geojson) return;
  if (event.deltaY === 0) return;

  event.preventDefault();
  animateLakeZoomTo(state.zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
}

function initAccordion() {
  const accordion = document.getElementById('sidebar-accordion');
  if (!accordion) return;

  const items = [...accordion.querySelectorAll('.accordion-item')];

  function setItemOpen(item, isOpen) {
    const trigger = item.querySelector('.accordion-trigger');
    const panel = item.querySelector('.accordion-panel');
    item.classList.toggle('is-open', isOpen);
    trigger?.setAttribute('aria-expanded', String(isOpen));
    if (panel) panel.hidden = !isOpen;
  }

  items.forEach(item => setItemOpen(item, item.classList.contains('is-open')));
  items.forEach(item => {
    const trigger = item.querySelector('.accordion-trigger');
    trigger?.addEventListener('click', () => {
      setItemOpen(item, !item.classList.contains('is-open'));
    });
  });
}

function getTheme() {
  return themesData.themes[state.themeId] || themesData.themes.coral;
}

function getExportDimensions() {
  const rawWidth = Math.round((FIXED_LAYOUT_CM.width / 2.54) * EXPORT_DPI);
  const rawHeight = Math.round((FIXED_LAYOUT_CM.height / 2.54) * EXPORT_DPI);
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

function getSvgDocumentSize() {
  return {
    width: `${FIXED_LAYOUT_CM.width}cm`,
    height: `${FIXED_LAYOUT_CM.height}cm`
  };
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

function applyThemeUi() {
  const theme = getTheme();
  document.documentElement.style.setProperty('--poster-bg', theme.ui.bg);
  document.documentElement.style.setProperty('--poster-text', theme.ui.text);
  posterLabels.style.fontFamily = `"${state.fontFamily}", sans-serif`;
}

function applyLabels() {
  posterCity.textContent = state.city;
  posterCountry.textContent = state.country;
  labelCity.value = state.city;
  labelCountry.value = state.country;
  labelFont.value = state.fontFamily;
}

function getPosterMetrics() {
  const { width, height } = getExportDimensions();
  const labelBand = Math.round(height * 0.25);
  const artHeight = height - labelBand;
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
    : Math.round(width * 0.06);
  const subtitleSize = Number.isFinite(previewSubtitleSize)
    ? Math.round(previewSubtitleSize * exportScale * EXPORT_TEXT_SCALE_ADJUSTMENT)
    : Math.round(width * 0.03);
  const titleY = posterFrameRect && posterCityRect
    ? Math.round((posterCityRect.top - posterFrameRect.top + posterCityRect.height / 2) * exportScale)
    : Math.round(artHeight + labelBand * 0.42);
  const subtitleY = posterFrameRect && posterCountryRect
    ? Math.round((posterCountryRect.top - posterFrameRect.top + posterCountryRect.height / 2) * exportScale)
    : Math.round(artHeight + labelBand * 0.66);

  return {
    width,
    height,
    labelBand,
    artHeight,
    titleSize,
    subtitleSize,
    titleY,
    subtitleY
  };
}

function renderThemeGrid() {
  themeGrid.replaceChildren();

  Object.entries(themesData.themes || {}).forEach(([id, theme]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `theme-swatch${id === state.themeId ? ' is-active' : ''}`;
    button.title = theme.description || theme.name;

    const preview = document.createElement('span');
    preview.className = 'theme-swatch-preview';
    preview.style.background = `linear-gradient(135deg, ${theme.ui.bg} 50%, ${theme.map.water || theme.ui.text} 50%)`;

    const name = document.createElement('span');
    name.className = 'theme-swatch-name';
    name.textContent = theme.name;

    button.append(preview, name);
    button.addEventListener('click', () => {
      state.themeId = id;
      applyThemeUi();
      renderThemeGrid();
      renderLakePreview();
      saveViewState();
    });

    themeGrid.append(button);
  });
}

function hideSearchResults() {
  searchResults.hidden = true;
  searchResults.replaceChildren();
}

function showSearchResults(results) {
  searchResults.replaceChildren();

  if (!results.length) {
    hideSearchResults();
    return;
  }

  results.forEach(result => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = result.label;
    button.addEventListener('click', () => selectLake(result));
    item.append(button);
    searchResults.append(item);
  });

  searchResults.hidden = false;
}

function showSearchMessage(message) {
  searchResults.replaceChildren();

  const item = document.createElement('li');
  const text = document.createElement('div');
  text.textContent = message;
  text.style.padding = '8px 10px';
  text.style.fontSize = '0.85rem';
  text.style.color = 'var(--sidebar-muted)';
  item.append(text);
  searchResults.append(item);
  searchResults.hidden = false;
}

function getLakeTitle(result) {
  return result.name || String(result.label || '').split(',')[0].trim() || state.city;
}

function getLakeSubtitle(result) {
  return result.region || result.country || state.country;
}

function setLakeEmptyMessage(message) {
  lakeEmpty.textContent = message;
  lakeEmpty.hidden = false;
}

async function fetchLakeGeometry(result) {
  const response = await fetch(`/api/lake-geometry?osmType=${encodeURIComponent(result.osmType)}&osmId=${encodeURIComponent(result.osmId)}`);

  if (!response.ok) {
    throw new Error('Lake geometry failed');
  }

  return response.json();
}

async function selectLake(result) {
  const requestId = ++activeLakeRequestId;
  const previousLakeKey = getLakeSelectionKey(state.selectedLake);
  const nextLakeKey = getLakeSelectionKey(result);
  state.selectedLake = null;
  state.city = getLakeTitle(result);
  state.country = getLakeSubtitle(result);
  if (previousLakeKey !== nextLakeKey) {
    state.panX = 0;
    state.panY = 0;
  }
  locationSearch.value = result.label;
  applyLabels();
  hideSearchResults();

  lakeStageSvg.innerHTML = '';
  setLakeEmptyMessage('Loading lake outline…');

  try {
    const detailedLake = await fetchLakeGeometry(result);
    if (requestId !== activeLakeRequestId) return;

    state.selectedLake = detailedLake;
    renderLakePreview();
    saveViewState();
  } catch (error) {
    if (requestId !== activeLakeRequestId) return;

    console.error(error);
    state.selectedLake = null;
    renderLakePreview();
    setLakeEmptyMessage('Could not load lake outline. Try another result.');
  }
}

async function searchLakes(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  const response = await fetch(`/api/lake-search?q=${encodeURIComponent(query)}`, {
    signal: searchAbort.signal
  });

  if (!response.ok) {
    throw new Error('Lake search failed');
  }

  return response.json();
}

function geometryToPolygons(geojson) {
  if (!geojson || typeof geojson !== 'object') return [];
  if (geojson.type === 'Polygon') return [geojson.coordinates || []];
  if (geojson.type === 'MultiPolygon') return geojson.coordinates || [];
  return [];
}

function projectLakeGeometry(geojson, width, height, paddingRatio = 0.08) {
  const polygons = geometryToPolygons(geojson);
  if (!polygons.length) return [];

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  polygons.forEach(polygon => {
    polygon.forEach(ring => {
      ring.forEach(([lon, lat]) => {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      });
    });
  });

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return [];

  const geometryWidth = Math.max(maxLon - minLon, 1e-9);
  const geometryHeight = Math.max(maxLat - minLat, 1e-9);
  const pad = Math.min(width, height) * paddingRatio;
  const innerWidth = Math.max(1, width - pad * 2);
  const innerHeight = Math.max(1, height - pad * 2);
  const scale = Math.min(innerWidth / geometryWidth, innerHeight / geometryHeight);
  const offsetX = pad + (innerWidth - geometryWidth * scale) / 2;
  const offsetY = pad + (innerHeight - geometryHeight * scale) / 2;
  const centerX = width / 2;
  const centerY = height / 2;
  const panScale = Math.min(width, height);
  const panOffsetX = clampLakePan(state.panX) * panScale;
  const panOffsetY = clampLakePan(state.panY) * panScale;
  const zoomScale = clampLakeZoom(state.zoom);
  const angle = normalizeBearing(state.bearing) * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return polygons.map(polygon => polygon.map(ring => ring.map(([lon, lat]) => ([
    (() => {
      const baseX = offsetX + (lon - minLon) * scale;
      const baseY = offsetY + (maxLat - lat) * scale;
      const scaledX = (baseX - centerX) * zoomScale;
      const scaledY = (baseY - centerY) * zoomScale;

      return centerX + panOffsetX + scaledX * cos - scaledY * sin;
    })(),
    (() => {
      const baseX = offsetX + (lon - minLon) * scale;
      const baseY = offsetY + (maxLat - lat) * scale;
      const scaledX = (baseX - centerX) * zoomScale;
      const scaledY = (baseY - centerY) * zoomScale;

      return centerY + panOffsetY + scaledX * sin + scaledY * cos;
    })()
  ]))));
}

function ringsToSvgPath(projectedPolygons) {
  return projectedPolygons.flatMap(polygon => polygon.map(ring => {
    if (!ring.length) return '';
    const [firstX, firstY] = ring[0];
    const segments = ring.slice(1).map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`);
    return `M ${firstX.toFixed(2)} ${firstY.toFixed(2)} ${segments.join(' ')} Z`;
  })).filter(Boolean).join(' ');
}

function getLakePathData(width, height) {
  if (!state.selectedLake?.geojson) return '';
  const projected = projectLakeGeometry(state.selectedLake.geojson, width, height);
  return ringsToSvgPath(projected);
}

function getLakePaint(theme) {
  return {
    fill: theme.ui.text,
    stroke: null
  };
}

function renderLakePreview() {
  const stageWidth = Math.max(1, Math.round(lakeStage.clientWidth || 0));
  const stageHeight = Math.max(1, Math.round(lakeStage.clientHeight || 0));
  const pathData = getLakePathData(stageWidth, stageHeight);

  lakeStageSvg.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`);

  if (!pathData) {
    if (!lakeEmpty.textContent.trim()) {
      setLakeEmptyMessage('Search and choose a lake to render its vector silhouette.');
    } else {
      lakeEmpty.hidden = false;
    }
    lakeStageSvg.innerHTML = '';
    return;
  }

  const theme = getTheme();
  const paint = getLakePaint(theme);

  lakeEmpty.hidden = true;
  lakeStageSvg.innerHTML = [
    `<path d="${pathData}" fill="${escapeXml(paint.fill)}" fill-rule="evenodd"/>`
  ].join('');
}

function drawLakeCanvas(ctx, width, height) {
  const pathData = getLakePathData(width, height);
  if (!pathData) return;

  const theme = getTheme();
  const paint = getLakePaint(theme);
  const path = new Path2D(pathData);

  ctx.fillStyle = paint.fill;
  ctx.fill(path, 'evenodd');
}

function buildLakeSvg(width, height) {
  const pathData = getLakePathData(width, height);
  if (!pathData) return '';

  const theme = getTheme();
  const paint = getLakePaint(theme);

  return [
    '  <g id="lake-layer">',
    `    <path d="${pathData}" fill="${escapeXml(paint.fill)}" fill-rule="evenodd" />`,
    '  </g>'
  ].join('\n');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  const fontFaces = await Promise.all(requestedWeights.map(weight => fetchEmbeddedFontFace(config.family, weight)));

  return [
    '  <defs>',
    '    <style type="text/css"><![CDATA[',
    fontFaces.join('\n'),
    '    ]]></style>',
    '  </defs>'
  ].join('\n');
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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'lake';
}

async function exportPng() {
  exportButton.disabled = true;
  exportButton.textContent = 'Exporting…';

  try {
    await waitForCanvasTextFonts(state.fontFamily);

    const theme = getTheme();
    const { width, height, artHeight, titleSize, subtitleSize, titleY, subtitleY } = getPosterMetrics();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = theme.ui.bg;
    ctx.fillRect(0, 0, width, height);
    drawLakeCanvas(ctx, width, artHeight);

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

    downloadBlob(blob, `${slugify(state.city || 'lake')}-poster.png`);
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = 'Download PNG';
  }
}

async function exportSvg() {
  exportSvgButton.disabled = true;
  exportSvgButton.textContent = 'Exporting…';

  try {
    const theme = getTheme();
    const { width, height, artHeight, titleSize, subtitleSize, titleY, subtitleY } = getPosterMetrics();
    const svgSize = getSvgDocumentSize();
    const fontConfig = getSvgFontConfig(state.fontFamily);
    const subtitleFontWeight = pickClosestFontWeight(fontConfig.weights, 500);
    let embeddedFontStyle = '';

    try {
      embeddedFontStyle = await buildSvgFontStyle(fontConfig.family);
    } catch (error) {
      console.warn('Failed to embed SVG font, falling back to installed fonts.', error);
    }

    const svg = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize.width}" height="${svgSize.height}" viewBox="0 0 ${width} ${height}">`,
      embeddedFontStyle,
      `  <rect width="${width}" height="${height}" fill="${escapeXml(theme.ui.bg)}" />`,
      buildLakeSvg(width, artHeight),
      `  <text x="${Math.round(width / 2)}" y="${titleY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(theme.ui.text)}" font-family="${escapeXml(fontConfig.family)}, sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(state.city)}</text>`,
      `  <text x="${Math.round(width / 2)}" y="${subtitleY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(theme.ui.text)}" fill-opacity="0.85" font-family="${escapeXml(fontConfig.family)}, sans-serif" font-size="${subtitleSize}" font-weight="${subtitleFontWeight}">${escapeXml(state.country)}</text>`,
      '</svg>'
    ].filter(Boolean).join('\n');

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${slugify(state.city || 'lake')}-poster.svg`);
  } finally {
    exportSvgButton.disabled = false;
    exportSvgButton.textContent = 'Download SVG';
  }
}

async function init() {
  loadViewState();
  initAccordion();

  const themeResponse = await fetch('/themes.json');
  themesData = await themeResponse.json();

  applyThemeUi();
  applyLabels();
  renderThemeGrid();
  requestAnimationFrame(renderLakePreview);

  if (state.selectedLake) {
    locationSearch.value = state.selectedLake.label;
    await selectLake(state.selectedLake);
  }
}

locationSearch.addEventListener('input', () => {
  const query = locationSearch.value.trim();
  clearTimeout(searchTimer);

  if (query.length < 3) {
    hideSearchResults();
    return;
  }

  showSearchMessage('Searching…');

  searchTimer = setTimeout(async () => {
    try {
      const results = await searchLakes(query);
      if (!results.length) {
        showSearchMessage('No matching lakes found.');
        return;
      }
      showSearchResults(results);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);
        showSearchMessage('Search is temporarily unavailable. Try again in a moment.');
      }
    }
  }, 450);
});

labelCity.addEventListener('input', () => {
  state.city = labelCity.value;
  applyLabels();
  saveViewState();
});

labelCountry.addEventListener('input', () => {
  state.country = labelCountry.value;
  applyLabels();
  saveViewState();
});

labelFont.addEventListener('change', () => {
  state.fontFamily = labelFont.value;
  applyThemeUi();
  applyLabels();
  saveViewState();
});

rotateLeftButton?.addEventListener('click', () => {
  animateLakeBearingTo(state.bearing + ROTATION_STEP);
});

rotateRightButton?.addEventListener('click', () => {
  animateLakeBearingTo(state.bearing - ROTATION_STEP);
});

zoomInButton?.addEventListener('click', () => {
  animateLakeZoomTo(state.zoom + ZOOM_STEP);
});

zoomOutButton?.addEventListener('click', () => {
  animateLakeZoomTo(state.zoom - ZOOM_STEP);
});

lakeStage.addEventListener('pointerdown', beginLakeDrag);
lakeStage.addEventListener('pointermove', updateLakeDrag);
lakeStage.addEventListener('pointerup', endLakeDrag);
lakeStage.addEventListener('pointercancel', endLakeDrag);
lakeStage.addEventListener('wheel', handleLakeWheel, { passive: false });

window.addEventListener('resize', renderLakePreview);
document.addEventListener('click', event => {
  if (!searchResults.hidden && !event.target.closest('.search-wrap')) {
    hideSearchResults();
  }
});

exportButton.addEventListener('click', exportPng);
exportSvgButton.addEventListener('click', exportSvg);

init().catch(error => {
  console.error('Failed to initialize lake app:', error);
});