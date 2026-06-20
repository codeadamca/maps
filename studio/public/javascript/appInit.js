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

    const [colRes, fontsRes, themesRes, layoutsRes, layersRes, iconsRes] = await Promise.all([
      fetch('https://api.lakelines.co/colours'),
      fetch('https://api.lakelines.co/fonts'),
      fetch('https://api.lakelines.co/themes'),
      fetch('https://api.lakelines.co/layouts'),
      fetch('https://api.lakelines.co/layers'),
      fetch('https://api.lakelines.co/icons')
    ]);
    
    if (colRes.ok) coloursData = await colRes.json();
    if (fontsRes.ok) fontsData = await fontsRes.json();
    if (themesRes.ok) themesData = await themesRes.json();
    if (layoutsRes.ok) layoutsData = await layoutsRes.json();
    if (layersRes.ok) layersData = await layersRes.json();
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
// Reusable Confirmation Overlay Component
// ────────────────────────────────────────────────────────────────────────────

class ConfirmationOverlay {
  constructor() {
    this.backdrop = null;
    this.modal = null;
    this.titleEl = null;
    this.messageEl = null;
    this.confirmBtn = null;
    this.cancelBtn = null;
    this.isVisible = false;
    this.currentResolve = null;
    this.focusedElementBeforeOpen = null;
    this.focusableElements = [];
    
    this.init();
  }

  /**
   * Initialize the overlay DOM structure (runs once at startup)
   */
  init() {
    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'confirmation-backdrop';
    this.backdrop.setAttribute('role', 'presentation');

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'confirmation-modal';
    this.modal.setAttribute('role', 'alertdialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-labelledby', 'confirmation-title');
    this.modal.setAttribute('aria-describedby', 'confirmation-message');

    // Create header
    const header = document.createElement('div');
    header.className = 'confirmation-header';

    this.titleEl = document.createElement('h2');
    this.titleEl.id = 'confirmation-title';
    this.titleEl.className = 'confirmation-title';
    header.appendChild(this.titleEl);

    // Create body
    const body = document.createElement('div');
    body.className = 'confirmation-body';

    this.messageEl = document.createElement('p');
    this.messageEl.id = 'confirmation-message';
    this.messageEl.className = 'confirmation-message';
    body.appendChild(this.messageEl);

    // Create footer with buttons
    const footer = document.createElement('div');
    footer.className = 'confirmation-footer';

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.type = 'button';
    this.cancelBtn.className = 'confirmation-btn confirmation-btn--cancel';
    this.cancelBtn.textContent = 'Cancel';
    this.cancelBtn.addEventListener('click', () => this.handleCancel());

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.type = 'button';
    this.confirmBtn.className = 'confirmation-btn confirmation-btn--confirm';
    this.confirmBtn.textContent = 'Confirm';
    this.confirmBtn.addEventListener('click', () => this.handleConfirm());

    footer.appendChild(this.cancelBtn);
    footer.appendChild(this.confirmBtn);

    // Assemble modal
    this.modal.appendChild(header);
    this.modal.appendChild(body);
    this.modal.appendChild(footer);

    // Add modal to backdrop
    this.backdrop.appendChild(this.modal);

    // Attach to body
    document.body.appendChild(this.backdrop);

    // Set up event listeners
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.handleCancel();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (this.isVisible && e.key === 'Escape') {
        this.handleCancel();
      }
    });
  }

  /**
   * Get all focusable elements within the modal
   */
  getFocusableElements() {
    const selector = [
      'button',
      '[href]',
      'input',
      'select',
      'textarea',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    return Array.from(this.modal.querySelectorAll(selector)).filter(el => {
      return !el.hasAttribute('disabled') && el.offsetParent !== null;
    });
  }

  /**
   * Trap focus within the modal
   */
  trapFocus(e) {
    if (e.key !== 'Tab') return;

    this.focusableElements = this.getFocusableElements();
    if (this.focusableElements.length === 0) return;

    const firstElement = this.focusableElements[0];
    const lastElement = this.focusableElements[this.focusableElements.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  /**
   * Open the confirmation overlay with the given options
   */
  async open(options = {}) {
    if (this.isVisible) {
      console.warn('Confirmation overlay is already open');
      return false;
    }

    const {
      title = 'Confirm',
      message = 'Are you sure?',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      danger = false
    } = options;

    // Store the currently focused element to restore later
    this.focusedElementBeforeOpen = document.activeElement;

    // Update content
    this.titleEl.textContent = title;
    this.messageEl.textContent = message;
    this.confirmBtn.textContent = confirmText;
    this.cancelBtn.textContent = cancelText;

    // Apply danger styling if needed
    this.confirmBtn.classList.toggle('is-danger', danger);
    this.modal.classList.toggle('is-danger', danger);

    // Show overlay
    this.backdrop.classList.add('is-open');
    this.isVisible = true;

    // Focus the cancel button by default (safer choice)
    this.cancelBtn.focus();

    // Add keyboard event listener for focus trapping
    document.addEventListener('keydown', (e) => this.trapFocus(e));

    // Return a promise that resolves when the user makes a choice
    return new Promise((resolve) => {
      this.currentResolve = resolve;
    });
  }

  /**
   * Close the overlay
   */
  close(result) {
    if (!this.isVisible) return;

    this.backdrop.classList.remove('is-open');
    this.isVisible = false;

    // Clean up
    this.currentResolve = null;
    this.confirmBtn.classList.remove('is-danger');
    this.modal.classList.remove('is-danger');

    // Remove keyboard event listener
    document.removeEventListener('keydown', (e) => this.trapFocus(e));

    // Restore focus to the triggering element
    if (this.focusedElementBeforeOpen && typeof this.focusedElementBeforeOpen.focus === 'function') {
      this.focusedElementBeforeOpen.focus();
    }
  }

  /**
   * Handle confirm button click
   */
  handleConfirm() {
    const resolve = this.currentResolve;
    this.close(true);
    if (resolve) resolve(true);
  }

  /**
   * Handle cancel or backdrop click
   */
  handleCancel() {
    const resolve = this.currentResolve;
    this.close(false);
    if (resolve) resolve(false);
  }
}

/**
 * Global confirmation overlay instance (created once at startup)
 */
let confirmationOverlay = null;

/**
 * Initialize the confirmation overlay on app startup
 * Call this once from initApp() or from page-specific init
 */
function initConfirmationOverlay() {
  if (!confirmationOverlay) {
    confirmationOverlay = new ConfirmationOverlay();
  }
}

/**
 * Global API for showing confirmation dialogs
 * @param {Object} options - Configuration object
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string} options.confirmText - Confirm button text
 * @param {string} options.cancelText - Cancel button text
 * @param {boolean} options.danger - Apply danger styling (default: false)
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
async function showConfirm(options = {}) {
  if (!confirmationOverlay) {
    initConfirmationOverlay();
  }
  return confirmationOverlay.open(options);
}

// ────────────────────────────────────────────────────────────────────────────
// Icon SVGs
// ────────────────────────────────────────────────────────────────────────────

