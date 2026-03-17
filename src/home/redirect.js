(function () {
  'use strict';

  const nativeNewTabUrl = 'chrome://newtab/';
  const fallbackLink = document.getElementById('nativeNewTabLink');

  if (fallbackLink) {
    fallbackLink.href = nativeNewTabUrl;
  }

  /**
   * Redirect the current legacy extension tab to the browser's native new tab page.
   * Falls back to location.replace() only when extension APIs are unavailable.
   * @returns {Promise<void>}
   */
  async function redirectToNativeNewTab() {
    if (
      typeof chrome !== 'undefined' &&
      chrome.tabs &&
      typeof chrome.tabs.getCurrent === 'function' &&
      typeof chrome.tabs.update === 'function'
    ) {
      const currentTab = await chrome.tabs.getCurrent();
      if (currentTab && typeof currentTab.id === 'number') {
        await chrome.tabs.update(currentTab.id, { url: nativeNewTabUrl });
        return;
      }
    }

    window.location.replace(nativeNewTabUrl);
  }

  void redirectToNativeNewTab().catch((error) => {
    console.warn('[home] Failed to redirect legacy new tab page:', error);
  });
})();
