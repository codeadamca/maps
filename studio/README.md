# Map Poster

A Terraink-inspired map poster maker: search a place, pick a theme, toggle layers, edit labels, and download a PNG.

Built with vanilla HTML/CSS/JavaScript, MapLibre GL, and OpenStreetMap data via [OpenFreeMap](https://openfreemap.org/).

## Run locally

```sh
npm install
npm start
```

Open http://localhost:3000

## Features

- Location search (Nominatim, proxied through Express)
- Curated color themes (from [Terraink](https://github.com/yousifamanuel/terraink) `themes.json`)
- Layer toggles (land, water, parks, buildings, roads, rail)
- Title / subtitle labels with font choice
- Print and digital format presets
- PNG export

## Attribution

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Tiles via [OpenFreeMap](https://openfreemap.org/)
- Map style generation adapted from [Terraink](https://github.com/yousifamanuel/terraink) (AGPL-3.0)

If you redistribute this project, review Terraink’s license and trademark terms.

## Not affiliated with Terraink

This is an independent learning project inspired by [terraink.app](https://terraink.app/). Do not use the Terraink name or branding.
