/* global chrome */

import {
  loadValidProviderTokens,
  raindropRequest,
  fetchRaindropItems,
} from './mirror.js';
import { debounce } from '../shared/debounce.js';
import { normalizePinnedSearchResults } from '../shared/pinnedSearchResults.js';

const BACKUP_COLLECTION_TITLE = 'nenya / pinned search results';
const BACKUP_FILE_NAME = 'pinned_search_results.json';
const PINNED_SEARCH_RESULTS_STORAGE_KEY = 'pinnedSearchResults';
const STATE_STORAGE_KEY = 'pinnedSearchResultsBackupState';

let initialized = false;
let isRestoring = false;
let autoBackupListenerInitialized = false;

/**
 * @typedef {Object} BackupState
 * @property {number | undefined} lastBackupAt
 * @property {number | undefined} lastRestoreAt
 * @property {string | undefined} lastError
 * @property {number | undefined} lastErrorAt
 * @property {number | undefined} lastChunkCount
 */

/**
 * @typedef {Object} PinnedSearchResultsBackupPayload
 * @property {number} version
 * @property {number} savedAt
 * @property {Array<{title: string, url: string, type: string}>} pinnedSearchResults
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
 * Load persisted backup state.
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
 * Update persisted backup state.
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
 * Run one-time initialization.
 * @returns {Promise<void>}
 */
async function ensureInitialized() {
  if (initialized) {
    return;
  }
  initialized = true;
}

/**
 * Build a backup payload from local storage.
 * @returns {Promise<PinnedSearchResultsBackupPayload>}
 */
async function buildBackupPayload() {
  const stored = await chrome.storage.local.get(PINNED_SEARCH_RESULTS_STORAGE_KEY);
  return {
    version: 1,
    savedAt: Date.now(),
    pinnedSearchResults: normalizePinnedSearchResults(
      stored?.[PINNED_SEARCH_RESULTS_STORAGE_KEY],
    ),
  };
}

/**
 * Extract pinned search results from an incoming payload.
 * @param {unknown} payload
 * @returns {Array<{title: string, url: string, type: string}>}
 */
function readPinnedSearchResultsFromPayload(payload) {
  if (Array.isArray(payload)) {
    return normalizePinnedSearchResults(payload);
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const backupPayload =
    /** @type {{ pinnedSearchResults?: unknown }} */ (payload);
  return normalizePinnedSearchResults(backupPayload.pinnedSearchResults);
}

/**
 * Apply a backup payload to local storage.
 * @param {unknown} payload
 * @returns {Promise<void>}
 */
async function applyBackupPayload(payload) {
  await chrome.storage.local.set({
    [PINNED_SEARCH_RESULTS_STORAGE_KEY]: readPinnedSearchResultsFromPayload(
      payload,
    ),
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
 * @param {any} tokens
 * @returns {Promise<any[]>}
 */
async function fetchBackupCollections(tokens) {
  const collectionsResponse = await raindropRequest('/collections', tokens);
  return Array.isArray(collectionsResponse?.items)
    ? collectionsResponse.items
    : [];
}

/**
 * Find the ID of the pinned search results backup collection.
 * @param {any} tokens
 * @returns {Promise<number | null>}
 */
async function findBackupCollectionId(tokens) {
  const items = await fetchBackupCollections(tokens);
  const collection = items.find((item) => item.title === BACKUP_COLLECTION_TITLE);
  return getCollectionId(collection);
}

/**
 * Ensure the pinned search results backup collection exists.
 * @param {any} tokens
 * @returns {Promise<number>}
 */
async function ensureBackupCollection(tokens) {
  const existingId = await findBackupCollectionId(tokens);
  if (existingId) {
    return existingId;
  }

  const createResponse = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: BACKUP_COLLECTION_TITLE }),
  });
  const collectionId = getCollectionId(createResponse?.item);
  if (collectionId === null) {
    throw new Error(
      'Unable to prepare Raindrop collection for pinned search results.',
    );
  }
  return collectionId;
}

/**
 * Fetch all items in a collection across pages.
 * @param {any} tokens
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
    if (pageItems.length < 50) {
      break;
    }
  }
  return allItems;
}

/**
 * Delete a list of item IDs from a collection.
 * @param {any} tokens
 * @param {number} collectionId
 * @param {number[]} ids
 * @returns {Promise<void>}
 */
async function deleteItems(tokens, collectionId, ids) {
  if (!ids.length) {
    return;
  }

  const response = await raindropRequest('/raindrops/' + collectionId, tokens, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  if (response && response.modified === 0) {
    await raindropRequest('/raindrops/' + collectionId, tokens, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids,
        collection: { $id: -99 },
      }),
    });
  }
}

/**
 * Upload the pinned search results payload as a single file.
 * @param {any} tokens
 * @param {number} collectionId
 * @param {PinnedSearchResultsBackupPayload} payload
 * @returns {Promise<void>}
 */
async function uploadBackupFile(tokens, collectionId, payload) {
  const existingItems = await fetchAllCollectionItems(tokens, collectionId);
  const existingIds = existingItems
    .map((item) => Number(item?._id ?? item?.id))
    .filter((id) => Number.isFinite(id));
  await deleteItems(tokens, collectionId, existingIds);

  const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('collectionId', String(collectionId));
  formData.append('file', blob, BACKUP_FILE_NAME);

  const response = await raindropRequest('/raindrop/file', tokens, {
    method: 'PUT',
    body: formData,
  });

  const item = response?.item;
  if (!item) {
    return;
  }

  const itemCollectionId = getCollectionId(item.collection);
  if (itemCollectionId !== collectionId) {
    await raindropRequest('/raindrop/' + item._id, tokens, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: { $id: collectionId } }),
    });
  }
}

