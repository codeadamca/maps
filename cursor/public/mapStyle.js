function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let n = hex.trim().replace('#', '');
  if (n.length === 3) n = n.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return null;
  const v = parseInt(n, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
function blendHex(hexA, hexB, weight = 0.5) {
  const a = parseHex(hexA), b = parseHex(hexB);
  if (!a && !b) return '#888888';
  if (!a) return hexB;
  if (!b) return hexA;
  const t = Math.min(Math.max(weight, 0), 1);
  const mix = (f, to) => Math.round(f * (1 - t) + to * t);
  return '#' + [mix(a.r,b.r), mix(a.g,b.g), mix(a.b,b.b)].map(x => x.toString(16).padStart(2,'0')).join('');
}






const OPENFREEMAP_SOURCE = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_SOURCE_ID = "openfreemap";
const MAPBOX_SOURCE_ID = "mapbox-streets";
const MAPBOX_STREETS_TILE_URL = "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/{z}/{x}/{y}.vector.pbf?access_token=";
const MAPBOX_SOURCE_MAX_ZOOM = 16;

/**
 * OpenFreeMap is OpenMapTiles-based and can generalize data at low zooms.
 * Setting maxzoom explicitly keeps high zoom behavior deterministic (standard overzoom above this level).
 */
const SOURCE_MAX_ZOOM = 14;

const BUILDING_BLEND_FACTOR = 0.14;
const BUILDING_FILL_OPACITY = 0.84;

const MAP_WATERWAY_WIDTH_STOPS = [
  [0, 0.2],
  [6, 0.34],
  [12, 0.8],
  [18, 2.4],
];

const MAP_RAIL_WIDTH_STOPS = [
  [3, 0.4],
  [6, 0.7],
  [10, 1],
  [18, 1.5],
];

/**
 * Road classes are intentionally broad in minor/detail buckets so dense road texture
 * remains visible when the camera zooms out.
 */
const MAP_ROAD_MAJOR_CLASSES = ["motorway"];

const MAP_ROAD_MINOR_HIGH_CLASSES = [
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "motorway_link",
  "trunk",
  "trunk_link",
];

const MAP_ROAD_MINOR_MID_CLASSES = ["tertiary", "tertiary_link", "minor"];

const MAP_ROAD_MINOR_LOW_CLASSES = [
  "residential",
  "living_street",
  "unclassified",
  "road",
  "street",
  "street_limited",
  "service",
];

const MAP_ROAD_PATH_CLASSES = ["path", "pedestrian", "cycleway", "track"];
const OPENFREEMAP_RAIL_CLASSES = ["rail", "transit"];
const MAPBOX_RAIL_CLASSES = ["major_rail", "minor_rail", "service_rail"];
const OPENFREEMAP_LANDCOVER_LAYER = "landcover";
const OPENFREEMAP_PARK_LAYER = "park";
const OPENFREEMAP_TRANSPORTATION_LAYER = "transportation";
const MAPBOX_LANDUSE_LAYER = "landuse";
const MAPBOX_ROAD_LAYER = "road";
const MAPBOX_PARK_CLASSES = ["park"];
const MAPBOX_LANDCOVER_CLASSES = [
  "grass",
  "wood",
  "scrub",
  "sand",
  "rock",
  "farmland",
  "glacier",
];
const MAPBOX_ROAD_MAJOR_CLASSES = ["motorway"];
const MAPBOX_ROAD_MINOR_HIGH_CLASSES = [
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "trunk",
  "trunk_link",
  "motorway_link",
];
const MAPBOX_ROAD_MINOR_MID_CLASSES = ["tertiary", "tertiary_link"];
const MAPBOX_ROAD_MINOR_LOW_CLASSES = ["street", "street_limited", "service"];
const MAPBOX_ROAD_PATH_CLASSES = ["path", "pedestrian", "track"];

/**
 * Two-stage minor/path rendering:
 * - overview layer: very thin roads at low zoom so detail does not disappear abruptly
 * - detail layer: thicker, readable network from mid zoom upward
 */
const MAP_ROAD_MINOR_HIGH_OVERVIEW_WIDTH_STOPS = [
  [0, 0.1],
  [4, 0.18],
  [8, 0.3],
  [11, 0.46],
];
const MAP_ROAD_MINOR_MID_OVERVIEW_WIDTH_STOPS = [
  [0, 0.08],
  [4, 0.14],
  [8, 0.24],
  [11, 0.36],
];
const MAP_ROAD_MINOR_LOW_OVERVIEW_WIDTH_STOPS = [
  [0, 0.06],
  [4, 0.1],
  [8, 0.18],
  [11, 0.3],
];
const MAP_ROAD_MINOR_HIGH_DETAIL_WIDTH_STOPS = [
  [6, 0.46],
  [10, 0.8],
  [14, 1.48],
  [18, 2.7],
];
const MAP_ROAD_MINOR_MID_DETAIL_WIDTH_STOPS = [
  [6, 0.34],
  [10, 0.62],
  [14, 1.2],
  [18, 2.35],
];
const MAP_ROAD_MINOR_LOW_DETAIL_WIDTH_STOPS = [
  [6, 0.24],
  [10, 0.44],
  [14, 0.84],
  [18, 1.65],
];

const MAP_ROAD_PATH_OVERVIEW_WIDTH_STOPS = [
  [5, 0.06],
  [8, 0.1],
  [11, 0.2],
];
const MAP_ROAD_PATH_DETAIL_WIDTH_STOPS = [
  [8, 0.2],
  [12, 0.42],
  [16, 0.85],
  [18, 1.3],
];

const MAP_ROAD_MAJOR_WIDTH_STOPS = [
  [0, 0.36],
  [3, 0.52],
  [9, 1.1],
  [14, 2.05],
  [18, 3.3],
];

const ROAD_MINOR_OVERVIEW_MIN_ZOOM = 0;
const ROAD_MINOR_DETAIL_MIN_ZOOM = 6;
const ROAD_PATH_OVERVIEW_MIN_ZOOM = 5;
const ROAD_PATH_DETAIL_MIN_ZOOM = 8;
const ROAD_OVERVIEW_MAX_ZOOM = 11.8;

const LINE_GEOMETRY_FILTER = [
  "match",
  ["geometry-type"],
  ["LineString", "MultiLineString"],
  true,
  false,
] ;

/** Over-zoom scale for poster rendering (from Terraink constants). */
const MAP_OVERZOOM_SCALE = 5.5;

/**
 * Over-zoom preview/export shrinks rendered strokes after viewport scale compensation.
 * Apply a global width boost to keep perceived stroke thickness closer to non-overzoom output.
 */
const OVERZOOM_LINE_WIDTH_SCALE = Math.pow(MAP_OVERZOOM_SCALE, 0.8);

function widthExpr(stops) {
  const flat = stops.flatMap(([zoom, width]) => [zoom, width]);
  return ["interpolate", ["linear"], ["zoom"], ...flat];
}

function opacityExpr(stops) {
  const flat = stops.flatMap(([zoom, opacity]) => [zoom, opacity]);
  return ["interpolate", ["linear"], ["zoom"], ...flat];
}

function scaledStops(
  stops,
  scale,
) {
  return stops.map(([zoom, width]) => [zoom, width * scale]);
}

function compensateLineWidthStops(
  stops,
) {
  return scaledStops(stops, OVERZOOM_LINE_WIDTH_SCALE);
}

function lineClassFilter(classes) {
  return [
    "all",
    LINE_GEOMETRY_FILTER,
    ["match", ["get", "class"], classes, true, false],
  ];
}

function areaClassFilter(classes) {
  return ["match", ["get", "class"], classes, true, false];
}

function getProviderConfig(options = {}) {
  const useMapbox = options.provider === 'mapbox' && Boolean(options.mapboxToken);

  if (useMapbox) {
    return {
      sourceId: MAPBOX_SOURCE_ID,
      source: {
        type: 'vector',
        tiles: [`${MAPBOX_STREETS_TILE_URL}${options.mapboxToken}`],
        minzoom: 0,
        maxzoom: MAPBOX_SOURCE_MAX_ZOOM,
      },
      layers: {
        landcover: MAPBOX_LANDUSE_LAYER,
        park: MAPBOX_LANDUSE_LAYER,
        water: 'water',
        waterway: 'waterway',
        aeroway: 'aeroway',
        transportation: MAPBOX_ROAD_LAYER,
        building: 'building',
      },
      filters: {
        landcover: areaClassFilter(MAPBOX_LANDCOVER_CLASSES),
        park: areaClassFilter(MAPBOX_PARK_CLASSES),
        rail: lineClassFilter(MAPBOX_RAIL_CLASSES),
      },
      roadClasses: {
        major: MAPBOX_ROAD_MAJOR_CLASSES,
        minorHigh: MAPBOX_ROAD_MINOR_HIGH_CLASSES,
        minorMid: MAPBOX_ROAD_MINOR_MID_CLASSES,
        minorLow: MAPBOX_ROAD_MINOR_LOW_CLASSES,
        path: MAPBOX_ROAD_PATH_CLASSES,
      },
    };
  }

  return {
    sourceId: OPENFREEMAP_SOURCE_ID,
    source: {
      type: 'vector',
      url: OPENFREEMAP_SOURCE,
      maxzoom: SOURCE_MAX_ZOOM,
    },
    layers: {
      landcover: OPENFREEMAP_LANDCOVER_LAYER,
      park: OPENFREEMAP_PARK_LAYER,
      water: 'water',
      waterway: 'waterway',
      aeroway: 'aeroway',
      transportation: OPENFREEMAP_TRANSPORTATION_LAYER,
      building: 'building',
    },
    filters: {
      landcover: null,
      park: null,
      rail: lineClassFilter(OPENFREEMAP_RAIL_CLASSES),
    },
    roadClasses: {
      major: MAP_ROAD_MAJOR_CLASSES,
      minorHigh: MAP_ROAD_MINOR_HIGH_CLASSES,
      minorMid: MAP_ROAD_MINOR_MID_CLASSES,
      minorLow: MAP_ROAD_MINOR_LOW_CLASSES,
      path: MAP_ROAD_PATH_CLASSES,
    },
  };
}

function generateMapStyle(theme, options = {}) {
  const provider = getProviderConfig(options);
  const buildingFill =
    theme.map.buildings ||
    blendHex(
      theme.map.land || "#ffffff",
      theme.ui.text || "#111111",
      BUILDING_BLEND_FACTOR,
    );

  const includeLandcover = options.includeLandcover ?? true;
  const includeBuildings = options.includeBuildings ?? true;
  const includeWater = options.includeWater ?? true;
  const includeParks = options.includeParks ?? true;
  const includeAeroway = options.includeAeroway ?? true;
  const includeRail = options.includeRail ?? true;
  const includeRoads = options.includeRoads ?? true;
  const includeRoadPath = options.includeRoadPath ?? true;
  const includeRoadMinorLow = options.includeRoadMinorLow ?? true;
  const includeRoadOutline = options.includeRoadOutline ?? true;
  const roadMajorClasses = provider.roadClasses.major;
  const roadMinorHighClasses = provider.roadClasses.minorHigh;
  const roadMinorMidClasses = provider.roadClasses.minorMid;
  const roadMinorLowClasses = provider.roadClasses.minorLow;
  const roadPathClasses = provider.roadClasses.path;

  const minorHighCasingStops = scaledStops(
    MAP_ROAD_MINOR_HIGH_DETAIL_WIDTH_STOPS,
    1.45,
  );
  const minorMidCasingStops = scaledStops(
    MAP_ROAD_MINOR_MID_DETAIL_WIDTH_STOPS,
    1.15,
  );
  const pathCasingStops = scaledStops(MAP_ROAD_PATH_DETAIL_WIDTH_STOPS, 1.6);
  const majorCasingStops = scaledStops(MAP_ROAD_MAJOR_WIDTH_STOPS, 1.38);
  const waterwayWidthStops = compensateLineWidthStops(MAP_WATERWAY_WIDTH_STOPS);
  const railWidthStops = compensateLineWidthStops(MAP_RAIL_WIDTH_STOPS);
  const roadMinorOverviewHighWidthStops = compensateLineWidthStops(
    MAP_ROAD_MINOR_HIGH_OVERVIEW_WIDTH_STOPS,
  );
  const roadMinorOverviewMidWidthStops = compensateLineWidthStops(
    MAP_ROAD_MINOR_MID_OVERVIEW_WIDTH_STOPS,
  );
  const roadMinorOverviewLowWidthStops = compensateLineWidthStops(
    MAP_ROAD_MINOR_LOW_OVERVIEW_WIDTH_STOPS,
  );
  const roadPathOverviewWidthStops = compensateLineWidthStops(
    MAP_ROAD_PATH_OVERVIEW_WIDTH_STOPS,
  );
  const roadMinorDetailHighWidthStops = compensateLineWidthStops(
    MAP_ROAD_MINOR_HIGH_DETAIL_WIDTH_STOPS,
  );
  const roadMinorDetailMidWidthStops = compensateLineWidthStops(
    MAP_ROAD_MINOR_MID_DETAIL_WIDTH_STOPS,
  );
  const roadMinorDetailLowWidthStops = compensateLineWidthStops(
    MAP_ROAD_MINOR_LOW_DETAIL_WIDTH_STOPS,
  );
  const roadPathDetailWidthStops = compensateLineWidthStops(
    MAP_ROAD_PATH_DETAIL_WIDTH_STOPS,
  );
  const roadMajorWidthStops = compensateLineWidthStops(
    MAP_ROAD_MAJOR_WIDTH_STOPS,
  );
  const roadMinorHighCasingStops =
    compensateLineWidthStops(minorHighCasingStops);
  const roadMinorMidCasingStops = compensateLineWidthStops(minorMidCasingStops);
  const roadPathCasingStops = compensateLineWidthStops(pathCasingStops);
  const roadMajorCasingStops = compensateLineWidthStops(majorCasingStops);
  const roadMinorHighColor = theme.map.roads.minor_high;
  const roadMinorMidColor = theme.map.roads.minor_mid;
  const roadMinorLowColor = theme.map.roads.minor_low;
  const roadPathColor = theme.map.roads.path;
  const roadOutlineColor = theme.map.roads.outline;

  return {
    version: 8,
    sources: {
      [provider.sourceId]: provider.source,
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": theme.map.land },
      },

      // Landcover (forests, grass, farmland, etc.) drawn first so parks and
      // water can paint over it where they overlap.
      {
        id: "landcover",
        source: provider.sourceId,
        "source-layer": provider.layers.landcover,
        type: "fill" ,
        layout: { visibility: includeLandcover ? ("visible" ) : ("none" ) },
        filter: provider.filters.landcover || undefined,
        paint: {
          "fill-color": theme.map.landcover,
          "fill-opacity": 0.7,
        },
      },

      // Parks are drawn before water so that marine protected areas / ocean parks
      // are always covered by the water layer and don't bleed the parks color onto oceans.
      {
        id: "park",
        source: provider.sourceId,
        "source-layer": provider.layers.park,
        type: "fill" ,
        layout: { visibility: includeParks ? ("visible" ) : ("none" ) },
        filter: provider.filters.park || undefined,
        paint: { "fill-color": theme.map.parks },
      },

      {
        id: "water",
        source: provider.sourceId,
        "source-layer": provider.layers.water,
        type: "fill" ,
        layout: { visibility: includeWater ? ("visible" ) : ("none" ) },
        paint: { "fill-color": theme.map.water },
      },
      {
        id: "waterway",
        source: provider.sourceId,
        "source-layer": provider.layers.waterway,
        type: "line" ,
        filter: lineClassFilter(["river", "canal", "stream", "ditch"]),
        paint: {
          "line-color": theme.map.waterway,
          "line-width": widthExpr(waterwayWidthStops),
        },
        layout: {
          visibility: includeWater ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },

      {
        id: "aeroway",
        source: provider.sourceId,
        "source-layer": provider.layers.aeroway,
        type: "fill" ,
        filter: [
          "match",
          ["geometry-type"],
          ["MultiPolygon", "Polygon"],
          true,
          false,
        ],
        layout: { visibility: includeAeroway ? ("visible" ) : ("none" ) },
        paint: {
          "fill-color": theme.map.aeroway,
          "fill-opacity": 0.85,
        },
      },

      {
        id: "rail",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line" ,
        filter: provider.filters.rail,
        paint: {
          "line-color": theme.map.rail,
          "line-width": widthExpr(railWidthStops),
          "line-opacity": opacityExpr([
            [0, 0.56],
            [12, 0.62],
            [18, 0.72],
          ]),
          "line-dasharray": [2, 1.6],
        },
        layout: {
          visibility: includeRail ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },

      {
        id: "road-minor-overview-low",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_MINOR_OVERVIEW_MIN_ZOOM,
        maxzoom: ROAD_OVERVIEW_MAX_ZOOM,
        filter: lineClassFilter(roadMinorLowClasses),
        paint: {
          "line-color": roadMinorLowColor,
          "line-width": widthExpr(roadMinorOverviewLowWidthStops),
          "line-opacity": includeRoadMinorLow
            ? opacityExpr([
                [0, 0.26],
                [8, 0.34],
                [12, 0],
              ])
            : 0,
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-minor-overview-mid",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_MINOR_OVERVIEW_MIN_ZOOM,
        maxzoom: ROAD_OVERVIEW_MAX_ZOOM,
        filter: lineClassFilter(roadMinorMidClasses),
        paint: {
          "line-color": roadMinorMidColor,
          "line-width": widthExpr(roadMinorOverviewMidWidthStops),
          "line-opacity": opacityExpr([
            [0, 0.46],
            [8, 0.56],
            [12, 0],
          ]),
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-minor-overview-high",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_MINOR_OVERVIEW_MIN_ZOOM,
        maxzoom: ROAD_OVERVIEW_MAX_ZOOM,
        filter: lineClassFilter(roadMinorHighClasses),
        paint: {
          "line-color": roadMinorHighColor,
          "line-width": widthExpr(roadMinorOverviewHighWidthStops),
          "line-opacity": opacityExpr([
            [0, 0.66],
            [8, 0.76],
            [12, 0],
          ]),
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-path-overview",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_PATH_OVERVIEW_MIN_ZOOM,
        maxzoom: ROAD_OVERVIEW_MAX_ZOOM,
        filter: lineClassFilter(roadPathClasses),
        paint: {
          "line-color": roadPathColor,
          "line-width": widthExpr(roadPathOverviewWidthStops),
          "line-opacity": includeRoadPath
            ? opacityExpr([
                [5, 0.45],
                [9, 0.58],
                [12, 0],
              ])
            : 0,
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },

      {
        id: "road-path-casing",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_PATH_DETAIL_MIN_ZOOM,
        filter: lineClassFilter(roadPathClasses),
        paint: {
          "line-color": roadOutlineColor,
          "line-width": widthExpr(roadPathCasingStops),
          "line-opacity": includeRoadOutline && includeRoadPath
            ? opacityExpr([
                [8, 0.62],
                [12, 0.72],
                [18, 0.85],
              ])
            : 0,
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-minor-mid-casing",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
        filter: lineClassFilter(roadMinorMidClasses),
        paint: {
          "line-color": roadOutlineColor,
          "line-width": widthExpr(roadMinorMidCasingStops),
          "line-opacity": includeRoadOutline
            ? opacityExpr([
                [6, 0.42],
                [12, 0.56],
                [18, 0.66],
              ])
            : 0,
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-minor-high-casing",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
        filter: lineClassFilter(roadMinorHighClasses),
        paint: {
          "line-color": roadOutlineColor,
          "line-width": widthExpr(roadMinorHighCasingStops),
          "line-opacity": includeRoadOutline
            ? opacityExpr([
                [6, 0.72],
                [12, 0.85],
                [18, 0.92],
              ])
            : 0,
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-major-casing",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        filter: lineClassFilter(roadMajorClasses),
        paint: {
          "line-color": roadOutlineColor,
          "line-width": widthExpr(roadMajorCasingStops),
          "line-opacity": includeRoadOutline ? 0.95 : 0,
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },

      {
        id: "road-minor-low",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
        filter: lineClassFilter(roadMinorLowClasses),
        paint: {
          "line-color": roadMinorLowColor,
          "line-width": widthExpr(roadMinorDetailLowWidthStops),
          "line-opacity": includeRoadMinorLow
            ? opacityExpr([
                [6, 0.34],
                [10, 0.46],
                [18, 0.58],
              ])
            : 0,
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-minor-mid",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
        filter: lineClassFilter(roadMinorMidClasses),
        paint: {
          "line-color": roadMinorMidColor,
          "line-width": widthExpr(roadMinorDetailMidWidthStops),
          "line-opacity": opacityExpr([
            [6, 0.62],
            [10, 0.74],
            [18, 0.86],
          ]),
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-minor-high",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
        filter: lineClassFilter(roadMinorHighClasses),
        paint: {
          "line-color": roadMinorHighColor,
          "line-width": widthExpr(roadMinorDetailHighWidthStops),
          "line-opacity": opacityExpr([
            [6, 0.84],
            [10, 0.92],
            [18, 1],
          ]),
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-path",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        minzoom: ROAD_PATH_DETAIL_MIN_ZOOM,
        filter: lineClassFilter(roadPathClasses),
        paint: {
          "line-color": roadPathColor,
          "line-width": widthExpr(roadPathDetailWidthStops),
          "line-opacity": includeRoadPath
            ? opacityExpr([
                [8, 0.7],
                [12, 0.82],
                [18, 0.95],
              ])
            : 0,
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "road-major",
        source: provider.sourceId,
        "source-layer": provider.layers.transportation,
        type: "line",
        filter: lineClassFilter(roadMajorClasses),
        paint: {
          "line-color": theme.map.roads.major,
          "line-width": widthExpr(roadMajorWidthStops),
        },
        layout: {
          visibility: includeRoads ? ("visible" ) : ("none" ),
          "line-cap": "round" ,
          "line-join": "round" ,
        },
      },
      {
        id: "building",
        source: provider.sourceId,
        "source-layer": provider.layers.building,
        type: "fill" ,
        layout: { visibility: includeBuildings ? ("visible" ) : ("none" ) },
        paint: {
          "fill-color": buildingFill,
          "fill-opacity": options.provider === "mapbox"
            ? opacityExpr([
                [2.8, 0.08],
                [3.6, 0.13],
                [4.6, 0.2],
                [5.6, 0.28],
                [6.6, 0.36],
                [8, 0.44],
                [10, 0.58],
                [13, BUILDING_FILL_OPACITY],
              ])
            : BUILDING_FILL_OPACITY,
        },
      },
    ],
  };
}

window.generateMapStyle = generateMapStyle;
