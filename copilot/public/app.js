// Set your Mapbox access token here
mapboxgl.accessToken = window.MAPBOX_ACCESS_TOKEN;

const DEFAULT_VIEW_STATE = {
  center: [-79.86622015711724, 45.64789087148891],
  zoom: 11
};
const VIEW_STATE_STORAGE_KEY = 'maps:last-view-state';

function loadInitialViewState() {
  try {
    const savedViewState = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);

    if (!savedViewState) {
      return DEFAULT_VIEW_STATE;
    }

    const parsedViewState = JSON.parse(savedViewState);
    const center = Array.isArray(parsedViewState.center) ? parsedViewState.center : [];
    const [lng, lat] = center;
    const zoom = Number(parsedViewState.zoom);

    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) {
      return DEFAULT_VIEW_STATE;
    }

    return {
      center: [lng, lat],
      zoom
    };
  } catch (error) {
    return DEFAULT_VIEW_STATE;
  }
}

function saveCurrentViewState() {
  try {
    const center = map.getCenter();
    window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify({
      center: [center.lng, center.lat],
      zoom: map.getZoom()
    }));
  } catch (error) {
    // Ignore storage failures and keep the in-memory view.
  }
}

const initialViewState = loadInitialViewState();

const map = new mapboxgl.Map({
  container: 'map-canvas',
  style: 'mapbox://styles/mapbox/outdoors-v12',
  center: initialViewState.center,
  zoom: initialViewState.zoom,
  attributionControl: false,
  preserveDrawingBuffer: true
});

window.map = map;
map.dragPan.enable();
map.on('moveend', saveCurrentViewState);

let hikingTrails = [];
let selectedTrailIds = new Set();
let activeTrailRequestId = 0;
let trailWarning = '';
const DEFAULT_FRAME_GEOMETRY = {
  naturalWidth: 1544,
  naturalHeight: 2116,
  openingRatios: {
    left: 0.15738341968911918,
    top: 0.12948960302457466,
    width: 0.6709844559585493,
    height: 0.6701323251417769
  }
};

const trailListElement = document.getElementById('trail-list');
const trailStatusElement = document.getElementById('trail-status');
const mapStageElement = document.getElementById('map-stage');
const mapWindowElement = document.getElementById('map-window');
const glazingCopyElement = document.getElementById('glazing-copy');
const mapTitleElement = document.getElementById('map-title');
const mapSubtitleElement = document.getElementById('map-subtitle');
const frameImageElement = document.getElementById('frame-image');
const frameAssetPath = 'frame.png';
let frameGeometry = DEFAULT_FRAME_GEOMETRY;
let frameGeometryPromise = null;
const hikingTrailSourceId = 'hiking-trails-source';
const hikingTrailLayerId = 'hiking-trails-layer';
const referencePalette = {
  paper: '#f3ecdf',
  paperShade: '#ebe1d0',
  ink: '#30475c',
  line: '#6f8696',
  contour: '#b8a898',
  building: '#f7f1e7',
  trail: '#5b7385'
};

function setPaintIfSupported(layerId, property, value) {
  if (!map.getLayer(layerId)) {
    return;
  }

  try {
    map.setPaintProperty(layerId, property, value);
  } catch (error) {
    // Ignore unsupported paint properties across different layer types.
  }
}

function setLayoutIfSupported(layerId, property, value) {
  if (!map.getLayer(layerId)) {
    return;
  }

  try {
    map.setLayoutProperty(layerId, property, value);
  } catch (error) {
    // Ignore unsupported layout properties across different layer types.
  }
}

function loadImageAsDataUrl(assetPath) {
  const url = new URL(assetPath, window.location.href);

  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error('Unable to load frame image');
      }

      return response.blob();
    })
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Unable to encode frame image'));
      reader.readAsDataURL(blob);
    }));
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function getTextPlacement(element) {
  const stageRect = mapStageElement.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);

  return {
    text: element.textContent.trim(),
    x: (elementRect.left - stageRect.left) + (elementRect.width / 2),
    y: elementRect.bottom - stageRect.top,
    fontSize: computedStyle.fontSize,
    fontWeight: computedStyle.fontWeight,
    letterSpacing: computedStyle.letterSpacing,
    lineHeight: computedStyle.lineHeight,
    fill: computedStyle.color
  };
}

