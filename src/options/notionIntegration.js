/* global chrome */

/**
 * @typedef {'success' | 'error' | 'info'} ToastVariant
 */

const NOTION_INTEGRATION_SECRET_KEY = 'notionIntegrationSecret';
const VALIDATE_NOTION_SECRET_MESSAGE = 'notion:validateSecret';
const STATUS_BASE_CLASS = 'text-sm';
const TOAST_BACKGROUND_BY_VARIANT = {
  success: 'linear-gradient(135deg, #22c55e, #16a34a)',
  error: 'linear-gradient(135deg, #f97316, #ea580c)',
  info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
};

const notionSecretInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notionIntegrationSecretInput')
);
const notionStatus = /** @type {HTMLDivElement | null} */ (
  document.getElementById('notionIntegrationStatus')
);
const saveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('saveNotionIntegrationButton')
);
const clearButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('clearNotionIntegrationButton')
);

/** @type {string} */
let currentSecret = '';

/**
 * Display a toast notification if Toastify is available.
 * @param {string} message
 * @param {ToastVariant} [variant='info']
 * @returns {void}
 */
function showToast(message, variant = 'info') {
  /** @type {{ Toastify?: (options: any) => { showToast: () => void } }} */
  const windowWithToastify = /** @type {any} */ (window);
  if (typeof windowWithToastify.Toastify !== 'function') {
    return;
  }

  const background =
    TOAST_BACKGROUND_BY_VARIANT[variant] || TOAST_BACKGROUND_BY_VARIANT.info;

  windowWithToastify
    .Toastify({
      text: message,
      duration: 4000,
      gravity: 'top',
      position: 'right',
      close: true,
      style: { background },
    })
    .showToast();
}

/**
 * Send a runtime message to the background script.
 * @template T
 * @param {any} payload
 * @returns {Promise<T>}
 */
function sendRuntimeMessage(payload) {
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
 * Normalize a stored Notion integration secret.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Render the current Notion integration status and button state.
 * @returns {void}
 */
function render() {
  if (!notionSecretInput || !notionStatus || !saveButton || !clearButton) {
    return;
  }

  notionSecretInput.value = currentSecret;
  clearButton.disabled = currentSecret.length === 0;

  if (currentSecret) {
    notionStatus.textContent = 'Configured.';
    notionStatus.className = STATUS_BASE_CLASS + ' text-success';
  } else {
    notionStatus.textContent = 'Not configured.';
    notionStatus.className = STATUS_BASE_CLASS + ' text-base-content/70';
  }
}

/**
 * Toggle buttons into or out of a busy state.
 * @param {boolean} isBusy
 * @returns {void}
 */
function setBusyState(isBusy) {
  if (!saveButton || !clearButton || !notionSecretInput) {
    return;
  }

  saveButton.disabled = isBusy;
  clearButton.disabled = isBusy || currentSecret.length === 0;
  notionSecretInput.disabled = isBusy;

  if (isBusy) {
    saveButton.dataset.originalLabel = saveButton.textContent || 'Save';
    saveButton.textContent = 'Validating...';
  } else if (saveButton.dataset.originalLabel) {
    saveButton.textContent = saveButton.dataset.originalLabel;
    delete saveButton.dataset.originalLabel;
  }
}

/**
 * Load the saved Notion integration secret from storage.
 * @returns {Promise<void>}
 */
async function loadSecret() {
  const stored = await chrome.storage.local.get(NOTION_INTEGRATION_SECRET_KEY);
  currentSecret = normalizeSecret(stored?.[NOTION_INTEGRATION_SECRET_KEY]);
  render();
}

/**
 * Persist a validated Notion integration secret.
 * @param {string} secret
 * @returns {Promise<void>}
 */
async function saveSecret(secret) {
  await chrome.storage.local.set({ [NOTION_INTEGRATION_SECRET_KEY]: secret });
  currentSecret = secret;
  render();
}

/**
 * Clear the saved Notion integration secret.
 * @returns {Promise<void>}
 */
async function clearSecret() {
  await chrome.storage.local.remove(NOTION_INTEGRATION_SECRET_KEY);
  currentSecret = '';
  render();
}

/**
 * Validate and save the Notion integration secret from the input.
 * @returns {Promise<void>}
 */
async function handleSaveClick() {
  if (!notionSecretInput || !notionStatus) {
    return;
  }

  const nextSecret = normalizeSecret(notionSecretInput.value);
  if (!nextSecret) {
    notionStatus.textContent = 'Enter a Notion integration secret first.';
    notionStatus.className = STATUS_BASE_CLASS + ' text-error';
    return;
  }

  setBusyState(true);
  notionStatus.textContent = 'Validating secret...';
  notionStatus.className = STATUS_BASE_CLASS + ' text-info';

  try {
    const response = await sendRuntimeMessage({
      type: VALIDATE_NOTION_SECRET_MESSAGE,
      secret: nextSecret,
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Invalid Notion integration secret.');
    }

    await saveSecret(nextSecret);
    notionStatus.textContent = 'Configured.';
    notionStatus.className = STATUS_BASE_CLASS + ' text-success';
    showToast('Saved Notion integration secret.', 'success');
  } catch (error) {
    notionStatus.textContent =
      error instanceof Error
        ? error.message
        : 'Failed to validate Notion integration secret.';
    notionStatus.className = STATUS_BASE_CLASS + ' text-error';
    showToast(notionStatus.textContent, 'error');
  } finally {
    setBusyState(false);
  }
}

/**
 * Initialize the Notion integration controls.
 * @returns {void}
 */
function init() {
  if (!notionSecretInput || !notionStatus || !saveButton || !clearButton) {
    return;
  }

  saveButton.addEventListener('click', () => {
    void handleSaveClick();
  });
  clearButton.addEventListener('click', () => {
    void clearSecret()
      .then(() => {
        showToast('Cleared Notion integration secret.', 'info');
      })
      .catch((error) => {
        console.error('[notionIntegration] Failed to clear secret:', error);
        showToast('Failed to clear Notion integration secret.', 'error');
      });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[NOTION_INTEGRATION_SECRET_KEY]) {
      return;
    }
    currentSecret = normalizeSecret(
      changes[NOTION_INTEGRATION_SECRET_KEY].newValue,
    );
    render();
  });

  void loadSecret().catch((error) => {
    console.error('[notionIntegration] Failed to load secret:', error);
  });
}

init();
