/* global chrome */

(function () {
  if (window.hasSaveToUnsortedModal) {
    return;
  }
  window.hasSaveToUnsortedModal = true;

  const HOST_ID = 'nenya-save-to-unsorted-host';
  const MODAL_ID = 'nenya-save-to-unsorted-modal';

  function createModalHost() {
    if (document.getElementById(HOST_ID)) {
      return document.getElementById(HOST_ID);
    }
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.all = 'initial';
    document.body.appendChild(host);
    return host;
  }

  async function injectModalAndStyles(shadowRoot) {
    const daisyUiHref = chrome.runtime.getURL('src/libs/daisyui@5.css');
    const daisyUiThemesHref = chrome.runtime.getURL('src/libs/daisyui@5-themes.css');
    const tailwindHref = chrome.runtime.getURL('src/libs/tailwindcss@4.js');

    const loadCss = (href) => new Promise(resolve => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        shadowRoot.appendChild(link);
    });

    const loadJs = (src) => new Promise(resolve => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        shadowRoot.appendChild(script);
    });

    await Promise.all([
        loadCss(daisyUiHref),
        loadCss(daisyUiThemesHref),
        loadJs(tailwindHref)
    ]);

    const modalContainer = document.createElement('div');
    modalContainer.setAttribute('data-theme', 'light');
    modalContainer.innerHTML = `
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
    shadowRoot.appendChild(modalContainer);
  }

  function cleanup() {
    const host = document.getElementById(HOST_ID);
    if (host) {
      host.remove();
    }
    window.hasSaveToUnsortedModal = false;
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  async function showModal(originalTitle) {
    const host = createModalHost();
    const shadowRoot = host.attachShadow({ mode: 'open' });

    await injectModalAndStyles(shadowRoot);

    const modal = shadowRoot.getElementById(MODAL_ID);
    const titleInput = shadowRoot.getElementById(`${MODAL_ID}-title-input`);
    const screenshotCheckbox = shadowRoot.getElementById(`${MODAL_ID}-screenshot-checkbox`);
    const cancelButton = shadowRoot.getElementById(`${MODAL_ID}-cancel-button`);
    const saveButton = shadowRoot.getElementById(`${MODAL_ID}-save-button`);

    if (!modal || !titleInput || !screenshotCheckbox || !cancelButton || !saveButton) {
      cleanup();
      return;
    }

    titleInput.value = originalTitle;

    const onSave = () => {
      chrome.runtime.sendMessage({
        type: 'saveToUnsortedFromModal',
        title: titleInput.value.trim(),
        attachScreenshot: screenshotCheckbox.checked,
      });
      modal.close();
    };

    const onCancel = () => {
      modal.close();
    };

    saveButton.addEventListener('click', onSave, { once: true });
    cancelButton.addEventListener('click', onCancel, { once: true });
    modal.addEventListener('close', cleanup, { once: true });

    modal.showModal();
  }

  const messageListener = (message, sender, sendResponse) => {
    if (message.type === 'showSaveToUnsortedModal') {
      void showModal(message.title);
      sendResponse({ success: true });
    }
    return true;
  };

  chrome.runtime.onMessage.addListener(messageListener);
})();