function loadFrameGeometry() {
  if (frameGeometryPromise) {
    return frameGeometryPromise;
  }

  frameGeometryPromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });

        context.drawImage(image, 0, 0);

        const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
        const visited = new Uint8Array(width * height);
        const queue = [];
        const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
        const push = (x, y) => {
          if (x < 0 || y < 0 || x >= width || y >= height) {
            return;
          }

          const index = y * width + x;
          if (visited[index] || alphaAt(x, y) !== 0) {
            return;
          }

          visited[index] = 1;
          queue.push(index);
        };

        for (let x = 0; x < width; x += 1) {
          push(x, 0);
          push(x, height - 1);
        }

        for (let y = 0; y < height; y += 1) {
          push(0, y);
          push(width - 1, y);
        }

        while (queue.length > 0) {
          const index = queue.shift();
          const x = index % width;
          const y = Math.floor(index / width);

          push(x + 1, y);
          push(x - 1, y);
          push(x, y + 1);
          push(x, y - 1);
        }

        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = y * width + x;
            if (alphaAt(x, y) === 0 && !visited[index]) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

        if (maxX === -1 || maxY === -1) {
          frameGeometry = DEFAULT_FRAME_GEOMETRY;
          resolve(frameGeometry);
          return;
        }

        frameGeometry = {
          naturalWidth: width,
          naturalHeight: height,
          openingRatios: {
            left: minX / width,
            top: minY / height,
            width: (maxX - minX + 1) / width,
            height: (maxY - minY + 1) / height
          }
        };

        resolve(frameGeometry);
      } catch (error) {
        frameGeometry = DEFAULT_FRAME_GEOMETRY;
        reject(error);
      }
    };

    image.onerror = () => {
      frameGeometry = DEFAULT_FRAME_GEOMETRY;
      reject(new Error('Unable to analyze frame image'));
    };

    image.src = `${frameAssetPath}?v=${Date.now()}`;
  }).catch(() => frameGeometry);

  return frameGeometryPromise;
}

function getFramePlacement() {
  const stageRect = mapStageElement.getBoundingClientRect();
  const overlayRect = frameImageElement.getBoundingClientRect();

  if (!stageRect.width || !stageRect.height || !overlayRect.width || !overlayRect.height) {
    return {
      width: mapStageElement.clientWidth,
      height: mapStageElement.clientHeight,
      x: 0,
      y: 0
    };
  }

  const overlayAspectRatio = overlayRect.width / overlayRect.height;
  const frameAspectRatio = frameGeometry.naturalWidth / frameGeometry.naturalHeight;
  let width;
  let height;
  let offsetX = 0;
  let offsetY = 0;

  if (overlayAspectRatio > frameAspectRatio) {
    height = overlayRect.height;
    width = height * frameAspectRatio;
    offsetX = (overlayRect.width - width) / 2;
  } else {
    width = overlayRect.width;
    height = width / frameAspectRatio;
    offsetY = (overlayRect.height - height) / 2;
  }

  return {
    width,
    height,
    x: (overlayRect.left - stageRect.left) + offsetX,
    y: (overlayRect.top - stageRect.top) + offsetY
  };
}

function getFrameOpeningPlacement() {
  const framePlacement = getFramePlacement();
  const { openingRatios } = frameGeometry;

  return {
    x: framePlacement.x + (framePlacement.width * openingRatios.left),
    y: framePlacement.y + (framePlacement.height * openingRatios.top),
    width: framePlacement.width * openingRatios.width,
    height: framePlacement.height * openingRatios.height
  };
}

