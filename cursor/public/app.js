const DEFAULT_CENTER = [-79.86622015711724, 45.64789087148891];
const DEFAULT_ZOOM = 11;
const MAPBOX_BUILDING_FOCUS_ZOOM = 16;
const VIEW_STATE_KEY = 'map-poster:view';
const EXPORT_DPI = 96;
const MAX_EXPORT_DIMENSION = 1600;
const EXPORT_TEXT_SCALE_ADJUSTMENT = 1.08;
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

const LAYER_OPTIONS = [
  { id: 'landcover', label: 'Land cover' },
  { id: 'parks', label: 'Parks' },
  { id: 'water', label: 'Water' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'roads', label: 'Roads' },
  { id: 'rail', label: 'Rail' },
  { id: 'compass', label: 'Compass' }
];

const LAYER_IDS_BY_OPTION = {
  landcover: ['landcover'],
  parks: ['park', 'aeroway'],
  water: ['water', 'waterway'],
  buildings: ['building'],
  rail: ['rail'],
  roads: [
    'road-minor-overview-high',
    'road-minor-overview-mid',
    'road-minor-overview-low',
    'road-path-overview',
    'road-major-casing',
    'road-minor-high-casing',
    'road-minor-mid-casing',
    'road-path-casing',
    'road-major',
    'road-minor-high',
    'road-minor-mid',
    'road-minor-low',
    'road-path'
  ]
};

const state = {
  themeId: 'coral',
  layoutId: 'poster_18x24_portrait',
  orientation: 'portrait',
  city: 'Whitestone Lake',
  country: 'Ontario, Canada',
  fontFamily: 'Playfair Display',
  center: [...DEFAULT_CENTER],
  zoom: DEFAULT_ZOOM,
  bearing: 0,
  layers: {
    landcover: true,
    parks: true,
    water: true,
    buildings: true,
    roads: true,
    rail: true,
    compass: true
  }
};

let themesData = { themes: {} };
let layoutsData = { categories: [] };
let map = null;
let searchAbort = null;
const svgFontFaceCache = new Map();
const svgFontDataCache = new Map();
let appConfig = {
  tileProvider: 'openfreemap',
  mapboxToken: '',
  debug: false
};

const themeGrid = document.getElementById('theme-grid');
const layerList = document.getElementById('layer-list');
const layoutSelect = document.getElementById('layout-select');
const orientationSelect = document.getElementById('orientation-select');
const locationSearch = document.getElementById('location-search');
const searchResults = document.getElementById('search-results');
const labelCity = document.getElementById('label-city');
const labelCountry = document.getElementById('label-country');
const labelFont = document.getElementById('label-font');
const posterFrame = document.getElementById('poster-frame');
const posterCompass = document.getElementById('poster-compass');
const posterCompassRose = document.getElementById('poster-compass-rose');
const posterDebug = document.getElementById('poster-debug');
const posterCity = document.getElementById('poster-city');
const posterCountry = document.getElementById('poster-country');
const posterLabels = document.getElementById('poster-labels');
const exportButton = document.getElementById('export-png');
const exportSvgButton = document.getElementById('export-svg');
const rotateLeftButton = document.getElementById('rotate-left');
const rotateRightButton = document.getElementById('rotate-right');

const ROTATION_STEP = 15;

