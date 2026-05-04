/* global chrome */

/**
 * @typedef {Object} StoredProviderTokens
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt
 */

/**
 * @typedef {Object} RootFolderSettings
 * @property {string} parentFolderId
 * @property {string} rootFolderName
 */

/**
 * @typedef {Object} BookmarkFolderInfo
 * @property {string} id
 * @property {string} parentId
 * @property {string} title
 * @property {string[]} pathSegments
 * @property {number} depth
 */

/**
 * @typedef {Object} BookmarkNodeIndex
 * @property {Map<string, BookmarkFolderInfo>} folders
 * @property {Map<string, BookmarkFolderInfo[]>} childrenByParent
 * @property {Map<string, BookmarkEntry>} bookmarks
 * @property {Map<string, BookmarkEntry[]>} bookmarksByUrl
 */

/**
 * @typedef {Object} BookmarkEntry
 * @property {string} id
 * @property {string} parentId
 * @property {string} title
 * @property {string} url
 * @property {string[]} pathSegments
 */

/**
 * @typedef {Object} MirrorStats
 * @property {number} foldersCreated
 * @property {number} foldersRemoved
 * @property {number} foldersMoved
 * @property {number} bookmarksCreated
 * @property {number} bookmarksUpdated
 * @property {number} bookmarksMoved
 * @property {number} bookmarksDeleted
 */

/**
 * @typedef {Object} NotificationBookmarkSettings
 * @property {boolean} enabled
 * @property {boolean} pullFinished
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

/**
 * @typedef {Object} SaveUnsortedEntry
 * @property {string} url
 * @property {string} [title]
 * @property {string} [excerpt]
 * @property {string} [cover]
 * @property {boolean} [includeScreenshot]
 * @property {number} [tabId]
 * @property {number} [windowId]
 */

/**
 * @typedef {Object} SaveUnsortedResult
 * @property {boolean} ok
 * @property {number} created
 * @property {number} updated
 * @property {number} skipped
 * @property {number} failed
 * @property {number} total
 * @property {string[]} errors
 * @property {string} [error]
 */

/**
 * @typedef {Object} MirrorContext
 * @property {string} rootFolderId
 * @property {string} unsortedFolderId
 * @property {Map<number, string>} collectionFolderMap
 * @property {BookmarkNodeIndex} index
 */

/**
 * @typedef {Object} BadgeAnimationHandle
 * @property {() => void} stop
 * @property {number} token
 */

import {
  getValidTokens,
  TOKEN_VALIDATION_MESSAGE,
} from '../shared/tokenRefresh.js';
import { getSnapshots } from './tab-snapshots.js';

export {
  concludeActionBadge,
  setActionBadge,
  pushNotification,
  raindropRequest,
  loadValidProviderTokens,
  normalizeFolderTitle,
  normalizeBookmarkTitle,
  normalizeHttpUrl,
  buildRaindropCollectionUrl,
  handleTokenValidationMessage,
  fetchRaindropItems,
  handleRaindropSearch,
  isPromiseLike,
  ensureNenyaSessionsCollection,
  handleFetchSessions,
  handleFetchSessionDetails,
  handleRestoreSession,
  ensureDeviceCollectionAndExport,
  handleSessionExportAlarm,
  handleUpdateSessionName,
  handleDeleteSession,
  handleUploadCollectionCover,
  handleSetCurrentSessionIconPreference,
  handleOpenAllItemsInCollection,
  fetchAllItemsInCollection,
  handleUpdateRaindropUrl,
};

// ... (skipping some lines)

/**
 * Unwrap an internal URL from nenya.local format.
 * @param {string} url
 * @returns {string}
 */
function unwrapInternalUrl(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  if (url.startsWith('https://nenya.local/tab?url=')) {
    try {
      const parsed = new URL(url);
      const originalUrl = parsed.searchParams.get('url');
      return originalUrl || url;
    } catch (e) {
      return url;
    }
  }

  return url;
}

/**
 * Get metadata stored in a Raindrop item's excerpt or note.
 * Prefers 'excerpt' as per user request for searchability.
 * @param {object} item
 * @returns {object}
 */
function getItemMetadata(item) {
  // Try excerpt first
  if (item.excerpt) {
    try {
      const data = JSON.parse(item.excerpt);
      if (data && typeof data === 'object') return data;
    } catch (e) {
      // ignore
    }
  }
  // Fallback to note
  if (item.note) {
    try {
      const data = JSON.parse(item.note);
      if (data && typeof data === 'object') return data;
    } catch (e) {
      // ignore
    }
  }
  return {};
}

/**
 * Fetch all items in a Raindrop collection, parallelizing requests when possible.
 * @param {number} collectionId
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<any[]>}
 */
async function fetchAllItemsInCollection(collectionId, tokens) {
  // 1. Fetch first page to get metadata (count) and first batch of items
  const firstPageResponse = await raindropRequest(
    `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=0`,
    tokens
  );

  if (!firstPageResponse) {
    return [];
  }

  const items = Array.isArray(firstPageResponse.items) ? [...firstPageResponse.items] : [];
  const totalCount = firstPageResponse.count;

  // If we got fewer items than page size, we are done
  if (items.length < FETCH_PAGE_SIZE) {
    return items;
  }

  // 2. Determine if we can parallelize
  if (typeof totalCount === 'number' && totalCount > items.length) {
    const totalPages = Math.ceil(totalCount / FETCH_PAGE_SIZE);

    // We already have page 0, so fetch 1 to totalPages - 1
    const pageIndices = [];
    for (let i = 1; i < totalPages; i++) {
      pageIndices.push(i);
    }

    // Limit concurrency to avoid hitting rate limits too fast
    const CONCURRENCY_LIMIT = 5;
    const chunks = [];
    for (let i = 0; i < pageIndices.length; i += CONCURRENCY_LIMIT) {
      chunks.push(pageIndices.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(page =>
        raindropRequest(
          `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}`,
          tokens
        )
        .then(response => Array.isArray(response?.items) ? response.items : [])
      );

      const results = await Promise.all(promises);
      results.forEach(pageItems => items.push(...pageItems));
    }

  } else {
    // Fallback to sequential if count is missing or unreliable
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await raindropRequest(
        `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}`,
        tokens
      );
      const pageItems = Array.isArray(response?.items) ? response.items : [];
      items.push(...pageItems);

      if (pageItems.length < FETCH_PAGE_SIZE) {
        hasMore = false;
      } else {
        page += 1;
      }
    }
  }

  return items;
}

/**
 * Fetch and open all items in a Raindrop collection.
 * @param {number} collectionId
 * @param {string} [collectionTitle]
 * @returns {Promise<{success: boolean}>}
 */
async function handleOpenAllItemsInCollection(collectionId, collectionTitle) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  const items = await fetchAllItemsInCollection(collectionId, tokens);

  // Open all links in new tabs (inactive)
  const tabPromises = items
    .filter((item) => item.link)
    .map((item) => {
      const url = unwrapInternalUrl(item.link);
      return chrome.tabs.create({ url, active: false });
    });

  const createdTabs = await Promise.all(tabPromises);
  const tabIds = createdTabs
    .map((tab) => tab.id)
    .filter((id) => id !== undefined);

  if (tabIds.length > 0) {
    const groupId = await /** @type {Promise<number>} */ (
      chrome.tabs.group({ tabIds })
    );

    let title = collectionTitle;
    if (!title) {
      if (collectionId === -1) {
        title = 'Unsorted';
      } else {
        try {
          const collectionResponse = await raindropRequest(
            `/collection/${collectionId}`,
            tokens,
          );
          title = collectionResponse?.item?.title;
        } catch (e) {
          console.warn(
            '[mirror] Failed to fetch collection title for grouping:',
            e,
          );
        }
      }
    }

    if (title) {
      await chrome.tabGroups.update(groupId, { title });
    }
  }

  return { success: true };
}

/**
 * Update the URL of a Raindrop item.
 * @param {number} id - The Raindrop item ID
 * @param {string} url - The new URL
 * @returns {Promise<{success: boolean}>}
 */
async function handleUpdateRaindropUrl(id, url) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }
  if (!id) {
    throw new Error('Invalid Raindrop item ID');
  }

  const finalUrl = isValidRaindropUrl(url) ? url : wrapInternalUrl(url);

  await raindropRequest(`/raindrop/${id}`, tokens, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      link: finalUrl,
    }),
  });

  return { success: true };
}


const PROVIDER_ID = 'raindrop';
const STORAGE_KEY_TOKENS = 'cloudAuthTokens';
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const ITEM_BOOKMARK_MAP_KEY = 'raindropItemBookmarkMap';
const DEFAULT_PARENT_FOLDER_ID = '1';
const DEFAULT_ROOT_FOLDER_NAME = 'Raindrop';
const UNSORTED_TITLE = 'Unsorted';
const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1';
const RAINDROP_UNSORTED_URL = 'https://app.raindrop.io/my/-1';
const RAINDROP_COLLECTION_URL_BASE = 'https://app.raindrop.io/my/';
const BOOKMARK_MANAGER_URL_BASE = 'chrome://bookmarks/?id=';
const FETCH_PAGE_SIZE = 50;
const SESSIONS_COLLECTION_NAME = 'nenya / sessions';
const SESSION_EXPORT_ALARM_NAME = 'nenya-session-export';
const SESSION_EXPORT_INTERVAL_MINUTES = 1;
const BROWSER_ID_STORAGE_KEY = 'browserId';
const SESSION_ICON_PREFERENCES_STORAGE_KEY = 'sessionIconPreferences';
const DEFAULT_BADGE_ANIMATION_DELAY = 300;
const ANIMATION_DOWN_SEQUENCE = ['🔽', '⏬'];
const ANIMATION_UP_SEQUENCE = ['🔼', '⏫'];

/** @type {BadgeAnimationHandle | null} */
let currentBadgeAnimationHandle = null;
let badgeAnimationSequence = 0;
let lastStartedBadgeToken = 0;

/**
 * Set the extension action badge and clear it after an optional timeout.
 * @param {string} text
 * @param {string} color
 * @param {number} [clearAfterMs]
 * @returns {void}
 */
function setActionBadge(text, color, clearAfterMs) {
  if (!chrome?.action) {
    return;
  }

  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });

  if (typeof clearAfterMs === 'number' && clearAfterMs > 0) {
    const token = ++badgeAnimationSequence;
    setTimeout(() => {
      if (badgeAnimationSequence !== token) {
        return;
      }
      chrome.action.setBadgeText({ text: '' });
    }, clearAfterMs);
  }
}

/**
 * Animate the action badge through a short emoji sequence.
 * @param {string[]} sequence
 * @returns {BadgeAnimationHandle}
 */
