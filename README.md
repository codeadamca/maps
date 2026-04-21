# Mapbox Export App

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```
2. Get a Mapbox access token from https://account.mapbox.com/access-tokens/
3. Open `public/app.js` and replace `'YOUR_MAPBOX_ACCESS_TOKEN'` with your token.
4. Start the server:
   ```sh
   npm start
   ```
5. Open http://localhost:3000 in your browser.

## Features
- Pan, zoom, and interact with the map
- Export current map bounds as GeoJSON
- Export current map view as SVG image
