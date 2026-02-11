/**
 * Handle opening the current tab in a small popup window.
 * @returns {Promise<void>}
 */
export async function handleOpenInPopup() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      console.warn('[background] No active tab found for open-in-popup.');
      return;
    }

    const currentTab = tabs[0];
    const currentUrl = typeof currentTab.url === 'string' ? currentTab.url : '';

    if (!currentUrl) {
      console.warn('[background] No URL found for current tab.');
      return;
    }

    // Create a new popup window
    await chrome.windows.create({
      url: currentUrl,
      type: 'popup',
      width: 400,
      height: 600,
    });
  } catch (error) {
    console.error('[background] Error opening in popup window:', error);
  }
}