function animateActionBadge(sequence) {
  const token = ++badgeAnimationSequence;
  lastStartedBadgeToken = token;

  if (currentBadgeAnimationHandle) {
    currentBadgeAnimationHandle.stop();
  }

  let index = 0;
  const tick = () => {
    const nextText =
      Array.isArray(sequence) && sequence.length > 0
        ? sequence[index % sequence.length]
        : '';
    chrome.action.setBadgeText({ text: nextText });
    index += 1;
  };

  tick();
  const intervalId = setInterval(tick, DEFAULT_BADGE_ANIMATION_DELAY);

  const handle = {
    token,
    stop() {
      clearInterval(intervalId);
      if (currentBadgeAnimationHandle === handle) {
        currentBadgeAnimationHandle = null;
      }
    },
  };

  currentBadgeAnimationHandle = handle;
  return handle;
}

/**
 * Finish a badge animation with a final emoji, then clear it.
 * @param {BadgeAnimationHandle | null} handle
 * @param {string} finalEmoji
 * @returns {void}
 */
function concludeActionBadge(handle, finalEmoji) {
  const isLatestStart = !!handle && handle.token === lastStartedBadgeToken;
  const clearToken = ++badgeAnimationSequence;

  if (handle) {
    handle.stop();
  }
  if (!isLatestStart) {
    return;
  }

  chrome.action.setBadgeText({ text: finalEmoji });

  setTimeout(() => {
    if (badgeAnimationSequence !== clearToken) {
      return;
    }
    chrome.action.setBadgeText({ text: '' });
  }, 2000);
}

/**
 * Notifications are intentionally disabled, but the shared helper is kept so
 * existing background call sites do not fail module initialization.
 * @returns {Promise<void>}
 */
async function pushNotification() {
  return;
}

/**
 * Notify about the result of saving URLs to Unsorted.
 * @param {SaveUnsortedResult} summary
 * @returns {Promise<void>}
 */
async function notifyUnsortedSaveOutcome(summary) {
  return;
}

/**
 * Reset stored timestamps and remove the current mirror root folder.
 * @param {{ settings: RootFolderSettings, map: Record<string, RootFolderSettings>, didMutate: boolean }} settingsData
 * @returns {Promise<void>}
 */
export async function resetMirrorState(settingsData) {
  const parentId = await ensureParentFolderAvailable(settingsData);
  const normalizedTitle = normalizeFolderTitle(
    settingsData.settings.rootFolderName,
    DEFAULT_ROOT_FOLDER_NAME,
  );
  if (normalizedTitle !== settingsData.settings.rootFolderName) {
    settingsData.settings.rootFolderName = normalizedTitle;
    settingsData.didMutate = true;
  }

  const parentExists = await bookmarkNodeExists(parentId);
  if (parentExists) {
    const existingRoot = await findChildFolderByTitle(
      parentId,
      normalizedTitle,
    );
    if (existingRoot) {
      await bookmarksRemoveTree(existingRoot.id);
    }
  }

  if (settingsData.didMutate) {
    await persistRootFolderSettings(settingsData);
  }
}

/**
 * Save URLs to the Raindrop Unsorted collection.
 * @param {SaveUnsortedEntry[]} entries
 * @param {{ pleaseParse?: boolean, skipUrlProcessing?: boolean, keepEntryTitle?: boolean }} [options]
 * @returns {Promise<SaveUnsortedResult>}
 */
export async function saveUrlsToUnsorted(entries, options = {}) {
  const badgeAnimation = animateActionBadge(ANIMATION_UP_SEQUENCE);
  /** @type {SaveUnsortedResult} */
  const summary = {
    ok: false,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: [],
  };
  const finalize = () => {
    void notifyUnsortedSaveOutcome(summary);
    return summary;
  };

  try {
    if (!Array.isArray(entries)) {
      summary.error = 'No URLs provided.';
      return finalize();
    }

    /** @type {SaveUnsortedEntry[]} */
    const sanitized = [];
    const seenUrls = new Set();

    for (const entry of entries) {
      const rawUrl = typeof entry?.url === 'string' ? entry.url.trim() : '';
      if (!rawUrl) {
        summary.skipped += 1;
        continue;
      }

      const normalizedUrl = normalizeHttpUrl(rawUrl);
      if (!normalizedUrl) {
        summary.skipped += 1;
        continue;
      }

      const finalUrl = normalizedUrl;

      if (seenUrls.has(finalUrl)) {
        summary.skipped += 1;
        continue;
      }

      seenUrls.add(finalUrl);
      sanitized.push({
        url: finalUrl,
        title: typeof entry?.title === 'string' ? entry.title.trim() : '',
        excerpt: typeof entry?.excerpt === 'string' ? entry.excerpt.trim() : '',
        cover:
          typeof entry?.cover === 'string' && entry.cover.trim().length > 0
            ? entry.cover.trim()
            : undefined,
        includeScreenshot: entry?.includeScreenshot,
        tabId: entry?.tabId,
        windowId: entry?.windowId,
      });
    }

    summary.total = sanitized.length;

    if (sanitized.length === 0) {
      summary.error = 'No valid URLs to save.';
      return finalize();
    }

    let tokens;
    try {
      tokens = await loadValidProviderTokens();
    } catch (error) {
      summary.error = error instanceof Error ? error.message : String(error);
      return finalize();
    }

    if (!tokens) {
      summary.error =
        'No Raindrop connection found. Connect in Options to enable saving.';
      return finalize();
    }

    const dedupeResult = await filterExistingRaindropEntries(tokens, sanitized);
    summary.skipped += dedupeResult.skipped;
    summary.failed += dedupeResult.failed;
    if (dedupeResult.errors.length > 0) {
      summary.errors.push(...dedupeResult.errors);
    }

    if (dedupeResult.entries.length === 0) {
      summary.ok = summary.failed === 0;
      if (!summary.ok && !summary.error && summary.errors.length > 0) {
        summary.error = summary.errors[0];
      }
      return finalize();
    }

    const CHUNK_SIZE = 100;
    const chunks = [];
    for (let i = 0; i < dedupeResult.entries.length; i += CHUNK_SIZE) {
      chunks.push(dedupeResult.entries.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of chunks) {
      try {
        const itemsToCreate = chunk.map((entry) => {
          const pleaseParse =
            options.pleaseParse ||
            !entry.title ||
            (!entry.cover && !entry.includeScreenshot);
          return {
            link: entry.url,
            collectionId: -1,
            ...(pleaseParse ? { pleaseParse: {} } : {}),
            ...(entry.cover ? { cover: entry.cover } : {}),
            ...(entry.title ? { title: entry.title } : {}),
            ...(entry.excerpt ? { excerpt: entry.excerpt } : {}),
          };
        });

        const response = await raindropRequest('/raindrops', tokens, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: itemsToCreate }),
        });

        if (!response || typeof response !== 'object' || !Array.isArray(response.items)) {
          throw new Error(
            'Invalid response from Raindrop API: missing items array',
          );
        }

        // Process results sequentially for screenshots
        for (let i = 0; i < response.items.length; i++) {
          const createdItem = response.items[i];
          const entry = chunk[i];

          if (!createdItem || !createdItem._id) {
            summary.failed += 1;
            summary.errors.push(`${entry.url}: Failed to create item (no ID returned)`);
            continue;
          }

          try {
            if (entry.includeScreenshot && entry.tabId && entry.windowId) {
              await chrome.windows.update(entry.windowId, { focused: true });
              await chrome.tabs.update(entry.tabId, { active: true });
              const screenshotDataUrl = await chrome.tabs.captureVisibleTab(
                entry.windowId,
                {
                  format: 'jpeg',
                  quality: 80,
                },
              );
              const blob = await (await fetch(screenshotDataUrl)).blob();
              const formData = new FormData();
              formData.append('cover', blob, 'screenshot.jpg');
              await raindropRequest(
                `/raindrop/${createdItem._id}/cover`,
                tokens,
                {
                  method: 'PUT',
                  body: formData,
                },
              );
            }
            summary.created += 1;
          } catch (error) {
            // Item was created but screenshot failed - count as failure or just log error?
            // Original logic counted as failure if any part failed inside the loop
            summary.failed += 1;
            summary.errors.push(
              entry.url +
              ': Screenshot failed: ' +
              (error instanceof Error ? error.message : String(error)),
            );
          }
        }
      } catch (error) {
        // If the batch request fails, all items in the chunk fail
        for (const entry of chunk) {
          summary.failed += 1;
          summary.errors.push(
            entry.url +
            ': Batch failed: ' +
            (error instanceof Error ? error.message : String(error)),
          );
        }
      }
    }

    summary.ok = summary.failed === 0;
    if (!summary.ok && !summary.error && summary.errors.length > 0) {
      summary.error = summary.errors[0];
    }

    return finalize();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    finalize();
    throw error;
  } finally {
    concludeActionBadge(badgeAnimation, summary.ok ? '✅' : '❌');
  }
}

/**
 * Filter entries that already exist in Raindrop.
 * Note: The search API endpoint (/raindrops/0?search=...) is currently returning 500 errors,
 * so we skip the existence check and let the save API handle duplicates.
 * The save operation will create the raindrop, and we check for duplicate bookmarks locally.
 * @param {StoredProviderTokens} tokens
 * @param {SaveUnsortedEntry[]} entries
 * @returns {Promise<{ entries: SaveUnsortedEntry[], skipped: number, failed: number, errors: string[] }>}
 */
async function filterExistingRaindropEntries(tokens, entries) {
  /** @type {SaveUnsortedEntry[]} */
  const filtered = [];
  let skipped = 0;
  let failed = 0;
  const errors = [];

  // Skip existence check - the search API is returning 500 errors
  // We'll let the save API handle duplicates, and check for duplicate bookmarks locally
  // by comparing URLs against existing bookmarks in the unsorted folder
  filtered.push(...entries);

  return {
    entries: filtered,
    skipped,
    failed,
    errors,
  };
}

/**
 * Determine whether a Raindrop item already exists for the provided URL.
 * @param {StoredProviderTokens} tokens
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function doesRaindropItemExist(tokens, url) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) {
    return false;
  }

  const params = new URLSearchParams({
    perpage: '1',
    page: '0',
    search: 'link:"' + escapeSearchValue(normalized) + '"',
  });

  const data = await raindropRequest(
    '/raindrops/0?' + params.toString(),
    tokens,
  );
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.some((item) => {
    const itemUrl = typeof item?.link === 'string' ? item.link : '';
    return normalizeHttpUrl(itemUrl) === normalized;
  });
}

/**
 * Check if any Raindrop item in a specific collection has the provided URL.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function doesRaindropItemExistInCollection(tokens, collectionId, url) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized || !Number.isFinite(collectionId)) {
    return false;
  }

  const params = new URLSearchParams({
    perpage: '1',
    page: '0',
    search: 'link:"' + escapeSearchValue(normalized) + '"',
  });
  const path = '/raindrops/' + String(collectionId) + '?' + params.toString();
  const data = await raindropRequest(path, tokens);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.some((item) => {
    const itemUrl = typeof item?.link === 'string' ? item.link : '';
    return normalizeHttpUrl(itemUrl) === normalized;
  });
}

/**
 * Escape a string for inclusion in a Raindrop search query.
 * @param {string} value
 * @returns {string}
 */
