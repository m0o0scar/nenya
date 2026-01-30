/* global chrome */

import {
  loadValidProviderTokens,
  raindropRequest,
  fetchRaindropItems,
  pushNotification,
} from './mirror.js';
import { debounce } from '../shared/debounce.js';
import {
  getBookmarkFolderPath,
  ensureBookmarkFolderPath,
} from '../shared/bookmarkFolders.js';
import { OPTIONS_BACKUP_MESSAGES } from '../shared/optionsBackupMessages.js';
import { migrateHighlightRules } from '../shared/highlightTextMigration.js';

const PROVIDER_ID = 'raindrop';
const BACKUP_COLLECTION_TITLE = 'nenya / backup';
const BACKUP_FILE_NAME = 'options_backup.txt';

const STATE_STORAGE_KEY = 'optionsBackupState';
const DEFAULT_PARENT_FOLDER_ID = '1';
const DEFAULT_PARENT_PATH = '/Bookmarks Bar';
const DEFAULT_ROOT_FOLDER_NAME = 'Raindrop';

const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
const DARK_MODE_RULES_KEY = 'darkModeRules';
const BRIGHT_MODE_WHITELIST_KEY = 'brightModeWhitelist';
const HIGHLIGHT_TEXT_RULES_KEY = 'highlightTextRules';
const VIDEO_ENHANCEMENT_RULES_KEY = 'videoEnhancementRules';
const BLOCK_ELEMENT_RULES_KEY = 'blockElementRules';
const CUSTOM_CODE_RULES_KEY = 'customCodeRules';
const RUN_CODE_IN_PAGE_RULES_KEY = 'runCodeInPageRules';
const LLM_PROMPTS_KEY = 'llmPrompts';
const URL_PROCESS_RULES_KEY = 'urlProcessRules';
const TITLE_TRANSFORM_RULES_KEY = 'titleTransformRules';
const AUTO_GOOGLE_LOGIN_RULES_KEY = 'autoGoogleLoginRules';
const SCREENSHOT_SETTINGS_KEY = 'screenshotSettings';
const PINNED_SHORTCUTS_KEY = 'pinnedShortcuts';
const PINNED_SEARCH_RESULTS_KEY = 'pinnedSearchResults';
const CUSTOM_SEARCH_ENGINES_KEY = 'customSearchEngines';

const OPTION_KEYS = [
  ROOT_FOLDER_SETTINGS_KEY,
  NOTIFICATION_PREFERENCES_KEY,
  AUTO_RELOAD_RULES_KEY,
  DARK_MODE_RULES_KEY,
  BRIGHT_MODE_WHITELIST_KEY,
  HIGHLIGHT_TEXT_RULES_KEY,
  VIDEO_ENHANCEMENT_RULES_KEY,
  BLOCK_ELEMENT_RULES_KEY,
  CUSTOM_CODE_RULES_KEY,
  RUN_CODE_IN_PAGE_RULES_KEY,
  LLM_PROMPTS_KEY,
  URL_PROCESS_RULES_KEY,
  TITLE_TRANSFORM_RULES_KEY,
  AUTO_GOOGLE_LOGIN_RULES_KEY,
  SCREENSHOT_SETTINGS_KEY,
  PINNED_SHORTCUTS_KEY,
  PINNED_SEARCH_RESULTS_KEY,
  CUSTOM_SEARCH_ENGINES_KEY,
];

const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: true,
  bookmark: {
    enabled: true,
    pullFinished: true,
    unsortedSaved: true,
  },
  project: {
    enabled: true,
    saveProject: true,
    addTabs: true,
    replaceItems: true,
    deleteProject: true,
  },
  clipboard: {
    enabled: true,
    copySuccess: true,
  },
};

let initialized = false;
let isRestoring = false;

