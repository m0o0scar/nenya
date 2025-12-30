/**
 * @typedef {import('../background/clipboardHistory.js').ClipboardItem} ClipboardItem
 */

function initializeClipboardHistory() {
  const clipboardHistoryList = document.getElementById('clipboardHistoryList');
  const clearClipboardHistoryButton = document.getElementById('clearClipboardHistoryButton');

  /**
   * Renders the clipboard history.
   * @param {ClipboardItem[]} history - The clipboard history to render.
   */
  function renderClipboardHistory(history) {
    clipboardHistoryList.innerHTML = '';
    if (history.length === 0) {
      clipboardHistoryList.innerHTML = '<p class="text-base-content/60">No clipboard history yet.</p>';
      return;
    }

    history.forEach((item, index) => {
      const { text, url, timestamp } = item;
      const element = document.createElement('div');
      element.className = 'flex items-center justify-between p-3 bg-base-200 rounded-xl';

      const textContainer = document.createElement('div');
      textContainer.className = 'flex-1 truncate';

      const textElement = document.createElement('p');
      textElement.className = 'font-mono text-sm truncate';
      textElement.textContent = text;

      const metaElement = document.createElement('p');
      metaElement.className = 'text-xs text-base-content/60 truncate';
      metaElement.textContent = `${url} - ${dayjs(timestamp).fromNow()}`;

      textContainer.appendChild(textElement);
      textContainer.appendChild(metaElement);

      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'flex gap-2';

      const copyButton = document.createElement('button');
      copyButton.className = 'nenya-btn nenya-btn-secondary !py-1 !px-3 copy-btn';
      copyButton.textContent = 'Copy';
      copyButton.dataset.text = text;

      const deleteButton = document.createElement('button');
      deleteButton.className = 'nenya-btn nenya-btn-danger !py-1 !px-3 delete-btn';
      deleteButton.textContent = 'Delete';
      deleteButton.dataset.index = index;

      buttonContainer.appendChild(copyButton);
      buttonContainer.appendChild(deleteButton);

      element.appendChild(textContainer);
      element.appendChild(buttonContainer);

      clipboardHistoryList.appendChild(element);
    });
  }

  /**
   * Loads the clipboard history from storage and renders it.
   */
  async function loadClipboardHistory() {
    const { clipboardHistory = [] } = await chrome.storage.local.get('clipboardHistory');
    renderClipboardHistory(clipboardHistory);
  }

  /**
   * Handles click events on the clipboard history list.
   * @param {MouseEvent} event - The click event.
   */
  async function handleListClick(event) {
    const target = event.target;
    if (target.classList.contains('copy-btn')) {
      const text = target.dataset.text;
      await navigator.clipboard.writeText(text);
      Toastify({ text: 'Copied to clipboard!', duration: 2000 }).showToast();
    } else if (target.classList.contains('delete-btn')) {
      const index = parseInt(target.dataset.index, 10);
      const { clipboardHistory = [] } = await chrome.storage.local.get('clipboardHistory');
      clipboardHistory.splice(index, 1);
      await chrome.storage.local.set({ clipboardHistory });
      await loadClipboardHistory();
    }
  }

  /**
   * Clears the entire clipboard history.
   */
  async function clearAll() {
    if (confirm('Are you sure you want to clear the entire clipboard history?')) {
      await chrome.storage.local.set({ clipboardHistory: [] });
      await loadClipboardHistory();
    }
  }

  clipboardHistoryList.addEventListener('click', handleListClick);
  clearClipboardHistoryButton.addEventListener('click', clearAll);

  loadClipboardHistory();
}

document.addEventListener('DOMContentLoaded', initializeClipboardHistory);