function escapeSearchValue(value) {
  return value.replace(/(["\\])/g, '\\$1');
}

/**
 * Format the current date and time for the bookmark folder title.
 * @returns {string}
 */
function getTimestampForFolderName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

/**
 * A simple delay utility.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sanitize a bookmark folder title.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function normalizeFolderTitle(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Execute three Raindrop API calls to retrieve sidebar structure.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<{ groups: any[], rootCollections: any[], childCollections: any[] }>}
 */
async function fetchRaindropStructure(tokens) {
  const [userResponse, rootResponse, childResponse] = await Promise.all([
    raindropRequest('/user', tokens),
    raindropRequest('/collections', tokens),
    raindropRequest('/collections/childrens', tokens),
  ]);

  const allCollections = [
    ...(Array.isArray(rootResponse?.items) ? rootResponse.items : []),
    ...(Array.isArray(childResponse?.items) ? childResponse.items : []),
  ];

  const collectionsById = new Map(
    allCollections.map((coll) => [coll._id, coll]),
  );
  const childrenByParentId = new Map();
  allCollections.forEach((coll) => {
    const parentId = coll.parent?.$id;
    if (parentId) {
      if (!childrenByParentId.has(parentId)) {
        childrenByParentId.set(parentId, []);
      }
      childrenByParentId.get(parentId).push(coll._id);
    }
  });

  const noSyncCollectionIds = new Set();
  allCollections.forEach((coll) => {
    if (coll.title.includes('[no sync]')) {
      noSyncCollectionIds.add(coll._id);
    }
  });

  const collectionsToExclude = new Set(noSyncCollectionIds);
  const queue = [...noSyncCollectionIds];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = childrenByParentId.get(currentId);
    if (children) {
      children.forEach((childId) => {
        if (!collectionsToExclude.has(childId)) {
          collectionsToExclude.add(childId);
          queue.push(childId);
        }
      });
    }
  }

  const filterExcluded = (coll) => !collectionsToExclude.has(coll._id);

  const rootCollections = (
    Array.isArray(rootResponse?.items) ? rootResponse.items : []
  ).filter(filterExcluded);
  const childCollections = (
    Array.isArray(childResponse?.items) ? childResponse.items : []
  ).filter(filterExcluded);

  const groups = (
    Array.isArray(userResponse?.user?.groups) ? userResponse.user.groups : []
  ).map((group) => ({
    ...group,
    collections: group.collections.filter(
      (id) => !collectionsToExclude.has(id),
    ),
  }));

  return { groups, rootCollections, childCollections };
}

/**
 * Perform an authenticated Raindrop API request.
 * @param {string} path
 * @param {StoredProviderTokens} tokens
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
async function raindropRequest(path, tokens, init) {
  const url = RAINDROP_API_BASE + path;
  const headers = new Headers(init?.headers ?? {});
  headers.set('Authorization', 'Bearer ' + tokens.accessToken);
  headers.set('Accept', 'application/json');
  // Force no cache for all Raindrop API requests
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  headers.set('Pragma', 'no-cache');

  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      'Raindrop request failed (' +
      response.status +
      '): ' +
      response.statusText,
    );
  }

  const data = await response.json();
  if (data && data.result === false) {
    const errorMessage =
      data.errorMessage ||
      data.error ||
      'Raindrop API returned an error result';
    throw new Error(errorMessage);
  }

  return data;
}

/**
 * Ensure the configured parent folder exists, falling back to the bookmarks bar when necessary.
 * @param {{ settings: RootFolderSettings, map: Record<string, RootFolderSettings>, didMutate: boolean }} settingsData
 * @returns {Promise<string>}
 */
async function ensureParentFolderAvailable(settingsData) {
  const settings = settingsData.settings;
  const existing = await bookmarkNodeExists(settings.parentFolderId);
  if (existing) {
    return settings.parentFolderId;
  }

  settings.parentFolderId = DEFAULT_PARENT_FOLDER_ID;
  settingsData.didMutate = true;
  return settings.parentFolderId;
}

/**
 * Ensure the root mirror folder exists beneath the configured parent.
 * @param {string} parentId
 * @param {string} title
 * @param {MirrorStats} stats
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function ensureRootFolder(parentId, title, stats) {
  const existing = await findChildFolderByTitle(parentId, title);
  if (existing) {
    return existing;
  }

  const created = await bookmarksCreate({
    parentId,
    title,
  });

  stats.foldersCreated += 1;
  return created;
}

/**
 * Determine whether the given value is promise-like.
 * @param {unknown} value
 * @returns {value is PromiseLike<any>}
 */
/**
 * Check if a value is thenable.
 * @param {any} value
 * @returns {boolean}
 */
function isPromiseLike(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'then' in value &&
    typeof value.then === 'function',
  );
}

/**
 * Fetch a page of Raindrop items for a collection.
 * @param {any} tokens
 * @param {number} collectionId
 * @param {number} page
 * @returns {Promise<any[] | null>}
 */
async function fetchRaindropItems(tokens, collectionId, page = 0) {
  try {
    const url = `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}&sort=-created`;
    const response = await raindropRequest(url, tokens);
    return Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    console.warn(
      `[mirror] Failed to fetch Raindrop items for collection ${collectionId} page ${page}:`,
      error,
    );
    return null;
  }
}

/**
 * Search Raindrop items and collections.
 * @param {string} query
 * @returns {Promise<{ items: any[], collections: any[] }>}
 */
async function handleRaindropSearch(query) {
  try {
    const tokens = await loadValidProviderTokens();
    if (!tokens) {
      return { items: [], collections: [] };
    }

    const [itemsResponse, rootCollections, childCollections] =
      await Promise.all([
        raindropRequest(
          `/raindrops/0?search=${encodeURIComponent(query)}&perpage=50&sort=score`,
          tokens,
        ),
        raindropRequest('/collections', tokens),
        raindropRequest('/collections/childrens', tokens),
      ]);

    const items = Array.isArray(itemsResponse?.items)
      ? itemsResponse.items
      : [];
    const allCollections = [
      ...(Array.isArray(rootCollections?.items) ? rootCollections.items : []),
      ...(Array.isArray(childCollections?.items) ? childCollections.items : []),
    ];

    const queryLower = query.toLowerCase();
    const searchTerms = queryLower.split(' ').filter(term => term.length > 0);
    const EXCLUDED_COLLECTION_NAME = 'nenya / options';

    // Identify excluded collection IDs
    const excludedCollectionIds = new Set();
    allCollections.forEach((c) => {
      if (c.title?.toLowerCase() === EXCLUDED_COLLECTION_NAME) {
        excludedCollectionIds.add(c._id);
      }
    });

    // Create a map of collectionId -> title and collectionId -> parentId
    const collectionIdTitleMap = new Map();
    const collectionIdParentMap = new Map();
    allCollections.forEach((c) => {
      if (c._id && c.title) {
        collectionIdTitleMap.set(c._id, c.title);
      }
      if (c._id && c.parent?.$id) {
        collectionIdParentMap.set(c._id, c.parent.$id);
      }
    });
    // Add Unsorted
    collectionIdTitleMap.set(-1, 'Unsorted');

    // Filter items: add collection names AND exclude those in specific collections
    // AND refine URL matching to ignore Raindrop system URLs
    const filteredItems = items
      .filter((item) => {
        // Exclude specific collections
        if (excludedCollectionIds.has(item.collectionId)) {
          return false;
        }

        const title = (item.title || '').toLowerCase();
        const link = (item.link || '').toLowerCase();
        const excerpt = (item.excerpt || '').toLowerCase();
        const tags = Array.isArray(item.tags)
          ? item.tags.map((t) => String(t).toLowerCase())
          : [];

        // If it's a Raindrop system/internal URL, ONLY match against the title
        if (
          link.startsWith('https://api.raindrop.io') ||
          link.startsWith('https://up.raindrop.io')
        ) {
          return searchTerms.every(term => title.includes(term));
        }

        // Otherwise, match against title, excerpt, tags, OR the non-domain part of the URL
        const linkWithoutDomain = link
          .replace('https://raindrop.io', '')
          .replace('http://raindrop.io', '');
        const searchableText = `${title} ${excerpt} ${tags.join(' ')} ${linkWithoutDomain}`;
        return searchTerms.every(term => searchableText.includes(term));
      })
      .map((item) => {
        if (item.collectionId !== undefined) {
          item.collectionTitle = collectionIdTitleMap.get(item.collectionId);
        }
        return item;
      });

    // Sort items: Raindrop system URLs (api/up) to the bottom
    filteredItems.sort((a, b) => {
      const aLink = (a.link || '').toLowerCase();
      const bLink = (b.link || '').toLowerCase();
      const aIsSystem =
        aLink.startsWith('https://api.raindrop.io') ||
        aLink.startsWith('https://up.raindrop.io');
      const bIsSystem =
        bLink.startsWith('https://api.raindrop.io') ||
        bLink.startsWith('https://up.raindrop.io');

      if (aIsSystem && !bIsSystem) return 1;
      if (!aIsSystem && bIsSystem) return -1;
      return 0; // Maintain original relative order (stability)
    });

    // Local filtering for collections: match title AND exclude specific collections
    const filteredCollections = allCollections
      .filter(
        (c) => {
          const collectionTitle = (c.title || '').toLowerCase();
          return collectionTitle !== EXCLUDED_COLLECTION_NAME &&
            searchTerms.every(term => collectionTitle.includes(term));
        },
      )
      .map((c) => {
        const parentId = collectionIdParentMap.get(c._id);
        if (parentId !== undefined) {
          c.parentCollectionTitle = collectionIdTitleMap.get(parentId);
        }
        return c;
      });

    // Special case: include virtual "Unsorted" collection if query matches "unsorted"
    if ('unsorted'.includes(queryLower)) {
      const alreadyHasUnsorted = filteredCollections.some((c) => c._id === -1);
      if (!alreadyHasUnsorted) {
        filteredCollections.unshift({
          _id: -1,
          title: 'Unsorted',
        });
      }
    }

    return { items: filteredItems, collections: filteredCollections };
  } catch (error) {
    console.error('[mirror] Raindrop search failed:', error);
    return { items: [], collections: [] };
  }
}

/**
 * Check if a URL is valid for Raindrop (http/https).
 * @param {string} url
 * @returns {boolean}
 */
function isValidRaindropUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Wrap a non-http URL for storage in Raindrop.
 * @param {string} url
 * @returns {string}
 */
function wrapInternalUrl(url) {
  return `https://nenya.local/tab?url=${encodeURIComponent(url)}`;
}

/**
 * Normalize a bundled browser icon filename.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeSessionIconPath(value) {
  const filename = typeof value === 'string' ? value.trim() : '';
  const allowed = new Set([
    'browser-chrome.png',
    'browser-edge.png',
    'browser-brave.png',
    'browser-vivaldi.png',
    'browser-comet.png',
    'browser-chatgpt.png',
    'browser-arc.png',
    'browser-dia.png',
  ]);
  return allowed.has(filename) ? filename : '';
}

/**
 * Load persisted session icon preferences keyed by browser id.
 * @returns {Promise<Record<string, string>>}
 */
async function loadSessionIconPreferences() {
  try {
    const result = await chrome.storage.local.get(
      SESSION_ICON_PREFERENCES_STORAGE_KEY,
    );
    const raw = result?.[SESSION_ICON_PREFERENCES_STORAGE_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    /** @type {Record<string, string>} */
    const preferences = {};
    Object.entries(raw).forEach(([browserId, iconPath]) => {
      const normalizedBrowserId = browserId.trim();
      const normalizedIconPath = normalizeSessionIconPath(iconPath);
      if (normalizedBrowserId && normalizedIconPath) {
        preferences[normalizedBrowserId] = normalizedIconPath;
      }
    });
    return preferences;
  } catch (error) {
    console.warn('[mirror] Failed to load session icon preferences:', error);
    return {};
  }
}

/**
 * Save the preferred icon for a browser id.
 * @param {string} browserId
 * @param {string} iconPath
 * @returns {Promise<void>}
 */
async function saveSessionIconPreference(browserId, iconPath) {
  const normalizedBrowserId = typeof browserId === 'string' ? browserId.trim() : '';
  const normalizedIconPath = normalizeSessionIconPath(iconPath);
  if (!normalizedBrowserId || !normalizedIconPath) {
    return;
  }

  const preferences = await loadSessionIconPreferences();
  preferences[normalizedBrowserId] = normalizedIconPath;
  await chrome.storage.local.set({
    [SESSION_ICON_PREFERENCES_STORAGE_KEY]: preferences,
  });
}

/**
 * Read the preferred icon for a browser id.
 * @param {string} browserId
 * @returns {Promise<string>}
 */
async function getSessionIconPreference(browserId) {
  const preferences = await loadSessionIconPreferences();
  return preferences[typeof browserId === 'string' ? browserId.trim() : ''] || '';
}

/**
 * Move a stored icon preference to a renamed browser id.
 * @param {string} oldName
 * @param {string} newName
 * @returns {Promise<void>}
 */
async function renameSessionIconPreference(oldName, newName) {
  const oldKey = typeof oldName === 'string' ? oldName.trim() : '';
  const newKey = typeof newName === 'string' ? newName.trim() : '';
  if (!oldKey || !newKey || oldKey === newKey) {
    return;
  }

  const preferences = await loadSessionIconPreferences();
  if (!preferences[oldKey]) {
    return;
  }
  preferences[newKey] = preferences[oldKey];
  delete preferences[oldKey];
  await chrome.storage.local.set({
    [SESSION_ICON_PREFERENCES_STORAGE_KEY]: preferences,
  });
}

/**
 * Get or create the stable browser/device name used for the current session.
 * @returns {Promise<string>}
 */
async function getOrCreateBrowserId() {
  const result = await chrome.storage.local.get(BROWSER_ID_STORAGE_KEY);
  const existing = typeof result?.[BROWSER_ID_STORAGE_KEY] === 'string'
    ? result[BROWSER_ID_STORAGE_KEY].trim()
    : '';
  if (existing) {
    return existing;
  }

  let os = 'Unknown OS';
  try {
    const platform = await chrome.runtime.getPlatformInfo();
    os = platform?.os || os;
  } catch (error) {
    console.warn('[mirror] Failed to read platform info:', error);
  }

  const brands = [
    ['Edg/', 'Edge'],
    ['OPR/', 'Opera'],
    ['Vivaldi', 'Vivaldi'],
    ['Brave', 'Brave'],
    ['Chrome/', 'Chrome'],
  ];
  const userAgent = navigator.userAgent || '';
  const matchedBrand = brands.find(([needle]) => userAgent.includes(needle));
  const brand = matchedBrand ? matchedBrand[1] : 'Browser';
  const suffix = Math.random().toString(36).slice(2, 7);
  const browserId = `${brand} - ${os} - ${suffix}`;
  await chrome.storage.local.set({ [BROWSER_ID_STORAGE_KEY]: browserId });
  return browserId;
}

/**
 * Get or create the parent `nenya / sessions` collection.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<number>}
 */
async function ensureSessionsCollection(tokens) {
  const response = await raindropRequest('/collections', tokens);
  const collections = Array.isArray(response?.items) ? response.items : [];
  const sessionsCollection = collections.find(
    (collection) => collection?.title === SESSIONS_COLLECTION_NAME,
  );

  if (sessionsCollection?._id) {
    return Number(sessionsCollection._id);
  }

  const createResult = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: SESSIONS_COLLECTION_NAME,
      view: 'list',
    }),
  });
  const collectionId = Number(createResult?.item?._id);
  if (!Number.isFinite(collectionId)) {
    throw new Error('Failed to obtain sessions collection ID');
  }
  return collectionId;
}

