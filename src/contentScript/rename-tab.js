/* global chrome */

/**
 * @fileoverview Content script for locking tab titles.
 * Overrides document.title getter/setter and monitors title changes.
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'customTabTitles';
  
  /**
   * @typedef {Object} CustomTabTitle
   * @property {string} title - The custom title for the tab
   * @property {string} url - The URL of the tab
   * @property {number} [tabId] - The tab ID (optional)
   */

  /** @type {CustomTabTitle | null} */
  let matchingTitle = null;
  
  /** @type {number | null} */
  let currentTabId = null;
  
  /** @type {string} */
  let currentUrl = window.location.href;
  
  /** @type {MutationObserver | null} */
  let titleObserver = null;
  
  /** @type {string} */
  let originalTitle = document.title;
  
  /** @type {PropertyDescriptor | undefined} */
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'title'
  );

  /**
   * Get the current tab ID
   * @returns {Promise<number | null>}
   */
  async function getCurrentTabId() {
    try {
      // Use chrome.runtime.sendMessage to get tab ID from background
      const response = await chrome.runtime.sendMessage({
        type: 'renameTab:getTabId',
      });
      console.log('[RenameTab] Got tab ID:', response?.tabId);
      return response?.tabId || null;
    } catch (error) {
      console.warn('[RenameTab] Failed to get tab ID:', error);
      return null;
    }
  }

  /**
   * Find matching custom title for current tab
   * @param {CustomTabTitle[]} titles
   * @returns {CustomTabTitle | null}
   */
  function findMatchingTitle(titles) {
    if (!titles || titles.length === 0) {
      return null;
    }

    const url = window.location.href;

    // First try to match by tab ID (if we have one)
    if (currentTabId !== null && currentTabId !== undefined) {
      const byTabId = titles.find(
        (t) => t.tabId !== null && t.tabId !== undefined && t.tabId === currentTabId
      );
      if (byTabId) {
        console.log('[RenameTab] Matched by tab ID:', byTabId);
        return byTabId;
      }
    }

    // Fall back to URL matching (match any record with same URL)
    // This handles both records without tabId AND records where tabId doesn't match current tab
    const byUrl = titles.find((t) => t.url === url);
    if (byUrl) {
      console.log('[RenameTab] Matched by URL:', byUrl);
      return byUrl;
    }

    return null;
  }

  /**
   * Load custom titles from storage and find match
   * @returns {Promise<void>}
   */
  async function loadMatchingTitle() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const titles = result[STORAGE_KEY] || [];
      console.log('[RenameTab] Loaded titles from storage:', titles);
      console.log('[RenameTab] Current URL:', window.location.href);
      console.log('[RenameTab] Current tab ID:', currentTabId);
      matchingTitle = findMatchingTitle(titles);
      console.log('[RenameTab] Matching title:', matchingTitle);
    } catch (error) {
      console.error('[RenameTab] Failed to load titles:', error);
      matchingTitle = null;
    }
  }

  /**
   * Apply the custom title to the page
   * @returns {void}
   */
  function applyCustomTitle() {
    if (matchingTitle && matchingTitle.title) {
      console.log('[RenameTab] Applying custom title:', matchingTitle.title);
      
      // Update title element directly
      let titleEl = document.querySelector('title');
      if (titleEl) {
        titleEl.textContent = matchingTitle.title;
      } else {
        // Create title element if it doesn't exist
        const newTitleEl = document.createElement('title');
        newTitleEl.textContent = matchingTitle.title;
        const head = document.head || document.querySelector('head') || document.documentElement;
        if (head) {
          head.appendChild(newTitleEl);
          titleEl = newTitleEl;
        }
      }
      
      console.log('[RenameTab] Title applied, current document.title:', document.title);
    }
  }

  /**
   * Override document.title getter and setter
   * @returns {void}
   */
  function overrideDocumentTitle() {
    if (!originalDescriptor) {
      console.warn('[RenameTab] Could not get original title descriptor');
      return;
    }

    Object.defineProperty(document, 'title', {
      get() {
        // If we have a matching custom title, return it
        if (matchingTitle && matchingTitle.title) {
          return matchingTitle.title;
        }
        // Otherwise delegate to original getter
        if (originalDescriptor.get) {
          return originalDescriptor.get.call(this);
        }
        return '';
      },
      set(newTitle) {
        // If we have a matching custom title, ignore the set (no-op)
        if (matchingTitle && matchingTitle.title) {
          return;
        }
        // Otherwise delegate to original setter
        if (originalDescriptor.set) {
          originalDescriptor.set.call(this, newTitle);
        }
      },
      configurable: true,
      enumerable: true,
    });
  }

  /**
   * Setup MutationObserver to monitor title element changes
   * @returns {void}
   */
  function setupTitleObserver() {
    if (!window.MutationObserver) {
      console.warn('[RenameTab] MutationObserver not supported');
      return;
    }

    const trySetupObserver = () => {
      const titleEl = document.querySelector('title');
      if (!titleEl) {
        // Title element doesn't exist yet, try again later
        setTimeout(trySetupObserver, 100);
        return;
      }

      // Disconnect existing observer if any
      if (titleObserver) {
        titleObserver.disconnect();
      }

      titleObserver = new MutationObserver(() => {
        // If we have a custom title, restore it
        if (matchingTitle && matchingTitle.title) {
          const titleEl = document.querySelector('title');
          if (titleEl && titleEl.textContent !== matchingTitle.title) {
            titleEl.textContent = matchingTitle.title;
          }
        }
      });

      titleObserver.observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    };

    trySetupObserver();
  }

  /**
   * Setup URL change listener for SPA navigation
   * @returns {void}
   */
  function setupUrlChangeListener() {
    // Listen for history events
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleUrlChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };

    window.addEventListener('popstate', handleUrlChange);

    // Also poll for URL changes (backup for frameworks that don't use history API)
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        handleUrlChange();
      }
    }, 1000);
  }

  /**
   * Handle URL change event
   * @returns {void}
   */
  function handleUrlChange() {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      void loadMatchingTitle().then(() => {
        applyCustomTitle();
      });
    }
  }

  /**
   * Setup message listener for updates from background
   * @returns {void}
   */
  function setupMessageListener() {
    if (!chrome?.runtime?.onMessage) {
      console.warn('[RenameTab] Runtime onMessage not available');
      return;
    }

    chrome.runtime.onMessage.addListener((message) => {
      console.log('[RenameTab] Received message:', message);
      if (message && message.type === 'renameTab:titleUpdated') {
        console.log('[RenameTab] Title update message received');
        // Reload matching title from storage and apply immediately
        void loadMatchingTitle().then(() => {
          console.log('[RenameTab] Loaded matching title after message:', matchingTitle);
          applyCustomTitle();
          
          // Force a second update after a short delay to ensure Chrome picks it up
          setTimeout(() => {
            console.log('[RenameTab] Reapplying title after 100ms delay');
            applyCustomTitle();
          }, 100);
        });
      }
    });
  }

  /**
   * Setup storage change listener
   * @returns {void}
   */
  function setupStorageListener() {
    if (!chrome?.storage?.onChanged) {
      console.warn('[RenameTab] Storage onChanged not available');
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      console.log('[RenameTab] Storage changed:', areaName, Object.keys(changes));
      if (areaName === 'local' && changes[STORAGE_KEY]) {
        console.log('[RenameTab] Custom titles storage changed, reloading...');
        void loadMatchingTitle().then(() => {
          applyCustomTitle();
        });
      }
    });
  }

  /**
   * Initialize rename tab content script
   * @returns {Promise<void>}
   */
  async function init() {
    console.log('[RenameTab] Initializing content script...');
    
    // Get current tab ID
    currentTabId = await getCurrentTabId();

    // Load matching title
    await loadMatchingTitle();

    // Override document.title
    overrideDocumentTitle();

    // Apply custom title if we have one
    applyCustomTitle();

    // Setup observers and listeners
    setupTitleObserver();
    setupUrlChangeListener();
    setupMessageListener();
    setupStorageListener();
    
    console.log('[RenameTab] Content script initialized');
    
    // Apply title again after a short delay to ensure it takes effect
    if (matchingTitle) {
      setTimeout(() => {
        console.log('[RenameTab] Reapplying title after delay...');
        applyCustomTitle();
      }, 100);
    }
  }

  console.log('[RenameTab] Content script loaded, readyState:', document.readyState);

  // Run initialization as early as possible
  if (document.readyState === 'loading') {
    // Start immediately, but also retry after DOMContentLoaded
    void init();
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[RenameTab] DOMContentLoaded fired');
      if (matchingTitle) {
        applyCustomTitle();
      }
    });
  } else {
    void init();
  }
})();

