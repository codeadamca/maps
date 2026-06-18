// Design Initialization Module
// Global variable to store the design ID
let designId = null;

/**
 * init design on app startup
 * - If URL has no design_id, create one and redirect
 * - If URL has design_id, continue loading app
 * - Prevents duplicate API calls with sessionStorage flag
 * 
 * @returns {Promise<string>} The design ID
 */
async function initDesign() {
  // Return immediately if already initialized
  if (designId) {
    console.log(`[Design Init] Design ID already initialized: ${designId}`);
    return;
  }

  // Check if URL has a design ID, URL will be /lake/:id or /map/:id
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const route = pathParts[0];
  const urlDesignId = pathParts[1];
  if (urlDesignId) {
    designId = urlDesignId;
    console.log(`[Design Init] Design ID found in URL: ${designId}`);
    return;
  }
  
  // Create new design via API
  try {

    console.log('[Design Init] Creating new design...');
    
    const ownerId = localStorage.getItem('owner_id');

    if (!ownerId) {
        throw new Error('owner_id not found in localStorage');
    }

    const response = await fetch('https://api.lakelines.co/design/create', {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            owner_id: ownerId
        })
    });

    if (!response.ok) {
        throw new Error(`Design creation failed with status ${response.status}`);
    }

    const data = await response.json();
    const newDesignId = data.design.design_id;

    designId = newDesignId;

    console.log('[Design Init] New design created:', designId);
    
    // Redirect to new URL with design ID
    const newPath = `/${route}/${designId}`;
    console.log(`[Design Init] Redirecting to ${newPath}`);
    window.history.replaceState(null, '', newPath);

  } catch (error) {
    console.error('[Design Init] Failed to initialize design:', error);
    throw error;
  }
}
