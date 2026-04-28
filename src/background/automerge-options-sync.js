/* global chrome */

import * as Automerge from '../libs/automerge@3.2.0-mjs/entrypoints/fullfat_base64_no_warning.js';
import {
  loadValidProviderTokens,
  raindropRequest,
  fetchRaindropItems,
  pushNotification,
} from './mirror.js';

const PROVIDER_ID = 'raindrop';
const SYNC_COLLECTION_TITLE = 'nenya / options sync';
const LEGACY_BACKUP_COLLECTION_TITLE = 'nenya / backup';
const LEGACY_BACKUP_FILE_NAME = 'options_backup.txt';
const SYNC_ITEM_TITLE_PREFIX = 'automerge-options-sync';
const SYNC_CHUNK_DATA_SIZE = 8000;
const STATE_STORAGE_KEY = 'optionsBackupState';
const LOCAL_DOC_STORAGE_KEY = 'automergeOptionsDoc';
const ACTOR_ID_STORAGE_KEY = 'automergeActorId';
const AUTO_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
const DARK_MODE_RULES_KEY = 'darkModeRules';
const BRIGHT_MODE_WHITELIST_KEY = 'brightModeWhitelist';
const BLOCK_ELEMENT_RULES_KEY = 'blockElementRules';
const CUSTOM_CODE_RULES_KEY = 'customCodeRules';
const RUN_CODE_IN_PAGE_RULES_KEY = 'runCodeInPageRules';
const LLM_PROMPTS_KEY = 'llmPrompts';
const AUTO_GOOGLE_LOGIN_RULES_KEY = 'autoGoogleLoginRules';
const PINNED_SHORTCUTS_KEY = 'pinnedShortcuts';
const PINNED_SEARCH_RESULTS_KEY = 'pinnedSearchResults';
const CUSTOM_SEARCH_ENGINES_KEY = 'customSearchEngines';
const NOTION_INTEGRATION_SECRET_KEY = 'notionIntegrationSecret';

export const OPTION_KEYS = [
  ROOT_FOLDER_SETTINGS_KEY,
  AUTO_RELOAD_RULES_KEY,
  DARK_MODE_RULES_KEY,
  BRIGHT_MODE_WHITELIST_KEY,
  BLOCK_ELEMENT_RULES_KEY,
  CUSTOM_CODE_RULES_KEY,
  RUN_CODE_IN_PAGE_RULES_KEY,
  LLM_PROMPTS_KEY,
  AUTO_GOOGLE_LOGIN_RULES_KEY,
  PINNED_SHORTCUTS_KEY,
  PINNED_SEARCH_RESULTS_KEY,
  CUSTOM_SEARCH_ENGINES_KEY,
  NOTION_INTEGRATION_SECRET_KEY,
];

const IDENTITY_ARRAY_KEYS = new Set([
  AUTO_RELOAD_RULES_KEY,
  DARK_MODE_RULES_KEY,
  BRIGHT_MODE_WHITELIST_KEY,
  BLOCK_ELEMENT_RULES_KEY,
  CUSTOM_CODE_RULES_KEY,
  RUN_CODE_IN_PAGE_RULES_KEY,
  LLM_PROMPTS_KEY,
  AUTO_GOOGLE_LOGIN_RULES_KEY,
  PINNED_SHORTCUTS_KEY,
  PINNED_SEARCH_RESULTS_KEY,
  CUSTOM_SEARCH_ENGINES_KEY,
]);

let initialized = false;
let actorId = '';
let localDoc = null;
let applyingRemote = false;
let syncInProgress = null;
let queuedSync = false;
let lastNotificationAt = 0;

/**
 * @typedef {Object} BackupState
 * @property {number | undefined} lastBackupAt
 * @property {number | undefined} lastRestoreAt
 * @property {number | undefined} lastSyncAt
 * @property {number | undefined} lastMergeAt
 * @property {number | undefined} lastRemoteModifiedAt
 * @property {number | undefined} lastDocumentSize
 * @property {number | undefined} lastChunkCount
 * @property {string | undefined} lastError
 * @property {number | undefined} lastErrorAt
 * @property {string | undefined} lastTrigger
 * @property {string | undefined} actorId
 */

