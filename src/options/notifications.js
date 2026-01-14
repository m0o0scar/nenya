/* global chrome */

/**
 * @typedef {Object} NotificationBookmarkSettings
 * @property {boolean} enabled
 * @property {boolean} unsortedSaved
 */



/**
 * @typedef {Object} NotificationClipboardSettings
 * @property {boolean} enabled
 * @property {boolean} copySuccess
 */

/**
 * @typedef {Object} NotificationPreferences
 * @property {boolean} enabled
 * @property {NotificationBookmarkSettings} bookmark
 * @property {NotificationClipboardSettings} clipboard
 */

const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';

/** @type {NotificationPreferences} */
const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: true,
  bookmark: {
    enabled: true,
    unsortedSaved: true
  },
  clipboard: {
    enabled: true,
    copySuccess: true
  }
};

const globalToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationGlobalToggle')
);
const bookmarkToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationBookmarkToggle')
);
const bookmarkUnsortedToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationBookmarkUnsortedToggle')
);

const clipboardToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationClipboardToggle')
);
const clipboardCopySuccessToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationClipboardCopySuccessToggle')
);

// Section elements for showing/hiding based on login status
const bookmarkManagementSection = /** @type {HTMLElement | null} */ (
  document.querySelector('[aria-labelledby="notifications-bookmark-heading"]')
);

const clipboardManagementSection = /** @type {HTMLElement | null} */ (
  document.querySelector('[aria-labelledby="notifications-clipboard-heading"]')
);

/** @type {NotificationPreferences} */
let preferences = clonePreferences(DEFAULT_NOTIFICATION_PREFERENCES);

/**
 * Create a deep clone of the provided preferences.
 * @param {NotificationPreferences} value
 * @returns {NotificationPreferences}
 */
function clonePreferences(value) {
  return {
    enabled: Boolean(value.enabled),
    bookmark: {
      enabled: Boolean(value.bookmark.enabled),
      unsortedSaved: Boolean(value.bookmark.unsortedSaved)
    },
    clipboard: {
      enabled: Boolean(value.clipboard?.enabled),
      copySuccess: Boolean(value.clipboard?.copySuccess)
    }
  };
}

function normalizePreferences(value) {
  const fallback = clonePreferences(DEFAULT_NOTIFICATION_PREFERENCES);
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw = /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings>, clipboard?: Partial<NotificationClipboardSettings> }} */ (value);
  const bookmark = raw.bookmark ?? {};
  const clipboard = raw.clipboard ?? {};

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    bookmark: {
      enabled: typeof bookmark.enabled === 'boolean' ? bookmark.enabled : fallback.bookmark.enabled,
      unsortedSaved: typeof bookmark.unsortedSaved === 'boolean'
        ? bookmark.unsortedSaved
        : fallback.bookmark.unsortedSaved
    },
    clipboard: {
      enabled: typeof clipboard.enabled === 'boolean' ? clipboard.enabled : fallback.clipboard.enabled,
      copySuccess: typeof clipboard.copySuccess === 'boolean'
        ? clipboard.copySuccess
        : fallback.clipboard.copySuccess
    }
  };
}


/**
 * Read notification preferences from chrome.storage.
 * @returns {Promise<NotificationPreferences>}
 */
async function loadPreferences() {
  if (!chrome?.storage?.local) {
    return clonePreferences(DEFAULT_NOTIFICATION_PREFERENCES);
  }

  const result = await chrome.storage.local.get(NOTIFICATION_PREFERENCES_KEY);
  const stored = result?.[NOTIFICATION_PREFERENCES_KEY];
  return normalizePreferences(stored);
}

/**
 * Persist the current preferences into chrome.storage.
 * @returns {Promise<void>}
 */
async function savePreferences() {
  if (!chrome?.storage?.local) {
    return;
  }

  await chrome.storage.local.set({
    [NOTIFICATION_PREFERENCES_KEY]: preferences
  });
}

/**
 * Apply the current preferences to the UI controls.
 * @returns {void}
 */
function applyPreferencesToUI() {
  if (globalToggle) {
    globalToggle.checked = preferences.enabled;
  }
  if (bookmarkToggle) {
    bookmarkToggle.checked = preferences.bookmark.enabled;
  }
  if (bookmarkUnsortedToggle) {
    bookmarkUnsortedToggle.checked = preferences.bookmark.unsortedSaved;
  }
  if (clipboardToggle) {
    clipboardToggle.checked = preferences.clipboard.enabled;
  }
  if (clipboardCopySuccessToggle) {
    clipboardCopySuccessToggle.checked = preferences.clipboard.copySuccess;
  }

  updateToggleDisabledState();
}