// ── Points of Interest ────────────────────────────────────────────────────────
// Font Awesome class strings used in the live HTML preview.
const POI_ICONS = [
  'fa-solid fa-location-dot',
  'fa-solid fa-star',
  'fa-solid fa-campground',
  'fa-solid fa-mountain',
  'fa-solid fa-person-swimming',
  'fa-solid fa-sailboat',
  'fa-solid fa-fish',
  'fa-solid fa-tree',
  'fa-solid fa-house',
  'fa-solid fa-camera',
  'fa-solid fa-building',
  'fa-solid fa-church',
  'fa-solid fa-landmark',
  'fa-solid fa-bus',
  'fa-solid fa-utensils',
  'fa-solid fa-person-skiing',
  'fa-solid fa-person-hiking',
  'fa-solid fa-leaf',
  'fa-solid fa-1',
  'fa-solid fa-2',
  'fa-solid fa-3',
  'fa-solid fa-4',
  'fa-solid fa-5',
  'fa-solid fa-6',
  'fa-solid fa-7',
  'fa-solid fa-8',
  'fa-solid fa-9'
];
// Emoji equivalents used as final fallback when FA font cannot be loaded.
const POI_ICONS_EMOJI = ['📍', '⭐', '🏕️', '🏔️', '🏊', '🚤', '🎣', '🌲', '🏠', '📸', '🏢', '⛪', '🏛️', '🚌', '🍽️', '⛷️', '🥾', '🍃', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
// FA 6 Solid unicode codepoints — index-matched to POI_ICONS.
// Numbers 1-9 use standard ASCII digits which FA 6 renders as styled numerals at weight 900.
const POI_ICONS_UNICODE = [
  '\uf3c5', '\uf005', '\uf6bb', '\uf6fc', '\uf5c4', '\ue612',
  '\uf578', '\uf1bb', '\uf015', '\uf030', '\uf1ad', '\uf51d',
  '\uf66f', '\uf207', '\uf2e7', '\uf7c9', '\uf6ec', '\uf06c',
  '1', '2', '3', '4', '5', '6', '7', '8', '9'
];
// FA 6 Free solid woff2 — embedded into SVG exports so icons render everywhere.
const FA_SOLID_WOFF2_URL = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/webfonts/fa-solid-900.woff2';

// FA 6 Solid SVG path data — used for reliable icon rendering in PNG (Path2D) and SVG exports.
// Each entry: { vbW, vbH, d } where vbW/vbH are the viewBox dimensions and d is the path data.
const POI_ICONS_SVG = [
  // 0 location-dot
  { vbW: 384, vbH: 512, d: 'M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z' },
  // 1 star
  { vbW: 576, vbH: 512, d: 'M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z' },
  // 2 campground
  { vbW: 576, vbH: 512, d: 'M377 52c11-13.8 8.8-33.9-5-45s-33.9-8.8-45 5L288 60.8 249 12c-11-13.8-31.2-16-45-5s-16 31.2-5 45l48 60L12.3 405.4C4.3 415.4 0 427.7 0 440.4V464c0 26.5 21.5 48 48 48H288 528c26.5 0 48-21.5 48-48V440.4c0-12.7-4.3-25.1-12.3-35L329 112l48-60zM288 448H168.5L288 291.7 407.5 448H288z' },
  // 3 mountain
  { vbW: 512, vbH: 512, d: 'M256 32c12.5 0 24.1 6.4 30.8 17L503.4 394.4c5.6 8.9 8.6 19.2 8.6 29.7c0 30.9-25 55.9-55.9 55.9H55.9C25 480 0 455 0 424.1c0-10.5 3-20.8 8.6-29.7L225.2 49c6.6-10.6 18.3-17 30.8-17zm65 192L256 120.4 176.9 246.5l18.3 24.4c6.4 8.5 19.2 8.5 25.6 0l25.6-34.1c6-8.1 15.5-12.8 25.6-12.8h49z' },
  // 4 person-swimming
  { vbW: 576, vbH: 512, d: 'M309.5 178.4L447.9 297.1c-1.6 .9-3.2 2-4.8 3c-18 12.4-40.1 20.3-59.2 20.3c-19.6 0-40.8-7.7-59.2-20.3c-22.1-15.5-51.6-15.5-73.7 0c-17.1 11.8-38 20.3-59.2 20.3c-10.1 0-21.1-2.2-31.9-6.2C163.1 193.2 262.2 96 384 96h64c17.7 0 32 14.3 32 32s-14.3 32-32 32H384c-26.9 0-52.3 6.6-74.5 18.4zM160 160A64 64 0 1 1 32 160a64 64 0 1 1 128 0zM306.5 325.9C329 341.4 356.5 352 384 352c26.9 0 55.4-10.8 77.4-26.1l0 0c11.9-8.5 28.1-7.8 39.2 1.7c14.4 11.9 32.5 21 50.6 25.2c17.2 4 27.9 21.2 23.9 38.4s-21.2 27.9-38.4 23.9c-24.5-5.7-44.9-16.5-58.2-25C449.5 405.7 417 416 384 416c-31.9 0-60.6-9.9-80.4-18.9c-5.8-2.7-11.1-5.3-15.6-7.7c-4.5 2.4-9.7 5.1-15.6 7.7c-19.8 9-48.5 18.9-80.4 18.9c-33 0-65.5-10.3-94.5-25.8c-13.4 8.4-33.7 19.3-58.2 25c-17.2 4-34.4-6.7-38.4-23.9s6.7-34.4 23.9-38.4c18.1-4.2 36.2-13.3 50.6-25.2c11.1-9.4 27.3-10.1 39.2-1.7l0 0C136.7 341.2 165.1 352 192 352c27.5 0 55-10.6 77.5-26.1c11.1-7.9 25.9-7.9 37 0z' },
  // 5 sailboat
  { vbW: 576, vbH: 512, d: 'M256 16c0-7 4.5-13.2 11.2-15.3s13.9 .4 17.9 6.1l224 320c3.4 4.9 3.8 11.3 1.1 16.6s-8.2 8.6-14.2 8.6H272c-8.8 0-16-7.2-16-16V16zM212.1 96.5c7 1.9 11.9 8.2 11.9 15.5V336c0 8.8-7.2 16-16 16H80c-5.7 0-11-3-13.8-8s-2.9-11-.1-16l128-224c3.6-6.3 11-9.4 18-7.5zM5.7 404.3C2.8 394.1 10.5 384 21.1 384H554.9c10.6 0 18.3 10.1 15.4 20.3l-4 14.3C550.7 473.9 500.4 512 443 512H133C75.6 512 25.3 473.9 9.7 418.7l-4-14.3z' },
  // 6 fish
  { vbW: 576, vbH: 512, d: 'M180.5 141.5C219.7 108.5 272.6 80 336 80s116.3 28.5 155.5 61.5c39.1 33 66.9 72.4 81 99.8c4.7 9.2 4.7 20.1 0 29.3c-14.1 27.4-41.9 66.8-81 99.8C452.3 403.5 399.4 432 336 432s-116.3-28.5-155.5-61.5c-16.2-13.7-30.5-28.5-42.7-43.1L48.1 379.6c-12.5 7.3-28.4 5.3-38.7-4.9S-3 348.7 4.2 336.1L50 256 4.2 175.9c-7.2-12.6-5-28.4 5.3-38.6s26.1-12.2 38.7-4.9l89.7 52.3c12.2-14.6 26.5-29.4 42.7-43.1zM448 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z' },
  // 7 tree
  { vbW: 448, vbH: 512, d: 'M210.6 5.9L62 169.4c-3.9 4.2-6 9.8-6 15.5C56 197.7 66.3 208 79.1 208H104L30.6 281.4c-4.2 4.2-6.6 10-6.6 16C24 309.9 34.1 320 46.6 320H80L5.4 409.5C1.9 413.7 0 419 0 424.5c0 13 10.5 23.5 23.5 23.5H192v32c0 17.7 14.3 32 32 32s32-14.3 32-32V448H424.5c13 0 23.5-10.5 23.5-23.5c0-5.5-1.9-10.8-5.4-15L368 320h33.4c12.5 0 22.6-10.1 22.6-22.6c0-6-2.4-11.8-6.6-16L344 208h24.9c12.7 0 23.1-10.3 23.1-23.1c0-5.7-2.1-11.3-6-15.5L237.4 5.9C234 2.1 229.1 0 224 0s-10 2.1-13.4 5.9z' },
  // 8 house
  { vbW: 576, vbH: 512, d: 'M575.8 255.5c0 18-15 32.1-32 32.1h-32l.7 160.2c0 2.7-.2 5.4-.5 8.1V472c0 22.1-17.9 40-40 40H456c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1H416 392c-22.1 0-40-17.9-40-40V448 384c0-17.7-14.3-32-32-32H256c-17.7 0-32 14.3-32 32v64 24c0 22.1-17.9 40-40 40H160 128.1c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2H104c-22.1 0-40-17.9-40-40V360c0-.9 0-1.9 .1-2.8V287.6H32c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z' },
  // 9 camera
  { vbW: 512, vbH: 512, d: 'M149.1 64.8L138.7 96H64C28.7 96 0 124.7 0 160V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H373.3L362.9 64.8C356.4 45.2 338.1 32 317.4 32H194.6c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z' },
  // 10 building
  { vbW: 384, vbH: 512, d: 'M48 0C21.5 0 0 21.5 0 48V464c0 26.5 21.5 48 48 48h96V432c0-26.5 21.5-48 48-48s48 21.5 48 48v80h96c26.5 0 48-21.5 48-48V48c0-26.5-21.5-48-48-48H48zM64 240c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V240zm112-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V240c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H272c-8.8 0-16-7.2-16-16V240zM80 96h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V112zM272 96h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H272c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16z' },
  // 11 church
  { vbW: 640, vbH: 512, d: 'M344 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V48H264c-13.3 0-24 10.7-24 24s10.7 24 24 24h32v46.4L183.3 210c-14.5 8.7-23.3 24.3-23.3 41.2V512h96V416c0-35.3 28.7-64 64-64s64 28.7 64 64v96h96V251.2c0-16.9-8.8-32.5-23.3-41.2L344 142.4V96h32c13.3 0 24-10.7 24-24s-10.7-24-24-24H344V24zM24.9 330.3C9.5 338.8 0 354.9 0 372.4V464c0 26.5 21.5 48 48 48h80V273.6L24.9 330.3zM592 512c26.5 0 48-21.5 48-48V372.4c0-17.5-9.5-33.6-24.9-42.1L512 273.6V512h80z' },
  // 12 landmark
  { vbW: 512, vbH: 512, d: 'M240.1 4.2c9.8-5.6 21.9-5.6 31.8 0l171.8 98.1L448 104l0 .9 47.9 27.4c12.6 7.2 18.8 22 15.1 36s-16.4 23.8-30.9 23.8H32c-14.5 0-27.2-9.8-30.9-23.8s2.5-28.8 15.1-36L64 104.9V104l4.4-1.6L240.1 4.2zM64 224h64V416h40V224h64V416h48V224h64V416h40V224h64V420.3c.6 .3 1.2 .7 1.8 1.1l48 32c11.7 7.8 17 22.4 12.9 35.9S494.1 512 480 512H32c-14.1 0-26.5-9.2-30.6-22.7s1.1-28.1 12.9-35.9l48-32c.6-.4 1.2-.7 1.8-1.1V224z' },
  // 13 bus
  { vbW: 576, vbH: 512, d: 'M288 0C422.4 0 512 35.2 512 80V96l0 32c17.7 0 32 14.3 32 32v64c0 17.7-14.3 32-32 32l0 160c0 17.7-14.3 32-32 32v32c0 17.7-14.3 32-32 32H416c-17.7 0-32-14.3-32-32V448H192v32c0 17.7-14.3 32-32 32H128c-17.7 0-32-14.3-32-32l0-32c-17.7 0-32-14.3-32-32l0-160c-17.7 0-32-14.3-32-32V160c0-17.7 14.3-32 32-32h0V96h0V80C64 35.2 153.6 0 288 0zM128 160v96c0 17.7 14.3 32 32 32H272V128H160c-17.7 0-32 14.3-32 32zM304 288H416c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32H304V288zM144 400a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm288 0a32 32 0 1 0 0-64 32 32 0 1 0 0 64zM384 80c0-8.8-7.2-16-16-16H208c-8.8 0-16 7.2-16 16s7.2 16 16 16H368c8.8 0 16-7.2 16-16z' },
  // 14 utensils
  { vbW: 448, vbH: 512, d: 'M416 0C400 0 288 32 288 176V288c0 35.3 28.7 64 64 64h32V480c0 17.7 14.3 32 32 32s32-14.3 32-32V352 240 32c0-17.7-14.3-32-32-32zM64 16C64 7.8 57.9 1 49.7 .1S34.2 4.6 32.4 12.5L2.1 148.8C.7 155.1 0 161.5 0 167.9c0 45.9 35.1 83.6 80 87.7V480c0 17.7 14.3 32 32 32s32-14.3 32-32V255.6c44.9-4.1 80-41.8 80-87.7c0-6.4-.7-12.8-2.1-19.1L191.6 12.5c-1.8-8-9.3-13.3-17.4-12.4S160 7.8 160 16V150.2c0 5.4-4.4 9.8-9.8 9.8c-5.1 0-9.3-3.9-9.8-9L127.9 14.6C127.2 6.3 120.3 0 112 0s-15.2 6.3-15.9 14.6L83.7 151c-.5 5.1-4.7 9-9.8 9c-5.4 0-9.8-4.4-9.8-9.8V16zm48.3 152l-.3 0-.3 0 .3-.7 .3 .7z' },
  // 15 person-skiing
  { vbW: 512, vbH: 512, d: 'M380.7 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM2.7 268.9c6.1-11.8 20.6-16.3 32.4-10.2L232.7 361.3l46.2-69.2-75.1-75.1c-14.6-14.6-20.4-33.9-18.4-52.1l108.8 52 39.3 39.3c16.2 16.2 18.7 41.5 6 60.6L289.8 391l128.7 66.8c13.6 7.1 29.8 7.2 43.6 .3l15.2-7.6c11.9-5.9 26.3-1.1 32.2 10.7s1.1 26.3-10.7 32.2l-15.2 7.6c-27.5 13.7-59.9 13.5-87.2-.7L12.9 301.3C1.2 295.2-3.4 280.7 2.7 268.9zM118.9 65.6L137 74.2l8.7-17.4c4-7.9 13.6-11.1 21.5-7.2s11.1 13.6 7.2 21.5l-8.5 16.9 54.7 26.2c1.5-.7 3.1-1.4 4.7-2.1l83.4-33.4c34.2-13.7 72.8 4.2 84.5 39.2l17.1 51.2 52.1 26.1c15.8 7.9 22.2 27.1 14.3 42.9s-27.1 22.2-42.9 14.3l-58.1-29c-11.4-5.7-20-15.7-24.1-27.8l-5.8-17.3-27.3 12.1-6.8 3-6.7-3.2L151.5 116.7l-9.2 18.4c-4 7.9-13.6 11.1-21.5 7.2s-11.1-13.6-7.2-21.5l9-18-17.6-8.4c-8-3.8-11.3-13.4-7.5-21.3s13.4-11.3 21.3-7.5z' },
  // 16 person-hiking
  { vbW: 384, vbH: 512, d: 'M192 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm51.3 182.7L224.2 307l49.7 49.7c9 9 14.1 21.2 14.1 33.9V480c0 17.7-14.3 32-32 32s-32-14.3-32-32V397.3l-73.9-73.9c-15.8-15.8-22.2-38.6-16.9-60.3l20.4-84c8.3-34.1 42.7-54.9 76.7-46.4c19 4.8 35.6 16.4 46.4 32.7L305.1 208H336V184c0-13.3 10.7-24 24-24s24 10.7 24 24v55.8c0 .1 0 .2 0 .2s0 .2 0 .2V488c0 13.3-10.7 24-24 24s-24-10.7-24-24V272H296.6c-16 0-31-8-39.9-21.4l-13.3-20zM81.1 471.9L117.3 334c3 4.2 6.4 8.2 10.1 11.9l41.9 41.9L142.9 488.1c-4.5 17.1-22 27.3-39.1 22.8s-27.3-22-22.8-39.1zm55.5-346L101.4 266.5c-3 12.1-14.9 19.9-27.2 17.9l-47.9-8c-14-2.3-22.9-16.3-19.2-30L31.9 155c9.5-34.8 41.1-59 77.2-59h4.2c15.6 0 27.1 14.7 23.3 29.8z' },
  // 17 leaf
  { vbW: 512, vbH: 512, d: 'M272 96c-78.6 0-145.1 51.5-167.7 122.5c33.6-17 71.5-26.5 111.7-26.5h88c8.8 0 16 7.2 16 16s-7.2 16-16 16H288 216s0 0 0 0c-16.6 0-32.7 1.9-48.3 5.4c-25.9 5.9-49.9 16.4-71.4 30.7c0 0 0 0 0 0C38.3 298.8 0 364.9 0 440v16c0 13.3 10.7 24 24 24s24-10.7 24-24V440c0-48.7 20.7-92.5 53.8-123.2C121.6 392.3 190.3 448 272 448l1 0c132.1-.7 239-130.9 239-291.4c0-42.6-7.5-83.1-21.1-119.6c-2.6-6.9-12.7-6.6-16.2-.1C455.9 72.1 418.7 96 376 96L272 96z' },
  // 18 1
  { vbW: 256, vbH: 512, d: 'M160 64c0-11.8-6.5-22.6-16.9-28.2s-23-5-32.8 1.6l-96 64C-.5 111.2-4.4 131 5.4 145.8s29.7 18.7 44.4 8.9L96 123.8V416H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h96 96c17.7 0 32-14.3 32-32s-14.3-32-32-32H160V64z' },
  // 19 2
  { vbW: 320, vbH: 512, d: 'M142.9 96c-21.5 0-42.2 8.5-57.4 23.8L54.6 150.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L40.2 74.5C67.5 47.3 104.4 32 142.9 32C223 32 288 97 288 177.1c0 38.5-15.3 75.4-42.5 102.6L109.3 416H288c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-12.9 0-24.6-7.8-29.6-19.8s-2.2-25.7 6.9-34.9L200.2 234.5c15.2-15.2 23.8-35.9 23.8-57.4c0-44.8-36.3-81.1-81.1-81.1z' },
  // 20 3
  { vbW: 320, vbH: 512, d: 'M0 64C0 46.3 14.3 32 32 32H272c13.2 0 25 8.1 29.8 20.4s1.5 26.3-8.2 35.2L162.3 208H184c75.1 0 136 60.9 136 136s-60.9 136-136 136H105.4C63 480 24.2 456 5.3 418.1l-1.9-3.8c-7.9-15.8-1.5-35 14.3-42.9s35-1.5 42.9 14.3l1.9 3.8c8.1 16.3 24.8 26.5 42.9 26.5H184c39.8 0 72-32.2 72-72s-32.2-72-72-72H80c-13.2 0-25-8.1-29.8-20.4s-1.5-26.3 8.2-35.2L189.7 96H32C14.3 96 0 81.7 0 64z' },
  // 21 4
  { vbW: 384, vbH: 512, d: 'M189 77.6c7.5-16 .7-35.1-15.3-42.6s-35.1-.7-42.6 15.3L3 322.4c-4.7 9.9-3.9 21.5 1.9 30.8S21 368 32 368H256v80c0 17.7 14.3 32 32 32s32-14.3 32-32V368h32c17.7 0 32-14.3 32-32s-14.3-32-32-32H320V160c0-17.7-14.3-32-32-32s-32 14.3-32 32V304H82.4L189 77.6z' },
  // 22 5
  { vbW: 320, vbH: 512, d: 'M32.5 58.3C35.3 43.1 48.5 32 64 32H256c17.7 0 32 14.3 32 32s-14.3 32-32 32H90.7L70.3 208H184c75.1 0 136 60.9 136 136s-60.9 136-136 136H100.5c-39.4 0-75.4-22.3-93-57.5l-4.1-8.2c-7.9-15.8-1.5-35 14.3-42.9s35-1.5 42.9 14.3l4.1 8.2c6.8 13.6 20.6 22.1 35.8 22.1H184c39.8 0 72-32.2 72-72s-32.2-72-72-72H32c-9.5 0-18.5-4.2-24.6-11.5s-8.6-16.9-6.9-26.2l32-176z' },
  // 23 6
  { vbW: 320, vbH: 512, d: 'M232.4 84.7c11.4-13.5 9.7-33.7-3.8-45.1s-33.7-9.7-45.1 3.8L38.6 214.7C14.7 242.9 1.1 278.4 .1 315.2c0 1.4-.1 2.9-.1 4.3c0 .2 0 .3 0 .5c0 88.4 71.6 160 160 160s160-71.6 160-160c0-85.5-67.1-155.4-151.5-159.8l63.9-75.6zM256 320A96 96 0 1 1 64 320a96 96 0 1 1 192 0z' },
  // 24 7
  { vbW: 320, vbH: 512, d: 'M0 64C0 46.3 14.3 32 32 32H288c11.5 0 22 6.1 27.7 16.1s5.7 22.2-.1 32.1l-224 384c-8.9 15.3-28.5 20.4-43.8 11.5s-20.4-28.5-11.5-43.8L232.3 96H32C14.3 96 0 81.7 0 64z' },
  // 25 8
  { vbW: 320, vbH: 512, d: 'M304 160c0-70.7-57.3-128-128-128H144C73.3 32 16 89.3 16 160c0 34.6 13.7 66 36 89C20.5 272.3 0 309.8 0 352c0 70.7 57.3 128 128 128h64c70.7 0 128-57.3 128-128c0-42.2-20.5-79.7-52-103c22.3-23 36-54.4 36-89zM176.1 288H192c35.3 0 64 28.7 64 64s-28.7 64-64 64H128c-35.3 0-64-28.7-64-64s28.7-64 64-64h15.9c0 0 .1 0 .1 0h32c0 0 .1 0 .1 0zm0-64c0 0 0 0 0 0H144c0 0 0 0 0 0c-35.3 0-64-28.7-64-64c0-35.3 28.7-64 64-64h32c35.3 0 64 28.7 64 64c0 35.3-28.6 64-64 64z' },
  // 26 9
  { vbW: 320, vbH: 512, d: 'M64 192a96 96 0 1 0 192 0A96 96 0 1 0 64 192zm87.5 159.8C67.1 347.4 0 277.5 0 192C0 103.6 71.6 32 160 32s160 71.6 160 160c0 2.6-.1 5.3-.2 7.9c-1.7 35.7-15.2 70-38.4 97.4l-145 171.4c-11.4 13.5-31.6 15.2-45.1 3.8s-15.2-31.6-3.8-45.1l63.9-75.6z' }
];

let poiList = [];          // [{ id, name, iconIdx, lng, lat }]
let poiLegendMode = false; // true = show legend; false = show callout labels
let poiPickerActive = false;
let poiIdCounter = 0;
let poiLegendPos = null;  // {x, y} as % from top-left, null = use default (bottom-right)

const poiAddBtn      = document.getElementById('poi-add');
const poiLegendCheck = document.getElementById('poi-legend-mode');
const poiListEl      = document.getElementById('poi-list');
const poiOverlay     = document.getElementById('poi-overlay');
const poiLegendEl    = document.getElementById('poi-legend');
const poiDialog      = document.getElementById('poi-dialog');
const poiNameInput   = document.getElementById('poi-name-input');
const poiDialogCancel  = document.getElementById('poi-dialog-cancel');
// ─────────────────────────────────────────────────────────────────────────────

function loadViewState() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_STATE_KEY) || 'null');
    if (!saved) return;

    const [lng, lat] = saved.center || [];
    const zoom = Number(saved.zoom);
    const bearing = Number(saved.bearing);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(zoom)) {
      state.center = [lng, lat];
      state.zoom = zoom;
    }

    if (Number.isFinite(bearing)) {
      state.bearing = bearing;
    }

    if (typeof saved.themeId === 'string') state.themeId = saved.themeId;
    if (typeof saved.layoutId === 'string') state.layoutId = saved.layoutId;
    if (saved.orientation === 'portrait' || saved.orientation === 'landscape') {
      state.orientation = saved.orientation;
    }
    if (typeof saved.city === 'string') state.city = saved.city;
    if (typeof saved.country === 'string') state.country = saved.country;
    if (typeof saved.fontFamily === 'string') state.fontFamily = saved.fontFamily;

    if (saved.layers && typeof saved.layers === 'object') {
      for (const option of LAYER_OPTIONS) {
        if (typeof saved.layers[option.id] === 'boolean') {
          state.layers[option.id] = saved.layers[option.id];
        }
      }
    }

    if (Array.isArray(saved.pois)) {
      poiList = saved.pois.filter(p =>
        p && typeof p.id === 'number' &&
        typeof p.name === 'string' &&
        typeof p.iconIdx === 'number' &&
        typeof p.lng === 'number' &&
        typeof p.lat === 'number'
      ).map(p => ({
        ...p,
        labelDx: typeof p.labelDx === 'number' ? p.labelDx : 0,
        labelDy: typeof p.labelDy === 'number' ? p.labelDy : -12
      }));
    }
    if (typeof saved.poiIdCounter === 'number') poiIdCounter = saved.poiIdCounter;
    if (typeof saved.poiLegendMode === 'boolean') {
      poiLegendMode = saved.poiLegendMode;
      poiLegendCheck.checked = poiLegendMode;
    }
    if (saved.poiLegendPos && typeof saved.poiLegendPos.x === 'number') {
      poiLegendPos = saved.poiLegendPos;
    }
  } catch (error) {
    // Ignore invalid storage.
  }
}