/**
 * @typedef {Object} BackupState
 * @property {number | undefined} lastBackupAt
 * @property {number | undefined} lastRestoreAt
 * @property {string | undefined} lastError
 * @property {number | undefined} lastErrorAt
 * @property {number | undefined} lastChunkCount
 */

/**
 * @typedef {Object} RootFolderBackupSettings
 * @property {string} parentFolderId
 * @property {string} parentFolderPath
 * @property {string} rootFolderName
 */

/**
 * @typedef {Object} StoredProviderTokens
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt
 */

/**
 * @typedef {Object} OptionsBackupPayload
 * @property {number} version
 * @property {number} savedAt
 * @property {RootFolderBackupSettings} rootFolder
 * @property {any} notificationPreferences
 * @property {any[]} autoReloadRules
 * @property {any[]} darkModeRules
 * @property {any[]} brightModeWhitelist
 * @property {any[]} highlightTextRules
 * @property {any[]} videoEnhancementRules
 * @property {any[]} blockElementRules
 * @property {any[]} customCodeRules
 * @property {any[]} runCodeInPageRules
 * @property {any[]} llmPrompts
 * @property {any[]} urlProcessRules
 * @property {any[]} titleTransformRules
 * @property {any[]} autoGoogleLoginRules
 * @property {any} screenshotSettings
 * @property {any[]} pinnedShortcuts
 * @property {any[]} pinnedSearchResults
 * @property {any[]} customSearchEngines
 */

/**
 * Create a default backup state.
 * @returns {BackupState}
 */
function createDefaultState() {
  return {
    lastBackupAt: undefined,
    lastRestoreAt: undefined,
    lastError: undefined,
    lastErrorAt: undefined,
    lastChunkCount: undefined,
  };
}

/**
 * Deep clone a JSON-compatible value.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Ensure local storage has values for all option keys by migrating any
 * existing sync-stored values. Sync keys are no longer written to, but we
 * migrate once so users do not lose prior data.
 * @returns {Promise<void>}
 */