/**
 * Update the disabled state of dependent toggles.
 * @returns {void}
 */
function updateToggleDisabledState() {
  const bookmarkDisabled = !preferences.enabled;
  const bookmarkChildDisabled = bookmarkDisabled || !preferences.bookmark.enabled;
  const clipboardDisabled = !preferences.enabled;
  const clipboardChildDisabled = clipboardDisabled || !preferences.clipboard.enabled;

  if (bookmarkToggle) {
    bookmarkToggle.disabled = bookmarkDisabled;
    bookmarkToggle.setAttribute('aria-disabled', bookmarkDisabled ? 'true' : 'false');
  }
  if (bookmarkUnsortedToggle) {
    bookmarkUnsortedToggle.disabled = bookmarkChildDisabled;
    bookmarkUnsortedToggle.setAttribute('aria-disabled', bookmarkChildDisabled ? 'true' : 'false');
  }
  if (clipboardToggle) {
    clipboardToggle.disabled = clipboardDisabled;
    clipboardToggle.setAttribute('aria-disabled', clipboardDisabled ? 'true' : 'false');
  }
  if (clipboardCopySuccessToggle) {
    clipboardCopySuccessToggle.disabled = clipboardChildDisabled;
    clipboardCopySuccessToggle.setAttribute('aria-disabled', clipboardChildDisabled ? 'true' : 'false');
  }
}

/**
 * Handle updates triggered by the global toggle.
 * @param {boolean} checked
 * @returns {void}
 */
function handleGlobalToggleChange(checked) {
  preferences.enabled = checked;
  updateToggleDisabledState();
  void savePreferences();
}

/**
 * Handle updates triggered by the bookmark group toggle.
 * @param {boolean} checked
 * @returns {void}
 */
function handleBookmarkToggleChange(checked) {
  preferences.bookmark.enabled = checked;
  updateToggleDisabledState();
  void savePreferences();
}

/**
 * Handle updates triggered by the clipboard group toggle.
 * @param {boolean} checked
 * @returns {void}
 */
function handleClipboardToggleChange(checked) {
  preferences.clipboard.enabled = checked;
  updateToggleDisabledState();
  void savePreferences();
}



/**
 * Initialize listeners for the notification controls.
 * @returns {void}
 */
function attachEventListeners() {
  if (globalToggle) {
    globalToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      handleGlobalToggleChange(target.checked);
    });
  }

  if (bookmarkToggle) {
    bookmarkToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      handleBookmarkToggleChange(target.checked);
    });
  }


  if (bookmarkUnsortedToggle) {
    bookmarkUnsortedToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      preferences.bookmark.unsortedSaved = target.checked;
      void savePreferences();
    });
  }



  if (clipboardToggle) {
    clipboardToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      handleClipboardToggleChange(target.checked);
    });
  }

  if (clipboardCopySuccessToggle) {
    clipboardCopySuccessToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      preferences.clipboard.copySuccess = target.checked;
      void savePreferences();
    });
  }
}

/**
 * Respond to storage updates from other contexts.
 * @returns {void}
 */
function subscribeToStorageChanges() {
  if (!chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    const detail = changes[NOTIFICATION_PREFERENCES_KEY];
    if (!detail) {
      return;
    }

    preferences = normalizePreferences(detail.newValue);
    applyPreferencesToUI();
  });
}

/**
 * Load preferences and prepare the UI.
 * @returns {Promise<void>}
 */
async function initializeNotificationControls() {
  if (!globalToggle || !bookmarkToggle || !bookmarkUnsortedToggle || 
      !clipboardToggle || !clipboardCopySuccessToggle) {
    return;
  }

  preferences = await loadPreferences();
  applyPreferencesToUI();
}

/**
 * Show or hide the bookmark and project management sections based on login status.
 * @param {boolean} isLoggedIn - Whether the user is logged in
 * @returns {void}
 */
export function updateNotificationSectionsVisibility(isLoggedIn) {
  if (bookmarkManagementSection) {
    bookmarkManagementSection.hidden = !isLoggedIn;
  }

  // Clipboard section is always visible, no need to hide/show based on login
}

// Reflect imported/restored preference changes live in the controls
if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    const detail = changes[NOTIFICATION_PREFERENCES_KEY];
    if (!detail) {
      return;
    }

    preferences = normalizePreferences(detail.newValue);
    applyPreferencesToUI();
  });
}

attachEventListeners();
subscribeToStorageChanges();
void initializeNotificationControls();