/**
 * Upload a bundled browser icon as a collection cover.
 * @param {number} collectionId
 * @param {string} iconPath
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<void>}
 */
async function uploadCollectionCover(collectionId, iconPath, tokens) {
  const normalizedIconPath = normalizeSessionIconPath(iconPath);
  if (!normalizedIconPath) {
    throw new Error('Invalid icon path');
  }

  const iconUrl = chrome.runtime.getURL(
    `assets/browser-icons/${normalizedIconPath}`,
  );
  const response = await fetch(iconUrl);
  if (!response.ok) {
    throw new Error(`Failed to load icon: ${normalizedIconPath}`);
  }

  const formData = new FormData();
  formData.append('cover', await response.blob(), normalizedIconPath);
  await raindropRequest(`/collection/${collectionId}/cover`, tokens, {
    method: 'PUT',
    body: formData,
  });
}

/**
 * Ensure the current browser/device child collection exists.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<number>}
 */
async function ensureDeviceCollection(tokens) {
  const browserId = await getOrCreateBrowserId();
  const sessionsCollectionId = await ensureSessionsCollection(tokens);
  const childrenResult = await raindropRequest('/collections/childrens', tokens);
  const childCollections = Array.isArray(childrenResult?.items)
    ? childrenResult.items
    : [];
  const deviceCollection = childCollections.find(
    (collection) =>
      collection?.title === browserId &&
      Number(collection?.parent?.$id) === sessionsCollectionId,
  );

  if (deviceCollection?._id) {
    return Number(deviceCollection._id);
  }

  const createResult = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: browserId,
      parent: { $id: sessionsCollectionId },
      view: 'list',
    }),
  });
  const collectionId = Number(createResult?.item?._id);
  if (!Number.isFinite(collectionId)) {
    throw new Error('Failed to create device session collection');
  }

  const preferredIconPath = await getSessionIconPreference(browserId);
  if (preferredIconPath) {
    try {
      await uploadCollectionCover(collectionId, preferredIconPath, tokens);
    } catch (error) {
      console.warn('[mirror] Failed to reapply session icon:', error);
    }
  }

  return collectionId;
}

/** @type {Promise<void> | null} */
let ensureNenyaSessionsCollectionPromise = null;
/** @type {number | null} */
let deviceCollectionId = null;
/** @type {Promise<void> | null} */
let currentExportPromise = null;

/**
 * Ensure sessions are initialized and the current browser state is exported.
 * @returns {Promise<void>}
 */
async function ensureNenyaSessionsCollection() {
  if (ensureNenyaSessionsCollectionPromise) {
    return ensureNenyaSessionsCollectionPromise;
  }

  ensureNenyaSessionsCollectionPromise = (async () => {
    try {
      const tokens = await loadValidProviderTokens();
      if (!tokens) {
        return;
      }
      await ensureDeviceCollectionAndExport(tokens);
      startSessionAutoExport();
    } catch (error) {
      console.warn('[mirror] Failed to ensure synced browser sessions:', error);
    } finally {
      ensureNenyaSessionsCollectionPromise = null;
    }
  })();

  return ensureNenyaSessionsCollectionPromise;
}

/**
 * Check if at least one browser window is not minimized.
 * @returns {Promise<boolean>}
 */
async function checkIfAnyWindowIsActive() {
  try {
    const windows = await chrome.windows.getAll();
    return windows.some((windowInfo) => windowInfo.state !== 'minimized');
  } catch (error) {
    console.warn('[mirror] Failed to check browser windows:', error);
    return true;
  }
}

/**
 * Start the recurring session auto-export alarm.
 * @returns {void}
 */
function startSessionAutoExport() {
  if (!chrome?.alarms) {
    return;
  }
  chrome.alarms.create(SESSION_EXPORT_ALARM_NAME, {
    delayInMinutes: SESSION_EXPORT_INTERVAL_MINUTES,
    periodInMinutes: SESSION_EXPORT_INTERVAL_MINUTES,
  });
}

/**
 * Handle the session auto-export alarm.
 * @returns {Promise<void>}
 */
async function handleSessionExportAlarm() {
  if (!(await checkIfAnyWindowIsActive())) {
    return;
  }
  await ensureDeviceCollectionAndExport();
}

/**
 * Export the current browser session, with one export active at a time.
 * @param {StoredProviderTokens} [providedTokens]
 * @param {number} [providedCollectionId]
 * @returns {Promise<void>}
 */
async function ensureDeviceCollectionAndExport(providedTokens, providedCollectionId) {
  if (currentExportPromise) {
    await currentExportPromise;
  }

  currentExportPromise = (async () => {
    try {
      const tokens = providedTokens || (await loadValidProviderTokens());
      if (!tokens) {
        return;
      }
      const collectionId =
        Number.isFinite(providedCollectionId)
          ? Number(providedCollectionId)
          : await ensureDeviceCollection(tokens);
      deviceCollectionId = collectionId;
      await exportCurrentSessionToRaindrop(collectionId, tokens);
    } finally {
      currentExportPromise = null;
    }
  })();

  return currentExportPromise;
}

/**
 * Generate a unique metadata key for a live tab.
 * @param {number} tabId
 * @param {number} windowId
 * @returns {string}
 */
function getTabUniqueId(tabId, windowId) {
  return `${windowId}:${tabId}`;
}

/**
 * Compare a stored Raindrop item against the live tab payload.
 * @param {object} item
 * @param {chrome.tabs.Tab} tab
 * @param {string} finalUrl
 * @param {Record<string, any>} metadata
 * @returns {boolean}
 */
function hasSessionTabChanged(item, tab, finalUrl, metadata) {
  if (item.link !== finalUrl) {
    return true;
  }
  if (item.title !== (tab.title || 'Untitled')) {
    return true;
  }

  const oldData = getItemMetadata(item);
  return (
    oldData.tabId !== metadata.tabId ||
    oldData.windowId !== metadata.windowId ||
    oldData.pinned !== metadata.pinned ||
    oldData.index !== metadata.index ||
    oldData.tabGroupId !== metadata.tabGroupId ||
    oldData.groupTitle !== metadata.groupTitle ||
    oldData.groupColor !== metadata.groupColor ||
    oldData.groupCollapsed !== metadata.groupCollapsed
  );
}

/**
 * Upload a tab snapshot as a Raindrop item cover.
 * @param {number} raindropId
 * @param {string} thumbnailDataUrl
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<void>}
 */
