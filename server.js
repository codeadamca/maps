const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

app.use(express.static(path.join(__dirname, 'public')));

// Serve config.js with the access token
app.get('/config.js', (req, res) => {
  const token = process.env.MAPBOX_ACCESS_TOKEN || '';
  res.type('application/javascript');
  res.send(`window.MAPBOX_ACCESS_TOKEN = "${token}";\n`);
});

app.get('/api/hiking-trails', async (req, res) => {
  const bbox = String(req.query.bbox || '').split(',').map(Number);

  if (bbox.length !== 4 || bbox.some(value => Number.isNaN(value))) {
    res.status(400).json({ error: 'Expected bbox=minLng,minLat,maxLng,maxLat' });
    return;
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  const lngSpan = Math.abs(maxLng - minLng);
  const latSpan = Math.abs(maxLat - minLat);

  if (lngSpan > 0.75 || latSpan > 0.5 || (lngSpan * latSpan) > 0.18) {
    res.json({
      trails: [],
      warning: 'Zoom in to load trails for the current map view.'
    });
    return;
  }

  const overpassQuery = `
    [out:json][timeout:25];
    way["highway"~"path|footway|track"]["name"]["foot"!="no"](${minLat},${minLng},${maxLat},${maxLng});
    out geom tags;
    relation["route"~"hiking|foot"]["name"](${minLat},${minLng},${maxLat},${maxLng});
    out body;
    way(r);
    out geom tags;
  `;

  try {
    const overpassUrl = `${OVERPASS_API_URL}?data=${encodeURIComponent(overpassQuery)}`;
    const response = await fetch(overpassUrl, {
      headers: {
        'User-Agent': 'mapbox-export-app/1.0 (+http://localhost)',
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      const responseText = await response.text();
      res.json({
        trails: [],
        warning: 'Trail data is temporarily unavailable.',
        details: responseText
      });
      return;
    }

    const payload = await response.json();
    const elements = payload.elements || [];
    const relations = elements.filter(element => element.type === 'relation');
    const drawableWays = elements.filter(element => (
      element.type === 'way' && Array.isArray(element.geometry) && element.geometry.length > 1
    ));

    const directWayTrails = drawableWays
      .filter(element => element.tags?.highway && element.tags?.name)
      .map(element => ({
        id: `osm-way-${element.id}`,
        name: element.tags?.name || `Trail ${element.id}`,
        surface: element.tags?.surface || null,
        sourceType: 'OSM path',
        geometry: {
          type: 'LineString',
          coordinates: element.geometry.map(point => [point.lon, point.lat])
        }
      }));

    const wayGeometryById = new Map(
      drawableWays.map(element => [
        element.id,
        element.geometry.map(point => [point.lon, point.lat])
      ])
    );

    const routeRelationTrails = relations
      .map(relation => {
        const segments = (relation.members || [])
          .filter(member => member.type === 'way')
          .map(member => wayGeometryById.get(member.ref))
          .filter(segment => Array.isArray(segment) && segment.length > 1);

        if (segments.length === 0) {
          return null;
        }

        return {
          id: `osm-route-${relation.id}`,
          name: relation.tags?.name || `Route ${relation.id}`,
          surface: null,
          sourceType: 'OSM hiking route',
          geometry: {
            type: segments.length === 1 ? 'LineString' : 'MultiLineString',
            coordinates: segments.length === 1 ? segments[0] : segments
          }
        };
      })
      .filter(Boolean);

    const trails = [...directWayTrails, ...routeRelationTrails]
      .sort((left, right) => left.name.localeCompare(right.name));

    res.json({ trails });
  } catch (error) {
    res.json({
      trails: [],
      warning: 'Trail data is temporarily unavailable.',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