/**
 * Create a default sync state.
 * @returns {BackupState}
 */
function createDefaultState() {
  return {
    lastBackupAt: undefined,
    lastRestoreAt: undefined,
    lastSyncAt: undefined,
    lastMergeAt: undefined,
    lastRemoteModifiedAt: undefined,
    lastDocumentSize: undefined,
    lastChunkCount: undefined,
    lastError: undefined,
    lastErrorAt: undefined,
    lastTrigger: undefined,
    actorId: undefined,
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
 * Compare two JSON-compatible values.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Convert an Automerge proxy/value into plain JSON.
 * @param {any} value
 * @returns {any}
 */
function toPlain(value) {
  return clone(value ?? null);
}

/**
 * Generate a stable Automerge-compatible hex actor id.
 * @returns {string}
 */
function generateActorId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encode bytes as Base64.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Decode a Base64 string back to original content.
 * @param {string} value
 * @returns {string}
 */
function decodeCodeContent(value) {
  if (!value) {
    return value;
  }
  try {
    return decodeURIComponent(
      atob(value)
        .split('')
        .map((char) => {
          return '%' + ('00' + char.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(''),
    );
  } catch (_) {
    return value;
  }
}

/**
 * Decode code content in legacy custom code rules.
 * @param {any[]} rules
 * @returns {any[]}
 */
function decodeLegacyCustomCodeRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
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
 * Decode code content in legacy run-code rules.
 * @param {any[]} rules
 * @returns {any[]}
 */
function decodeLegacyRunCodeRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
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
 * Decode Base64 to bytes.
 * @param {string} base64
 * @returns {Uint8Array}
 */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Load the persisted sync state.
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
 * Update the persisted sync state.
 * @param {(draft: BackupState) => void} updater
 * @returns {Promise<BackupState>}
 */
async function updateState(updater) {
  const current = await loadState();
  updater(current);
  const next = { ...createDefaultState(), ...current, actorId };
  await chrome.storage.local.set({ [STATE_STORAGE_KEY]: next });
  return next;
}

/**
 * Get the default value for an option key.
 * @param {string} key
 * @returns {any}
 */
function getDefaultOptionValue(key) {
  if (key === ROOT_FOLDER_SETTINGS_KEY) {
    return {
      [PROVIDER_ID]: {
        parentFolderId: '1',
        rootFolderName: 'Raindrop',
      },
    };
  }
  if (key === NOTION_INTEGRATION_SECRET_KEY) {
    return '';
  }
  return [];
}

/**
 * Normalize an option value for sync storage.
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
function normalizeOptionValue(key, value) {
  if (value === undefined || value === null) {
    return clone(getDefaultOptionValue(key));
  }
  if (key === NOTION_INTEGRATION_SECRET_KEY) {
    return typeof value === 'string' ? value : '';
  }
  if (key === ROOT_FOLDER_SETTINGS_KEY) {
    return value && typeof value === 'object'
      ? clone(value)
      : clone(getDefaultOptionValue(key));
  }
  return Array.isArray(value) ? clone(value) : [];
}

/**
 * Read the extension's current local option values.
 * @returns {Promise<Record<string, any>>}
 */
async function readLocalOptions() {
  const stored = await chrome.storage.local.get(OPTION_KEYS);
  /** @type {Record<string, any>} */
  const options = {};
  OPTION_KEYS.forEach((key) => {
    options[key] = normalizeOptionValue(key, stored?.[key]);
  });
  return options;
}

/**
 * Migrate any older sync-stored option values into local storage once.
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
 * Extract option values from an Automerge document.
 * @param {any} doc
 * @returns {Record<string, any>}
 */
function docToOptions(doc) {
  /** @type {Record<string, any>} */
  const options = {};
  OPTION_KEYS.forEach((key) => {
    options[key] = normalizeOptionValue(key, doc?.[key]);
  });
  return options;
}

/**
 * Return the identity key for array items where possible.
 * @param {string} optionKey
 * @param {any} item
 * @returns {string}
 */
function getItemIdentity(optionKey, item) {
  if (typeof item === 'string') {
    return item;
  }
  if (!item || typeof item !== 'object') {
    return JSON.stringify(item);
  }
  if (typeof item.id === 'string' && item.id) {
    return item.id;
  }
  if (optionKey === PINNED_SEARCH_RESULTS_KEY && typeof item.url === 'string') {
    return item.url;
  }
  if (typeof item.url === 'string' && item.url) {
    return item.url;
  }
  if (typeof item.shortcut === 'string' && item.shortcut) {
    return item.shortcut;
  }
  return JSON.stringify(item);
}

/**
 * Apply one option value into an Automerge draft.
 * @param {any} draft
 * @param {string} key
 * @param {any} nextValue
 * @returns {void}
 */
function applyOptionToDraft(draft, key, nextValue) {
  const normalizedNext = normalizeOptionValue(key, nextValue);
  if (!IDENTITY_ARRAY_KEYS.has(key) || !Array.isArray(normalizedNext)) {
    if (!deepEqual(toPlain(draft[key]), normalizedNext)) {
      draft[key] = normalizedNext;
    }
    return;
  }

  if (!Array.isArray(draft[key])) {
    draft[key] = [];
  }

  const list = draft[key];
  const nextById = new Map();
  const nextOrdered = [];
  normalizedNext.forEach((item) => {
    const id = getItemIdentity(key, item);
    if (!nextById.has(id)) {
      nextOrdered.push(item);
    }
    nextById.set(id, item);
  });

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const id = getItemIdentity(key, list[i]);
    if (!nextById.has(id)) {
      list.splice(i, 1);
    }
  }

  nextOrdered.forEach((item) => {
    const id = getItemIdentity(key, item);
    const existingIndex = list.findIndex(
      (candidate) => getItemIdentity(key, candidate) === id,
    );
    if (existingIndex === -1) {
      list.push(clone(item));
      return;
    }
    if (!deepEqual(toPlain(list[existingIndex]), item)) {
      list[existingIndex] = clone(item);
    }
  });
}

/**
 * Ensure metadata exists in a document.
 * @param {any} doc
 * @param {string} trigger
 * @returns {any}
 */
function touchDocMeta(doc, trigger) {
  return Automerge.change(doc, 'update sync metadata', (draft) => {
    if (!draft._meta || typeof draft._meta !== 'object') {
      draft._meta = { version: 2, devices: {} };
    }
    draft._meta.version = 2;
    if (!draft._meta.devices || typeof draft._meta.devices !== 'object') {
      draft._meta.devices = {};
    }
    draft._meta.devices[actorId] = {
      lastSeen: Date.now(),
      trigger,
    };
  });
}

/**
 * Apply a full options snapshot to the local Automerge document.
 * @param {Record<string, any>} options
 * @param {string} message
 * @returns {Promise<void>}
 */
async function applyOptionsToLocalDoc(options, message) {
  await initializeAutomergeOptionsSync();
  localDoc = Automerge.change(localDoc, message, (draft) => {
    OPTION_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(options, key),
    ).forEach((key) => {
      applyOptionToDraft(draft, key, options[key]);
    });
  });
  localDoc = touchDocMeta(localDoc, message);
  await persistLocalDoc();
}

/**
 * Persist the local Automerge document into extension local storage.
 * @returns {Promise<void>}
 */
async function persistLocalDoc() {
  if (!localDoc) {
    return;
  }
  const bytes = Automerge.save(localDoc);
  await chrome.storage.local.set({
    [LOCAL_DOC_STORAGE_KEY]: bytesToBase64(bytes),
  });
}

/**
 * Load or create the stable actor id.
 * @returns {Promise<string>}
 */
async function ensureActorId() {
  if (actorId) {
    return actorId;
  }
  const stored = await chrome.storage.local.get(ACTOR_ID_STORAGE_KEY);
  const existing = stored?.[ACTOR_ID_STORAGE_KEY];
  if (typeof existing === 'string' && /^[0-9a-f]+$/i.test(existing)) {
    actorId = existing.toLowerCase();
    return actorId;
  }
  actorId = generateActorId();
  await chrome.storage.local.set({ [ACTOR_ID_STORAGE_KEY]: actorId });
  return actorId;
}

/**
 * Initialize the Automerge options sync service.
 * @returns {Promise<void>}
 */
export async function initializeAutomergeOptionsSync() {
  if (initialized) {
    return;
  }
  await ensureActorId();
  await migrateOptionsToLocal();
  const stored = await chrome.storage.local.get(LOCAL_DOC_STORAGE_KEY);
  const encodedDoc = stored?.[LOCAL_DOC_STORAGE_KEY];
  if (typeof encodedDoc === 'string' && encodedDoc) {
    try {
      localDoc = Automerge.load(base64ToBytes(encodedDoc), actorId);
    } catch (error) {
      console.warn('[options-sync] Failed to load local Automerge doc:', error);
      localDoc = null;
    }
  }

  const localOptions = await readLocalOptions();
  if (!localDoc) {
    localDoc = Automerge.from(localOptions, actorId);
    localDoc = touchDocMeta(localDoc, 'initialize');
    await persistLocalDoc();
  } else {
    initialized = true;
    await applyOptionsToLocalDoc(localOptions, 'refresh local storage snapshot');
    return;
  }

  initialized = true;
}

/**
 * Whether storage changes should currently be ignored because remote data is
 * being applied.
 * @returns {boolean}
 */
export function isApplyingRemoteOptions() {
  return applyingRemote;
}

/**
 * Record local storage changes in the Automerge document.
 * @param {Record<string, chrome.storage.StorageChange>} changes
 * @returns {Promise<void>}
 */
export async function recordLocalOptionChanges(changes) {
  if (applyingRemote) {
    return;
  }
  /** @type {Record<string, any>} */
  const changedOptions = {};
  Object.keys(changes).forEach((key) => {
    if (OPTION_KEYS.includes(key)) {
      changedOptions[key] = changes[key].newValue;
    }
  });
  if (Object.keys(changedOptions).length === 0) {
    return;
  }
  await applyOptionsToLocalDoc(changedOptions, 'local option change');
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
 * Fetch root Raindrop collections.
 * @param {any} tokens
 * @returns {Promise<any[]>}
 */
async function fetchCollections(tokens) {
  const response = await raindropRequest('/collections', tokens);
  return Array.isArray(response?.items) ? response.items : [];
}

/**
 * Ensure a named Raindrop collection exists.
 * @param {any} tokens
 * @param {string} title
 * @returns {Promise<number>}
 */
async function ensureCollection(tokens, title) {
  const collections = await fetchCollections(tokens);
  const existing = collections.find((item) => item.title === title);
  const existingId = getCollectionId(existing);
  if (existingId !== null) {
    return existingId;
  }
  const response = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const createdId = getCollectionId(response?.item);
  if (createdId === null) {
    throw new Error('Unable to prepare Raindrop options sync collection.');
  }
  return createdId;
}

/**
 * Find a named Raindrop collection.
 * @param {any} tokens
 * @param {string} title
 * @returns {Promise<number | null>}
 */
async function findCollection(tokens, title) {
  const collections = await fetchCollections(tokens);
  const existing = collections.find((item) => item.title === title);
  return getCollectionId(existing);
}

/**
 * Fetch all items from a collection.
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
 * Delete sync items from Raindrop.
 * @param {any} tokens
 * @param {number} collectionId
 * @param {number[]} ids
 * @returns {Promise<void>}
 */
async function deleteItems(tokens, collectionId, ids) {
  if (!ids.length) {
    return;
  }
  await raindropRequest('/raindrops/' + collectionId, tokens, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

/**
 * Create or update one Raindrop item.
 * @param {any} tokens
 * @param {number} collectionId
 * @param {any | undefined} existingItem
 * @param {{ title: string, excerpt: string, link: string, tags: string[] }} item
 * @returns {Promise<void>}
 */
async function upsertSyncItem(tokens, collectionId, existingItem, item) {
  const body = {
    title: item.title,
    link: item.link,
    excerpt: item.excerpt,
    tags: item.tags,
    collection: { $id: collectionId },
  };
  if (existingItem) {
    const id = Number(existingItem?._id ?? existingItem?.id);
    await raindropRequest('/raindrop/' + id, tokens, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return;
  }
  await raindropRequest('/raindrop', tokens, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Build a deterministic sync chunk title.
 * @param {string} syncId
 * @param {number} index
 * @returns {string}
 */
function buildChunkTitle(syncId, index) {
  return (
    SYNC_ITEM_TITLE_PREFIX +
    '-' +
    syncId +
    '-chunk-' +
    String(index).padStart(4, '0')
  );
}

/**
 * Parse a sync chunk payload.
 * @param {any} item
 * @returns {{ syncId: string, index: number, total: number, data: string, lastModified: number } | null}
 */
function parseSyncChunk(item) {
  const text = typeof item?.excerpt === 'string'
    ? item.excerpt
    : typeof item?.note === 'string'
      ? item.note
      : '';
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (
      !parsed ||
      parsed.version !== 2 ||
      typeof parsed.syncId !== 'string' ||
      !Number.isInteger(parsed.index) ||
      !Number.isInteger(parsed.total) ||
      typeof parsed.data !== 'string'
    ) {
      return null;
    }
    return {
      syncId: parsed.syncId,
      index: parsed.index,
      total: parsed.total,
      data: parsed.data,
      lastModified: Date.parse(item?.lastUpdate) || 0,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Load the remote Automerge document from Raindrop.
 * @param {any} tokens
 * @param {number} collectionId
 * @returns {Promise<{ doc: any | null, lastModified: number, chunkCount: number }>}
 */
async function loadDocFromRaindrop(tokens, collectionId) {
  const items = await fetchAllCollectionItems(tokens, collectionId);
  const syncItems = items.filter((item) => {
    return (
      typeof item?.title === 'string' &&
      item.title.startsWith(SYNC_ITEM_TITLE_PREFIX)
    );
  });
  if (syncItems.length === 0) {
    return { doc: null, lastModified: 0, chunkCount: 0 };
  }

  const groups = new Map();
  syncItems.forEach((item) => {
    const chunk = parseSyncChunk(item);
    if (!chunk) {
      return;
    }
    if (!groups.has(chunk.syncId)) {
      groups.set(chunk.syncId, []);
    }
    groups.get(chunk.syncId).push(chunk);
  });

  const candidates = Array.from(groups.values())
    .filter((chunks) => {
      if (!chunks.length) {
        return false;
      }
      const total = chunks[0].total;
      if (chunks.some((chunk) => chunk.total !== total)) {
        return false;
      }
      const indices = new Set(chunks.map((chunk) => chunk.index));
      if (indices.size !== total) {
        return false;
      }
      for (let i = 0; i < total; i += 1) {
        if (!indices.has(i)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      const aModified = Math.max(...a.map((chunk) => chunk.lastModified));
      const bModified = Math.max(...b.map((chunk) => chunk.lastModified));
      return bModified - aModified;
    });

  if (candidates.length === 0) {
    throw new Error('Raindrop options sync data is incomplete or corrupted.');
  }

  const chunks = candidates[0].sort((a, b) => a.index - b.index);
  const base64 = chunks.map((chunk) => chunk.data).join('');
  return {
    doc: Automerge.load(base64ToBytes(base64), actorId),
    lastModified: Math.max(...chunks.map((chunk) => chunk.lastModified)),
    chunkCount: chunks.length,
  };
}

/**
 * Save an Automerge document to Raindrop.
 * @param {any} tokens
 * @param {number} collectionId
 * @param {any} doc
 * @returns {Promise<{ documentSize: number, chunkCount: number }>}
 */
async function saveDocToRaindrop(tokens, collectionId, doc) {
  const bytes = Automerge.save(doc);
  const base64 = bytesToBase64(bytes);
  const syncId =
    String(Date.now()) +
    '-' +
    actorId.slice(0, 8) +
    '-' +
    generateActorId().slice(0, 8);
  const chunks = [];
  for (let i = 0; i < base64.length; i += SYNC_CHUNK_DATA_SIZE) {
    chunks.push(base64.slice(i, i + SYNC_CHUNK_DATA_SIZE));
  }
  if (chunks.length === 0) {
    chunks.push('');
  }

  const existingItems = await fetchAllCollectionItems(tokens, collectionId);
  const existingSyncItems = existingItems.filter((item) => {
    return (
      typeof item?.title === 'string' &&
      item.title.startsWith(SYNC_ITEM_TITLE_PREFIX)
    );
  });

  const expectedTitles = new Set();
  for (let index = 0; index < chunks.length; index += 1) {
    const title = buildChunkTitle(syncId, index);
    expectedTitles.add(title);
    const excerpt = JSON.stringify({
      version: 2,
      syncId,
      index,
      total: chunks.length,
      data: chunks[index],
    });
    if (excerpt.length > 10000) {
      throw new Error('Options sync chunk exceeds Raindrop item limit.');
    }
    await upsertSyncItem(tokens, collectionId, undefined, {
      title,
      excerpt,
      link:
        'https://nenya.local/options-sync/' +
        encodeURIComponent(title),
      tags: ['nenya', 'options-sync', 'automerge', 'version:2'],
    });
  }

  const obsoleteIds = existingSyncItems
    .filter((item) => !expectedTitles.has(item.title))
    .map((item) => Number(item?._id ?? item?.id))
    .filter((id) => Number.isFinite(id));
  await deleteItems(tokens, collectionId, obsoleteIds);

  return {
    documentSize: base64.length,
    chunkCount: chunks.length,
  };
}

/**
 * Convert the legacy JSON backup payload into the sync option map.
 * @param {any} payload
 * @returns {Record<string, any> | null}
 */
function legacyPayloadToOptions(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const rootFolder = payload.rootFolder || {};
  return {
    [ROOT_FOLDER_SETTINGS_KEY]: {
      [PROVIDER_ID]: {
        parentFolderId:
          typeof rootFolder.parentFolderId === 'string'
            ? rootFolder.parentFolderId
            : '1',
        rootFolderName:
          typeof rootFolder.rootFolderName === 'string'
            ? rootFolder.rootFolderName
            : 'Raindrop',
      },
    },
    [AUTO_RELOAD_RULES_KEY]: payload.autoReloadRules || [],
    [DARK_MODE_RULES_KEY]: payload.darkModeRules || [],
    [BRIGHT_MODE_WHITELIST_KEY]: payload.brightModeWhitelist || [],
    [BLOCK_ELEMENT_RULES_KEY]: payload.blockElementRules || [],
    [CUSTOM_CODE_RULES_KEY]: decodeLegacyCustomCodeRules(
      payload.customCodeRules || [],
    ),
    [RUN_CODE_IN_PAGE_RULES_KEY]: decodeLegacyRunCodeRules(
      payload.runCodeInPageRules || [],
    ),
    [LLM_PROMPTS_KEY]: payload.llmPrompts || [],
    [AUTO_GOOGLE_LOGIN_RULES_KEY]: payload.autoGoogleLoginRules || [],
    [PINNED_SHORTCUTS_KEY]: payload.pinnedShortcuts || [],
    [PINNED_SEARCH_RESULTS_KEY]: payload.pinnedSearchResults || [],
    [CUSTOM_SEARCH_ENGINES_KEY]: payload.customSearchEngines || [],
    [NOTION_INTEGRATION_SECRET_KEY]:
      typeof payload.notionIntegrationSecret === 'string'
        ? payload.notionIntegrationSecret
        : '',
  };
}

/**
 * Load the old JSON backup file if one exists.
 * @param {any} tokens
 * @returns {Promise<Record<string, any> | null>}
 */
async function loadLegacyBackupOptions(tokens) {
  const collectionId = await findCollection(tokens, LEGACY_BACKUP_COLLECTION_TITLE);
  if (!collectionId) {
    return null;
  }
  const items = await fetchAllCollectionItems(tokens, collectionId);
  const fileItem = items.find((item) => {
    return (
      item.title === LEGACY_BACKUP_FILE_NAME ||
      item.file?.name === LEGACY_BACKUP_FILE_NAME ||
      (item.type === 'link' &&
        typeof item.link === 'string' &&
        item.link.endsWith(LEGACY_BACKUP_FILE_NAME))
    );
  });
  const downloadUrl = fileItem?.file?.link || fileItem?.link;
  if (!downloadUrl) {
    return null;
  }
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    return null;
  }
  const payload = await response.json();
  return legacyPayloadToOptions(payload);
}

/**
 * Merge legacy options and current local options for first CRDT creation.
 * @param {Record<string, any>} legacy
 * @param {Record<string, any>} local
 * @returns {Record<string, any>}
 */
function mergeInitialOptions(legacy, local) {
  /** @type {Record<string, any>} */
  const merged = {};
  OPTION_KEYS.forEach((key) => {
    const localValue = normalizeOptionValue(key, local[key]);
    const legacyValue = normalizeOptionValue(key, legacy[key]);
    if (Array.isArray(localValue) && Array.isArray(legacyValue)) {
      const byId = new Map();
      legacyValue.forEach((item) => byId.set(getItemIdentity(key, item), item));
      localValue.forEach((item) => byId.set(getItemIdentity(key, item), item));
      merged[key] = Array.from(byId.values());
      return;
    }
    if (!deepEqual(localValue, getDefaultOptionValue(key))) {
      merged[key] = localValue;
      return;
    }
    merged[key] = legacyValue;
  });
  return merged;
}

/**
 * Apply merged document data to chrome.storage.local.
 * @param {any} doc
 * @returns {Promise<void>}
 */
async function applyDocToStorage(doc) {
  const options = docToOptions(doc);
  const current = await readLocalOptions();
  /** @type {Record<string, any>} */
  const updates = {};
  OPTION_KEYS.forEach((key) => {
    if (!deepEqual(current[key], options[key])) {
      updates[key] = options[key];
    }
  });
  if (Object.keys(updates).length === 0) {
    return;
  }
  applyingRemote = true;
  try {
    await chrome.storage.local.set(updates);
  } finally {
    setTimeout(() => {
      applyingRemote = false;
    }, 1500);
  }
}

/**
 * Run the sync operation without the concurrency wrapper.
 * @param {{ trigger: string, forceRestore?: boolean, notifyOnError?: boolean }} options
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
async function performSync(options) {
  await initializeAutomergeOptionsSync();
  let tokens;
  try {
    tokens = await loadValidProviderTokens();
  } catch (error) {
    return {
      ok: false,
      errors: [
        'No Raindrop connection found. Connect your account to sync settings.',
      ],
      state: await loadState(),
    };
  }
  if (!tokens) {
    return {
      ok: false,
      errors: ['No Raindrop connection found. Connect your account to sync settings.'],
      state: await loadState(),
    };
  }

  const trigger = options.trigger || 'manual-sync';
  const collectionId = await ensureCollection(tokens, SYNC_COLLECTION_TITLE);
  let remote = await loadDocFromRaindrop(tokens, collectionId);

  if (!remote.doc && !options.forceRestore) {
    const legacyOptions = await loadLegacyBackupOptions(tokens);
    if (legacyOptions) {
      const localOptions = await readLocalOptions();
      const initialOptions = mergeInitialOptions(legacyOptions, localOptions);
      localDoc = Automerge.from(initialOptions, actorId);
      localDoc = touchDocMeta(localDoc, 'legacy migration');
      await applyDocToStorage(localDoc);
      await persistLocalDoc();
    }
  }

  if (options.forceRestore) {
    if (!remote.doc) {
      throw new Error('No remote options sync document found in Raindrop.');
    }
    localDoc = touchDocMeta(remote.doc, 'manual force restore');
    await applyDocToStorage(localDoc);
    await persistLocalDoc();
  } else if (remote.doc) {
    localDoc = Automerge.merge(localDoc, remote.doc);
    localDoc = touchDocMeta(localDoc, trigger);
    await applyDocToStorage(localDoc);
    await persistLocalDoc();
  } else {
    localDoc = touchDocMeta(localDoc, trigger);
    await persistLocalDoc();
  }

  const saveResult = await saveDocToRaindrop(tokens, collectionId, localDoc);
  remote = await loadDocFromRaindrop(tokens, collectionId);
  const now = Date.now();
  const state = await updateState((draft) => {
    draft.lastSyncAt = now;
    draft.lastBackupAt = now;
    draft.lastMergeAt = now;
    draft.lastTrigger = trigger;
    draft.lastRemoteModifiedAt = remote.lastModified || now;
    draft.lastDocumentSize = saveResult.documentSize;
    draft.lastChunkCount = saveResult.chunkCount;
    draft.lastError = undefined;
    draft.lastErrorAt = undefined;
    if (options.forceRestore) {
      draft.lastRestoreAt = now;
    }
  });
  return { ok: true, errors: [], state };
}

/**
 * Sync local options with the Raindrop Automerge document.
 * @param {{ trigger?: string, forceRestore?: boolean, notifyOnError?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function syncOptionsWithRemote(options = {}) {
  if (syncInProgress) {
    if (!options.forceRestore) {
      queuedSync = true;
    }
    await syncInProgress.catch(() => undefined);
  }

  syncInProgress = performSync({
    trigger: options.trigger || 'manual-sync',
    forceRestore: Boolean(options.forceRestore),
    notifyOnError: Boolean(options.notifyOnError),
  })
    .catch(async (error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? 'Unknown error');
      const state = await updateState((draft) => {
        draft.lastError = message;
        draft.lastErrorAt = Date.now();
        draft.lastTrigger = options.trigger || 'manual-sync';
      });
      if (
        options.notifyOnError &&
        Date.now() - lastNotificationAt > AUTO_NOTIFICATION_COOLDOWN_MS
      ) {
        lastNotificationAt = Date.now();
        void pushNotification();
      }
      return { ok: false, errors: [message], state };
    })
    .finally(() => {
      syncInProgress = null;
    });

  const result = await syncInProgress;
  if (queuedSync && !options.forceRestore) {
    queuedSync = false;
    void syncOptionsWithRemote({
      trigger: 'queued',
      notifyOnError: options.notifyOnError,
    });
  }
  return result;
}

/**
 * Reset all synchronized options to defaults.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function resetOptionsToDefaults() {
  await initializeAutomergeOptionsSync();
  /** @type {Record<string, any>} */
  const defaults = {};
  OPTION_KEYS.forEach((key) => {
    defaults[key] = getDefaultOptionValue(key);
  });
  applyingRemote = true;
  try {
    await chrome.storage.local.set(defaults);
  } finally {
    setTimeout(() => {
      applyingRemote = false;
    }, 1500);
  }
  localDoc = Automerge.from(defaults, actorId);
  localDoc = touchDocMeta(localDoc, 'reset defaults');
  await persistLocalDoc();
  const state = await updateState((draft) => {
    draft.lastRestoreAt = Date.now();
    draft.lastError = undefined;
    draft.lastErrorAt = undefined;
  });
  return { ok: true, errors: [], state };
}

/**
 * Get current sync status.
 * @returns {Promise<{ ok: boolean, state: BackupState, loggedIn: boolean }>}
 */
export async function getOptionsSyncStatus() {
  await initializeAutomergeOptionsSync();
  const state = await loadState();
  let tokens;
  try {
    tokens = await loadValidProviderTokens();
  } catch (error) {
    return {
      ok: true,
      state: {
        ...state,
        actorId,
        lastError:
          error instanceof Error
            ? error.message
            : String(error ?? 'Unknown error'),
      },
      loggedIn: false,
    };
  }
  return {
    ok: true,
    state: { ...state, actorId },
    loggedIn: Boolean(tokens),
  };
}