function getGlazingCopyPlacement() {
  const framePlacement = getFramePlacement();
  const openingPlacement = getFrameOpeningPlacement();
  const frameBottom = framePlacement.y + framePlacement.height;
  const openingBottom = openingPlacement.y + openingPlacement.height;
  const bottomGlazingHeight = Math.max(frameBottom - openingBottom, 0);

  if (bottomGlazingHeight < 24) {
    return {
      x: openingPlacement.x,
      y: openingPlacement.y + (openingPlacement.height * 0.76),
      width: openingPlacement.width,
      height: openingPlacement.height * 0.2
    };
  }

  const horizontalInset = Math.max(openingPlacement.width * 0.04, 12);
  const bottomInset = Math.min(Math.max(bottomGlazingHeight * 0.28, 18), bottomGlazingHeight * 0.42);
  const height = Math.max(bottomGlazingHeight - bottomInset, 32);

  return {
    x: openingPlacement.x + horizontalInset,
    y: openingBottom,
    width: Math.max(openingPlacement.width - (horizontalInset * 2), 40),
    height
  };
}

async function updateMapWindowLayout() {
  await loadFrameGeometry();
  const openingPlacement = getFrameOpeningPlacement();
  const glazingPlacement = getGlazingCopyPlacement();

  mapWindowElement.style.left = `${openingPlacement.x}px`;
  mapWindowElement.style.top = `${openingPlacement.y}px`;
  mapWindowElement.style.width = `${openingPlacement.width}px`;
  mapWindowElement.style.height = `${openingPlacement.height}px`;
  glazingCopyElement.style.left = `${glazingPlacement.x}px`;
  glazingCopyElement.style.top = `${glazingPlacement.y}px`;
  glazingCopyElement.style.width = `${glazingPlacement.width}px`;
  glazingCopyElement.style.height = `${glazingPlacement.height}px`;

  if (map) {
    map.resize();
  }
}

function applyReferenceMapStyle() {
  const layers = map.getStyle().layers || [];

  layers.forEach(layer => {
    const layerId = layer.id;
    const sourceLayer = layer['source-layer'] || '';
    const layerKey = `${layerId} ${sourceLayer}`.toLowerCase();

    if (layer.type === 'background') {
      setPaintIfSupported(layerId, 'background-color', referencePalette.paper);
      return;
    }

    if (/(poi|airport|transit|road-number-shield)/.test(layerKey)) {
      setLayoutIfSupported(layerId, 'visibility', 'none');
      return;
    }

    if (layer.type === 'symbol' && /(place|settlement|road|street)/.test(layerKey)) {
      setLayoutIfSupported(layerId, 'visibility', 'none');
      return;
    }

    if (layer.type === 'fill' && /(water|lake|river|stream|ocean)/.test(layerKey)) {
      setPaintIfSupported(layerId, 'fill-color', referencePalette.ink);
      setPaintIfSupported(layerId, 'fill-opacity', 0.96);
      return;
    }

    if (layer.type === 'line' && /(water|lake|river|stream|ocean)/.test(layerKey)) {
      setPaintIfSupported(layerId, 'line-color', referencePalette.ink);
      setPaintIfSupported(layerId, 'line-opacity', 0.85);
      return;
    }

    if (layer.type === 'line' && /(contour|hillshade)/.test(layerKey)) {
      setPaintIfSupported(layerId, 'line-color', referencePalette.contour);
      setPaintIfSupported(layerId, 'line-width', 0.8);
      setPaintIfSupported(layerId, 'line-opacity', 0.72);
      return;
    }

    if (layer.type === 'line' && /(road|street|path|motorway|bridge|tunnel)/.test(layerKey)) {
      setPaintIfSupported(layerId, 'line-color', referencePalette.line);
      setPaintIfSupported(layerId, 'line-opacity', 0.65);
      return;
    }

    if (layer.type === 'fill' && /(building)/.test(layerKey)) {
      setPaintIfSupported(layerId, 'fill-color', referencePalette.building);
      setPaintIfSupported(layerId, 'fill-outline-color', referencePalette.contour);
      setPaintIfSupported(layerId, 'fill-opacity', 0.45);
      return;
    }

    if (layer.type === 'fill' && /(landuse|park|wood|grass|landcover)/.test(layerKey)) {
      setPaintIfSupported(layerId, 'fill-color', referencePalette.paperShade);
      setPaintIfSupported(layerId, 'fill-opacity', 0.22);
      return;
    }

    if (layer.type === 'symbol' && /(road-label|water-label|natural-label)/.test(layerKey)) {
      setPaintIfSupported(layerId, 'text-color', referencePalette.line);
      setPaintIfSupported(layerId, 'text-halo-color', referencePalette.paper);
      setPaintIfSupported(layerId, 'text-halo-width', 1.2);
    }
  });

  map.setFog({
    color: referencePalette.paper,
    'high-color': referencePalette.paper,
    'space-color': referencePalette.paper,
    'star-intensity': 0
  });
}