async function uploadCoverFromSnapshot(raindropId, thumbnailDataUrl, tokens) {
  try {
    if (!thumbnailDataUrl) {
      return;
    }
    const formData = new FormData();
    formData.append('cover', await (await fetch(thumbnailDataUrl)).blob(), 'screenshot.jpg');
    await raindropRequest(`/raindrop/${raindropId}/cover`, tokens, {
      method: 'PUT',
      body: formData,
    });
  } catch (error) {
    console.warn('[mirror] Failed to upload session item cover:', error);
  }
}

/**
 * Delete Raindrop items from a collection, falling back to moving to Trash.
 * @param {number} collectionId
 * @param {number[]} itemIds
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<void>}
 */
async function deleteRaindropItemsFromCollection(collectionId, itemIds, tokens) {
  const validIds = itemIds.filter((id) => Number.isFinite(id));
  const chunks = [];
  for (let i = 0; i < validIds.length; i += 100) {
    chunks.push(validIds.slice(i, i + 100));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const response = await raindropRequest(`/raindrops/${collectionId}`, tokens, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: chunk, id: chunk }),
      });

      if (response && response.modified === 0 && chunk.length > 0) {
        await raindropRequest(`/raindrops/${collectionId}`, tokens, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids: chunk,
            collection: { $id: -99 },
          }),
        });
      }
    }),
  );
}

/**
 * Export all open tabs and tab group metadata into the device session collection.
 * @param {number} collectionId
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<void>}
 */
async function exportCurrentSessionToRaindrop(collectionId, tokens) {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const groups = await chrome.tabGroups.query({});
    const groupsMap = new Map(groups.map((group) => [group.id, group]));
    const existingItems = await fetchAllItemsInCollection(collectionId, tokens);
    const itemByUniqueId = new Map();
    const duplicateIds = [];
    const allExistingIds = new Set();

    existingItems.forEach((item) => {
      const itemId = extractItemId(item);
      if (Number.isFinite(itemId)) {
        allExistingIds.add(itemId);
      }
      const metadata = getItemMetadata(item);
      if (typeof metadata.tabId === 'number' && typeof metadata.windowId === 'number') {
        const uniqueId = getTabUniqueId(metadata.tabId, metadata.windowId);
        if (!itemByUniqueId.has(uniqueId)) {
          itemByUniqueId.set(uniqueId, item);
        } else if (Number.isFinite(itemId)) {
          duplicateIds.push(itemId);
        }
      }
    });

    const toCreate = [];
    const toUpdate = [];
    const processedIds = new Set();

    windows.forEach((windowInfo) => {
      (windowInfo.tabs || []).forEach((tab) => {
        if (!tab.url || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
          return;
        }

        const finalUrl = isValidRaindropUrl(tab.url)
          ? tab.url
          : wrapInternalUrl(tab.url);
        const groupId = typeof tab.groupId === 'number' ? tab.groupId : -1;
        const group = groupId >= 0 ? groupsMap.get(groupId) : null;
        const metadata = {
          tabId: tab.id,
          windowId: tab.windowId,
          pinned: Boolean(tab.pinned),
          index: typeof tab.index === 'number' ? tab.index : 0,
          tabGroupId: groupId,
          groupTitle: group?.title || '',
          groupColor: group?.color || '',
          groupCollapsed: Boolean(group?.collapsed),
        };
        const payload = {
          link: finalUrl,
          title: tab.title || 'Untitled',
          collection: { $id: collectionId },
          excerpt: JSON.stringify(metadata),
        };
        const uniqueId = getTabUniqueId(tab.id, tab.windowId);
        const existingItem = itemByUniqueId.get(uniqueId);

        if (existingItem) {
          const existingId = extractItemId(existingItem);
          if (Number.isFinite(existingId)) {
            processedIds.add(existingId);
          }
          if (hasSessionTabChanged(existingItem, tab, finalUrl, metadata)) {
            toUpdate.push({ id: existingId, tabId: tab.id, ...payload });
          }
        } else {
          toCreate.push({ tabId: tab.id, ...payload });
        }
      });
    });

    const idsToDelete = Array.from(
      new Set([
        ...Array.from(allExistingIds).filter((id) => !processedIds.has(id)),
        ...duplicateIds,
      ]),
    );

    const snapshots = await getSnapshots();
    const snapshotMap = new Map();
    snapshots.forEach((snapshot) => {
      if (snapshot?.tabId && snapshot.thumbnail) {
        snapshotMap.set(snapshot.tabId, snapshot.thumbnail);
      }
    });

    for (let i = 0; i < toCreate.length; i += 100) {
      const chunk = toCreate.slice(i, i + 100);
      const tabIds = chunk.map((item) => item.tabId);
      const items = chunk.map(({ tabId, ...item }) => item);
      const response = await raindropRequest('/raindrops', tokens, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (Array.isArray(response?.items)) {
        await Promise.allSettled(
          response.items.map((createdItem, index) => {
            const itemId = extractItemId(createdItem);
            const thumbnail = snapshotMap.get(tabIds[index]);
            return Number.isFinite(itemId) && thumbnail
              ? uploadCoverFromSnapshot(itemId, thumbnail, tokens)
              : Promise.resolve();
          }),
        );
      }
    }

    if (idsToDelete.length > 0) {
      await deleteRaindropItemsFromCollection(collectionId, idsToDelete, tokens);
    }

    await Promise.all(
      toUpdate
        .filter((item) => Number.isFinite(item.id))
        .map(async (item) => {
          await raindropRequest(`/raindrop/${item.id}`, tokens, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              link: item.link,
              title: item.title,
              excerpt: item.excerpt,
            }),
          });
          const thumbnail = snapshotMap.get(item.tabId);
          if (thumbnail) {
            await uploadCoverFromSnapshot(item.id, thumbnail, tokens);
          }
        }),
    );
  } catch (error) {
    console.warn('[mirror] Failed to export current browser session:', error);
    throw error;
  }
}

/**
 * Fetch all saved session collections.
 * @returns {Promise<Array<{id: number, title: string, isCurrent: boolean, cover?: string|string[], lastUpdate?: string, lastAction?: string}>>}
 */
async function handleFetchSessions() {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  const sessionsCollectionId = await ensureSessionsCollection(tokens);
  const browserId = await getOrCreateBrowserId();
  const childrenResult = await raindropRequest('/collections/childrens', tokens);
  const childCollections = Array.isArray(childrenResult?.items)
    ? childrenResult.items
    : [];
  const sessions = childCollections.filter(
    (collection) => Number(collection?.parent?.$id) === sessionsCollectionId,
  );

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oldSessionIds = sessions
    .filter((collection) => {
      if (collection.title === browserId) {
        return false;
      }
      const timestamp = new Date(collection.lastAction || collection.lastUpdate).getTime();
      return Number.isFinite(timestamp) && timestamp < oneMonthAgo.getTime();
    })
    .map((collection) => Number(collection._id))
    .filter((id) => Number.isFinite(id));

  if (oldSessionIds.length > 0) {
    void raindropRequest('/collections', tokens, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: oldSessionIds }),
    }).catch((error) => {
      console.warn('[mirror] Failed to delete old sessions:', error);
    });
  }

  return sessions
    .filter((collection) => !oldSessionIds.includes(Number(collection._id)))
    .sort((a, b) => {
      const timeA = new Date(a.lastAction || a.lastUpdate).getTime();
      const timeB = new Date(b.lastAction || b.lastUpdate).getTime();
      return timeB - timeA;
    })
    .map((collection) => ({
      id: Number(collection._id),
      title: normalizeFolderTitle(collection.title, 'Untitled session'),
      isCurrent: collection.title === browserId,
      cover: collection.cover,
      lastUpdate: collection.lastUpdate,
      lastAction: collection.lastAction || collection.lastUpdate,
    }));
}

/**
 * Fetch a saved session's window/group/tab tree.
 * @param {number} collectionId
 * @returns {Promise<{windows: Array<{id: number, tree: any[]}>}>}
 */
async function handleFetchSessionDetails(collectionId) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  const items = await fetchAllItemsInCollection(collectionId, tokens);
  const windowsMap = new Map();
  items
    .filter((item) => item.link && item.link !== 'https://nenya.local/meta')
    .forEach((item) => {
      const metadata = getItemMetadata(item);
      const windowId = Number.isFinite(metadata.windowId) ? metadata.windowId : 0;
      if (!windowsMap.has(windowId)) {
        windowsMap.set(windowId, { id: windowId, items: [] });
      }
      windowsMap.get(windowId).items.push({
        id: extractItemId(item),
        url: unwrapInternalUrl(item.link),
        title: item.title || item.link,
        pinned: Boolean(metadata.pinned),
        index: Number.isFinite(metadata.index) ? metadata.index : 0,
        groupId: Number.isFinite(metadata.tabGroupId) ? metadata.tabGroupId : -1,
        groupTitle: metadata.groupTitle || 'Group',
        groupColor: metadata.groupColor || 'grey',
        groupCollapsed: Boolean(metadata.groupCollapsed),
      });
    });

  const windows = Array.from(windowsMap.values()).map((windowEntry) => {
    windowEntry.items.sort((a, b) => a.index - b.index);
    const tree = [];
    const processedGroups = new Set();

    windowEntry.items.forEach((tab) => {
      if (tab.groupId >= 0) {
        if (processedGroups.has(tab.groupId)) {
          return;
        }
        const tabs = windowEntry.items.filter((candidate) => candidate.groupId === tab.groupId);
        tree.push({
          type: 'group',
          id: tab.groupId,
          title: tab.groupTitle || 'Group',
          color: tab.groupColor || 'grey',
          collapsed: tab.groupCollapsed || false,
          tabs,
        });
        processedGroups.add(tab.groupId);
      } else {
        tree.push({ type: 'tab', ...tab });
      }
    });

    return { id: windowEntry.id, tree };
  });

  return { windows };
}

/**
 * Restore a saved session into new browser windows.
 * @param {number} collectionId
 * @returns {Promise<{success: boolean}>}
 */
async function handleRestoreSession(collectionId) {
  const details = await handleFetchSessionDetails(collectionId);
  for (const windowEntry of details.windows) {
    await restoreWindowTree(windowEntry.tree);
  }
  return { success: true };
}

/**
 * Restore a saved tree into a new browser window.
 * @param {any[]} tree
 * @returns {Promise<void>}
 */
