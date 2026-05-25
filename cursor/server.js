const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const MAPBOX_TOKEN = String(process.env.MAPBOX_TOKEN || '').trim();
const DEBUG = /^true$/i.test(String(process.env.DEBUG || '').trim());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (_req, res) => {
  res.json({
    tileProvider: MAPBOX_TOKEN ? 'mapbox' : 'openfreemap',
    mapboxToken: MAPBOX_TOKEN,
    debug: DEBUG
  });
});

app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (query.length < 2) {
    res.json([]);
    return;
  }

  const url = `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'map-poster-app/1.0 (local development)'
      }
    });

    if (!response.ok) {
      res.status(502).json({ error: 'Geocoding service unavailable' });
      return;
    }

    const payload = await response.json();
    const results = (Array.isArray(payload) ? payload : []).map(item => ({
      label: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
      city: item.address?.city
        || item.address?.town
        || item.address?.village
        || item.address?.municipality
        || item.address?.county
        || '',
      country: item.address?.country || ''
    })).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon));

    res.json(results);
  } catch (error) {
    res.status(502).json({ error: 'Geocoding request failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Map poster app running at http://localhost:${PORT}`);
});