async function migrateOptionsToLocal() {
  const [localValues, syncValues] = await Promise.all([
    chrome.storage.local.get(OPTION_KEYS),
    chrome.storage.sync.get(OPTION_KEYS),
  ]);

  /** @type {Record<string, any>} */
  const updates = {};
  OPTION_KEYS.forEach((key) => {
    if (localValues[key] === undefined && syncValues[key] !== undefined) {
      updates[key] = syncValues[key];
    }
  });

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

/**
 * Run one-time initialization (migration).
 * @returns {Promise<void>}
 */
async function ensureInitialized() {
  if (initialized) {
    return;
  }
  await migrateOptionsToLocal();
  initialized = true;
}

/**
 * Load the persisted backup state.
 * @returns {Promise<BackupState>}
 */
async function loadState() {
  const stored = await chrome.storage.local.get(STATE_STORAGE_KEY);
  const state = stored?.[STATE_STORAGE_KEY];
  if (state && typeof state === 'object') {
    return { ...createDefaultState(), ...state };
  }
  return createDefaultState();
}

/**
 * Update the persisted backup state.
 * @param {(draft: BackupState) => void} updater
 * @returns {Promise<BackupState>}
 */
async function updateState(updater) {
  const current = await loadState();
  updater(current);
  const next = { ...createDefaultState(), ...current };
  await chrome.storage.local.set({ [STATE_STORAGE_KEY]: next });
  return next;
}

/**
 * Build a snapshot of all option categories from local storage.
 * @returns {Promise<OptionsBackupPayload>}
 */
async function buildBackupPayload() {
  const stored = await chrome.storage.local.get(OPTION_KEYS);
  const rootMap = stored?.[ROOT_FOLDER_SETTINGS_KEY] || {};
  const providerRoot = rootMap?.[PROVIDER_ID] || {};
  const parentFolderId =
    typeof providerRoot.parentFolderId === 'string' &&
    providerRoot.parentFolderId.trim()
      ? providerRoot.parentFolderId.trim()
      : DEFAULT_PARENT_FOLDER_ID;
  const rootFolderName =
    typeof providerRoot.rootFolderName === 'string' &&
    providerRoot.rootFolderName.trim()
      ? providerRoot.rootFolderName.trim()
      : DEFAULT_ROOT_FOLDER_NAME;

  let parentFolderPath = '';
  try {
    parentFolderPath = await getBookmarkFolderPath(parentFolderId);
  } catch (error) {
    console.warn(
      '[options-backup] Failed to resolve parent folder path:',
      error,
    );
  }
  if (!parentFolderPath) {
    parentFolderPath = DEFAULT_PARENT_PATH;
  }

  /** @type {OptionsBackupPayload} */
  const payload = {
    version: 1,
    savedAt: Date.now(),
    rootFolder: {
      parentFolderId,
      parentFolderPath,
      rootFolderName,
    },
    notificationPreferences:
      stored?.[NOTIFICATION_PREFERENCES_KEY] ||
      clone(DEFAULT_NOTIFICATION_PREFERENCES),
    autoReloadRules: stored?.[AUTO_RELOAD_RULES_KEY] || [],
    darkModeRules: stored?.[DARK_MODE_RULES_KEY] || [],
    brightModeWhitelist: stored?.[BRIGHT_MODE_WHITELIST_KEY] || [],
    highlightTextRules: stored?.[HIGHLIGHT_TEXT_RULES_KEY] || [],
    videoEnhancementRules: stored?.[VIDEO_ENHANCEMENT_RULES_KEY] || [],
    blockElementRules: stored?.[BLOCK_ELEMENT_RULES_KEY] || [],
    customCodeRules: encodeCustomCodeRules(
      stored?.[CUSTOM_CODE_RULES_KEY] || [],
    ),
    runCodeInPageRules: encodeRunCodeInPageRules(
      stored?.[RUN_CODE_IN_PAGE_RULES_KEY] || [],
    ),
    llmPrompts: stored?.[LLM_PROMPTS_KEY] || [],
    urlProcessRules: stored?.[URL_PROCESS_RULES_KEY] || [],
    titleTransformRules: stored?.[TITLE_TRANSFORM_RULES_KEY] || [],
    autoGoogleLoginRules: stored?.[AUTO_GOOGLE_LOGIN_RULES_KEY] || [],
    screenshotSettings: stored?.[SCREENSHOT_SETTINGS_KEY] || {
      autoSave: false,
    },
    pinnedShortcuts: stored?.[PINNED_SHORTCUTS_KEY] || [],
    pinnedSearchResults: stored?.[PINNED_SEARCH_RESULTS_KEY] || [],
    customSearchEngines: stored?.[CUSTOM_SEARCH_ENGINES_KEY] || [],
  };

  return clone(payload);
}

/**
 * Apply a backup payload to local storage, overwriting existing option keys.
 * @param {OptionsBackupPayload} payload
 * @returns {Promise<void>}
 */
async function applyBackupPayload(payload) {
  const rootFolder = payload?.rootFolder || {
    parentFolderId: DEFAULT_PARENT_FOLDER_ID,
    parentFolderPath: DEFAULT_PARENT_PATH,
    rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
  };

  let parentFolderId = '';
  const desiredPath =
    typeof rootFolder.parentFolderPath === 'string'
      ? rootFolder.parentFolderPath.trim()
      : '';
  if (desiredPath) {
    try {
      const ensured = await ensureBookmarkFolderPath(desiredPath);
      if (ensured) {
        parentFolderId = ensured;
      }
    } catch (error) {
      console.warn(
        '[options-backup] Failed to ensure parent folder path during restore:',
        error,
      );
    }
  }
  if (!parentFolderId) {
    const providedId =
      typeof rootFolder.parentFolderId === 'string'
        ? rootFolder.parentFolderId.trim()
        : '';
    parentFolderId = providedId || DEFAULT_PARENT_FOLDER_ID;
  }

  const rootFolderName =
    typeof rootFolder.rootFolderName === 'string' &&
    rootFolder.rootFolderName.trim()
      ? rootFolder.rootFolderName.trim()
      : DEFAULT_ROOT_FOLDER_NAME;

  const existing = await chrome.storage.local.get(ROOT_FOLDER_SETTINGS_KEY);
  const map =
    existing?.[ROOT_FOLDER_SETTINGS_KEY] &&
    typeof existing[ROOT_FOLDER_SETTINGS_KEY] === 'object'
      ? existing[ROOT_FOLDER_SETTINGS_KEY]
      : {};
  map[PROVIDER_ID] = { parentFolderId, rootFolderName };

  // Migrate legacy highlight text rules to new format
  const { rules: migratedHighlightRules } = migrateHighlightRules(
    payload.highlightTextRules || [],
  );

  /** @type {Record<string, any>} */
  const updates = {
    [ROOT_FOLDER_SETTINGS_KEY]: map,
    [NOTIFICATION_PREFERENCES_KEY]:
      payload.notificationPreferences ||
      clone(DEFAULT_NOTIFICATION_PREFERENCES),
    [AUTO_RELOAD_RULES_KEY]: payload.autoReloadRules || [],
    [DARK_MODE_RULES_KEY]: payload.darkModeRules || [],
    [BRIGHT_MODE_WHITELIST_KEY]: payload.brightModeWhitelist || [],
    [HIGHLIGHT_TEXT_RULES_KEY]: migratedHighlightRules,
    [VIDEO_ENHANCEMENT_RULES_KEY]: payload.videoEnhancementRules || [],
    [BLOCK_ELEMENT_RULES_KEY]: payload.blockElementRules || [],
    [CUSTOM_CODE_RULES_KEY]: decodeCustomCodeRules(
      payload.customCodeRules || [],
    ),
    [RUN_CODE_IN_PAGE_RULES_KEY]: decodeRunCodeInPageRules(
      payload.runCodeInPageRules || [],
    ),
    [LLM_PROMPTS_KEY]: payload.llmPrompts || [],
    [URL_PROCESS_RULES_KEY]: payload.urlProcessRules || [],
    [TITLE_TRANSFORM_RULES_KEY]: payload.titleTransformRules || [],
    [AUTO_GOOGLE_LOGIN_RULES_KEY]: payload.autoGoogleLoginRules || [],
    [SCREENSHOT_SETTINGS_KEY]: payload.screenshotSettings || {
      autoSave: false,
    },
    [PINNED_SHORTCUTS_KEY]: payload.pinnedShortcuts || [],
    [PINNED_SEARCH_RESULTS_KEY]: payload.pinnedSearchResults || [],
    [CUSTOM_SEARCH_ENGINES_KEY]: payload.customSearchEngines || [],
  };

  await chrome.storage.local.set(updates);
}

/**
 * Encode a string to Base64 to preserve special characters.
 * @param {string} str
 * @returns {string}
 */
function encodeCodeContent(str) {
  if (!str) {
    return str;
  }
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
        String.fromCharCode(parseInt(p1, 16)),
      ),
    );
  } catch (error) {
    console.warn('[options-backup] Failed to encode code content:', error);
    return str;
  }
}

