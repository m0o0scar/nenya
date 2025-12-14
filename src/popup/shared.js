/* global chrome */

import { convertSplitUrlForSave } from '../shared/splitUrl.js';

/**
 * Send a runtime message with promise semantics.
 * @template T
 * @param {any} payload
 * @returns {Promise<T>}
 */
export function sendRuntimeMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Update the popup status text and styling.
 * @param {string} text
 * @param {'success' | 'error' | 'info'} tone
 * @param {HTMLElement} statusMessage
 * @returns {void}
 */
export function setStatus(text, tone, statusMessage) {
  if (!statusMessage) {
    return;
  }
  statusMessage.textContent = text;
  statusMessage.classList.remove(
    'opacity-0',
    'text-success',
    'text-error',
    'text-base-content/80',
  );
  if (tone === 'success') {
    statusMessage.classList.add('text-success');
  } else if (tone === 'error') {
    statusMessage.classList.add('text-error');
  } else {
    statusMessage.classList.add('text-base-content/80');
  }
}

let clearStatusTimeout = 0;

/**
 * Update the popup status text and styling, then hide it after a delay.
 * @param {string} text
 * @param {'success' | 'error' | 'info'} tone
 * @param {number} delay
 * @param {HTMLElement} statusMessage
 * @returns {void}
 */
export function concludeStatus(text, tone, delay = 3000, statusMessage) {
  setStatus(text, tone, statusMessage);
  clearTimeout(clearStatusTimeout);
  clearStatusTimeout = setTimeout(() => {
    statusMessage?.classList.add('opacity-0');
  }, delay);
}

/**
 * Query chrome tabs, returning a promise.
 * @param {chrome.tabs.QueryInfo} queryInfo
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
export function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(tabs);
    });
  });
}

/**
 * Normalize a URL string for saving, ensuring supported protocols.
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
export function normalizeUrlForSave(url) {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Gather highlighted tabs or fall back to the active tab in the current window.
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
export async function collectSavableTabs() {
  const highlighted = await queryTabs({
    currentWindow: true,
    highlighted: true,
  });
  const candidates =
    highlighted.length > 0
      ? highlighted
      : await queryTabs({
          currentWindow: true,
          active: true,
        });
  return candidates.filter((tab) => {
    if (!tab.url) {
      return false;
    }
    // Convert split page URLs to nenya.local format before checking
    const convertedUrl = convertSplitUrlForSave(tab.url);
    return Boolean(normalizeUrlForSave(convertedUrl));
  });
}

/**
 * Returns a function to close pre-existing empty tabs.
 * This should be called *before* opening new tabs to capture the state.
 * The returned function should be called *after* new tabs have been opened.
 * @returns {Promise<() => Promise<void>>} A function that performs the closing action.
 */
export async function getCloseExistingEmptyTabsAction() {
  try {
    // 1. Get all non-pinned tabs in the current window.
    const existingTabs = await queryTabs({
      currentWindow: true,
      pinned: false,
    });

    /**
     * The action to be executed after new tabs are opened.
     */
    const closeAction = async () => {
      if (existingTabs.length === 0) {
        return;
      }

      // 2. Identify all pre-existing empty tabs.
      const emptyTabsToClose = existingTabs.filter((tab) => {
        const url = tab.url || '';
        // Also check for localhost, which should not be considered an empty tab.
        const isLocalhost =
          url.includes('localhost') || url.includes('127.0.0.1');
        return (
          !isLocalhost && !url.startsWith('http://') && !url.startsWith('https://')
        );
      });

      const tabIdsToClose = emptyTabsToClose
        .map((tab) => tab.id)
        .filter((id) => typeof id === 'number');

      // 3. Close them.
      if (tabIdsToClose.length > 0) {
        try {
          await chrome.tabs.remove(tabIdsToClose);
        } catch (error) {
          console.error('[shared] Error removing tabs:', error);
        }
      }
    };

    return closeAction;
  } catch (error) {
    console.error('[shared] Error getting existing tabs:', error);
    // Return a no-op function in case of error.
    return async () => {};
  }
}