function saveViewState() {
  const center = map ? map.getCenter() : { lng: state.center[0], lat: state.center[1] };
  localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
    center: [center.lng, center.lat],
    zoom: map ? map.getZoom() : state.zoom,
    bearing: map ? map.getBearing() : state.bearing,
    themeId: state.themeId,
    layoutId: state.layoutId,
    orientation: state.orientation,
    city: state.city,
    country: state.country,
    fontFamily: state.fontFamily,
    layers: state.layers,
    pois: poiList,
    poiLegendMode,
    poiIdCounter,
    poiLegendPos
  }));
}

function getTheme() {
  return themesData.themes[state.themeId] || themesData.themes.coral;
}

function getLayout() {
  for (const category of layoutsData.categories || []) {
    const match = (category.layouts || []).find(layout => layout.id === state.layoutId);
    if (match) return match;
  }
  return { width: 21, height: 29.7, unit: 'cm' };
}

function getLayoutDimensions() {
  const layout = getLayout();
  const longSide = Math.max(layout.width, layout.height);
  const shortSide = Math.min(layout.width, layout.height);

  if (state.orientation === 'landscape') {
    return {
      ...layout,
      width: longSide,
      height: shortSide
    };
  }

  return {
    ...layout,
    width: shortSide,
    height: longSide
  };
}

function getExportDimensions() {
  const layout = getLayoutDimensions();
  if (layout.unit === 'px') {
    const largestDimension = Math.max(layout.width, layout.height);
    if (largestDimension <= MAX_EXPORT_DIMENSION) {
      return { width: layout.width, height: layout.height };
    }

    const scale = MAX_EXPORT_DIMENSION / largestDimension;
    return {
      width: Math.round(layout.width * scale),
      height: Math.round(layout.height * scale)
    };
  }
  const rawWidth = Math.round((layout.width / 2.54) * EXPORT_DPI);
  const rawHeight = Math.round((layout.height / 2.54) * EXPORT_DPI);
  const largestDimension = Math.max(rawWidth, rawHeight);

  if (largestDimension <= MAX_EXPORT_DIMENSION) {
    return { width: rawWidth, height: rawHeight };
  }

  const scale = MAX_EXPORT_DIMENSION / largestDimension;
  const width = Math.round(rawWidth * scale);
  const height = Math.round(rawHeight * scale);
  return { width, height };
}

function getSvgDocumentSize() {
  const layout = getLayoutDimensions();

  if (layout.unit === 'px') {
    return {
      width: `${layout.width}px`,
      height: `${layout.height}px`
    };
  }

  return {
    width: `${layout.width}cm`,
    height: `${layout.height}cm`
  };
}

function buildMapStyle() {
  const theme = getTheme();
  return generateMapStyle(theme, {
    provider: appConfig.tileProvider,
    mapboxToken: appConfig.mapboxToken,
    includeLandcover: state.layers.landcover,
    includeParks: state.layers.parks,
    includeWater: state.layers.water,
    includeBuildings: state.layers.buildings,
    includeAeroway: state.layers.parks,
    includeRail: state.layers.rail,
    includeRoads: state.layers.roads,
    includeRoadPath: state.layers.roads,
    includeRoadMinorLow: state.layers.roads,
    includeRoadOutline: state.layers.roads
  });
}

function applyThemeUi() {
  const theme = getTheme();
  document.documentElement.style.setProperty('--poster-bg', theme.ui.bg);
  document.documentElement.style.setProperty('--poster-text', theme.ui.text);
  document.documentElement.style.setProperty('--compass-bg', theme.ui.bg);
  document.documentElement.style.setProperty('--compass-ring', theme.ui.text);
  document.documentElement.style.setProperty('--compass-accent', theme.map.water || theme.ui.text);
  document.documentElement.style.setProperty('--compass-muted', theme.map.land || theme.ui.bg);
  posterLabels.style.fontFamily = `"${state.fontFamily}", sans-serif`;
}

