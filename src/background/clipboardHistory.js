/**
 * @typedef {object} ClipboardItem
 * @property {string} text - The copied text.
 * @property {string} url - The URL of the page where the text was copied.
 * @property {string} timestamp - The ISO string of the date and time when the text was copied.
 */

/**
 * Adds a new item to the clipboard history.
 * @param {ClipboardItem} newItem - The clipboard item to add.
 * @returns {Promise<void>}
 */
export async function addClipboardItem(newItem) {
  try {
    const { clipboardHistory = [] } = await chrome.storage.local.get('clipboardHistory');

    // Remove any existing item with the same text to avoid duplicates
    const filteredHistory = clipboardHistory.filter(item => item.text !== newItem.text);

    // Add the new or updated item to the beginning of the array
    const updatedHistory = [newItem, ...filteredHistory];

    // Keep only the latest 20 items
    if (updatedHistory.length > 20) {
      updatedHistory.length = 20;
    }

    await chrome.storage.local.set({ clipboardHistory: updatedHistory });
  } catch (error) {
    console.error('Error adding clipboard item:', error);
  }
}
