const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 3000;
const DEBUG = /^true$/i.test(String(process.env.DEBUG || '').trim());
const MAPBOX_TOKEN = String(process.env.MAPBOX_TOKEN || '').trim();

const LAKE_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const NOMINATIM_MIN_INTERVAL_MS = 1200;
const NOMINATIM_RETRY_DELAY_MS = 5000;

const lakeSearchCache = new Map();
const lakeGeometryCache = new Map();

let nominatimQueue = Promise.resolve();
let nextNominatimRequestAt = 0;

function getNominatimHeaders() {
  return {
    'Accept': 'application/json',
    'User-Agent': 'map-poster-app/1.0 (local development)'
  };
}

async function fetchNominatimJson(url) {
  const requestTask = nominatimQueue.catch(() => undefined).then(async () => {
    const waitMs = Math.max(0, nextNominatimRequestAt - Date.now());
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    const response = await fetch(url, { headers: getNominatimHeaders() });
    const retryAfterHeader = Number(response.headers.get('retry-after'));
    const retryDelay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : (response.status === 429 ? NOMINATIM_RETRY_DELAY_MS : NOMINATIM_MIN_INTERVAL_MS);

    nextNominatimRequestAt = Date.now() + retryDelay;

    if (!response.ok) {
      throw new Error(`Lake search service unavailable (${response.status})`);
    }

    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  });

  nominatimQueue = requestTask.then(() => undefined, () => undefined);
  return requestTask;
}

function getLakeCacheEntry(cache, key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > LAKE_SEARCH_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return cached.results;
}

function setLakeCacheEntry(cache, key, results) {
  cache.set(key, {
    timestamp: Date.now(),
    results
  });
}

function isLakeLikeResult(item, allowedCodes, lakeTypes) {
  const countryCode = (item.address?.country_code || '').toLowerCase();
  const className = String(item.class || item.category || '').toLowerCase();
  const typeName = String(item.type || '').toLowerCase();
  const addressType = String(item.addresstype || '').toLowerCase();
  const labelText = `${item.display_name || ''} ${item.name || ''}`.toLowerCase();

  if (!allowedCodes.has(countryCode)) return false;

  return lakeTypes.has(typeName)
    || lakeTypes.has(addressType)
    || (className === 'natural' && typeName === 'water')
    || (className === 'water' && (typeName === 'lake' || typeName === 'reservoir'))
    || (className === 'landuse' && typeName === 'reservoir')
    || /(^|[^a-z])(lake|reservoir|pond)([^a-z]|$)/.test(labelText);
}

function formatLakeResult(item) {
  const name = String(item.name || item.display_name || '').split(',')[0].trim();
  const region = [
    item.address?.state,
    item.address?.province,
    item.address?.county,
    item.address?.municipality,
    item.address?.country
  ].filter(Boolean).filter((value, index, arr) => arr.indexOf(value) === index).join(', ');

  return {
    label: item.display_name,
    name,
    region,
    country: item.address?.country || '',
    lat: Number(item.lat),
    lon: Number(item.lon),
    osmType: item.osm_type || '',
    osmId: String(item.osm_id || '')
  };
}

function getLookupOsmRef(osmType, osmId) {
  const prefixes = { relation: 'R', way: 'W', node: 'N' };
  const prefix = prefixes[osmType];
  if (!prefix || !/^\d+$/.test(osmId)) return null;
  return `${prefix}${osmId}`;
}

function getCachedLakeSearch(query) {
  return getLakeCacheEntry(lakeSearchCache, query);
}

function setCachedLakeSearch(query, results) {
  setLakeCacheEntry(lakeSearchCache, query, results);
}

function getCachedLakeGeometry(key) {
  return getLakeCacheEntry(lakeGeometryCache, key);
}

function setCachedLakeGeometry(key, results) {
  setLakeCacheEntry(lakeGeometryCache, key, results);
}

/*
  * Express routes
  * - Serves static files for app frontend
  * - Provides API endpoints for geocoding and lake data
  * - Implements in-memory caching for lake search results and geometries
  * - Proxies requests to Nominatim with rate limiting and retry handling
  */
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/map', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'map.html'));
});

app.get('/map/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'map.html'));
});

app.get('/lake', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lake.html'));
});

app.get('/lake/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lake.html'));
});

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

  const url = `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=us,ca&q=${encodeURIComponent(query)}`;

  try {
    const payload = await fetchNominatimJson(url);
    const ALLOWED_CODES = new Set(['us', 'ca']);
    const results = (Array.isArray(payload) ? payload : [])
      .filter(item => ALLOWED_CODES.has((item.address?.country_code || '').toLowerCase()))
      .map(item => ({
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

/*
  * Lake search and geometry endpoints
  * - /api/lake-search?q=... : Searches for lakes matching query string
  * - /api/lake-geometry?osmType=...&osmId=... : Retrieves geometry for specific lake
  * - Implements caching and rate-limited proxying to Nominatim
  * - Filters results to lake-like features in US and Canada
  */
app.get('/api/lake-search', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (query.length < 2) {
    res.json([]);
    return;
  }

  const ALLOWED_CODES = new Set(['us', 'ca']);
  const LAKE_TYPES = new Set(['water', 'lake', 'reservoir', 'pond', 'basin']);
  const normalizedQuery = query.toLowerCase();
  const cachedResults = getCachedLakeSearch(normalizedQuery);

  if (cachedResults) {
    res.json(cachedResults);
    return;
  }

  try {
    const url = `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=12&countrycodes=us,ca&q=${encodeURIComponent(query)}`;
    const payload = await fetchNominatimJson(url);
    const seen = new Set();
    const results = payload
      .filter(item => isLakeLikeResult(item, ALLOWED_CODES, LAKE_TYPES))
      .filter(item => {
        const key = `${item.osm_type || ''}:${item.osm_id || ''}:${item.display_name || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6)
      .map(formatLakeResult);

    setCachedLakeSearch(normalizedQuery, results);
    res.json(results);
  } catch (error) {
    res.status(502).json({ error: 'Lake search request failed', details: error.message });
  }
});

app.get('/api/lake-geometry', async (req, res) => {
  const osmType = String(req.query.osmType || '').trim().toLowerCase();
  const osmId = String(req.query.osmId || '').trim();
  const lookupRef = getLookupOsmRef(osmType, osmId);

  if (!lookupRef) {
    res.status(400).json({ error: 'Invalid lake lookup parameters' });
    return;
  }

  const cachedGeometry = getCachedLakeGeometry(lookupRef);
  if (cachedGeometry) {
    res.json(cachedGeometry);
    return;
  }

  try {
    const url = `${NOMINATIM_URL}/lookup?format=jsonv2&addressdetails=1&polygon_geojson=1&osm_ids=${encodeURIComponent(lookupRef)}`;
    const payload = await fetchNominatimJson(url);
    const item = payload.find(entry => {
      const countryCode = (entry.address?.country_code || '').toLowerCase();
      const geometryType = entry.geojson?.type;
      return (countryCode === 'us' || countryCode === 'ca')
        && (geometryType === 'Polygon' || geometryType === 'MultiPolygon');
    });

    if (!item) {
      res.status(404).json({ error: 'Lake outline unavailable' });
      return;
    }

    const result = {
      ...formatLakeResult(item),
      geojson: item.geojson
    };

    setCachedLakeGeometry(lookupRef, result);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: 'Lake geometry request failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Map poster app running at http://localhost:${PORT}`);
});