/**
 * Decode a Base64 string back to original content.
 * @param {string} str
 * @returns {string}
 */
function decodeCodeContent(str) {
  if (!str) {
    return str;
  }
  try {
    return decodeURIComponent(
      atob(str)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch (error) {
    console.warn('[options-backup] Failed to decode code content:', error);
    return str;
  }
}

/**
 * Encode code content in custom code rules.
 * @param {any[]} rules
 * @returns {any[]}
 */
function encodeCustomCodeRules(rules) {
  if (!Array.isArray(rules)) {
    return rules;
  }
  return rules.map((rule) => {
    if (!rule || typeof rule !== 'object') {
      return rule;
    }
    return {
      ...rule,
      css: rule.css ? encodeCodeContent(rule.css) : rule.css,
      js: rule.js ? encodeCodeContent(rule.js) : rule.js,
    };
  });
}

/**
 * Decode code content in custom code rules.
 * @param {any[]} rules
 * @returns {any[]}
 */
function decodeCustomCodeRules(rules) {
  if (!Array.isArray(rules)) {
    return rules;
  }
  return rules.map((rule) => {
    if (!rule || typeof rule !== 'object') {
      return rule;
    }
    return {
      ...rule,
      css: rule.css ? decodeCodeContent(rule.css) : rule.css,
      js: rule.js ? decodeCodeContent(rule.js) : rule.js,
    };
  });
}

/**
 * Encode code content in run code in page rules.
 * @param {any[]} rules
 * @returns {any[]}
 */
function encodeRunCodeInPageRules(rules) {
  if (!Array.isArray(rules)) {
    return rules;
  }
  return rules.map((rule) => {
    if (!rule || typeof rule !== 'object') {
      return rule;
    }
    return {
      ...rule,
      code: rule.code ? encodeCodeContent(rule.code) : rule.code,
    };
  });
}

/**
 * Decode code content in run code in page rules.
 * @param {any[]} rules
 * @returns {any[]}
 */
function decodeRunCodeInPageRules(rules) {
  if (!Array.isArray(rules)) {
    return rules;
  }
  return rules.map((rule) => {
    if (!rule || typeof rule !== 'object') {
      return rule;
    }
    return {
      ...rule,
      code: rule.code ? decodeCodeContent(rule.code) : rule.code,
    };
  });
}

/**
 * Extract a numeric Raindrop collection id.
 * @param {any} collection
 * @returns {number | null}
 */
function getCollectionId(collection) {
  const rawId = collection?._id ?? collection?.id;
  const id = typeof rawId === 'string' ? Number(rawId) : rawId;
  return Number.isFinite(id) ? Number(id) : null;
}

/**
 * Fetch all Raindrop collections.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<any[]>}
 */
async function fetchBackupCollections(tokens) {
  const collectionsResponse = await raindropRequest('/collections', tokens);
  return Array.isArray(collectionsResponse?.items)
    ? collectionsResponse.items
    : [];
}

/**
 * Find the ID of the backup collection.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<{ primaryId: number | null }>}
 */
async function findBackupCollectionIds(tokens) {
  const items = await fetchBackupCollections(tokens);
  const primary = items.find((item) => item.title === BACKUP_COLLECTION_TITLE);
  return {
    primaryId: getCollectionId(primary),
  };
}

/**
 * Ensure the backup collection exists and return its ID.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<number>}
 */
async function ensureBackupCollection(tokens) {
  const { primaryId } = await findBackupCollectionIds(tokens);
  if (primaryId) {
    return primaryId;
  }

  const createResponse = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: BACKUP_COLLECTION_TITLE }),
  });
  const collectionId = getCollectionId(createResponse?.item);
  if (collectionId === null) {
    throw new Error('Unable to prepare Raindrop collection for backups.');
  }
  return collectionId;
}