function applyPosterAspect() {
  const layout = getLayoutDimensions();
  posterFrame.style.setProperty('--poster-aspect', `${layout.width} / ${layout.height}`);
}

function updatePosterLayout() {
  applyPosterAspect();
  if (map) {
    requestAnimationFrame(() => map.resize());
  }
}

function getPosterMetrics() {
  const { width, height } = getExportDimensions();
  const labelBand = Math.round(height * 0.14);
  const mapHeight = height - labelBand;
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
    : Math.round(width * 0.055);
  const subtitleSize = Number.isFinite(previewSubtitleSize)
    ? Math.round(previewSubtitleSize * exportScale * EXPORT_TEXT_SCALE_ADJUSTMENT)
    : Math.round(width * 0.028);
  const titleY = posterFrameRect && posterCityRect
    ? Math.round((posterCityRect.top - posterFrameRect.top + posterCityRect.height / 2) * exportScale)
    : Math.round(mapHeight + labelBand * 0.52);
  const subtitleY = posterFrameRect && posterCountryRect
    ? Math.round((posterCountryRect.top - posterFrameRect.top + posterCountryRect.height / 2) * exportScale)
    : Math.round(mapHeight + labelBand * 0.82);

  return {
    width,
    height,
    labelBand,
    mapHeight,
    titleSize,
    subtitleSize,
    titleY,
    subtitleY
  };
}

function getCompassPalette(theme) {
  return {
    bg: theme.ui.bg,
    ring: theme.ui.text,
    accent: theme.map.water || theme.ui.text,
    muted: theme.map.land || theme.ui.bg
  };
}

function getCompassMetrics(width, mapHeight) {
  const size = Math.max(72, Math.round(Math.min(width, mapHeight) * 0.13));
  const radius = Math.round(size / 2);
  const inset = Math.max(28, Math.round(size * 0.32));

  return {
    size,
    radius,
    centerX: width - inset - radius,
    centerY: inset + radius
  };
}

function getCompassAngle() {
  return map ? -map.getBearing() : 0;
}

function applyCompassRotation() {
  if (!posterCompassRose) return;
  posterCompassRose.setAttribute('transform', `rotate(${getCompassAngle()} 50 50)`);
}

function drawCompass(ctx, theme, width, mapHeight) {
  if (!state.layers.compass) return;

  const palette = getCompassPalette(theme);
  const compass = getCompassMetrics(width, mapHeight);
  const sideOffset = compass.radius * 0.32;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = compass.size * 0.22;
  ctx.shadowOffsetY = compass.size * 0.08;

  ctx.beginPath();
  ctx.fillStyle = palette.bg;
  ctx.globalAlpha = 0.92;
  ctx.arc(compass.centerX, compass.centerY, compass.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';

  ctx.beginPath();
  ctx.lineWidth = Math.max(3, compass.size * 0.045);
  ctx.strokeStyle = palette.ring;
  ctx.arc(compass.centerX, compass.centerY, compass.radius * 0.95, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(compass.centerX, compass.centerY);
  ctx.rotate((getCompassAngle() * Math.PI) / 180);
  ctx.translate(-compass.centerX, -compass.centerY);

  ctx.fillStyle = palette.ring;
  ctx.beginPath();
  ctx.moveTo(compass.centerX, compass.centerY - compass.radius * 0.88);
  ctx.lineTo(compass.centerX + sideOffset, compass.centerY);
  ctx.lineTo(compass.centerX, compass.centerY - compass.radius * 0.2);
  ctx.lineTo(compass.centerX - sideOffset, compass.centerY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(compass.centerX, compass.centerY + compass.radius * 0.88);
  ctx.lineTo(compass.centerX + sideOffset, compass.centerY);
  ctx.lineTo(compass.centerX, compass.centerY + compass.radius * 0.2);
  ctx.lineTo(compass.centerX - sideOffset, compass.centerY);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = palette.muted;
  ctx.arc(compass.centerX, compass.centerY, compass.radius * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.lineWidth = Math.max(2, compass.size * 0.03);
  ctx.strokeStyle = palette.ring;
  ctx.arc(compass.centerX, compass.centerY, compass.radius * 0.12, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function buildCompassSvg(theme, width, mapHeight) {
  if (!state.layers.compass) return '';

  const palette = getCompassPalette(theme);
  const compass = getCompassMetrics(width, mapHeight);
  const sideOffset = compass.radius * 0.32;

  return [
    '  <g>',
    `    <circle cx="${compass.centerX}" cy="${compass.centerY}" r="${compass.radius}" fill="${escapeXml(palette.bg)}" fill-opacity="0.92" />`,
    `    <circle cx="${compass.centerX}" cy="${compass.centerY}" r="${compass.radius * 0.95}" fill="none" stroke="${escapeXml(palette.ring)}" stroke-width="${Math.max(3, compass.size * 0.045)}" />`,
    `    <g transform="rotate(${getCompassAngle()} ${compass.centerX} ${compass.centerY})">`,
    `    <path d="M ${compass.centerX} ${compass.centerY - compass.radius * 0.88} L ${compass.centerX + sideOffset} ${compass.centerY} L ${compass.centerX} ${compass.centerY - compass.radius * 0.2} L ${compass.centerX - sideOffset} ${compass.centerY} Z" fill="${escapeXml(palette.ring)}" />`,
    `    <path d="M ${compass.centerX} ${compass.centerY + compass.radius * 0.88} L ${compass.centerX + sideOffset} ${compass.centerY} L ${compass.centerX} ${compass.centerY + compass.radius * 0.2} L ${compass.centerX - sideOffset} ${compass.centerY} Z" fill="${escapeXml(palette.accent)}" />`,
    `    <circle cx="${compass.centerX}" cy="${compass.centerY}" r="${compass.radius * 0.12}" fill="${escapeXml(palette.muted)}" stroke="${escapeXml(palette.ring)}" stroke-width="${Math.max(2, compass.size * 0.03)}" />`,
    '    </g>',
    '  </g>'
  ].join('\n');
}

function applyLabels() {
  posterCity.textContent = state.city;
  posterCountry.textContent = state.country;
  labelCity.value = state.city;
  labelCountry.value = state.country;
}

function formatZoomValue(zoom) {
  return Number.isFinite(zoom) ? zoom.toFixed(2) : '0.00';
}

function applyDebugOverlay() {
  if (!posterDebug) return;
  posterDebug.hidden = !appConfig.debug;
  if (!appConfig.debug) return;
  posterDebug.textContent = `Zoom: ${formatZoomValue(state.zoom)}`;
}

function rotateMapBy(delta) {
  if (!map) return;

  map.rotateTo(map.getBearing() + delta, {
    duration: 300
  });
}

function setLayerVisibility(layerIds, visible) {
  if (!map || !map.isStyleLoaded()) return;

  const visibility = visible ? 'visible' : 'none';
  layerIds.forEach(layerId => {
    if (!map.getLayer(layerId)) return;
    try {
      map.setLayoutProperty(layerId, 'visibility', visibility);
    } catch (error) {
      // Ignore layers that do not support visibility toggles.
    }
  });
}

function applyCompassVisibility() {
  posterCompass.hidden = !state.layers.compass;
  applyCompassRotation();
}

function applyLayerOption(optionId) {
  if (optionId === 'compass') {
    applyCompassVisibility();
    return;
  }

  const layerIds = LAYER_IDS_BY_OPTION[optionId] || [];
  setLayerVisibility(layerIds, state.layers[optionId]);
}

function applyLayerVisibility() {
  LAYER_OPTIONS.forEach(option => {
    applyLayerOption(option.id);
  });
}

function reloadMapStyle() {
  if (!map) return;

  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing();

  const restoreView = () => {
    map.jumpTo({ center, zoom, bearing });
    applyLayerVisibility();
  };

  map.once('style.load', restoreView);
  map.setStyle(buildMapStyle());
}

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: buildMapStyle(),
    center: state.center,
    zoom: state.zoom,
    bearing: state.bearing,
    attributionControl: false,
    preserveDrawingBuffer: true,
    dragRotate: false,
    pitchWithRotate: false
  });

  map.on('moveend', () => {
    const center = map.getCenter();
    state.center = [center.lng, center.lat];
    state.zoom = map.getZoom();
    state.bearing = map.getBearing();
    applyDebugOverlay();
    saveViewState();
  });

  map.on('rotate', applyCompassRotation);
  map.on('rotateend', () => {
    state.bearing = map.getBearing();
    saveViewState();
  });

  map.once('load', applyLayerVisibility);

  map.on('error', (event) => {
    console.error('Map error:', event.error || event);
  });

  requestAnimationFrame(() => {
    map.resize();
    applyCompassRotation();
    applyDebugOverlay();
  });
}

function renderThemeGrid() {
  themeGrid.replaceChildren();
  const entries = Object.entries(themesData.themes || {});

  entries.forEach(([id, theme]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `theme-swatch${id === state.themeId ? ' is-active' : ''}`;
    button.title = theme.description || theme.name;

    const preview = document.createElement('span');
    preview.className = 'theme-swatch-preview';
    preview.style.background = `linear-gradient(135deg, ${theme.ui.bg} 50%, ${theme.map.water} 50%)`;

    const name = document.createElement('span');
    name.className = 'theme-swatch-name';
    name.textContent = theme.name;

    button.append(preview, name);
    button.addEventListener('click', () => {
      state.themeId = id;
      applyThemeUi();
      renderThemeGrid();
      reloadMapStyle();
      saveViewState();
    });

    themeGrid.append(button);
  });
}

function renderLayerList() {
  layerList.replaceChildren();

  LAYER_OPTIONS.forEach(option => {
    const label = document.createElement('label');
    label.className = 'layer-toggle';

    const text = document.createElement('span');
    text.textContent = option.label;

    const switchWrap = document.createElement('span');
    switchWrap.className = 'layer-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.layers[option.id];
    input.addEventListener('change', () => {
      state.layers[option.id] = input.checked;
      applyLayerOption(option.id);
      saveViewState();
    });

    const track = document.createElement('span');
    track.className = 'layer-track';
    const thumb = document.createElement('span');
    thumb.className = 'layer-thumb';
    track.append(thumb);
    switchWrap.append(input, track);

    label.append(text, switchWrap);
    layerList.append(label);
  });
}

function renderLayoutSelect() {
  layoutSelect.replaceChildren();

  (layoutsData.categories || []).forEach(category => {
    const group = document.createElement('optgroup');
    group.label = category.name;

    (category.layouts || []).forEach(layout => {
      const option = document.createElement('option');
      option.value = layout.id;
      option.textContent = layout.name;
      group.append(option);
    });

    layoutSelect.append(group);
  });

  layoutSelect.value = state.layoutId;
  orientationSelect.value = state.orientation;
}

function hideSearchResults() {
  searchResults.hidden = true;
  searchResults.replaceChildren();
}

function showSearchResults(results) {
  searchResults.replaceChildren();

  if (results.length === 0) {
    hideSearchResults();
    return;
  }

  results.forEach(result => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = result.label;
    button.addEventListener('click', () => {
      flyToLocation(result);
      locationSearch.value = result.label;
      hideSearchResults();
    });
    item.append(button);
    searchResults.append(item);
  });

  searchResults.hidden = false;
}

function flyToLocation(result) {
  state.center = [result.lon, result.lat];
  state.city = result.city || state.city;
  state.country = result.country || state.country;
  applyLabels();

  const targetZoom = appConfig.tileProvider === 'mapbox' && state.layers.buildings
    ? MAPBOX_BUILDING_FOCUS_ZOOM
    : 10;

  map.flyTo({
    center: state.center,
    zoom: Math.max(map.getZoom(), targetZoom),
    duration: 1200
  });
}

async function searchLocations(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal: searchAbort.signal
  });

  if (!response.ok) {
    throw new Error('Search failed');
  }

  return response.json();
}

