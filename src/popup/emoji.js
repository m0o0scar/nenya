import Picker from '../libs/emoji-picker-element.js';
import '../options/theme.js'; // Apply theme

// Register custom element if not already registered
if (!customElements.get('emoji-picker')) {
  customElements.define('emoji-picker', Picker);
}

const pickerContainer = document.getElementById('pickerContainer');
const statusEl = document.getElementById('status');
const backButton = document.getElementById('backButton');

// Create picker
const picker = document.createElement('emoji-picker');
pickerContainer.appendChild(picker);

// Focus search input on load
requestAnimationFrame(() => {
  const searchInput = picker.shadowRoot?.querySelector('input[type="search"]');
  if (searchInput) {
    searchInput.focus();
  }
});

let statusTimeout;
function showStatus(message, type = 'success') {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = type === 'error' ? 'bg-error text-error-content' : '';
    statusEl.classList.add('show');

    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      statusEl.classList.remove('show');
    }, 2000);
  }
}

// Track modifier keys
let isCmdHeld = false;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Meta' || e.key === 'Control') isCmdHeld = true;
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'Meta' || e.key === 'Control') isCmdHeld = false;
});
window.addEventListener('blur', () => { isCmdHeld = false; });

// Handle emoji selection
picker.addEventListener('emoji-click', async (event) => {
  const emoji = event.detail.unicode;
  if (!emoji) return;

  try {
    let textToCopy = emoji;
    let message = 'Copied!';

    if (isCmdHeld) {
       // Append to clipboard
       try {
         // Try to read existing clipboard text
         // This might fail if permissions are strict, but in popup it usually works
         const currentClipboard = await navigator.clipboard.readText();
         textToCopy = currentClipboard + emoji;
         message = 'Appended!';
       } catch (readErr) {
         console.warn('Could not read clipboard to append, overwriting instead.', readErr);
         // Fallback: just copy the new emoji if we can't read
       }
    }

    await navigator.clipboard.writeText(textToCopy);
    showStatus(message);

    // Optional: Close window if not appending and opened as popup?
    // For now, let's keep it open to allow multiple picks.
  } catch (err) {
    console.error('Failed to copy:', err);
    showStatus('Failed to copy', 'error');
  }
});

// Handle back button
if (backButton) {
  backButton.addEventListener('click', () => {
    // If we have history, go back. Otherwise go to index.html
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'index.html';
    }
  });
}