/**
 * Fetch all items within a collection (all pages).
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @returns {Promise<any[]>}
 */
async function fetchAllCollectionItems(tokens, collectionId) {
  /** @type {any[]} */
  const allItems = [];
  for (let page = 0; page < 50; page += 1) {
    const pageItems = await fetchRaindropItems(tokens, collectionId, page);
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }
    allItems.push(...pageItems);
    if (pageItems.length < 50) { // Using 50 based on fetchRaindropItems
      break;
    }
  }
  return allItems;
}

/**
 * Delete a list of item IDs from a collection.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {number[]} ids
 * @returns {Promise<void>}
 */
async function deleteItems(tokens, collectionId, ids) {
  if (!ids.length) {
    return;
  }
  // Try DELETE first
  const response = await raindropRequest('/raindrops/' + collectionId, tokens, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  // If DELETE failed (modified: 0), try moving to Trash
  if (response && response.modified === 0) {
    await raindropRequest('/raindrops/' + collectionId, tokens, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids,
        collection: { $id: -99 }
      }),
    });
  }
}

/**
 * Upload backup payload as a single file.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {OptionsBackupPayload} payload
 * @returns {Promise<void>}
 */
async function uploadBackupFile(tokens, collectionId, payload) {
  // 1. Delete existing items in the collection
  const existingItems = await fetchAllCollectionItems(tokens, collectionId);
  const existingIds = existingItems
    .map((item) => Number(item?._id ?? item?.id))
    .filter((id) => Number.isFinite(id));
  await deleteItems(tokens, collectionId, existingIds);

  // 2. Upload new file
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('collectionId', String(collectionId));
  formData.append('file', blob, BACKUP_FILE_NAME);

  const response = await raindropRequest('/raindrop/file', tokens, {
    method: 'PUT',
    body: formData,
  });

  // 3. Ensure it is in the correct collection
  const item = response.item;
  if (item) {
    const itemCollectionId = getCollectionId(item.collection);
    if (itemCollectionId !== collectionId) {
      await raindropRequest('/raindrop/' + item._id, tokens, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: { $id: collectionId } }),
      });
    }
  }
}