async function restoreWindowTree(tree) {
  const tabs = [];
  tree.forEach((node) => {
    if (node?.type === 'tab') {
      tabs.push({ ...node, groupId: -1 });
    } else if (node?.type === 'group' && Array.isArray(node.tabs)) {
      node.tabs.forEach((tab) => tabs.push({ ...tab, groupId: node.id, group: node }));
    }
  });
  tabs.sort((a, b) => (a.index || 0) - (b.index || 0));
  if (tabs.length === 0) {
    return;
  }

  const first = tabs[0];
  const newWindow = await chrome.windows.create({
    url: first.url,
    focused: true,
  });
  const windowId = newWindow?.id;
  const firstTabId = newWindow?.tabs?.[0]?.id;
  if (typeof windowId !== 'number' || typeof firstTabId !== 'number') {
    return;
  }

  if (first.pinned) {
    await chrome.tabs.update(firstTabId, { pinned: true });
  }

  const createdTabs = [{ id: firstTabId, oldGroupId: first.groupId, group: first.group }];
  for (let i = 1; i < tabs.length; i += 1) {
    const tab = tabs[i];
    const created = await chrome.tabs.create({
      windowId,
      url: tab.url,
      pinned: Boolean(tab.pinned),
      active: false,
    });
    if (typeof created?.id === 'number') {
      createdTabs.push({ id: created.id, oldGroupId: tab.groupId, group: tab.group });
    }
  }

  const groupsById = new Map();
  createdTabs.forEach((tab) => {
    if (tab.oldGroupId >= 0 && tab.group) {
      groupsById.set(tab.oldGroupId, tab.group);
    }
  });

  for (const [oldGroupId, group] of groupsById.entries()) {
    const tabIds = createdTabs
      .filter((tab) => tab.oldGroupId === oldGroupId)
      .map((tab) => tab.id);
    if (tabIds.length === 0) {
      continue;
    }
    const newGroupId = await chrome.tabs.group({
      tabIds: /** @type {any} */ (tabIds),
      createProperties: { windowId },
    });
    await chrome.tabGroups.update(newGroupId, {
      title: group.title || 'Group',
      color: group.color || 'grey',
      collapsed: Boolean(group.collapsed),
    });
  }
}

/**
 * Update a session collection title.
 * @param {number} collectionId
 * @param {string} oldName
 * @param {string} newName
 * @returns {Promise<{success: boolean}>}
 */
async function handleUpdateSessionName(collectionId, oldName, newName) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  const title = typeof newName === 'string' ? newName.trim() : '';
  if (!title) {
    throw new Error('Session name is required');
  }

  await raindropRequest(`/collection/${collectionId}`, tokens, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  const browserId = await getOrCreateBrowserId();
  if (oldName === browserId) {
    await renameSessionIconPreference(oldName, title);
    await chrome.storage.local.set({ [BROWSER_ID_STORAGE_KEY]: title });
  }

  return { success: true };
}

/**
 * Delete a session collection.
 * @param {number} collectionId
 * @returns {Promise<{success: boolean}>}
 */
async function handleDeleteSession(collectionId) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }
  await raindropRequest(`/collection/${collectionId}`, tokens, {
    method: 'DELETE',
  });
  return { success: true };
}

/**
 * Upload a browser icon cover to a session collection.
 * @param {number} collectionId
 * @param {string} iconPath
 * @returns {Promise<{success: boolean}>}
 */
async function handleUploadCollectionCover(collectionId, iconPath) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }
  await uploadCollectionCover(collectionId, iconPath, tokens);
  return { success: true };
}

/**
 * Persist the current browser session's preferred icon.
 * @param {string} iconPath
 * @returns {Promise<{success: boolean}>}
 */
async function handleSetCurrentSessionIconPreference(iconPath) {
  const browserId = await getOrCreateBrowserId();
  await saveSessionIconPreference(browserId, iconPath);
  return { success: true };
}

/**
 * Check if a bookmark node exists.
 * @param {string} nodeId
 * @returns {Promise<boolean>}
 */
async function bookmarkNodeExists(nodeId) {
  if (!nodeId) {
    return false;
  }

  try {
    const nodes = await bookmarksGet([nodeId]);
    return Array.isArray(nodes) && nodes.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Retrieve bookmark nodes by id.
 * @param {string | string[]} ids
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
async function bookmarksGet(ids) {
  if (!ids || (Array.isArray(ids) && ids.length === 0)) {
    return [];
  }

  // Handle single string case
  if (typeof ids === 'string') {
    try {
      const maybe = chrome.bookmarks.get(ids);
      if (isPromiseLike(maybe)) {
        return await /** @type {Promise<chrome.bookmarks.BookmarkTreeNode[]>} */ (
          maybe
        );
      }
    } catch (error) {
      // Fall back to callback form.
    }

    return new Promise((resolve, reject) => {
      chrome.bookmarks.get(ids, (nodes) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(nodes);
      });
    });
  }

  // Handle array case - ensure it has at least one element
  if (Array.isArray(ids) && ids.length > 0) {
    try {
      const maybe = chrome.bookmarks.get(
        /** @type {[string, ...string[]]} */(ids),
      );
      if (isPromiseLike(maybe)) {
        return await /** @type {Promise<chrome.bookmarks.BookmarkTreeNode[]>} */ (
          maybe
        );
      }
    } catch (error) {
      // Fall back to callback form.
    }

    return new Promise((resolve, reject) => {
      chrome.bookmarks.get(
        /** @type {[string, ...string[]]} */(ids),
        (nodes) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }
          resolve(nodes);
        },
      );
    });
  }

  return [];
}

/**
 * Retrieve immediate bookmark children.
 * @param {string} parentId
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
async function bookmarksGetChildren(parentId) {
  try {
    const maybe = chrome.bookmarks.getChildren(parentId);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(parentId, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(nodes);
    });
  });
}

/**
 * Retrieve a subtree beneath the specified node.
 * @param {string} nodeId
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
async function bookmarksGetSubTree(nodeId) {
  try {
    const maybe = chrome.bookmarks.getSubTree(nodeId);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getSubTree(nodeId, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(nodes);
    });
  });
}

/**
 * Create a bookmark node.
 * @param {chrome.bookmarks.CreateDetails} details
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function bookmarksCreate(details) {
  try {
    const maybe = chrome.bookmarks.create(details);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(details, (node) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(node);
    });
  });
}

/**
 * Move a bookmark node.
 * @param {string} nodeId
 * @param {chrome.bookmarks.MoveDestination} destination
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function bookmarksMove(nodeId, destination) {
  try {
    const maybe = chrome.bookmarks.move(nodeId, destination);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(nodeId, destination, (node) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(node);
    });
  });
}

/**
 * Update a bookmark node.
 * @param {string} nodeId
 * @param {any} changes
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function bookmarksUpdate(nodeId, changes) {
  try {
    const maybe = chrome.bookmarks.update(nodeId, changes);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.update(nodeId, changes, (node) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(node);
    });
  });
}

/**
 * Remove an entire bookmark subtree.
 * @param {string} nodeId
 * @returns {Promise<void>}
 */
async function bookmarksRemoveTree(nodeId) {
  try {
    const maybe = chrome.bookmarks.removeTree(nodeId);
    if (isPromiseLike(maybe)) {
      await maybe;
      return;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  await new Promise((resolve, reject) => {
    chrome.bookmarks.removeTree(nodeId, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(undefined);
    });
  });
}

/**
 * Locate a child folder by title.
 * @param {string} parentId
 * @param {string} title
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode | undefined>}
 */
async function findChildFolderByTitle(parentId, title) {
  const children = await bookmarksGetChildren(parentId);
  for (const child of children) {
    if (!child.url && normalizeFolderTitle(child.title, '') === title) {
      return child;
    }
  }
  return undefined;
}

/**
 * Build an index of bookmark folders and items under the provided root.
 * @param {string} rootId
 * @returns {Promise<BookmarkNodeIndex>}
 */
async function buildBookmarkIndex(rootId) {
  const subTree = await bookmarksGetSubTree(rootId);
  if (!Array.isArray(subTree) || subTree.length === 0) {
    throw new Error('Unable to read bookmark subtree for root ' + rootId + '.');
  }

  const rootNode = subTree[0];
  /** @type {Map<string, BookmarkFolderInfo>} */
  const folders = new Map();
  /** @type {Map<string, BookmarkFolderInfo[]>} */
  const childrenByParent = new Map();
  /** @type {Map<string, BookmarkEntry>} */
  const bookmarks = new Map();
  /** @type {Map<string, BookmarkEntry[]>} */
  const bookmarksByUrl = new Map();

  /**
   * Register a folder in the index.
   * @param {chrome.bookmarks.BookmarkTreeNode} node
   * @param {string[]} pathSegments
   */
  function registerFolder(node, pathSegments) {
    const parentId = node.parentId ?? '';
    const info = {
      id: node.id,
      parentId,
      title: normalizeFolderTitle(node.title, ''),
      pathSegments,
      depth: pathSegments.length,
    };
    folders.set(node.id, info);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    const siblings = childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(info);
    }
  }

  /**
   * Register a bookmark item in the index.
   * @param {chrome.bookmarks.BookmarkTreeNode} node
   * @param {string[]} pathSegments
   */
  function registerBookmark(node, pathSegments) {
    if (!node.url) {
      return;
    }
    const entry = {
      id: node.id,
      parentId: node.parentId ?? '',
      title: node.title ?? '',
      url: node.url,
      pathSegments,
    };
    bookmarks.set(node.id, entry);
    if (!bookmarksByUrl.has(entry.url)) {
      bookmarksByUrl.set(entry.url, []);
    }
    const urlList = bookmarksByUrl.get(entry.url);
    if (urlList) {
      urlList.push(entry);
    }
  }

  /**
   * Walk the bookmark tree recursively.
   * @param {chrome.bookmarks.BookmarkTreeNode} node
   * @param {string[]} ancestorSegments
   */
  function traverse(node, ancestorSegments) {
    const isFolder = !node.url;
    let nextSegments = ancestorSegments;

    if (isFolder) {
      if (node.id === rootNode.id) {
        registerFolder(node, []);
        nextSegments = [];
      } else {
        const currentSegments = ancestorSegments.concat([
          normalizeFolderTitle(node.title, ''),
        ]);
        registerFolder(node, currentSegments);
        nextSegments = currentSegments;
      }
    } else {
      registerBookmark(node, ancestorSegments);
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => {
        traverse(child, nextSegments);
      });
    }
  }

  traverse(rootNode, []);

  return {
    folders,
    childrenByParent,
    bookmarks,
    bookmarksByUrl,
  };
}

/**
 * Build a collection node map from remote Raindrop responses.
 * @param {any[]} rootCollections
 * @param {any[]} childCollections
 * @returns {Map<number, CollectionNode>}
 */
function buildCollectionNodeMap(rootCollections, childCollections) {
  /** @type {Map<number, CollectionNode>} */
  const map = new Map();

  /**
   * Ensure a node exists in the map.
   * @param {any} collection
   * @returns {CollectionNode | undefined}
   */
  function ensureNode(collection) {
    const id = Number(collection?._id);
    if (!Number.isFinite(id)) {
      return undefined;
    }

    let node = map.get(id);
    if (!node) {
      node = {
        id,
        title: normalizeFolderTitle(collection?.title, 'Untitled'),
        sort: Number(collection?.sort) || 0,
        parentId: null,
        children: [],
      };
      map.set(id, node);
    } else {
      node.title = normalizeFolderTitle(collection?.title, node.title);
      node.sort = Number(collection?.sort) || node.sort;
    }
    return node;
  }

  rootCollections.forEach((collection) => {
    const node = ensureNode(collection);
    if (node) {
      node.parentId = null;
    }
  });

  childCollections.forEach((collection) => {
    const node = ensureNode(collection);
    if (!node) {
      return;
    }

    const parentId = Number(collection?.parent?.$id);
    if (Number.isFinite(parentId)) {
      node.parentId = parentId;
    }
  });

  // Attach children after nodes are registered to avoid duplicates.
  map.forEach((node) => {
    node.children = [];
  });

  childCollections.forEach((collection) => {
    const childId = Number(collection?._id);
    const parentId = Number(collection?.parent?.$id);
    if (!Number.isFinite(childId) || !Number.isFinite(parentId)) {
      return;
    }

    const childNode = map.get(childId);
    const parentNode = map.get(parentId);
    if (childNode && parentNode && !parentNode.children.includes(childNode)) {
      parentNode.children.push(childNode);
    }
  });

  map.forEach((node) => {
    node.children.sort(compareCollectionNodes);
  });

  return map;
}

