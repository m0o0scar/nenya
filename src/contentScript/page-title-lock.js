// @ts-check

/**
 * @file This content script runs on all pages to enforce a locked title.
 * It communicates with the background script to get the custom title and
 * uses a MutationObserver to ensure the title remains unchanged by the page.
 */

// This MARK must exactly match the one in `src/background/page-title-lock.js`
const MARK = '\u2063\u2063\u2063\u2063';

let titleObserver = null;
let headObserver = null;

/**
 * Disconnects any active MutationObservers.
 */
function disconnectObservers() {
  if (titleObserver) {
    titleObserver.disconnect();
    titleObserver = null;
  }
  if (headObserver) {
    headObserver.disconnect();
    headObserver = null;
  }
}

/**
 * Removes the title lock, disconnects observers, and attempts to clean the
 * marker from the current title.
 */
function unlockTitle() {
  disconnectObservers();
  const currentTitle = document.title;
  if (currentTitle.startsWith(MARK)) {
    // Make a best effort to remove the marker. The page will likely set its
    // own title shortly after this.
    document.title = currentTitle.slice(MARK.length);
  }
}

/**
 * Locks the page title to a specific value.
 * @param {string} visibleTitle The custom title provided by the user.
 */
function lockTitle(visibleTitle) {
  // If a lock is already in place, clear it before setting a new one.
  disconnectObservers();

  const desiredTitle = MARK + visibleTitle;
  let selfChange = false; // Flag to prevent the observer from firing on our own changes.

  const enforce = () => {
    if (document.title !== desiredTitle) {
      selfChange = true;
      document.title = desiredTitle;
      // The MutationObserver runs synchronously, so we can reset the flag immediately.
      selfChange = false;
    }
  };

  const observeTitleElement = (titleEl) => {
    if (titleObserver) titleObserver.disconnect();
    titleObserver = new MutationObserver(() => {
      if (!selfChange) {
        enforce();
      }
    });
    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
  };

  const attach = () => {
    enforce();

    const titleEl = document.querySelector('title');
    if (titleEl) {
      observeTitleElement(titleEl);
    }

    // Observe the <head> element in case the entire <title> element is
    // programmatically removed and replaced, which would detach our titleObserver.
    if (headObserver) headObserver.disconnect();
    const head = document.head || document.documentElement;
    headObserver = new MutationObserver(() => {
      const newTitleEl = document.querySelector('title');
      if (newTitleEl && !titleObserver) {
        // If a new title element appeared and we aren't watching it, start.
        observeTitleElement(newTitleEl);
      }
      // Always re-enforce, as the title might have been removed and not replaced yet.
      enforce();
    });
    headObserver.observe(head, { childList: true, subtree: true });
  };

  attach();
}


// --- Main Execution ---

// This IIFE (Immediately Invoked Function Expression) runs as soon as the script is injected.
(async () => {
  // 1. Ask the background script if a title is already locked for this tab.
  // This is for handling reloads and navigations.
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LOCKED_TITLE' });
    if (response && response.title) {
      lockTitle(response.title);
    }
  } catch (error) {
    // This can happen if the background script is not ready, e.g., during extension reload.
    // It's not a critical error; the feature will still work when user initiates a lock.
    if (error.message.includes('Could not establish connection')) {
        // Silently ignore connection errors.
    } else {
        console.warn('[page-title-lock] Could not get initial title:', error);
    }
  }

  // 2. Listen for messages from the background script to dynamically apply or clear the lock.
  // This is triggered by the user clicking the context menu items.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'APPLY_TITLE_LOCK' && typeof message.title === 'string') {
      lockTitle(message.title);
      sendResponse({ success: true });
      return;
    }

    if (message && message.type === 'CLEAR_TITLE_LOCK') {
      unlockTitle();
      sendResponse({ success: true });
    }
  });
})();