/**
 * Download and parse backup file from the collection.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @returns {Promise<{ payload: OptionsBackupPayload | null, lastModified: number }>}
 */
async function downloadBackupFile(tokens, collectionId) {
  const items = await fetchAllCollectionItems(tokens, collectionId);
  // Find the file item
  const fileItem = items.find(
    (item) =>
      item.title === BACKUP_FILE_NAME ||
      item.file?.name === BACKUP_FILE_NAME ||
      (item.type === 'link' && item.link.endsWith(BACKUP_FILE_NAME))
  );

  if (!fileItem) {
    return { payload: null, lastModified: 0 };
  }

  const downloadUrl = fileItem.file?.link || fileItem.link;
  if (!downloadUrl) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error('Failed to download backup file');
    }
    const payload = await response.json();
    const lastModified = Date.parse(fileItem.lastUpdate) || Date.now();
    return { payload, lastModified };
  } catch (error) {
    console.warn('[options-backup] Failed to download/parse backup file:', error);
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Execute a manual backup.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runAutomaticRestore() {
  await ensureInitialized();

  // Check if options page is open
  const extensionId = chrome.runtime.id;
  const optionsUrl = `chrome-extension://${extensionId}/src/options/index.html`;
  const tabs = await chrome.tabs.query({ url: optionsUrl });
  if (tabs.length > 0) {
    return;
  }

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return;
  }

  try {
    const { primaryId } = await findBackupCollectionIds(tokens);
    const targetCollectionId = primaryId;

    if (!targetCollectionId) {
      return;
    }

    const { lastModified } = await downloadBackupFile(tokens, targetCollectionId);
    if (!lastModified) {
      return;
    }
    const state = await loadState();
    if (state.lastBackupAt && state.lastBackupAt >= lastModified) {
      return;
    }
    await runManualRestore();
  } catch (error) {
    console.warn('[options-backup] Automatic restore failed:', error);
  }
}

/**
 * Execute a startup sync comparing local and Raindrop versions.
 * @returns {Promise<void>}
 */