/**
 * Download and parse the pinned search results backup file.
 * @param {any} tokens
 * @param {number} collectionId
 * @returns {Promise<{ payload: unknown, lastModified: number }>}
 */
async function downloadBackupFile(tokens, collectionId) {
  const items = await fetchAllCollectionItems(tokens, collectionId);
  const fileItem = items.find(
    (item) =>
      item.title === BACKUP_FILE_NAME ||
      item.file?.name === BACKUP_FILE_NAME ||
      (item.type === 'link' &&
        typeof item.link === 'string' &&
        item.link.endsWith(BACKUP_FILE_NAME)),
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
      throw new Error('Failed to download pinned search results backup.');
    }
    const payload = await response.json();
    const lastModified = Date.parse(fileItem.lastUpdate) || Date.now();
    return { payload, lastModified };
  } catch (error) {
    console.warn(
      '[pinned-search-results-backup] Failed to download or parse backup:',
      error,
    );
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Execute a backup for pinned search results.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runPinnedSearchResultsManualBackup() {
  await ensureInitialized();

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return {
      ok: false,
      errors: [
        'No Raindrop connection found. Connect your account to back up pinned search results.',
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
      draft.lastChunkCount = 1;
    });

    return { ok: true, errors: [], state };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const state = await updateState((draft) => {
      draft.lastError = message;
      draft.lastErrorAt = Date.now();
    });
    return { ok: false, errors: [message], state };
  }
}

/**
 * Execute a restore for pinned search results.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runPinnedSearchResultsManualRestore() {
  await ensureInitialized();

  isRestoring = true;
  const resetRestoring = () => {
    setTimeout(() => {
      isRestoring = false;
    }, 2000);
  };

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    resetRestoring();
    return {
      ok: false,
      errors: [
        'No Raindrop connection found. Connect your account to restore pinned search results.',
      ],
      state: await loadState(),
    };
  }

  try {
    const collectionId = await findBackupCollectionId(tokens);
    if (!collectionId) {
      const state = await updateState((draft) => {
        draft.lastError = 'No pinned search results backup found in Raindrop.';
        draft.lastErrorAt = Date.now();
      });
      resetRestoring();
      return {
        ok: false,
        errors: ['No pinned search results backup found in Raindrop.'],
        state,
      };
    }

    const { payload, lastModified } = await downloadBackupFile(tokens, collectionId);
    if (!payload) {
      const state = await updateState((draft) => {
        draft.lastError = 'No pinned search results backup found in Raindrop.';
        draft.lastErrorAt = Date.now();
      });
      resetRestoring();
      return {
        ok: false,
        errors: ['No pinned search results backup found in Raindrop.'],
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
    return { ok: false, errors: [message], state };
  }
}

/**
 * Execute an automatic restore check.
 * @returns {Promise<void>}
 */
export async function runPinnedSearchResultsAutomaticRestore() {
  await ensureInitialized();

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return;
  }

  try {
    const collectionId = await findBackupCollectionId(tokens);
    if (!collectionId) {
      return;
    }

    const { lastModified } = await downloadBackupFile(tokens, collectionId);
    if (!lastModified) {
      return;
    }

    const state = await loadState();
    if (state.lastBackupAt && state.lastBackupAt >= lastModified) {
      return;
    }

    await runPinnedSearchResultsManualRestore();
  } catch (error) {
    console.warn(
      '[pinned-search-results-backup] Automatic restore failed:',
      error,
    );
  }
}

/**
 * Execute startup sync for pinned search results.
 * @returns {Promise<void>}
 */
export async function runPinnedSearchResultsStartupSync() {
  await ensureInitialized();

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return;
  }

  try {
    const collectionId = await findBackupCollectionId(tokens);
    let raindropLastModified = 0;

    if (collectionId) {
      const result = await downloadBackupFile(tokens, collectionId);
      raindropLastModified = result.lastModified;
    }

    const state = await loadState();
    const localLastBackupAt = state.lastBackupAt || 0;

    if (raindropLastModified > localLastBackupAt || localLastBackupAt === 0) {
      await runPinnedSearchResultsManualRestore();
    } else if (localLastBackupAt > raindropLastModified) {
      await runPinnedSearchResultsManualBackup();
    }
  } catch (error) {
    console.warn(
      '[pinned-search-results-backup] Startup sync failed:',
      error,
    );
  }
}

/**
 * Restore pinned search results after a successful login.
 * @returns {Promise<void>}
 */
export async function runPinnedSearchResultsRestoreAfterLogin() {
  await ensureInitialized();

  try {
    await runPinnedSearchResultsManualRestore();
  } catch (error) {
    console.warn(
      '[pinned-search-results-backup] Restore after login failed:',
      error,
    );
  }
}

/**
 * Initialize the pinned search results backup service.
 * @returns {Promise<void>}
 */
export async function initializePinnedSearchResultsBackupService() {
  await ensureInitialized();
  if (!autoBackupListenerInitialized) {
    setupAutoBackupListener();
    autoBackupListenerInitialized = true;
  }
}

/**
 * Set up a listener for pinned search result changes.
 * @returns {void}
 */
function setupAutoBackupListener() {
  const debouncedBackup = debounce(() => {
    void runPinnedSearchResultsManualBackup().catch((error) => {
      console.warn(
        '[pinned-search-results-backup] Auto-backup failed:',
        error,
      );
    });
  }, 5000);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || isRestoring) {
      return;
    }

    const keys = Object.keys(changes);
    if (keys.length === 1 && keys[0] === STATE_STORAGE_KEY) {
      return;
    }

    if (keys.includes(PINNED_SEARCH_RESULTS_STORAGE_KEY)) {
      debouncedBackup();
    }
  });
}
