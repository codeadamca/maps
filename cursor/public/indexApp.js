// Index application
// Completely independent from map or lake application

// Global variables

// DOM Elements
const noDesigns = document.getElementById('no-designs');
const hasDesigns = document.getElementById('has-designs');
const designList = document.getElementById('design-list');

// ────────────────────────────────────────────────────────────────────────────
// State Management
// ────────────────────────────────────────────────────────────────────────────
async function loadDesigns() {

  try {

    // Load https://api.lakelines.co/designs/owner/:id and populate state with response
    const response = await fetch(`https://api.lakelines.co/designs/owner/${ownerId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Designs load failed with status ${response.status}`);
    }

    const data = await response.json();
    const newDesigns = data.designs;

    if (!newDesigns) {
      throw new Error('API response missing designs field');
    }

    console.log('[Load Designs] Designs loaded:', newDesigns);

    // If there are designs, remove large home page buttons and replace wiht design thums and links
    if(newDesigns.length > 0) {

      noDesigns.hidden = true;
      hasDesigns.hidden = false;

      // Build a card grid using the same `.card` styles as index.html
      const designsContainer = document.createElement('div');
      designsContainer.classList.add('designs-container');
      designsContainer.style.display = 'grid';
      designsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(240px, 1fr))';
      designsContainer.style.gap = '18px';

      newDesigns.forEach(design => {
        console.log(design);
        const link = document.createElement('a');
        link.href = `/${design.design_type}/${design.design_id}`;
        link.classList.add('card');
        link.style.textDecoration = 'none';

        const head = document.createElement('div');
        head.className = 'card-head';

        const thumbUrl = `https://api.lakelines.co/design/svg/${design.design_id}`;
        // Put thumbnail SVG behind the card content so it sits behind the button and icon
        link.style.position = 'relative';
        link.style.overflow = 'hidden';
        link.style.color = 'inherit';
        const bgImg = document.createElement('img');
        bgImg.src = thumbUrl;
        bgImg.alt = '';
        bgImg.setAttribute('aria-hidden', 'true');
        bgImg.style.position = 'absolute';
        bgImg.style.left = '0';
        bgImg.style.top = '0';
        bgImg.style.width = '100%';
        bgImg.style.height = '100%';
        bgImg.style.objectFit = 'cover';
        bgImg.style.objectPosition = 'center';
        bgImg.style.zIndex = '0';
        bgImg.style.pointerEvents = 'none';
        link.appendChild(bgImg);

        const title = document.createElement('h2');
        title.textContent = design.name;

        head.appendChild(title);
        // make sure content sits above the background image
        head.style.position = 'relative';
        head.style.zIndex = '1';

        const icon = document.createElement('span');
        icon.className = 'card-icon';
        icon.setAttribute('aria-hidden', 'true');

        if(design.design_type === 'map') {
          icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20V6.5Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M8.5 4v13.5M15.5 6.5V20" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </span>`;

        } else if(design.design_type === 'lake') {
            icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 6.5h8a3 3 0 0 1 3 3V14a4.5 4.5 0 0 1-4.5 4.5H10A5 5 0 0 1 5 13.5V8.5a2 2 0 0 1 2-2Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M15 9h3.5a1.5 1.5 0 0 1 0 3H18" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M8 4.5h5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
              </svg>`;
        }

        const cta = document.createElement('span');
        cta.className = 'card-cta';
        cta.innerHTML = `Open <span class="card-cta-arrow" aria-hidden="true">→</span>`;

        const rightGroup = document.createElement('div');
        rightGroup.className = 'card-right';
        rightGroup.appendChild(icon);
        rightGroup.appendChild(cta);

        link.appendChild(head);
        link.appendChild(rightGroup);

        designsContainer.appendChild(link);
      });

      designList.appendChild(designsContainer);

    } else {
      noDesigns.hidden = false;
      hasDesigns.hidden = true;
    }

  } catch (error) {
    throw new Error(`Failed to load designs: ${error.message}`);
  }

}

// ────────────────────────────────────────────────────────────────────────────
// Index Initialization
// ────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  
  await initApp();
  await initOwner();

  await loadDesigns();  

});