export async function runStartupSync() {
  await ensureInitialized();

  // Check if options page is open
  const extensionId = chrome.runtime.id;
  const optionsUrl = `chrome-extension://${extensionId}/src/options/index.html`;
  const tabs = await chrome.tabs.query({ url: optionsUrl });
  if (tabs.length > 0) {
    return;
  }

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return;
  }

  try {
    const { primaryId } = await findBackupCollectionIds(tokens);

    let raindropLastModified = 0;

    // Check primary
    if (primaryId) {
       const res = await downloadBackupFile(tokens, primaryId);
       raindropLastModified = res.lastModified;
    }

    const state = await loadState();
    const localLastBackupAt = state.lastBackupAt || 0;

    if (raindropLastModified > localLastBackupAt || localLastBackupAt === 0) {
      // If Raindrop is newer, or local has no timestamp (considered old version)
      await runManualRestore();
    } else if (localLastBackupAt > raindropLastModified) {
      // If local is newer
      await runManualBackup();
    }
  } catch (error) {
    console.warn('[options-backup] Startup sync failed:', error);
  }
}

/**
 * Execute a manual backup.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runManualBackup() {
  await ensureInitialized();

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return {
      ok: false,
      errors: [
        'No Raindrop connection found. Connect your account to back up settings.',
      ],
      state: await loadState(),
    };
  }

  try {
    const collectionId = await ensureBackupCollection(tokens);
    const payload = await buildBackupPayload();

    await uploadBackupFile(tokens, collectionId, payload);

    const state = await updateState((draft) => {
      draft.lastBackupAt = Date.now();
      draft.lastError = undefined;
      draft.lastErrorAt = undefined;
      draft.lastChunkCount = 1; // It is 1 file now
    });

    return { ok: true, errors: [], state };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const state = await updateState((draft) => {
      draft.lastError = message;
      draft.lastErrorAt = Date.now();
    });
    return {
      ok: false,
      errors: [message],
      state,
    };
  }
}

/**
 * Execute a manual restore.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runManualRestore() {
  await ensureInitialized();

  isRestoring = true;
  const resetRestoring = () => {
    setTimeout(() => {
      isRestoring = false;
    }, 2000);
  };

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return {
      ok: false,
      errors: [
        'No Raindrop connection found. Connect your account to restore settings.',
      ],
      state: await loadState(),
    };
  }

  try {
    const { primaryId } = await findBackupCollectionIds(tokens);

    let payload = null;
    let lastModified = 0;

    // Try primary
    if (primaryId) {
      const res = await downloadBackupFile(tokens, primaryId);
      payload = res.payload;
      lastModified = res.lastModified;
    }

    if (!payload) {
      const state = await updateState((draft) => {
        draft.lastError = 'No backup found in Raindrop.';
        draft.lastErrorAt = Date.now();
      });
      resetRestoring();
      return {
        ok: false,
        errors: ['No backup found in Raindrop.'],
        state,
      };
    }

    await applyBackupPayload(payload);
    const state = await updateState((draft) => {
      draft.lastRestoreAt = Date.now();
      draft.lastError = undefined;
      draft.lastErrorAt = undefined;
      if (lastModified > 0) {
        draft.lastBackupAt = lastModified;
      }
    });
    resetRestoring();
    return { ok: true, errors: [], state };
  } catch (error) {
    resetRestoring();
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const state = await updateState((draft) => {
      draft.lastError = message;
      draft.lastErrorAt = Date.now();
    });
    return {
      ok: false,
      errors: [message],
      state,
    };
  }
}

/**
 * Reset configurable options to defaults and clear backup state errors.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function resetOptionsToDefaults() {
  await ensureInitialized();

  isRestoring = true;
  const resetRestoring = () => {
    setTimeout(() => {
      isRestoring = false;
    }, 2000);
  };

  await chrome.storage.local.set({
    [ROOT_FOLDER_SETTINGS_KEY]: {
      [PROVIDER_ID]: {
        parentFolderId: DEFAULT_PARENT_FOLDER_ID,
        rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
      },
    },
    [NOTIFICATION_PREFERENCES_KEY]: clone(DEFAULT_NOTIFICATION_PREFERENCES),
    [AUTO_RELOAD_RULES_KEY]: [],
    [DARK_MODE_RULES_KEY]: [],
    [BRIGHT_MODE_WHITELIST_KEY]: [],
    [HIGHLIGHT_TEXT_RULES_KEY]: [],
    [VIDEO_ENHANCEMENT_RULES_KEY]: [],
    [BLOCK_ELEMENT_RULES_KEY]: [],
    [CUSTOM_CODE_RULES_KEY]: [],
    [RUN_CODE_IN_PAGE_RULES_KEY]: [],
    [LLM_PROMPTS_KEY]: [],
    [URL_PROCESS_RULES_KEY]: [],
    [TITLE_TRANSFORM_RULES_KEY]: [],
    [AUTO_GOOGLE_LOGIN_RULES_KEY]: [],
    [SCREENSHOT_SETTINGS_KEY]: { autoSave: false },
    [PINNED_SHORTCUTS_KEY]: [],
  });

  const state = await updateState((draft) => {
    draft.lastRestoreAt = Date.now();
    draft.lastError = undefined;
    draft.lastErrorAt = undefined;
  });

  resetRestoring();
  return { ok: true, errors: [], state };
}

/**
 * Retrieve the latest backup status snapshot.
 * @returns {Promise<{ ok: boolean, state: BackupState, loggedIn: boolean }>}
 */
