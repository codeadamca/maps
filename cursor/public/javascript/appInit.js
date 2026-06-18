// App Initialization Utilities
// Consolidated bootstrap logic for owner and design initialization

// ────────────────────────────────────────────────────────────────────────────
// Owner Initialization
// ────────────────────────────────────────────────────────────────────────────

// Data containers (loaded from /data/*.json)
let themesData = { themes: {} };
let layoutsData = { categories: [] };
let coloursData = { colours: [] };
let fontsData = { fonts: {} };
let iconsData = { icons: {} };

/**
 * Initialize app: owner → design → ready
 */
async function initApp() {

  try {

    const [colRes, fontsRes, themesRes, layoutsRes, iconsRes] = await Promise.all([
      fetch('/data/colours.json'),
      fetch('/data/fonts.json'),
      fetch('/data/themes.json'),
      fetch('/data/layouts.json'),
      fetch('/data/icons.json')
    ]);
    
    if (colRes.ok) coloursData = await colRes.json();
    if (fontsRes.ok) fontsData = await fontsRes.json();
    if (themesRes.ok) themesData = await themesRes.json();
    if (layoutsRes.ok) layoutsData = await layoutsRes.json();
    if (iconsRes.ok) iconsData = await iconsRes.json();

  } catch (error) {
    console.error('Failed to load data JSONs:', error);
  }

}

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatCoordinates(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '';
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Icon SVGs
// ────────────────────────────────────────────────────────────────────────────

