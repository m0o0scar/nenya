// @ts-check

/**
 * @file This script manages the state of locked page titles.
 * It uses a combination of an invisible Unicode marker in the tab title
 * and chrome.storage.session to persist the locked state across browser
 * restarts and service worker reloads.
 */

/**
 * An invisible Unicode marker prefix to identify locked titles.
 * We use the "Invisible Separator" character (U+2063), repeated for robustness.
 * @type {string}
 */
export const MARK = '\u2063\u2063\u2063\u2063';

/**
 * Generates a consistent storage key for a given tab ID.
 * @param {number} tabId The ID of the tab.
 * @returns {string} The key for chrome.storage.session.
 */
const keyFor = (tabId) => `lockedTitle:${tabId}`;

/**
 * Retrieves the custom title for a given tab ID from session storage.
 * @param {number} tabId The ID of the tab.
 * @returns {Promise<string | null>} A promise that resolves to the custom title or null if not found.
 */
export async function getLockedTitle(tabId) {
  if (typeof tabId !== 'number') {
    return null;
  }
  try {
    const key = keyFor(tabId);
    const data = await chrome.storage.session.get(key);
    return data[key] || null;
  } catch (error) {
    console.warn(`[page-title-lock] Error getting locked title for tab ${tabId}:`, error);
    return null;
  }
}

/**
 * Sets and locks a custom title for a given tab.
 * @param {number} tabId The ID of the tab to lock.
 * @param {string} title The custom title to apply.
 * @returns {Promise<void>} A promise that resolves when the title has been set in storage.
 */
export async function setLockedTitle(tabId, title) {
  if (typeof tabId !== 'number' || typeof title !== 'string') {
    return;
  }
  try {
    await chrome.storage.session.set({ [keyFor(tabId)]: title });
  } catch (error) {
    console.error(`[page-title-lock] Error setting locked title for tab ${tabId}:`, error);
  }
}

/**
 * Removes the title lock for a given tab.
 * @param {number} tabId The ID of the tab to unlock.
 * @returns {Promise<void>} A promise that resolves when the lock has been removed from storage.
 */
export async function removeLockedTitle(tabId) {
  if (typeof tabId !== 'number') {
    return;
  }
  try {
    await chrome.storage.session.remove(keyFor(tabId));
  } catch (error) {
    console.warn(`[page-title-lock] Error removing locked title for tab ${tabId}:`, error);
  }
}

/**
 * Scans all open tabs on startup/install to find marked titles and rebuilds
 * the session storage state. This is crucial for persistence across browser restarts.
 * @returns {Promise<void>}
 */
export async function rebuildFromOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const updates = {};
    for (const tab of tabs) {
      if (tab.id != null && tab.title && tab.title.startsWith(MARK)) {
        const customTitle = tab.title.slice(MARK.length);
        updates[keyFor(tab.id)] = customTitle;
      }
    }
    if (Object.keys(updates).length > 0) {
      await chrome.storage.session.set(updates);
      console.log('[page-title-lock] Rebuilt locked titles state from open tabs.');
    }
  } catch (error) {
    console.error('[page-title-lock] Failed to rebuild locked titles state:', error);
  }
}