export async function getBackupStatus() {
  await ensureInitialized();
  const [tokens, state] = await Promise.all([
    loadValidProviderTokens(),
    loadState(),
  ]);
  return {
    ok: true,
    state,
    loggedIn: Boolean(tokens),
  };
}

/**
 * Handle incoming runtime messages related to options backup.
 * @param {{ type?: string }} message
 * @param {(response?: any) => void} sendResponse
 * @returns {boolean}
 */
export function handleOptionsBackupMessage(message, sendResponse) {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  switch (message.type) {
    case OPTIONS_BACKUP_MESSAGES.STATUS: {
      void getBackupStatus()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.BACKUP_NOW: {
      void runManualBackup()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errors: [
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
            ],
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESTORE_NOW: {
      void runManualRestore()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errors: [
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
            ],
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESET_DEFAULTS: {
      void resetOptionsToDefaults()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
          }),
        );
      return true;
    }
    default:
      return false;
  }
}

/**
 * Initialize backup service (currently only runs migration).
 * @returns {Promise<void>}
 */
export async function initializeOptionsBackupService() {
  await ensureInitialized();
  setupAutoBackupListener();
}

/**
 * Set up a listener for option changes to trigger auto-backup.
 * @returns {void}
 */
function setupAutoBackupListener() {
  const debouncedBackup = debounce(() => {
    void runManualBackup().catch((error) => {
      console.warn('[options-backup] Auto-backup failed:', error);
    });
  }, 5000); // 5 second debounce for background auto-backup

  chrome.storage.local.onChanged.addListener((changes) => {
    if (isRestoring) {
      return;
    }

    const keys = Object.keys(changes);
    if (keys.length === 1 && keys[0] === STATE_STORAGE_KEY) {
      return;
    }

    // Check if any changed key is in OPTION_KEYS
    const hasOptionChanges = keys.some((key) => OPTION_KEYS.includes(key));
    if (hasOptionChanges) {
      debouncedBackup();
    }
  });
}

/**
 * Lifecycle handler (noop manual backup/restore).
 * @param {string} trigger
 * @returns {Promise<void>}
 */
export async function handleOptionsBackupLifecycle(trigger) {
  await ensureInitialized();
  if (trigger === 'login') {
    const status = await getBackupStatus();
    if (!status.loggedIn) {
      void pushNotification(
        'options-backup',
        'Options backup',
        'Connect Raindrop to enable manual backup and restore.',
        'nenya://options',
      );
    } else {
      // If logged in, force a restore to ensure settings are synced
      void runManualRestore().catch((error) => {
        console.warn('[options-backup] Restore after login failed:', error);
      });
    }
  }
}
