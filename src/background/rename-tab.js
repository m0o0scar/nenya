/* global chrome */

/**
 * @fileoverview Background script for managing custom tab titles.
 * Handles storage, tab ID cleanup, and rename operations.
 */

/**
 * Storage key for custom tab titles
 */
const STORAGE_KEY = 'customTabTitles';

/**
 * @typedef {Object} CustomTabTitle
 * @property {string} title - The custom title for the tab
 * @property {string} url - The URL of the tab
 * @property {number} [tabId] - The tab ID (optional, cleaned up on startup)
 */

/**
 * Get all custom tab titles from storage
 * @returns {Promise<CustomTabTitle[]>}
 */
export async function getCustomTabTitles() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  } catch (error) {
    console.error('[RenameTab] Failed to get custom titles:', error);
    return [];
  }
}

/**
 * Save custom tab titles to storage
 * @param {CustomTabTitle[]} titles
 * @returns {Promise<void>}
 */
async function saveCustomTabTitles(titles) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: titles });
  } catch (error) {
    console.error('[RenameTab] Failed to save custom titles:', error);
  }
}

/**
 * Add or update a custom tab title
 * @param {string} url - The tab URL
 * @param {number} tabId - The tab ID
 * @param {string} title - The custom title
 * @returns {Promise<void>}
 */
export async function setCustomTabTitle(url, tabId, title) {
  const titles = await getCustomTabTitles();
  
  // Remove existing entry for this URL or tabId
  const filtered = titles.filter(
    (t) => t.url !== url && t.tabId !== tabId
  );
  
  // Add new entry
  filtered.push({ title, url, tabId });
  
  await saveCustomTabTitles(filtered);
  
  console.log('[RenameTab] Saved custom title:', { url, tabId, title });
  
  // Force update the title in the tab using scripting API (run in MAIN world to directly affect page)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (newTitle) => {
        console.log('[RenameTab] Setting title via scripting API:', newTitle);
        // Set title element directly
        let titleEl = document.querySelector('title');
        if (titleEl) {
          titleEl.textContent = newTitle;
        } else {
          const newTitleEl = document.createElement('title');
          newTitleEl.textContent = newTitle;
          const head = document.head || document.querySelector('head') || document.documentElement;
          head.appendChild(newTitleEl);
          titleEl = newTitleEl;
        }
        console.log('[RenameTab] Title element after set:', titleEl?.textContent);
        console.log('[RenameTab] document.title after set:', document.title);
      },
      args: [title],
    });
    console.log('[RenameTab] Scripting API executed successfully for tabId:', tabId);
  } catch (error) {
    console.warn('[RenameTab] Failed to set title via scripting:', error);
  }
  
  // Also notify content script to update its state
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'renameTab:titleUpdated',
      title,
    });
  } catch (error) {
    // Tab might not have content script loaded yet, ignore
  }
}

/**
 * Remove a custom tab title
 * @param {string} url - The tab URL
 * @param {number} [tabId] - The tab ID (optional)
 * @returns {Promise<void>}
 */
export async function removeCustomTabTitle(url, tabId) {
  const titles = await getCustomTabTitles();
  
  // Remove entries matching URL or tabId
  const filtered = titles.filter(
    (t) => t.url !== url && (!tabId || t.tabId !== tabId)
  );
  
  await saveCustomTabTitles(filtered);
  
  // Notify content script to update (it will restore normal behavior)
  if (tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'renameTab:titleUpdated',
      });
    } catch (error) {
      // Tab might not have content script loaded yet, ignore
    }
  }
}

/**
 * Clean up tab IDs from storage on browser startup
 * This ensures URL-based matching works after browser restart
 * @returns {Promise<void>}
 */
export async function cleanupTabIds() {
  const titles = await getCustomTabTitles();
  
  // Remove tabId from all entries
  const cleaned = titles.map((t) => ({
    title: t.title,
    url: t.url,
  }));
  
  await saveCustomTabTitles(cleaned);
  console.log('[RenameTab] Cleaned up tab IDs on startup');
}

/**
 * Handle rename tab request
 * @param {number} tabId - The tab ID to rename
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function handleRenameTab(tabId) {
  try {
    // Get tab info
    const tab = await chrome.tabs.get(tabId);
    
    if (!tab || !tab.url) {
      return { success: false, error: 'Invalid tab' };
    }
    
    // Get current custom title if exists
    const titles = await getCustomTabTitles();
    const existing = titles.find(
      (t) => (t.tabId === tabId) || (t.url === tab.url)
    );
    
    // Get current title (custom or default)
    const currentTitle = existing ? existing.title : tab.title;
    
    // Show prompt with current title as default
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (prefillTitle) => {
        const newTitle = window.prompt(
          'Enter custom tab title (leave empty to remove):',
          prefillTitle
        );
        return newTitle;
      },
      args: [currentTitle],
      world: 'ISOLATED',
    });
    
    const newTitle = results && results[0] ? results[0].result : null;
    
    // User cancelled
    if (newTitle === null) {
      return { success: false };
    }
    
    // Remove title if empty
    if (newTitle.trim() === '') {
      await removeCustomTabTitle(tab.url, tabId);
      return { success: true };
    }
    
    // Set new title
    await setCustomTabTitle(tab.url, tabId, newTitle.trim());
    return { success: true };
  } catch (error) {
    console.error('[RenameTab] Failed to rename tab:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize rename tab functionality
 * @returns {void}
 */
export function initRenameTab() {
  // Clean up tab IDs on startup
  chrome.runtime.onStartup.addListener(() => {
    void cleanupTabIds();
  });
  
  // Also clean up on install
  chrome.runtime.onInstalled.addListener(() => {
    void cleanupTabIds();
  });
}