// --- Add Points and Draw Polyline (modified to support curves and draggable markers) ---
let addPointsMode = false;
let points = [];
let lineCounter = 0;
let markerObjs = [];
let distanceLabels = [];
let curvesMode = false;
let curveData = {}; // { lineId: [ {p1, p2, c} ] }

function emptyTrailCollection() {
  return {
    type: 'FeatureCollection',
    features: []
  };
}

function getVisibleBbox() {
  try {
    const bounds = map.getBounds();
    return [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ];
  } catch (error) {
    const center = map.getCenter();
    const lngPadding = 0.12;
    const latPadding = 0.09;
    return [
      center.lng - lngPadding,
      center.lat - latPadding,
      center.lng + lngPadding,
      center.lat + latPadding
    ];
  }
}

function renderTrailList() {
  trailListElement.replaceChildren();

  if (trailWarning) {
    trailStatusElement.textContent = trailWarning;
    return;
  }

  if (hikingTrails.length === 0) {
    trailStatusElement.textContent = 'No named hiking trails found in the current map view.';
    return;
  }

  trailStatusElement.textContent = 'Check a trail to draw it on the map.';

  hikingTrails.forEach(trail => {
    const label = document.createElement('label');
    label.className = 'trail-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedTrailIds.has(trail.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedTrailIds.add(trail.id);
      } else {
        selectedTrailIds.delete(trail.id);
      }

      updateTrailLayer();
    });

    const text = document.createElement('span');
  const metaParts = [trail.sourceType, trail.surface].filter(Boolean);
  const meta = metaParts.length > 0 ? `<div class="trail-meta">${metaParts.join(' • ')}</div>` : '';
    text.innerHTML = `<div>${trail.name}</div>${meta}`;

    label.append(checkbox, text);
    trailListElement.append(label);
  });
}

function updateTrailLayer() {
  const source = map.getSource(hikingTrailSourceId);
  if (!source) {
    return;
  }

  source.setData({
    type: 'FeatureCollection',
    features: hikingTrails
      .filter(trail => selectedTrailIds.has(trail.id))
      .map(trail => ({
      type: 'Feature',
      properties: {
        id: trail.id,
        name: trail.name,
        surface: trail.surface,
        sourceType: trail.sourceType
      },
      geometry: trail.geometry
    }))
  });
}