/**
 * Compare two collection nodes using Raindrop sort semantics.
 * @param {CollectionNode} a
 * @param {CollectionNode} b
 * @returns {number}
 */
function compareCollectionNodes(a, b) {
  if (a.sort !== b.sort) {
    return b.sort - a.sort;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Build the ordered group descriptors for folder synchronization.
 * @param {{ groups: any[], rootCollections: any[], childCollections: any[] }} remoteData
 * @param {Map<number, CollectionNode>} collectionMap
 * @returns {{ title: string, collections: CollectionNode[] }[]}
 */
function buildGroupPlan(remoteData, collectionMap) {
  /** @type {{ title: string, collections: CollectionNode[] }[]} */
  const plan = [];
  /** @type {Set<number>} */
  const assignedRootIds = new Set();

  const groups = Array.isArray(remoteData.groups) ? remoteData.groups : [];
  groups.forEach((group) => {
    const groupTitle = normalizeFolderTitle(group?.title, 'Group');
    const collectionIds = Array.isArray(group?.collections)
      ? group.collections
      : [];
    /** @type {CollectionNode[]} */
    const nodes = [];
    collectionIds.forEach((idValue) => {
      const id = Number(idValue);
      if (!Number.isFinite(id)) {
        return;
      }
      const node = collectionMap.get(id);
      if (node) {
        nodes.push(node);
        assignedRootIds.add(id);
      }
    });
    plan.push({ title: groupTitle, collections: nodes });
  });

  const unassigned = [];
  const roots = Array.isArray(remoteData.rootCollections)
    ? remoteData.rootCollections
    : [];
  roots.forEach((collection) => {
    const id = Number(collection?._id);
    if (!Number.isFinite(id)) {
      return;
    }
    if (assignedRootIds.has(id)) {
      return;
    }
    const node = collectionMap.get(id);
    if (node) {
      unassigned.push(node);
    }
  });

  if (unassigned.length > 0) {
    plan.push({
      title: 'Ungrouped',
      collections: unassigned,
    });
  }

  return plan;
}

/**
 * Synchronize bookmark folders to mirror the Raindrop structure.
 * @param {{ groups: any[], rootCollections: any[], childCollections: any[] }} remoteData
 * @param {string} rootId
 * @param {BookmarkNodeIndex} index
 * @param {MirrorStats} stats
 * @returns {Promise<{ collectionFolderMap: Map<number, string>, unsortedFolderId: string }>}
 */
async function synchronizeFolderTree(remoteData, rootId, index, stats) {
  const collectionMap = buildCollectionNodeMap(
    remoteData.rootCollections,
    remoteData.childCollections,
  );
  const groupPlan = buildGroupPlan(remoteData, collectionMap);

  /** @type {Set<string>} */
  const usedFolders = new Set([rootId]);
  /** @type {Map<string, string[]>} */
  const orderByParent = new Map();
  /** @type {Map<number, string>} */
  const collectionFolderMap = new Map();

  // Ensure group folders and nested collections.
  for (const group of groupPlan) {
    const groupTitle = group.title;
    const groupSegments = [groupTitle];
    const groupFolder = await ensureFolder(
      rootId,
      groupTitle,
      groupSegments,
      index,
      usedFolders,
      stats,
    );
    addOrderEntry(orderByParent, rootId, groupFolder.id);

    for (const collectionNode of group.collections) {
      await ensureCollectionHierarchy(
        collectionNode,
        groupFolder.id,
        groupSegments,
        index,
        usedFolders,
        orderByParent,
        collectionFolderMap,
        stats,
      );
    }
  }

  // Ensure the Unsorted folder under the root.
  const unsortedSegments = [UNSORTED_TITLE];
  const unsortedFolder = await ensureFolder(
    rootId,
    UNSORTED_TITLE,
    unsortedSegments,
    index,
    usedFolders,
    stats,
  );
  addOrderEntry(orderByParent, rootId, unsortedFolder.id);

  await removeUnusedFolders(rootId, index, usedFolders, stats);
  await enforceFolderOrder(orderByParent, index, stats);

  return {
    collectionFolderMap,
    unsortedFolderId: unsortedFolder.id,
  };
}

/**
 * Ensure a folder exists, creating it when necessary and updating the index.
 * @param {string} parentId
 * @param {string} title
 * @param {string[]} pathSegments
 * @param {BookmarkNodeIndex} index
 * @param {Set<string>} usedFolders
 * @param {MirrorStats} stats
 * @returns {Promise<BookmarkFolderInfo>}
 */
async function ensureFolder(
  parentId,
  title,
  pathSegments,
  index,
  usedFolders,
  stats,
) {
  const siblings = index.childrenByParent.get(parentId) ?? [];
  let folderInfo = siblings.find((info) => info.title === title);

  if (!folderInfo) {
    const created = await bookmarksCreate({
      parentId,
      title,
    });
    stats.foldersCreated += 1;

    folderInfo = {
      id: created.id,
      parentId,
      title,
      pathSegments,
      depth: pathSegments.length,
    };

    index.folders.set(folderInfo.id, folderInfo);

    if (!index.childrenByParent.has(parentId)) {
      index.childrenByParent.set(parentId, []);
    }
    const siblings = index.childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(folderInfo);
    }
  } else {
    if (folderInfo.title !== title) {
      await bookmarksUpdate(folderInfo.id, { title });
      folderInfo.title = title;
    }
    folderInfo.pathSegments = pathSegments;
    folderInfo.depth = pathSegments.length;
  }

  if (!index.childrenByParent.has(folderInfo.id)) {
    index.childrenByParent.set(folderInfo.id, []);
  }

  usedFolders.add(folderInfo.id);
  return folderInfo;
}

/**
 * Add a folder id to the ordering map for a parent.
 * @param {Map<string, string[]>} orderByParent
 * @param {string} parentId
 * @param {string} childId
 * @returns {void}
 */
function addOrderEntry(orderByParent, parentId, childId) {
  if (!orderByParent.has(parentId)) {
    orderByParent.set(parentId, []);
  }
  const list = orderByParent.get(parentId);
  if (list && !list.includes(childId)) {
    list.push(childId);
  }
}

/**
 * Ensure the hierarchy for a collection node, including descendants.
 * @param {CollectionNode} node
 * @param {string} parentFolderId
 * @param {string[]} parentSegments
 * @param {BookmarkNodeIndex} index
 * @param {Set<string>} usedFolders
 * @param {Map<string, string[]>} orderByParent
 * @param {Map<number, string>} collectionFolderMap
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function ensureCollectionHierarchy(
  node,
  parentFolderId,
  parentSegments,
  index,
  usedFolders,
  orderByParent,
  collectionFolderMap,
  stats,
) {
  const title = normalizeFolderTitle(node.title, 'Collection ' + node.id);
  const currentSegments = parentSegments.concat([title]);

  const folder = await ensureFolder(
    parentFolderId,
    title,
    currentSegments,
    index,
    usedFolders,
    stats,
  );

  collectionFolderMap.set(node.id, folder.id);
  addOrderEntry(orderByParent, parentFolderId, folder.id);

  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    await ensureCollectionHierarchy(
      child,
      folder.id,
      currentSegments,
      index,
      usedFolders,
      orderByParent,
      collectionFolderMap,
      stats,
    );
  }
}

/**
 * Remove folders that are no longer needed.
 * @param {string} rootId
 * @param {BookmarkNodeIndex} index
 * @param {Set<string>} usedFolders
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function removeUnusedFolders(rootId, index, usedFolders, stats) {
  /** @type {BookmarkFolderInfo[]} */
  const removable = [];
  index.folders.forEach((info, folderId) => {
    if (folderId === rootId) {
      return;
    }
    if (!usedFolders.has(folderId)) {
      removable.push(info);
    }
  });

  removable.sort((a, b) => b.depth - a.depth);

  for (const info of removable) {
    await bookmarksRemoveTree(info.id);
    stats.foldersRemoved += 1;

    index.folders.delete(info.id);
    index.childrenByParent.delete(info.id);

    const siblings = index.childrenByParent.get(info.parentId);
    if (siblings) {
      index.childrenByParent.set(
        info.parentId,
        siblings.filter((child) => child.id !== info.id),
      );
    }

    // Remove bookmarks that belonged to this branch.
    const pathPrefix = info.pathSegments;
    index.bookmarks.forEach((entry, bookmarkId) => {
      if (isPathWithin(entry.pathSegments, pathPrefix)) {
        index.bookmarks.delete(bookmarkId);
        const list = index.bookmarksByUrl.get(entry.url);
        if (list) {
          index.bookmarksByUrl.set(
            entry.url,
            list.filter((candidate) => candidate.id !== bookmarkId),
          );
          const updatedList = index.bookmarksByUrl.get(entry.url);
          if (updatedList && updatedList.length === 0) {
            index.bookmarksByUrl.delete(entry.url);
          }
        }
      }
    });
  }
}

/**
 * Check whether a bookmark path falls under the given prefix.
 * @param {string[]} path
 * @param {string[]} prefix
 * @returns {boolean}
 */