let searchTimer = null;
locationSearch.addEventListener('input', () => {
  const query = locationSearch.value.trim();
  clearTimeout(searchTimer);

  if (query.length < 2) {
    hideSearchResults();
    return;
  }

  searchTimer = setTimeout(async () => {
    try {
      const results = await searchLocations(query);
      showSearchResults(results);
    } catch (error) {
      if (error.name !== 'AbortError') hideSearchResults();
    }
  }, 280);
});

locationSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideSearchResults();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) hideSearchResults();
});

labelCity.addEventListener('input', () => {
  state.city = labelCity.value;
  posterCity.textContent = state.city;
  saveViewState();
});

labelCountry.addEventListener('input', () => {
  state.country = labelCountry.value;
  posterCountry.textContent = state.country;
  saveViewState();
});

labelFont.addEventListener('change', () => {
  state.fontFamily = labelFont.value;
  applyThemeUi();
  saveViewState();
});

layoutSelect.addEventListener('change', () => {
  state.layoutId = layoutSelect.value;
  updatePosterLayout();
  saveViewState();
});

orientationSelect.addEventListener('change', () => {
  state.orientation = orientationSelect.value;
  updatePosterLayout();
  saveViewState();
});

document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn({ duration: 300 }));
document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut({ duration: 300 }));
rotateLeftButton.addEventListener('click', () => rotateMapBy(-ROTATION_STEP));
rotateRightButton.addEventListener('click', () => rotateMapBy(ROTATION_STEP));

// ── Points of Interest logic ──────────────────────────────────────────────────

function poiNextId() {
  return ++poiIdCounter;
}

/**
 * Convert a [lng, lat] pair to a CSS percentage position inside the poster frame.
 * Returns null if the map is not ready or the point is outside the viewport.
 */
function poiLngLatToPercent(lng, lat) {
  if (!map) return null;
  const pt = map.project([lng, lat]);
  // Use the poster-frame dimensions so percentages are relative to the
  // containing element of .poi-overlay (which has inset: 0 on the frame).
  const fw = posterFrame.clientWidth  || 1;
  const fh = posterFrame.clientHeight || 1;
  return {
    x: (pt.x / fw) * 100,
    y: (pt.y / fh) * 100
  };
}

/** Re-render every POI callout / legend overlay on the poster. */
function renderPoiOverlays() {
  poiOverlay.innerHTML = '';

  if (poiLegendMode) {
    // In legend mode: place just a tiny icon dot at the clicked spot.
    poiList.forEach(poi => {
      const pos = poiLngLatToPercent(poi.lng, poi.lat);
      if (!pos) return;
      const pin = document.createElement('div');
      pin.className = 'poi-pin';
      pin.style.left = `${pos.x}%`;
      pin.style.top  = `${pos.y}%`;
      pin.innerHTML = `<div class="poi-pin-body"><div class="poi-pin-circle"><i class="${POI_ICONS[poi.iconIdx]}"></i></div></div>`;
      poiOverlay.append(pin);
    });

    // Build legend panel.
    poiLegendEl.hidden = false;
    poiLegendEl.innerHTML = '';
    poiLegendEl.style.fontFamily = `"${state.fontFamily}", sans-serif`;

    // Position: use saved drag position or default to bottom-right 20px in.
    // We use left/top % so it scales with the frame.
    if (poiLegendPos) {
      poiLegendEl.style.left   = `${poiLegendPos.x}%`;
      poiLegendEl.style.top    = `${poiLegendPos.y}%`;
      poiLegendEl.style.right  = 'auto';
      poiLegendEl.style.bottom = 'auto';
    } else {
      poiLegendEl.style.right  = '20px';
      poiLegendEl.style.bottom = '20px';
      poiLegendEl.style.left   = 'auto';
      poiLegendEl.style.top    = 'auto';
    }

    poiList.forEach(poi => {
      const row = document.createElement('div');
      row.className = 'poi-legend-row';
      row.innerHTML = `<span class="poi-legend-icon"><i class="${POI_ICONS[poi.iconIdx]}"></i></span><span class="poi-legend-name">${escapeHtml(poi.name)}</span>`;
      poiLegendEl.append(row);
    });
    if (!poiList.length) { poiLegendEl.hidden = true; return; }

    // Drag logic on the legend panel.
    let legDragging = false;
    let legStartPx, legStartPy, legStartX, legStartY;

    poiLegendEl.addEventListener('pointerdown', e => {
      legDragging = true;
      poiLegendEl.setPointerCapture(e.pointerId);
      const fw = posterFrame.clientWidth  || 1;
      const fh = posterFrame.clientHeight || 1;
      const rect = poiLegendEl.getBoundingClientRect();
      const frameRect = posterFrame.getBoundingClientRect();
      // Record current top-left as % of frame at drag start.
      legStartX = ((rect.left - frameRect.left) / fw) * 100;
      legStartY = ((rect.top  - frameRect.top)  / fh) * 100;
      legStartPx = e.clientX;
      legStartPy = e.clientY;
      poiLegendEl.classList.add('is-dragging');
      // Switch to left/top positioning.
      poiLegendEl.style.left   = `${legStartX}%`;
      poiLegendEl.style.top    = `${legStartY}%`;
      poiLegendEl.style.right  = 'auto';
      poiLegendEl.style.bottom = 'auto';
    }, { once: false });

    poiLegendEl.addEventListener('pointermove', e => {
      if (!legDragging) return;
      const fw = posterFrame.clientWidth  || 1;
      const fh = posterFrame.clientHeight || 1;
      const nx = legStartX + ((e.clientX - legStartPx) / fw) * 100;
      const ny = legStartY + ((e.clientY - legStartPy) / fh) * 100;
      poiLegendEl.style.left = `${nx}%`;
      poiLegendEl.style.top  = `${ny}%`;
    });

    poiLegendEl.addEventListener('pointerup', e => {
      if (!legDragging) return;
      legDragging = false;
      poiLegendEl.classList.remove('is-dragging');
      poiLegendEl.releasePointerCapture(e.pointerId);
      const fw = posterFrame.clientWidth  || 1;
      const fh = posterFrame.clientHeight || 1;
      const nx = legStartX + ((e.clientX - legStartPx) / fw) * 100;
      const ny = legStartY + ((e.clientY - legStartPy) / fh) * 100;
      poiLegendPos = { x: nx, y: ny };
      saveViewState();
    });

  } else {
    // Callout mode: draggable label box with filled triangular tail pointing to anchor.
    poiLegendEl.hidden = true;

    // One SVG layer for all tails (drawn beneath the boxes).
    const tailSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tailSvg.setAttribute('class', 'poi-line-svg');
    tailSvg.setAttribute('aria-hidden', 'true');
    poiOverlay.append(tailSvg);

    poiList.forEach(poi => {
      const anchor = poiLngLatToPercent(poi.lng, poi.lat);
      if (!anchor) return;

      if (poi.labelDx == null) poi.labelDx = 0;
      if (poi.labelDy == null) poi.labelDy = -12;

      const fw = posterFrame.clientWidth  || 1;
      const fh = posterFrame.clientHeight || 1;

      function tailPoints(labelX, labelY) {
        const ax = (anchor.x / 100) * fw;
        const ay = (anchor.y / 100) * fh;
        const lx = (labelX  / 100) * fw;
        const ly = (labelY  / 100) * fh;
        const half = Math.max(4, fw * 0.009);
        return `${lx - half},${ly} ${lx + half},${ly} ${ax},${ay}`;
      }

      const labelX = anchor.x + poi.labelDx;
      const labelY = anchor.y + poi.labelDy;

      // Filled triangle tail.
      const tail = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      tail.setAttribute('points', tailPoints(labelX, labelY));
      tail.setAttribute('class', 'poi-tail');
      tailSvg.append(tail);

      // Anchor dot.
      const dot = document.createElement('div');
      dot.className = 'poi-callout-dot';
      dot.style.left = `${anchor.x}%`;
      dot.style.top  = `${anchor.y}%`;
      poiOverlay.append(dot);

      // Draggable label box.
      const box = document.createElement('div');
      box.className = 'poi-callout-box';
      box.style.left = `${labelX}%`;
      box.style.top  = `${labelY}%`;
      box.style.fontFamily = `"${state.fontFamily}", sans-serif`;
      box.innerHTML =
        `<span class="poi-callout-icon"><i class="${POI_ICONS[poi.iconIdx]}"></i></span>` +
        `<span class="poi-callout-name">${escapeHtml(poi.name)}</span>`;

      // Drag logic.
      let dragging = false;
      let startPx, startPy, startDx, startDy;

      box.addEventListener('pointerdown', e => {
        e.stopPropagation();
        dragging = true;
        box.setPointerCapture(e.pointerId);
        startPx = e.clientX;
        startPy = e.clientY;
        startDx = poi.labelDx;
        startDy = poi.labelDy;
        box.classList.add('is-dragging');
      });

      box.addEventListener('pointermove', e => {
        if (!dragging) return;
        poi.labelDx = startDx + ((e.clientX - startPx) / fw) * 100;
        poi.labelDy = startDy + ((e.clientY - startPy) / fh) * 100;
        const nx = anchor.x + poi.labelDx;
        const ny = anchor.y + poi.labelDy;
        box.style.left = `${nx}%`;
        box.style.top  = `${ny}%`;
        tail.setAttribute('points', tailPoints(nx, ny));
      });

      box.addEventListener('pointerup', e => {
        if (!dragging) return;
        dragging = false;
        box.classList.remove('is-dragging');
        box.releasePointerCapture(e.pointerId);
        saveViewState();
      });

      poiOverlay.append(box);
    });
  }
}

