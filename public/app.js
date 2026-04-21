// Set your Mapbox access token here
mapboxgl.accessToken = window.MAPBOX_ACCESS_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v11',
  center: [-74.5, 40],
  zoom: 9
});

// Enable zoom and rotation controls
map.addControl(new mapboxgl.NavigationControl());

// Export current map bounds as GeoJSON
function exportGeoJSON() {
  const bounds = map.getBounds();
  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [bounds.getWest(), bounds.getSouth()],
        [bounds.getEast(), bounds.getSouth()],
        [bounds.getEast(), bounds.getNorth()],
        [bounds.getWest(), bounds.getNorth()],
        [bounds.getWest(), bounds.getSouth()]
      ]]
    },
    properties: {}
  };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'map-bounds.geojson';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export-geojson').onclick = exportGeoJSON;

// Export map as SVG (simple screenshot of map container)
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
