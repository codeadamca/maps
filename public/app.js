// Set your Mapbox access token here
mapboxgl.accessToken = window.MAPBOX_ACCESS_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v11',
  center: [-79.86622015711724, 45.64789087148891], // Updated center
  zoom: 13,
  preserveDrawingBuffer: true
});

// Disable map drag to prevent panning
map.dragPan.disable();

// Enable zoom and rotation controls
map.addControl(new mapboxgl.NavigationControl());

let hikingTrails = [];
let selectedTrailIds = new Set();
let activeTrailRequestId = 0;
let trailWarning = '';

const trailListElement = document.getElementById('trail-list');
const trailStatusElement = document.getElementById('trail-status');
const hikingTrailSourceId = 'hiking-trails-source';
const hikingTrailLayerId = 'hiking-trails-layer';

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
  map.addSource(hikingTrailSourceId, {
    type: 'geojson',
    data: emptyTrailCollection()
  });

  map.addLayer({
    id: hikingTrailLayerId,
    type: 'line',
    source: hikingTrailSourceId,
    paint: {
      'line-color': '#2d6a4f',
      'line-width': 4,
      'line-opacity': 0.85
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
function exportSVG() {
  const mapCanvas = map.getCanvas();
  const imgData = mapCanvas.toDataURL('image/png');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${mapCanvas.width}' height='${mapCanvas.height}'><image href='${imgData}' width='100%' height='100%'/></svg>`;
  const blob = new Blob([svg], {type: 'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'map-export.svg';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export-svg').onclick = exportSVG;

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
        'line-color': '#e67e22',
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