/** Re-render the sidebar list of POIs. */
function renderPoiList() {
  poiListEl.innerHTML = '';
  poiList.forEach(poi => {
    const li = document.createElement('li');
    li.className = 'poi-list-item';

    const iconBtn = document.createElement('button');
    iconBtn.type = 'button';
    iconBtn.className = 'poi-icon-btn';
    iconBtn.title = 'Click to change icon';
    iconBtn.innerHTML = `<i class="${POI_ICONS[poi.iconIdx]}"></i>`;
    iconBtn.addEventListener('click', () => {
      poi.iconIdx = (poi.iconIdx + 1) % POI_ICONS.length;
      iconBtn.innerHTML = `<i class="${POI_ICONS[poi.iconIdx]}"></i>`;
      renderPoiOverlays();
      saveViewState();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'poi-item-name';
    nameSpan.textContent = poi.name;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'poi-delete-btn';
    delBtn.title = 'Remove POI';
    delBtn.setAttribute('aria-label', `Remove ${poi.name}`);
    delBtn.innerHTML = '×';
    delBtn.addEventListener('click', () => {
      poiList = poiList.filter(p => p.id !== poi.id);
      renderPoiList();
      renderPoiOverlays();
      saveViewState();
    });

    li.append(iconBtn, nameSpan, delBtn);
    poiListEl.append(li);
  });
}

/** Add a new POI at the given map coordinates. */
function addPoi(lng, lat, name) {
  poiList.push({ id: poiNextId(), name, iconIdx: 0, lng, lat, labelDx: 0, labelDy: -12 });
  renderPoiList();
  renderPoiOverlays();
  saveViewState();
}

/** Activate picker: cursor becomes crosshair and next map click places a POI. */
function activatePoiPicker() {
  if (poiPickerActive) return;
  poiPickerActive = true;
  poiAddBtn.classList.add('is-active');
  map.getCanvas().style.cursor = 'crosshair';

  function onMapClick(e) {
    const { lng, lat } = e.lngLat;
    deactivatePoiPicker();
    openPoiNameDialog(lng, lat);
  }

  map.once('click', onMapClick);

  // Allow Escape to cancel.
  function onKey(e) {
    if (e.key === 'Escape') {
      map.off('click', onMapClick);
      deactivatePoiPicker();
    }
  }
  document.addEventListener('keydown', onKey, { once: true });
}

function deactivatePoiPicker() {
  poiPickerActive = false;
  poiAddBtn.classList.remove('is-active');
  if (map) map.getCanvas().style.cursor = '';
}

/** Open the name dialog; on confirm add the POI. */
function openPoiNameDialog(lng, lat) {
  poiNameInput.value = '';
  poiDialog.showModal();

  function onConfirm(e) {
    e.preventDefault();
    const name = poiNameInput.value.trim();
    poiDialog.close();
    cleanup();
    if (name) addPoi(lng, lat, name);
  }

  function onCancel() {
    poiDialog.close();
    cleanup();
  }

  function cleanup() {
    poiDialog.querySelector('form').removeEventListener('submit', onConfirm);
    poiDialogCancel.removeEventListener('click', onCancel);
  }

  poiDialog.querySelector('form').addEventListener('submit', onConfirm);
  poiDialogCancel.addEventListener('click', onCancel);
  setTimeout(() => poiNameInput.focus(), 50);
}

// Update overlay positions whenever the map moves.
function bindPoiMapEvents() {
  map.on('move',       renderPoiOverlays);
  map.on('zoom',       renderPoiOverlays);
  map.on('rotate',     renderPoiOverlays);
  map.on('moveend',    renderPoiOverlays);
  map.on('zoomend',    renderPoiOverlays);
  map.on('rotateend',  renderPoiOverlays);
}

poiAddBtn.addEventListener('click', () => {
  if (poiPickerActive) { deactivatePoiPicker(); return; }
  activatePoiPicker();
});

poiLegendCheck.addEventListener('change', () => {
  poiLegendMode = poiLegendCheck.checked;
  renderPoiOverlays();
  saveViewState();
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────

function waitForNextFrame() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function waitForMapReadyForExport() {
  if (!map) return;

  if (!map.loaded()) {
    await new Promise(resolve => {
      map.once('load', resolve);
    });
  }

  if (map.isMoving()) {
    await new Promise(resolve => {
      map.once('moveend', resolve);
    });
  }

  map.triggerRepaint();
  await waitForNextFrame();
}

async function exportPng() {
  exportButton.disabled = true;
  exportButton.textContent = 'Exporting…';

  try {
    await waitForMapReadyForExport();

    const theme = getTheme();
    const { width, height, labelBand, mapHeight, titleSize, subtitleSize, titleY, subtitleY } = getPosterMetrics();

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = theme.ui.bg;
    ctx.fillRect(0, 0, width, height);

    const mapCanvas = map.getCanvas();
    ctx.drawImage(mapCanvas, 0, 0, width, mapHeight);

    ctx.fillStyle = theme.ui.bg;
    ctx.fillRect(0, mapHeight, width, labelBand);

    drawCompass(ctx, theme, width, mapHeight);

    if (poiList.length) {
      await loadFaForCanvas();
    }
    drawPoiPng(ctx, width, mapHeight);

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

    downloadBlob(blob, `${slugify(state.city || 'map')}-poster.png`);
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = 'Download PNG';
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

// Evaluates a MapLibre GL "interpolate linear zoom" expression at the given zoom.
// Returns the plain number if expr is already a number; returns null for unknown expressions.
function evalGlInterpolateAtZoom(expr, zoom) {
  if (typeof expr === 'number') return expr;
  if (
    Array.isArray(expr) &&
    expr[0] === 'interpolate' &&
    Array.isArray(expr[2]) && expr[2][0] === 'zoom'
  ) {
    const stops = [];
    for (let i = 3; i + 1 < expr.length; i += 2) {
      stops.push([expr[i], expr[i + 1]]);
    }
    if (!stops.length) return 0;
    if (zoom <= stops[0][0]) return stops[0][1];
    if (zoom >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [z0, v0] = stops[i];
      const [z1, v1] = stops[i + 1];
      if (zoom >= z0 && zoom <= z1) {
        return v0 + ((zoom - z0) / (z1 - z0)) * (v1 - v0);
      }
    }
    return stops[stops.length - 1][1];
  }
  return null;
}

// Renders the map as vector SVG paths by querying MapLibre's rendered features
// and projecting their GeoJSON coordinates into the SVG coordinate system.
function buildVectorMapSvg(theme, width, mapHeight) {
  const zoom = map.getZoom();
  const canvas = map.getCanvas();
  // clientWidth/Height are CSS pixels; map.project() also returns CSS pixels.
  const cw = canvas.clientWidth || canvas.width;
  const ch = canvas.clientHeight || canvas.height;
  const sx = width / cw;
  const sy = mapHeight / ch;

  function project(coord) {
    const pt = map.project({ lng: coord[0], lat: coord[1] });
    return [pt.x * sx, pt.y * sy];
  }

  function ringToD(coords, close) {
    const parts = [];
    for (let i = 0; i < coords.length; i++) {
      const [x, y] = project(coords[i]);
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (close) parts.push('Z');
    return parts.join('');
  }

  function featureToD(feature) {
    const g = feature.geometry;
    if (!g) return '';
    switch (g.type) {
      case 'Polygon':
        return g.coordinates.map(r => ringToD(r, true)).join('');
      case 'MultiPolygon':
        return g.coordinates.flatMap(p => p.map(r => ringToD(r, true))).join('');
      case 'LineString':
        return ringToD(g.coordinates, false);
      case 'MultiLineString':
        return g.coordinates.map(l => ringToD(l, false)).join('');
      default:
        return '';
    }
  }

  function queryLayer(layerId) {
    if (!map.getLayer(layerId)) return [];
    return map.queryRenderedFeatures({ layers: [layerId] });
  }

  function safeGetPaint(layerId, prop) {
    try { return map.getPaintProperty(layerId, prop); } catch (_) { return null; }
  }

  function evalPaintNumber(layerId, prop, fallback) {
    const val = safeGetPaint(layerId, prop);
    if (val == null) return fallback;
    const evaled = evalGlInterpolateAtZoom(val, zoom);
    if (evaled != null) return evaled;
    if (typeof val === 'number') return val;
    return fallback;
  }

  function renderFillLayer(layerId) {
    const opacity = evalPaintNumber(layerId, 'fill-opacity', 1);
    if (opacity <= 0) return '';
    const features = queryLayer(layerId);
    if (!features.length) return '';
    const paths = features.map(f => featureToD(f)).filter(Boolean);
    if (!paths.length) return '';
    const fill = safeGetPaint(layerId, 'fill-color') || '#ffffff';
    const opAttr = Math.abs(opacity - 1) > 0.001 ? ` fill-opacity="${opacity.toFixed(3)}"` : '';
    return `  <path d="${paths.join('')}" fill="${escapeXml(String(fill))}"${opAttr}/>`;
  }

  function renderLineLayer(layerId) {
    const opacity = evalPaintNumber(layerId, 'line-opacity', 1);
    if (opacity <= 0) return '';
    const features = queryLayer(layerId);
    if (!features.length) return '';
    const paths = features.map(f => featureToD(f)).filter(Boolean);
    if (!paths.length) return '';
    const stroke = safeGetPaint(layerId, 'line-color') || '#000000';
    const widthPx = evalPaintNumber(layerId, 'line-width', 1);
    const strokeWidth = (widthPx * sx).toFixed(2);
    const opAttr = Math.abs(opacity - 1) > 0.001 ? ` stroke-opacity="${opacity.toFixed(3)}"` : '';
    // MapLibre line-dasharray values are multiples of line-width, so scale accordingly.
    const dashRaw = safeGetPaint(layerId, 'line-dasharray');
    const dashAttr = Array.isArray(dashRaw) && dashRaw.length >= 2
      ? ` stroke-dasharray="${dashRaw.map(v => (v * widthPx * sx).toFixed(2)).join(',')}"`
      : '';
    let lineCap = 'butt';
    let lineJoin = 'miter';
    try {
      const capRaw = map.getLayoutProperty(layerId, 'line-cap');
      const joinRaw = map.getLayoutProperty(layerId, 'line-join');
      if (typeof capRaw === 'string') lineCap = capRaw;
      if (typeof joinRaw === 'string') lineJoin = joinRaw;
    } catch (_) {}
    return `  <path d="${paths.join('')}" fill="none" stroke="${escapeXml(String(stroke))}" stroke-width="${strokeWidth}" stroke-linecap="${lineCap}" stroke-linejoin="${lineJoin}"${opAttr}${dashAttr}/>`;
  }

  const ALL_LAYER_IDS = [
    'landcover', 'park', 'water', 'waterway', 'aeroway',
    'rail',
    'road-minor-overview-low', 'road-minor-overview-mid', 'road-minor-overview-high',
    'road-path-overview',
    'road-path-casing', 'road-minor-mid-casing', 'road-minor-high-casing', 'road-major-casing',
    'road-minor-low', 'road-minor-mid', 'road-minor-high', 'road-path', 'road-major',
    'building'
  ];
  const FILL_LAYER_IDS = new Set(['landcover', 'park', 'water', 'aeroway', 'building']);

  const parts = [
    `<defs><clipPath id="map-clip"><rect x="0" y="0" width="${width}" height="${mapHeight}"/></clipPath></defs>`,
    `<g clip-path="url(#map-clip)">`,
    `  <rect x="0" y="0" width="${width}" height="${mapHeight}" fill="${escapeXml(theme.map.land)}"/>`,
    ...ALL_LAYER_IDS.map(id => FILL_LAYER_IDS.has(id) ? renderFillLayer(id) : renderLineLayer(id)),
    `</g>`
  ].filter(Boolean);

  return parts.join('\n');
}

/** Convert lng/lat → export-pixel {x, y} within the map area. */
function poiLngLatToExportPx(lng, lat, exportWidth, exportMapHeight) {
  if (!map) return null;
  const pt = map.project([lng, lat]);
  const canvas = map.getCanvas();
  const cw = canvas.clientWidth  || canvas.width;
  const ch = canvas.clientHeight || canvas.height;
  return {
    x: (pt.x / cw) * exportWidth,
    y: (pt.y / ch) * exportMapHeight
  };
}

/** Draw a POI icon using its SVG path onto a Canvas 2D context, centered at (cx, cy) within a square of `size` px. */
function drawPathIcon(ctx, iconIdx, cx, cy, size, color) {
  const icon = POI_ICONS_SVG[iconIdx];
  if (!icon) return;
  const scale = size / Math.max(icon.vbW, icon.vbH);
  const ox = cx - (icon.vbW * scale) / 2;
  const oy = cy - (icon.vbH * scale) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(icon.d));
  ctx.restore();
}

/** Return an SVG <path> element for a POI icon, centered at (cx, cy) within a square of `size` px. */
function svgPathIcon(iconIdx, cx, cy, size, color) {
  const icon = POI_ICONS_SVG[iconIdx];
  if (!icon) return '';
  const scale = size / Math.max(icon.vbW, icon.vbH);
  const ox = (cx - (icon.vbW * scale) / 2).toFixed(2);
  const oy = (cy - (icon.vbH * scale) / 2).toFixed(2);
  return `<path d="${icon.d}" transform="translate(${ox},${oy}) scale(${scale.toFixed(6)})" fill="${escapeXml(color)}"/>`;
}

/** Draw POI overlays onto a Canvas 2D context for PNG export. */
function drawPoiPng(ctx, exportWidth, mapHeight) {
  if (!poiList.length) return;

  const theme     = getTheme();
  const textColor = theme.ui.text;
  const bgColor   = theme.ui.bg;
  const { height } = getPosterMetrics(); // full poster height (map + label band)

  const fontSize = Math.max(18, Math.round(exportWidth * 0.024));
  const padH     = Math.round(exportWidth * 0.018);
  const padV     = Math.round(exportWidth * 0.016);
  const dotR     = Math.round(exportWidth * 0.005);

  if (poiLegendMode) {
    // ── Legend mode: teardrop pins ────────────────────────────────────────────
    const pinR   = Math.round(exportWidth * 0.040);
    const innerR = Math.round(pinR * 0.58);
    const triH   = Math.round(pinR * 0.75);
    const triW   = Math.round(pinR * 0.7);
    const iconF  = Math.round(innerR * 1.0);

    poiList.forEach(poi => {
      const pos = poiLngLatToExportPx(poi.lng, poi.lat, exportWidth, mapHeight);
      if (!pos || pos.x < 0 || pos.x > exportWidth || pos.y < 0 || pos.y > mapHeight) return;

      const tipX  = pos.x;
      const tipY  = pos.y;
      const bodyY = tipY - triH - pinR;

      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur    = Math.round(exportWidth * 0.008);
      ctx.shadowOffsetY = Math.round(exportWidth * 0.003);

      // Triangle (drawn first, behind circle)
      ctx.beginPath();
      ctx.moveTo(tipX - triW, bodyY);
      ctx.lineTo(tipX + triW, bodyY);
      ctx.lineTo(tipX, tipY);
      ctx.closePath();
      ctx.fillStyle = textColor;
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Outer coloured circle
      ctx.beginPath();
      ctx.arc(tipX, bodyY, pinR, 0, Math.PI * 2);
      ctx.fillStyle = textColor;
      ctx.fill();

      // Inner white circle
      ctx.beginPath();
      ctx.arc(tipX, bodyY, innerR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Icon centred in inner circle
      drawPathIcon(ctx, poi.iconIdx, tipX, bodyY, iconF, textColor);

      ctx.restore();
    });

    // ── Legend panel ─────────────────────────────────────────────────────────
    const lf       = Math.max(17, Math.round(exportWidth * 0.022));
    const rowH     = lf * 1.4;
    const lPadH    = Math.round(exportWidth * 0.018);
    const lPadV    = Math.round(exportWidth * 0.016);
    const iconColW = lf * 1.4;

    ctx.save();
    ctx.font = `700 ${lf}px "${state.fontFamily}", sans-serif`;
    const maxTextW = Math.max(...poiList.map(p => ctx.measureText(p.name).width));
    const boxW = iconColW + maxTextW + lPadH * 2 + 6;
    const boxH = rowH * poiList.length + lPadV * 2;

    let bx, by;
    if (poiLegendPos) {
      bx = (poiLegendPos.x / 100) * exportWidth;
      by = (poiLegendPos.y / 100) * height;
    } else {
      bx = exportWidth - boxW - Math.round(exportWidth * 0.02);
      by = mapHeight   - boxH - Math.round(exportWidth * 0.02);
    }

    ctx.fillStyle = textColor;
    ctx.fillRect(bx, by, boxW, boxH);

    poiList.forEach((poi, i) => {
      const ty = by + lPadV + rowH * i + rowH / 2;
      drawPathIcon(ctx, poi.iconIdx, bx + lPadH + lf * 0.5, ty, lf * 0.75, bgColor);
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.fillStyle    = bgColor;
      ctx.font = `700 ${lf}px "${state.fontFamily}", sans-serif`;
      ctx.fillText(poi.name, bx + lPadH + iconColW, ty);
    });
    ctx.restore();

  } else {
    // ── Callout mode: theme-coloured box + triangle tail + anchor dot ─────────
    const half = Math.max(4, Math.round(exportWidth * 0.007));

    poiList.forEach(poi => {
      const anchor = poiLngLatToExportPx(poi.lng, poi.lat, exportWidth, mapHeight);
      if (!anchor) return;

      // Convert % offsets (relative to full poster frame) to export px
      const dx = ((poi.labelDx || 0)  / 100) * exportWidth;
      const dy = ((poi.labelDy || -12) / 100) * height;
      const lx = anchor.x + dx;
      const ly = anchor.y + dy;

      ctx.save();
      ctx.font = `700 ${fontSize}px "${state.fontFamily}", sans-serif`;
      const textW  = ctx.measureText(poi.name).width;
      const iconW  = fontSize * 1.1;
      const totalW = iconW + 6 + textW + padH * 2;
      const boxH   = fontSize + padV * 2;
      const bx     = lx - totalW / 2;
      const by     = ly - boxH;

      // Triangle tail (drawn first so box paints over the base)
      ctx.beginPath();
      ctx.moveTo(bx + totalW / 2 - half, by + boxH);
      ctx.lineTo(bx + totalW / 2 + half, by + boxH);
      ctx.lineTo(anchor.x, anchor.y);
      ctx.closePath();
      ctx.fillStyle = textColor;
      ctx.fill();

      // Box
      ctx.fillStyle = textColor;
      ctx.fillRect(bx, by, totalW, boxH);

      // Icon
      drawPathIcon(ctx, poi.iconIdx, bx + padH + iconW / 2, by + boxH / 2, fontSize * 0.75, bgColor);

      // Label text
      ctx.font      = `700 ${fontSize}px "${state.fontFamily}", sans-serif`;
      ctx.fillStyle = bgColor;
      ctx.fillText(poi.name, bx + padH + iconW + 6, by + boxH / 2);

      // Anchor dot
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = textColor;
      ctx.fill();

      ctx.restore();
    });
  }
}

/** Return an SVG string with POI overlays for SVG export. */
function buildPoiSvg(exportWidth, mapHeight) {
  if (!poiList.length) return '';

  const theme     = getTheme();
  const textColor = theme.ui.text;
  const bgColor   = theme.ui.bg;
  const { height } = getPosterMetrics();

  const fontSize = Math.max(18, Math.round(exportWidth * 0.024));
  const padH     = Math.round(exportWidth * 0.012);
  const padV     = Math.round(exportWidth * 0.012);
  const dotR     = Math.round(exportWidth * 0.005);

  const lines = [];
  lines.push('<g id="poi-layer">');

  if (poiLegendMode) {
    // ── Legend mode: teardrop pins ────────────────────────────────────────────
    const pinR   = Math.round(exportWidth * 0.040);
    const innerR = Math.round(pinR * 0.58);
    const triH   = Math.round(pinR * 0.75);
    const triW   = Math.round(pinR * 0.7);
    const iconF  = Math.round(innerR * 1.0);

    poiList.forEach(poi => {
      const pos = poiLngLatToExportPx(poi.lng, poi.lat, exportWidth, mapHeight);
      if (!pos) return;
      const tipX  = pos.x;
      const tipY  = pos.y;
      const bodyY = tipY - triH - pinR;
      lines.push(`<g filter="drop-shadow(0 3px 7px rgba(0,0,0,.45))">`);
      lines.push(`  <polygon points="${(tipX-triW).toFixed(1)},${bodyY.toFixed(1)} ${(tipX+triW).toFixed(1)},${bodyY.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)}" fill="${escapeXml(textColor)}"/>`);
      lines.push(`  <circle cx="${tipX.toFixed(1)}" cy="${bodyY.toFixed(1)}" r="${pinR}" fill="${escapeXml(textColor)}"/>`);
      lines.push(`  <circle cx="${tipX.toFixed(1)}" cy="${bodyY.toFixed(1)}" r="${innerR}" fill="#fff"/>`);
      lines.push(svgPathIcon(poi.iconIdx, tipX, bodyY, iconF * 0.9, textColor));
      lines.push(`</g>`);
    });

    // ── Legend panel ─────────────────────────────────────────────────────────
    const lf       = Math.max(17, Math.round(exportWidth * 0.022));
    const rowH     = lf * 1.4;
    const lPadH    = Math.round(exportWidth * 0.014);
    const lPadV    = Math.round(exportWidth * 0.012);
    const iconColW = lf * 1.4;
    const maxNameLen = Math.max(...poiList.map(p => p.name.length));
    const approxCharW = lf * 0.6;
    const boxW = iconColW + maxNameLen * approxCharW + lPadH * 2 + 6;
    const boxH = rowH * poiList.length + lPadV * 2;

    let bx, by;
    if (poiLegendPos) {
      bx = (poiLegendPos.x / 100) * exportWidth;
      by = (poiLegendPos.y / 100) * height;
    } else {
      bx = exportWidth - boxW - Math.round(exportWidth * 0.02);
      by = mapHeight   - boxH - Math.round(exportWidth * 0.02);
    }

    lines.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${escapeXml(textColor)}"/>`);
    poiList.forEach((poi, i) => {
      const rowCy = by + lPadV + rowH * i + rowH / 2;
      const ty = (rowCy + lf * 0.36).toFixed(1);
      lines.push(svgPathIcon(poi.iconIdx, bx + lPadH + lf * 0.5, rowCy, lf * 0.75, bgColor));
      lines.push(`<text x="${(bx + lPadH + iconColW).toFixed(1)}" y="${ty}" font-size="${lf}" font-weight="700" font-family="${escapeXml(state.fontFamily)}, sans-serif" fill="${escapeXml(bgColor)}">${escapeXml(poi.name)}</text>`);
    });

  } else {
    // ── Callout mode: themed box + triangle tail + anchor dot ────────────────
    const half = Math.max(4, Math.round(exportWidth * 0.007));

    // Use a temporary canvas context to measure actual text width
    const _measCtx = document.createElement('canvas').getContext('2d');
    _measCtx.font = `700 ${fontSize}px "${state.fontFamily}", sans-serif`;

    poiList.forEach(poi => {
      const anchor = poiLngLatToExportPx(poi.lng, poi.lat, exportWidth, mapHeight);
      if (!anchor) return;

      const dx = ((poi.labelDx || 0)  / 100) * exportWidth;
      const dy = ((poi.labelDy || -12) / 100) * height;
      const lx = anchor.x + dx;
      const ly = anchor.y + dy;

      const textW  = _measCtx.measureText(poi.name).width + 10;
      const iconW  = fontSize * 1.1;
      const totalW = iconW + 6 + textW + padH * 2;
      const boxH   = fontSize + padV * 2;
      const bx     = lx - totalW / 2;
      const by     = ly - boxH;
      const midX   = lx;
      const textBaseY = (by + boxH / 2 + fontSize * 0.36).toFixed(1);

      lines.push(`<g>`);
      lines.push(`  <polygon points="${(midX-half).toFixed(1)},${(by+boxH).toFixed(1)} ${(midX+half).toFixed(1)},${(by+boxH).toFixed(1)} ${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}" fill="${escapeXml(textColor)}"/>`);
      lines.push(`  <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${totalW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${escapeXml(textColor)}"/>`);
      lines.push(svgPathIcon(poi.iconIdx, bx + padH + iconW / 2, by + boxH / 2, fontSize * 0.75, bgColor));
      lines.push(`  <text x="${(bx+padH+iconW+6).toFixed(1)}" y="${textBaseY}" font-size="${fontSize}" font-weight="700" font-family="${escapeXml(state.fontFamily)}, sans-serif" fill="${escapeXml(bgColor)}">${escapeXml(poi.name)}</text>`);
      lines.push(`  <circle cx="${anchor.x.toFixed(1)}" cy="${anchor.y.toFixed(1)}" r="${dotR}" fill="${escapeXml(textColor)}"/>`);
      lines.push(`</g>`);
    });
  }

  lines.push('</g>');
  return lines.join('\n');
}

let _canvasFaFontFamily = null;

/**
 * Loads FA 6 Solid woff2 via the FontFace API so canvas can use it.
 * Checks document.fonts first (in case the FA kit already loaded it),
 * then fetches from jsDelivr and registers explicitly. Caches the result.
 */
async function loadFaForCanvas() {
  if (_canvasFaFontFamily !== null) return _canvasFaFontFamily;

  // Check if the FA kit already registered a loaded font
  for (const f of document.fonts) {
    if (f.status === 'loaded' && /font awesome/i.test(f.family.replace(/['"/]/g, ''))) {
      _canvasFaFontFamily = f.family.replace(/['"/]/g, '');
      return _canvasFaFontFamily;
    }
  }

  // Fetch and register explicitly via FontFace API
  try {
    const resp = await fetch(FA_SOLID_WOFF2_URL);
    if (!resp.ok) throw new Error(`FA font HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    const font = new FontFace('Font Awesome 6 Free', arrayBuffer, { weight: '900', style: 'normal' });
    await font.load();
    document.fonts.add(font);
    _canvasFaFontFamily = 'Font Awesome 6 Free';
  } catch (e) {
    console.warn('Could not load FA font for canvas export:', e);
    _canvasFaFontFamily = '';
  }
  return _canvasFaFontFamily;
}

/** Returns a canvas font string if FA was loaded via loadFaForCanvas(), else null. */
function getFaCanvasFont(size) {
  if (_canvasFaFontFamily) {
    return `900 ${size}px "${_canvasFaFontFamily}"`;
  }
  return null;
}

let _svgFaFontFaceCache = null;

/** Fetches the FA 6 solid woff2 and returns an @font-face CSS string for SVG embedding. */
async function fetchFaSvgFontFace() {
  if (_svgFaFontFaceCache !== null) return _svgFaFontFaceCache;
  try {
    const resp = await fetch(FA_SOLID_WOFF2_URL);
    if (!resp.ok) throw new Error(`FA font HTTP ${resp.status}`);
    const dataUrl = await blobToDataUrl(await resp.blob());
    _svgFaFontFaceCache = [
      "@font-face {",
      "  font-family: 'Font Awesome 6 Free';",
      "  font-style: normal;",
      "  font-weight: 900;",
      `  src: url('${dataUrl}') format('woff2');`,
      "}"
    ].join('\n');
  } catch (e) {
    console.warn('Could not embed FA font in SVG, falling back to emoji:', e);
    _svgFaFontFaceCache = '';
  }
  return _svgFaFontFaceCache;
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

async function buildSvgFontStyle(fontFamily, extraFaces = []) {
  const config = getSvgFontConfig(fontFamily);
  const requestedWeights = [...new Set([
    700,
    pickClosestFontWeight(config.weights, 500)
  ])];
  const fontFaces = await Promise.all(
    requestedWeights.map(weight => fetchEmbeddedFontFace(config.family, weight))
  );

  return [
    '  <defs>',
    '    <style type="text/css"><![CDATA[',
    [...fontFaces, ...extraFaces].join('\n'),
    '    ]]></style>',
    '  </defs>'
  ].join('\n');
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

async function exportSvg() {
  exportSvgButton.disabled = true;
  exportSvgButton.textContent = 'Exporting…';

  try {
    await waitForMapReadyForExport();

    const theme = getTheme();
    const { width, height, labelBand, mapHeight, titleSize, subtitleSize, titleY, subtitleY } = getPosterMetrics();
    const svgSize = getSvgDocumentSize();
    const fontConfig = getSvgFontConfig(state.fontFamily);
    const subtitleFontWeight = pickClosestFontWeight(fontConfig.weights, 500);
    let embeddedFontStyle = '';

    try {
      const extraFaces = [];
      if (poiList.length) {
        try { const fa = await fetchFaSvgFontFace(); if (fa) extraFaces.push(fa); } catch (e) {}
      }
      embeddedFontStyle = await buildSvgFontStyle(fontConfig.family, extraFaces);
    } catch (error) {
      console.warn('Failed to embed SVG font, falling back to installed fonts.', error);
    }

    const mapVectorSvg = buildVectorMapSvg(theme, width, mapHeight);

    const svg = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgSize.width}" height="${svgSize.height}" viewBox="0 0 ${width} ${height}">`,
      embeddedFontStyle,
      `  <rect width="${width}" height="${height}" fill="${escapeXml(theme.ui.bg)}" />`,
      mapVectorSvg,
      buildCompassSvg(theme, width, mapHeight),
      buildPoiSvg(width, mapHeight),
      `  <rect x="0" y="${mapHeight}" width="${width}" height="${labelBand}" fill="${escapeXml(theme.ui.bg)}" />`,
      `  <text x="${Math.round(width / 2)}" y="${titleY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(theme.ui.text)}" font-family="${escapeXml(fontConfig.family)}, sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(state.city)}</text>`,
      `  <text x="${Math.round(width / 2)}" y="${subtitleY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(theme.ui.text)}" fill-opacity="0.85" font-family="${escapeXml(fontConfig.family)}, sans-serif" font-size="${subtitleSize}" font-weight="${subtitleFontWeight}" letter-spacing="0.04em">${escapeXml(state.country)}</text>`,
      '</svg>'
    ].filter(Boolean).join('\n');

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${slugify(state.city || 'map')}-poster.svg`);
  } finally {
    exportSvgButton.disabled = false;
    exportSvgButton.textContent = 'Download SVG';
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'map';
}

exportButton.addEventListener('click', exportPng);
exportSvgButton.addEventListener('click', exportSvg);

function initAccordion() {
  const accordion = document.getElementById('sidebar-accordion');
  if (!accordion) return;

  const items = [...accordion.querySelectorAll('.accordion-item')];

  function setItemOpen(item, isOpen) {
    const trigger = item.querySelector('.accordion-trigger');
    const panel = item.querySelector('.accordion-panel');

    item.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
    panel.hidden = !isOpen;
  }

  function toggleItem(item) {
    setItemOpen(item, !item.classList.contains('is-open'));

    if (map) {
      requestAnimationFrame(() => map.resize());
    }
  }

  items.forEach(item => {
    setItemOpen(item, false);
    item.querySelector('.accordion-trigger').addEventListener('click', () => {
      toggleItem(item);
    });
  });
}

async function boot() {
  loadViewState();

  const [configResponse, themesResponse, layoutsResponse] = await Promise.all([
    fetch('/api/config'),
    fetch('themes.json'),
    fetch('layouts.json')
  ]);

  appConfig = await configResponse.json();
  themesData = await themesResponse.json();
  layoutsData = await layoutsResponse.json();

  if (!themesData.themes[state.themeId]) {
    state.themeId = Object.keys(themesData.themes)[0];
  }

  const hasLayout = (layoutsData.categories || []).some(category => (
    (category.layouts || []).some(layout => layout.id === state.layoutId)
  ));

  if (!hasLayout) {
    state.layoutId = layoutsData.defaultLayoutId || 'poster_18x24_portrait';
  }

  labelFont.value = state.fontFamily;
  applyThemeUi();
  updatePosterLayout();
  applyLabels();
  applyDebugOverlay();
  applyCompassVisibility();
  renderThemeGrid();
  renderLayerList();
  renderLayoutSelect();
  initAccordion();
  initMap();
  bindPoiMapEvents();
  renderPoiList();
  // Render overlays once the map tiles are loaded so projections are accurate.
  map.once('load', renderPoiOverlays);
  saveViewState();
}

window.addEventListener('resize', () => {
  if (map) map.resize();
});

boot().catch(error => {
  console.error(error);
  alert('Failed to start the app. Check the console for details.');
});
