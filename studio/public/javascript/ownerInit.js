// Owner Initialization Module
// Global variable to store the owner ID
let ownerId = null;

/**
 * Check if the current URL path contains an owner ID and extract it.
 * If a valid owner ID is found in the URL, it will be saved to localStorage
 * and the browser will redirect to "/" to remove it from the URL.
 * 
 * Owner ID format: OW-[identifier characters]
 * Examples: OW-60450A9A, OW-abc123
 * 
 * Non-owner-id routes (excluded from check):
 * - /map, /lake (known app routes)
 * - Routes containing "/" (multi-segment paths)
 * - Routes starting with "." (files/assets)
 */
function handleOwnerIdFromUrl() {
  const pathname = window.location.pathname;
  
  // Extract the first path segment (after the leading /)
  const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
  
  if (pathSegments.length === 0) {
    // Root path, no action needed
    return;
  }
  
  const firstSegment = pathSegments[0];
  
  // Exclude known routes and invalid patterns
  const excludedRoutes = ['map', 'lake', 'design'];
  if (excludedRoutes.includes(firstSegment.toLowerCase())) {
    return;
  }
  
  // Check if it starts with a dot (asset/file)
  if (firstSegment.startsWith('.')) {
    return;
  }
  
  // Validate owner ID format: must start with "OW-" followed by identifier characters
  const ownerIdPattern = /^OW-[A-Za-z0-9]+$/;
  if (!ownerIdPattern.test(firstSegment)) {
    return;
  }
  
  // Valid owner ID found in URL
  console.log('[Owner Init] Found owner ID in URL path:', firstSegment);
  
  // Save to localStorage
  localStorage.setItem('owner_id', firstSegment);
  ownerId = firstSegment;
  
  // Redirect to root to remove owner ID from URL
  console.log('[Owner Init] Redirecting to / to remove owner ID from URL');
  window.history.replaceState(null, '', '/');
}

/**
 * Initialize owner ID on app startup.
 * - First checks URL path for owner ID (e.g., /OW-60450A9A)
 * - Then checks localStorage for existing owner_id
 * - If not found, creates new owner via API
 * - Stores result in localStorage and exposes as window.ownerId
 * - Only runs once per browser session
 * 
 * @returns {Promise<string>} The owner ID
 */
async function initOwner() {
  // First, check if there's an owner ID in the URL path
  handleOwnerIdFromUrl();
  
  // Return immediately if already initialized (from URL or other means)
  if (ownerId !== null) {
    console.log(`[Owner Init] Owner ID already initialized: ${ownerId}`);
    checkOwner(ownerId);
    return ownerId;
  }

  // Check localStorage for existing owner_id
  const storedOwnerId = localStorage.getItem('owner_id');
  if (storedOwnerId) {
    ownerId = storedOwnerId;
    console.log('[Owner Init] Using existing owner_id:', ownerId);
    checkOwner(ownerId);
    return ownerId;
  }

  // Create new owner via API
  try {

    console.log('[Owner Init] Creating new owner...');

    const response = await fetch('https://api.lakelines.co/owner/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Owner creation failed with status ${response.status}`);
    }

    const data = await response.json();
    const newOwnerId = data.owner.owner_id;

    if (!newOwnerId) {
      throw new Error('API response missing ownerId field');
    }

    // Store in localStorage and set global
    localStorage.setItem('owner_id', newOwnerId);
    ownerId = newOwnerId;

    console.log('[Owner Init] New owner created:', ownerId);
    return ownerId;

  } catch (error) {
    console.error('[Owner Init] Failed to initialize owner:', error);
    throw error;
  }
  
}

async function checkOwner(id) {

  const response = await fetch(`https://api.lakelines.co/owner/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    
    // Clear local sstorage and redirect to home page
    localStorage.removeItem('owner_id');
    window.location.href = '/';
  }

}

