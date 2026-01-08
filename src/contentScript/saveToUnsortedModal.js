
/* global chrome */

(function () {
  if (window.hasSaveToUnsortedModal) {
    return;
  }
  window.hasSaveToUnsortedModal = true;

  const MODAL_ID = 'nenya-save-to-unsorted-modal';
  const STYLESHEET_ID = 'nenya-daisyui-styles';

  function injectStylesheet() {
    if (document.getElementById(STYLESHEET_ID)) {
      return;
    }
    const daisyUiHref = chrome.runtime.getURL('src/libs/daisyui@5.css');
    const daisyUiThemesHref = chrome.runtime.getURL('src/libs/daisyui@5-themes.css');

    const daisyLink = document.createElement('link');
    daisyLink.id = STYLESHEET_ID;
    daisyLink.rel = 'stylesheet';
    daisyLink.type = 'text/css';
    daisyLink.href = daisyUiHref;
    document.head.appendChild(daisyLink);

    const themesLink = document.createElement('link');
    themesLink.rel = 'stylesheet';
    themesLink.type = 'text/css';
    themesLink.href = daisyUiThemesHref;
    document.head.appendChild(themesLink);
  }

  function injectModal() {
    if (document.getElementById(MODAL_ID)) {
      return;
    }
    const modalHtml = `
      <dialog id="${MODAL_ID}" class="modal">
        <div class="modal-box">
          <h3 class="font-bold text-lg">Save to Unsorted</h3>
          <div class="py-4 space-y-4">
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text">Title</span>
              </label>
              <input id="${MODAL_ID}-title-input" type="text" placeholder="Enter title" class="input input-bordered w-full" />
            </div>
            <div class="form-control">
              <label class="label cursor-pointer justify-start gap-4">
                <input id="${MODAL_ID}-screenshot-checkbox" type="checkbox" class="checkbox" />
                <span class="label-text">Attach Screenshot</span>
              </label>
            </div>
          </div>
          <div class="modal-action">
            <button id="${MODAL_ID}-cancel-button" class="btn">Cancel</button>
            <button id="${MODAL_ID}-save-button" class="btn btn-primary">Save</button>
          </div>
        </div>
      </dialog>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function cleanup() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.remove();
    }
    const stylesheet = document.getElementById(STYLESHEET_ID);
    if (stylesheet) {
      stylesheet.nextElementSibling?.remove(); // remove themes
      stylesheet.remove();
    }
    window.hasSaveToUnsortedModal = false;
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  function showModal(originalTitle) {
    const modal = document.getElementById(MODAL_ID);
    const titleInput = document.getElementById(`${MODAL_ID}-title-input`);
    const screenshotCheckbox = document.getElementById(`${MODAL_ID}-screenshot-checkbox`);
    const cancelButton = document.getElementById(`${MODAL_ID}-cancel-button`);
    const saveButton = document.getElementById(`${MODAL_ID}-save-button`);

    if (!modal || !titleInput || !screenshotCheckbox || !cancelButton || !saveButton) {
      cleanup();
      return;
    }

    titleInput.value = originalTitle;
    screenshotCheckbox.checked = false;

    const onSave = () => {
      chrome.runtime.sendMessage({
        type: 'saveToUnsortedFromModal',
        title: titleInput.value.trim(),
        attachScreenshot: screenshotCheckbox.checked,
      });
      modal.close();
      cleanup();
    };

    const onCancel = () => {
      modal.close();
      cleanup();
    };

    saveButton.addEventListener('click', onSave, { once: true });
    cancelButton.addEventListener('click', onCancel, { once: true });
    modal.addEventListener('close', cleanup, { once: true });

    modal.showModal();
  }

  const messageListener = (message, sender, sendResponse) => {
    if (message.type === 'showSaveToUnsortedModal') {
      injectStylesheet();
      injectModal();
      showModal(message.title);
    }
    return true;
  };

  chrome.runtime.onMessage.addListener(messageListener);
})();