async function loadTrailsForVisibleArea() {
  const requestId = ++activeTrailRequestId;
  trailStatusElement.textContent = 'Loading trails for the current map view...';

  try {
    const bbox = getVisibleBbox().join(',');
    const response = await fetch(`/api/hiking-trails?bbox=${encodeURIComponent(bbox)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load trails');
    }

    if (requestId !== activeTrailRequestId) {
      return;
    }

    hikingTrails = payload.trails || [];
    trailWarning = payload.warning || '';
    selectedTrailIds = new Set(
      hikingTrails
        .filter(trail => selectedTrailIds.has(trail.id))
        .map(trail => trail.id)
    );
    renderTrailList();
    updateTrailLayer();
  } catch (error) {
    if (requestId !== activeTrailRequestId) {
      return;
    }

    hikingTrails = [];
    trailWarning = 'Trail data is temporarily unavailable.';
    selectedTrailIds.clear();
    renderTrailList();
    updateTrailLayer();
  }
}

map.on('load', () => {
  applyReferenceMapStyle();

  map.addSource(hikingTrailSourceId, {
    type: 'geojson',
    data: emptyTrailCollection()
  });

  map.addLayer({
    id: hikingTrailLayerId,
    type: 'line',
    source: hikingTrailSourceId,
    paint: {
      'line-color': referencePalette.trail,
      'line-width': 3,
      'line-opacity': 0.9
    }
  });

  loadTrailsForVisibleArea();
});

map.on('moveend', loadTrailsForVisibleArea);

loadTrailsForVisibleArea();

function getOrderedPointsForLine(lineId) {
  const segments = curveData[lineId] || [];
  if (segments.length === 0) {
    return [];
  }

  const orderedPoints = [segments[0].p1];
  segments.forEach(segment => {
    orderedPoints.push(segment.p2);
  });
  return orderedPoints;
}

function rebuildLine(lineId, orderedPoints) {
  const existingSegments = curveData[lineId] || [];
  curveData[lineId] = [];

  for (let index = 1; index < orderedPoints.length; index++) {
    const previousSegment = existingSegments.find(segment => (
      segment.p1 === orderedPoints[index - 1] && segment.p2 === orderedPoints[index]
    )) || {};

    curveData[lineId].push({
      p1: orderedPoints[index - 1],
      p2: orderedPoints[index],
      c: previousSegment.c || null
    });
  }

  drawCurvesForLine(lineId);
}

function insertPointIntoSegment(lineId, segment, newPoint) {
  const orderedPoints = getOrderedPointsForLine(lineId);
  if (orderedPoints.length < 2) {
    return;
  }

  const insertAfterIndex = orderedPoints.findIndex((point, index) => {
    if (index === orderedPoints.length - 1) {
      return false;
    }

    return point === segment.p1 && orderedPoints[index + 1] === segment.p2;
  });

  if (insertAfterIndex === -1) {
    return;
  }

  orderedPoints.splice(insertAfterIndex + 1, 0, newPoint);
  rebuildLine(lineId, orderedPoints);
}

function splitSegmentWithCurvePoint(lineId, segment, curvePoint) {
  const segments = curveData[lineId] || [];
  const segmentIndex = segments.findIndex(candidate => candidate === segment);
  if (segmentIndex === -1) {
    return null;
  }

  const existingCurvePoint = segment.c;
  if (!existingCurvePoint) {
    return null;
  }

  if (!findNearbyMarker(existingCurvePoint)) {
    addMarker(existingCurvePoint, '#FF4136', true, markerObjs.length, lineId);
  }

  const originalControlPoint = bezierControlFromThroughPoint(segment.p1, existingCurvePoint, segment.p2);
  const firstHalfControlPoint = [
    (segment.p1[0] + originalControlPoint[0]) / 2,
    (segment.p1[1] + originalControlPoint[1]) / 2
  ];
  const firstHalfThroughPoint = [
    0.25 * segment.p1[0] + 0.5 * firstHalfControlPoint[0] + 0.25 * existingCurvePoint[0],
    0.25 * segment.p1[1] + 0.5 * firstHalfControlPoint[1] + 0.25 * existingCurvePoint[1]
  ];

  const firstSegment = {
    p1: segment.p1,
    p2: existingCurvePoint,
    c: firstHalfThroughPoint
  };
  const secondSegment = {
    p1: existingCurvePoint,
    p2: segment.p2,
    c: curvePoint
  };

  segments.splice(segmentIndex, 1, firstSegment, secondSegment);
  drawCurvesForLine(lineId);
  return secondSegment;
}

// Curves button toggles curve editing mode
const curvesBtn = document.getElementById('curves');
curvesBtn.onclick = function() {
  curvesMode = !curvesMode;
  curvesBtn.classList.toggle('active', curvesMode);
  map.getCanvas().style.cursor = curvesMode ? 'pointer' : '';
};

function resetLine() {
  points = [];
}

document.getElementById('add-points').onclick = function() {
  addPointsMode = true;
  resetLine(); // Only reset current points, not previous lines
  map.getCanvas().style.cursor = 'crosshair';
  // Do not resetLine() so existing points remain clickable
};

function addMarker(lngLat, color = '#FF4136', draggable = true, markerIndex = null, lineId = null) {
  const marker = new mapboxgl.Marker({color, draggable})
    .setLngLat(lngLat)
    .addTo(map);
  const obj = {marker, lngLat, markerIndex, lineId};
  markerObjs.push(obj);
  if (draggable) {
    marker.on('dragend', function() {
      const previousLngLat = obj.lngLat;
      const newLngLat = [marker.getLngLat().lng, marker.getLngLat().lat];

      // Update all curveData segments and points arrays that use this point
      for (const lid in curveData) {
        let changed = false;
        let segs = curveData[lid];
        for (let i = 0; i < segs.length; i++) {
          if (JSON.stringify(segs[i].p1) === JSON.stringify(previousLngLat)) {
            segs[i].p1 = newLngLat;
            changed = true;
          }
          if (JSON.stringify(segs[i].p2) === JSON.stringify(previousLngLat)) {
            segs[i].p2 = newLngLat;
            changed = true;
          }
          if (segs[i].c && JSON.stringify(segs[i].c) === JSON.stringify(previousLngLat)) {
            segs[i].c = newLngLat;
            changed = true;
          }
        }
        if (changed) drawCurvesForLine(lid);
      }

      obj.lngLat = newLngLat;

      // Update all points arrays for active lines
      if (obj.lineId && window.points && Array.isArray(window.points)) {
        for (let i = 0; i < window.points.length; i++) {
          if (JSON.stringify(window.points[i]) === JSON.stringify(previousLngLat)) {
            window.points[i] = newLngLat;
          }
        }
      }
    });
  }
  return marker;
}

function findNearbyMarker(lngLat, tolerance = 0.002) {
  // tolerance in degrees, ~200m
  return markerObjs.find(obj =>
    Math.abs(obj.lngLat[0] - lngLat[0]) < tolerance &&
    Math.abs(obj.lngLat[1] - lngLat[1]) < tolerance
  );
}

map.on('click', function(e) {
  if (!addPointsMode || curvesMode) return;
  let clickLngLat = [e.lngLat.lng, e.lngLat.lat];

  if (points.length === 0) {
    const nearbySegment = findNearestSegment(clickLngLat);
    if (nearbySegment) {
      const newPoint = clickLngLat;

      addMarker(newPoint, '#FF4136', true, markerObjs.length, nearbySegment.lineId);

      insertPointIntoSegment(nearbySegment.lineId, nearbySegment, newPoint);
      return;
    }

    const found = findNearbyMarker(clickLngLat);
    if (found) {
      points = [found.lngLat];
      // Do NOT add a new marker if starting at an existing point
      if (!found.connectedLines) found.connectedLines = [];
      found.connectedLines.push('distance-line-' + lineCounter);
    } else {
      points = [clickLngLat];
      addMarker(clickLngLat, '#0074D9', true, markerObjs.length, 'distance-line-' + lineCounter);
    }
  } else {
    // For subsequent points, check for proximity to existing marker
    const found = findNearbyMarker(clickLngLat);
    if (found) {
      points.push(found.lngLat);
      // Do NOT add a new marker if connecting to an existing point
      if (!found.connectedLines) found.connectedLines = [];
      found.connectedLines.push('distance-line-' + lineCounter);
    } else {
      points.push(clickLngLat);
      addMarker(clickLngLat, '#FF4136', true, points.length - 1, 'distance-line-' + lineCounter);
    }
  }
  // Draw/update line
  if (points.length > 1) {
    const thisLineId = 'distance-line-' + lineCounter;
    // Build segment data
    if (!curveData[thisLineId]) curveData[thisLineId] = [];
    curveData[thisLineId].push({p1: points[points.length-2], p2: points[points.length-1]});
    drawCurvesForLine(thisLineId);
  }
});

// When starting a new line, increment the line counter
map.on('mousedown', function(e) {
  if (addPointsMode && points.length === 1) {
    lineCounter++;
  }
});

// --- Export SVG ---
async function exportSVG() {
  await loadFrameGeometry();
  const mapCanvas = map.getCanvas();
  const imgData = mapCanvas.toDataURL('image/png');
  const frameData = await loadImageAsDataUrl(frameAssetPath);
  const stageWidth = mapStageElement.clientWidth;
  const stageHeight = mapStageElement.clientHeight;
  const framePlacement = getFramePlacement();
  const openingPlacement = getFrameOpeningPlacement();
  const titlePlacement = getTextPlacement(mapTitleElement);
  const subtitlePlacement = getTextPlacement(mapSubtitleElement);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${stageWidth}' height='${stageHeight}' viewBox='0 0 ${stageWidth} ${stageHeight}'><style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap');</style><image href='${imgData}' x='${openingPlacement.x}' y='${openingPlacement.y}' width='${openingPlacement.width}' height='${openingPlacement.height}' preserveAspectRatio='none'/><text x='${titlePlacement.x}' y='${titlePlacement.y}' text-anchor='middle' fill='${titlePlacement.fill}' font-family='Playfair Display, Georgia, serif' font-size='${titlePlacement.fontSize}' font-weight='${titlePlacement.fontWeight}' letter-spacing='${titlePlacement.letterSpacing}'>${escapeXml(titlePlacement.text)}</text><text x='${subtitlePlacement.x}' y='${subtitlePlacement.y}' text-anchor='middle' fill='${subtitlePlacement.fill}' font-family='Playfair Display, Georgia, serif' font-size='${subtitlePlacement.fontSize}' font-weight='${subtitlePlacement.fontWeight}' letter-spacing='${subtitlePlacement.letterSpacing}'>${escapeXml(subtitlePlacement.text)}</text><image href='${frameData}' x='${framePlacement.x}' y='${framePlacement.y}' width='${framePlacement.width}' height='${framePlacement.height}' preserveAspectRatio='xMidYMid meet'/></svg>`;
  const blob = new Blob([svg], {type: 'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'map-export.svg';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export-svg').onclick = exportSVG;
window.addEventListener('resize', updateMapWindowLayout);
updateMapWindowLayout();

// Helper: get all line segments for all lines
function getAllLineSegments() {
  const segments = [];
  for (let i = 0; i <= lineCounter; i++) {
    const thisLineId = 'distance-line-' + i;
    if (curveData[thisLineId]) {
      curveData[thisLineId].forEach(seg => {
        seg.lineId = thisLineId;
        segments.push(seg);
      });
    }
  }
  return segments;
}

// Helper: distance from point to segment
function pointToSegmentDistance(pt, p1, p2) {
  // pt, p1, p2: [lng, lat]
  const x = pt[0], y = pt[1], x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
  const A = x - x1, B = y - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  const dx = x - xx, dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointToPathDistance(pt, coordinates) {
  if (!coordinates || coordinates.length < 2) {
    return Infinity;
  }

  let minDistance = Infinity;
  for (let index = 1; index < coordinates.length; index++) {
    const distance = pointToSegmentDistance(pt, coordinates[index - 1], coordinates[index]);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

// Helper: find nearest segment to a click (by true distance)
function findNearestSegment(lngLat, tolerance = 0.001) {
  let minDist = Infinity, nearest = null;
  getAllLineSegments().forEach(seg => {
    let d;
    if (seg.c) {
      const controlPoint = bezierControlFromThroughPoint(seg.p1, seg.c, seg.p2);
      const curveCoordinates = bezierCurve(seg.p1, controlPoint, seg.p2);
      d = pointToPathDistance(lngLat, curveCoordinates);
    } else {
      d = pointToSegmentDistance(lngLat, seg.p1, seg.p2);
    }
    if (d < minDist && d < tolerance) {
      minDist = d;
      nearest = seg;
    }
  });
  return nearest;
}

// Add control point for curve
map.on('click', function(e) {
  if (curvesMode) {
    const clickLngLat = [e.lngLat.lng, e.lngLat.lat];
    const seg = findNearestSegment(clickLngLat);
    if (seg) {
      if (seg.c) {
        splitSegmentWithCurvePoint(seg.lineId, seg, clickLngLat);
      } else {
        seg.c = clickLngLat;
        drawCurvesForLine(seg.lineId);
      }
    }
    return;
  }
  // ...existing code...
});

function drawCurvesForLine(lineId) {
  // Remove old line and labels
  if (map.getLayer(lineId)) map.removeLayer(lineId);
  if (map.getSource(lineId)) map.removeSource(lineId);
  distanceLabels = distanceLabels.filter(l => {
    if (l.lineId === lineId) {
      l.label.remove();
      return false;
    }
    return true;
  });
  // Remove old control markers for this line
  if (curveData[lineId]) {
    curveData[lineId].forEach(seg => {
      if (seg.controlMarker) {
        seg.controlMarker.remove();
        seg.controlMarker = null;
      }
    });
  }
  // Draw each segment (curved or straight)
  const segs = curveData[lineId] || [];
  let coords = [segs[0]?.p1];
  let totalDist = 0;
  for (let i = 0; i < segs.length; i++) {
    let segCoords;
    let dist;
    if (segs[i].c) {
      const controlPoint = bezierControlFromThroughPoint(segs[i].p1, segs[i].c, segs[i].p2);
      segCoords = bezierCurve(segs[i].p1, controlPoint, segs[i].p2);
      dist = bezierLength(segs[i].p1, controlPoint, segs[i].p2);
      segs[i].controlMarker = createCurveHandle(segs[i], lineId);
    } else {
      segCoords = [segs[i].p1, segs[i].p2];
      dist = turf.distance(segs[i].p1, segs[i].p2, {units: 'kilometers'});
    }
    coords = coords.concat(segCoords.slice(1));
    // Add distance label at midpoint
    const mid = segs[i].c
      ? segs[i].c
      : [(segs[i].p1[0] + segs[i].p2[0]) / 2, (segs[i].p1[1] + segs[i].p2[1]) / 2];
    const label = new mapboxgl.Popup({closeButton: false, closeOnClick: false})
      .setLngLat(mid)
      .setHTML(`<b>${dist.toFixed(2)} km</b>`)
      .addTo(map);
    distanceLabels.push({label, lineId});
    totalDist += dist;
  }
  if (coords.length > 1) {
    map.addSource(lineId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords
        }
      }
    });
    map.addLayer({
      id: lineId,
      type: 'line',
      source: lineId,
      layout: {},
      paint: {
        'line-color': referencePalette.trail,
        'line-width': 3
      }
    });
  }
}

// Quadratic Bezier curve generator
function bezierCurve(p1, c, p2, steps = 32) {
  const coords = [];
  for (let t = 0; t <= 1; t += 1/steps) {
    coords.push(bezierPoint(p1, c, p2, t));
  }
  return coords;
}

function bezierControlFromThroughPoint(p1, throughPoint, p2) {
  return [
    2 * throughPoint[0] - 0.5 * (p1[0] + p2[0]),
    2 * throughPoint[1] - 0.5 * (p1[1] + p2[1])
  ];
}

function createCurveHandle(segment, lineId) {
  const element = document.createElement('div');
  element.className = 'curve-handle';
  element.title = 'Drag to adjust curve';

  const marker = new mapboxgl.Marker({element, draggable: true})
    .setLngLat(segment.c)
    .addTo(map);

  marker.on('dragend', function() {
    const newLngLat = marker.getLngLat();
    segment.c = [newLngLat.lng, newLngLat.lat];
    drawCurvesForLine(lineId);
  });

  return marker;
}

function bezierPoint(p1, c, p2, t) {
  const x = (1-t)*(1-t)*p1[0] + 2*(1-t)*t*c[0] + t*t*p2[0];
  const y = (1-t)*(1-t)*p1[1] + 2*(1-t)*t*c[1] + t*t*p2[1];
  return [x, y];
}
// Approximate Bezier curve length
function bezierLength(p1, c, p2, steps = 32) {
  let len = 0, prev = p1;
  for (let t = 1/steps; t <= 1; t += 1/steps) {
    const pt = bezierPoint(p1, c, p2, t);
    len += turf.distance(prev, pt, {units: 'kilometers'});
    prev = pt;
  }
  return len;
}
