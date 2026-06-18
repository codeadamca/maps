// Owner Initialization Module
// Global variable to store the owner ID
let ownerId = null;

/**
 * Initialize owner ID on app startup.
 * - Checks localStorage for existing owner_id
 * - If not found, creates new owner via API
 * - Stores result in localStorage and exposes as window.ownerId
 * - Only runs once per browser session
 * 
 * @returns {Promise<string>} The owner ID
 */
async function initOwner() {
  // Return immediately if already initialized
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