function isPathWithin(path, prefix) {
  if (prefix.length === 0) {
    return true;
  }
  if (path.length < prefix.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (path[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Reorder folders to match the desired sequence.
 * @param {Map<string, string[]>} orderByParent
 * @param {BookmarkNodeIndex} index
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function enforceFolderOrder(orderByParent, index, stats) {
  for (const [parentId, orderedIds] of orderByParent.entries()) {
    const siblings = index.childrenByParent.get(parentId) ?? [];
    const currentOrder = siblings.map((info) => info.id);
    let changed = false;

    for (let i = 0; i < orderedIds.length; i += 1) {
      const childId = orderedIds[i];
      if (currentOrder[i] !== childId) {
        await bookmarksMove(childId, { parentId, index: i });
        changed = true;
      }
    }

    if (changed) {
      stats.foldersMoved += 1;
    }

    const updatedChildren = orderedIds
      .map((id) => index.folders.get(id))
      .filter((entry) => entry !== undefined);
    index.childrenByParent.set(parentId, updatedChildren);
  }
}

/**
 * Extract the Raindrop collection id from an item.
 * @param {any} item
 * @returns {number | undefined}
 */
function extractCollectionId(item) {
  if (!item || typeof item !== 'object') {
    return undefined;
  }

  const raw =
    item.collectionId ??
    item?.collection?.$id ??
    item?.collection?._id ??
    item?.collection ??
    item?.collectionID;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

/**
 * Extract the Raindrop item id from an item.
 * @param {any} item
 * @returns {number | undefined}
 */
function extractItemId(item) {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  // Raindrop items use _id, but we check common variations
  const raw = item._id ?? item.id ?? item.ID;
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

/**
 * Convert a Raindrop timestamp string to a numeric value.
 * @param {unknown} value
 * @returns {number}
 */

/**
 * Remove bookmarks that correspond to a specific Raindrop item (preferred) or URL.
 * Falls back to URL-based removal only when no item mapping exists.
 * @param {number | undefined} itemId
 * @param {string} url
 * @param {MirrorContext} context
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function removeBookmarksForItem(itemId, url, context, stats) {
  /** @type {Set<string>} */
  const bookmarkIds = new Set();

  if (Number.isFinite(itemId)) {
    try {
      const mappedId = await getMappedBookmarkId(itemId);
      if (mappedId) {
        bookmarkIds.add(mappedId);
      }
    } catch (error) {
      console.warn(
        '[mirror] Failed to resolve mapped bookmark for deleted item:',
        error,
      );
    }
  }

  if (bookmarkIds.size === 0 && url) {
    const entries = context.index.bookmarksByUrl.get(url);
    if (entries && entries.length > 0) {
      entries.forEach((entry) => bookmarkIds.add(entry.id));
    }
  }

  if (bookmarkIds.size === 0) {
    return;
  }

  for (const bookmarkId of bookmarkIds) {
    const entry = context.index.bookmarks.get(bookmarkId);
    // await bookmarksRemove(bookmarkId); // Removed as part of the change

    stats.bookmarksDeleted += 1;
    context.index.bookmarks.delete(bookmarkId);

    const resolvedUrl = entry?.url ?? url;
    if (resolvedUrl) {
      const list = context.index.bookmarksByUrl.get(resolvedUrl) || [];
      const updated = list.filter((candidate) => candidate.id !== bookmarkId);
      if (updated.length > 0) {
        context.index.bookmarksByUrl.set(resolvedUrl, updated);
      } else {
        context.index.bookmarksByUrl.delete(resolvedUrl);
      }
    } else {
      context.index.bookmarksByUrl.forEach((entries, key) => {
        const updated = entries.filter(
          (candidate) => candidate.id !== bookmarkId,
        );
        if (updated.length !== entries.length) {
          if (updated.length > 0) {
            context.index.bookmarksByUrl.set(key, updated);
          } else {
            context.index.bookmarksByUrl.delete(key);
          }
        }
      });
    }

    await removeMappingsByBookmarkId(bookmarkId);
  }
}

/**
 * Generate a bookmark title, falling back to the URL when necessary.
 * @param {unknown} title
 * @param {string} url
 * @returns {string}
 */
function normalizeBookmarkTitle(title, url) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed.length > 0 ? trimmed : url;
}

/**
 * Normalize an HTTP(S) URL for consistent comparisons.
 * @param {string} value
 * @returns {string | undefined}
 */
function normalizeHttpUrl(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch (error) {
    return undefined;
  }
}

/**
 * Build a Raindrop collection URL for the provided id.
 * @param {number} id
 * @returns {string}
 */
function buildRaindropCollectionUrl(id) {
  return RAINDROP_COLLECTION_URL_BASE + String(id);
}

/**
 * Load the mapping of Raindrop item id -> Chrome bookmark id from local storage.
 * Cached per runtime to reduce storage calls.
 * @returns {Promise<Record<string, string>>}
 */
async function loadItemBookmarkMap() {
  if (itemBookmarkMapCache) {
    return itemBookmarkMapCache;
  }
  if (!itemBookmarkMapPromise) {
    itemBookmarkMapPromise = /** @type {Promise<Record<string, string>>} */ (
      (async () => {
        try {
          const result = await chrome.storage.local.get(ITEM_BOOKMARK_MAP_KEY);
          const raw = result?.[ITEM_BOOKMARK_MAP_KEY];
          if (raw && typeof raw === 'object') {
            itemBookmarkMapCache = { ...raw };
          } else {
            itemBookmarkMapCache = {};
          }
        } catch (error) {
          itemBookmarkMapCache = {};
        }
        return itemBookmarkMapCache;
      })()
    );
  }
  return /** @type {Promise<Record<string, string>>} */ (
    itemBookmarkMapPromise
  );
}

/**
 * Persist the current cached item->bookmark map.
 * @returns {Promise<void>}
 */
async function persistItemBookmarkMap() {
  if (!itemBookmarkMapCache) {
    await loadItemBookmarkMap();
  }
  await chrome.storage.local.set({
    [ITEM_BOOKMARK_MAP_KEY]: itemBookmarkMapCache || {},
  });
}

/**
 * Get the mapped bookmark id for a given raindrop item id.
 * @param {number | undefined} itemId
 * @returns {Promise<string | undefined>}
 */
async function getMappedBookmarkId(itemId) {
  if (!Number.isFinite(itemId)) {
    return undefined;
  }
  const map = await loadItemBookmarkMap();
  const key = String(itemId);
  const value = map[key];
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Update the mapping for a raindrop item id.
 * @param {number | undefined} itemId
 * @param {string} bookmarkId
 * @returns {Promise<void>}
 */
async function setMappedBookmarkId(itemId, bookmarkId) {
  if (!Number.isFinite(itemId) || !bookmarkId) {
    return;
  }
  const map = await loadItemBookmarkMap();
  map[String(itemId)] = String(bookmarkId);
  await persistItemBookmarkMap();
}

/**
 * Remove a mapping by item id if present.
 * @param {number | undefined} itemId
 * @returns {Promise<void>}
 */
async function deleteMappedBookmarkId(itemId) {
  if (!Number.isFinite(itemId)) {
    return;
  }
  const map = await loadItemBookmarkMap();
  const key = String(itemId);
  if (key in map) {
    delete map[key];
    await persistItemBookmarkMap();
  }
}

/**
 * Remove any mapping entries that point to a specific bookmark id.
 * @param {string} bookmarkId
 * @returns {Promise<void>}
 */
async function removeMappingsByBookmarkId(bookmarkId) {
  if (!bookmarkId) {
    return;
  }
  const map = await loadItemBookmarkMap();
  let changed = false;
  for (const [key, value] of Object.entries(map)) {
    if (value === bookmarkId) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) {
    await persistItemBookmarkMap();
  }
}

/**
async function bookmarksRemove(nodeId) {
  try {
    const maybe = chrome.bookmarks.remove(nodeId);
    if (isPromiseLike(maybe)) {
      await maybe;
      return;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  await new Promise((resolve, reject) => {
    chrome.bookmarks.remove(nodeId, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(undefined);
    });
  });
}

/**
 * Load the stored tokens for the Raindrop provider and ensure they are valid.
 * Attempts to refresh expired tokens automatically.
 * @returns {Promise<StoredProviderTokens | undefined>}
 */
async function loadValidProviderTokens() {
  const validationResult = await getValidTokens(PROVIDER_ID);

  if (validationResult.needsReauth) {
    if (validationResult.error) {
      throw new Error(validationResult.error);
    }
    throw new Error(
      'Raindrop credentials expired. Reconnect in Options to continue syncing.',
    );
  }

  if (!validationResult.tokens) {
    return undefined;
  }

  return validationResult.tokens;
}

/**
 * Handle token validation message from popup/options.
 * @param {any} message
 * @param {function} sendResponse
 * @returns {boolean}
 */
function handleTokenValidationMessage(message, sendResponse) {
  if (message.type !== TOKEN_VALIDATION_MESSAGE) {
    return false;
  }

  void (async () => {
    try {
      const validationResult = await getValidTokens(PROVIDER_ID);
      sendResponse({
        isValid: !validationResult.needsReauth && !!validationResult.tokens,
        needsReauth: validationResult.needsReauth,
        error: validationResult.error,
      });
    } catch (error) {
      sendResponse({
        isValid: false,
        needsReauth: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
}

/**
 * Load the persisted root folder settings for the Raindrop provider.
 * @returns {Promise<{ settings: RootFolderSettings, map: Record<string, RootFolderSettings>, didMutate: boolean }>}
 */
async function loadRootFolderSettings() {
  const result = await chrome.storage.local.get(ROOT_FOLDER_SETTINGS_KEY);
  /** @type {Record<string, RootFolderSettings> | undefined} */
  const storedMap = /** @type {*} */ (result[ROOT_FOLDER_SETTINGS_KEY]);
  const map = storedMap ? { ...storedMap } : {};

  let settings = map[PROVIDER_ID];
  let didMutate = false;

  if (!settings) {
    settings = {
      parentFolderId: DEFAULT_PARENT_FOLDER_ID,
      rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
    };
    map[PROVIDER_ID] = settings;
    didMutate = true;
  } else {
    if (!settings.parentFolderId) {
      settings.parentFolderId = DEFAULT_PARENT_FOLDER_ID;
      didMutate = true;
    }
    if (!settings.rootFolderName) {
      settings.rootFolderName = DEFAULT_ROOT_FOLDER_NAME;
      didMutate = true;
    }
  }

  return { settings, map, didMutate };
}

/**
 * Persist updated root folder settings map.
 * @param {{ settings: RootFolderSettings, map: Record<string, RootFolderSettings> }} data
 * @returns {Promise<void>}
 */
async function persistRootFolderSettings(data) {
  data.map[PROVIDER_ID] = data.settings;
  await chrome.storage.local.set({
    [ROOT_FOLDER_SETTINGS_KEY]: data.map,
  });
}

/**
 * Ensure the mirror root and Unsorted bookmark folders exist.
 * @returns {Promise<{ rootId: string, unsortedId: string }>}
 */
async function ensureUnsortedBookmarkFolder() {
  const settingsData = await loadRootFolderSettings();
  const parentId = await ensureParentFolderAvailable(settingsData);
  const normalizedRootTitle = normalizeFolderTitle(
    settingsData.settings.rootFolderName,
    DEFAULT_ROOT_FOLDER_NAME,
  );

  if (normalizedRootTitle !== settingsData.settings.rootFolderName) {
    settingsData.settings.rootFolderName = normalizedRootTitle;
    settingsData.didMutate = true;
  }

  let rootFolder = await findChildFolderByTitle(parentId, normalizedRootTitle);
  if (!rootFolder) {
    rootFolder = await bookmarksCreate({
      parentId,
      title: normalizedRootTitle,
    });
  }

  let unsortedFolder = await findChildFolderByTitle(
    rootFolder.id,
    UNSORTED_TITLE,
  );
  if (!unsortedFolder) {
    unsortedFolder = await bookmarksCreate({
      parentId: rootFolder.id,
      title: UNSORTED_TITLE,
    });
  }

  if (settingsData.didMutate) {
    await persistRootFolderSettings(settingsData);
  }

  return {
    rootId: rootFolder.id,
    unsortedId: unsortedFolder.id,
  };
}
