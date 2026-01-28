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

import { getSnapshots } from './tab-snapshots.js';
import {
  getValidTokens,
  TOKEN_VALIDATION_MESSAGE,
} from '../shared/tokenRefresh.js';

export {
  concludeActionBadge,
  setActionBadge,
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
  handleRestoreSession,
  handleOpenAllItemsInCollection,
  handleFetchSessionDetails,
  exportCurrentSessionToRaindrop,
  ensureDeviceCollectionAndExport,
  handleUpdateSessionName,
  handleUploadCollectionCover,
  handleUpdateRaindropUrl,
};

import { processUrl } from '../shared/urlProcessor.js';
import {
  convertSplitUrlForSave,
  convertSplitUrlForRestore,
} from '../shared/splitUrl.js';

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

  return convertSplitUrlForRestore(url);
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
 * Fetch all sessions (child collections of "nenya / sessions").
 * Deletes sessions older than one month.
 * @returns {Promise<Array<{id: number, title: string, isCurrent: boolean}>>}
 */
async function handleFetchSessions() {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  const sessionsCollectionId = await ensureSessionsCollection(tokens);

  const childrenResult = await raindropRequest(
    '/collections/childrens',
    tokens,
  );
  const childCollections = Array.isArray(childrenResult?.items)
    ? childrenResult.items
    : [];

  const sessions = childCollections.filter(
    (c) => c.parent?.$id === sessionsCollectionId,
  );

  const existingNames = new Set(sessions.map((c) => c.title));
  const browserId = await getOrCreateBrowserId(existingNames);

  // Ensure current session exists
  const currentSessionExists = sessions.some((c) => c.title === browserId);
  if (!currentSessionExists) {
    try {
      console.log('[mirror] Current session missing from fetch, creating it...');
      const newId = await ensureDeviceCollection(tokens);

      // Add to sessions list so it appears in UI immediately
      sessions.push({
        _id: newId,
        title: browserId,
        parent: { $id: sessionsCollectionId },
        lastUpdate: new Date().toISOString(),
        cover: [],
      });

      // Trigger background export to populate it
      void exportCurrentSessionToRaindrop(newId, tokens).catch((err) => {
        console.warn('[mirror] Background export failed after creation:', err);
      });
    } catch (error) {
      console.warn(
        '[mirror] Failed to ensure device collection during fetch:',
        error,
      );
    }
  }

  // Identify sessions older than one month
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthAgoTime = oneMonthAgo.getTime();

  const oldSessions = sessions.filter((c) => {
    // Never delete current browser session
    if (c.title === browserId) return false;

    const lastUpdate = new Date(c.lastUpdate).getTime();
    return lastUpdate < oneMonthAgoTime;
  });

  if (oldSessions.length > 0) {
    const idsToDelete = oldSessions.map((c) => c._id);
    console.log(
      `[mirror] Batch deleting ${oldSessions.length} old sessions:`,
      idsToDelete,
    );
    // No need to await deletion to finish, allowing faster rendering of remaining sessions
    void raindropRequest('/collections', tokens, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: idsToDelete }),
    }).catch((error) => {
      console.warn('[mirror] Failed to batch delete old sessions:', error);
    });
  }

  // Filter out the deleted sessions from the result
  const remainingSessions = sessions.filter(
    (c) => !oldSessions.some((old) => old._id === c._id),
  );

  return remainingSessions
    .sort((a, b) => {
      const timeA = new Date(a.lastAction || a.lastUpdate).getTime();
      const timeB = new Date(b.lastAction || b.lastUpdate).getTime();
      return timeB - timeA;
    })
    .map((c) => ({
      id: c._id,
      title: c.title,
      isCurrent: c.title === browserId,
      cover: c.cover,
      lastUpdate: c.lastUpdate,
      lastAction: c.lastAction || c.lastUpdate,
    }));
}

/**
 * Fetch detailed structure of a session.
 * @param {number} collectionId
 * @returns {Promise<any>}
 */
async function handleFetchSessionDetails(collectionId) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  // 1. Fetch all items in the collection
  const items = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await raindropRequest(
      `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}`,
      tokens,
    );
    const pageItems = Array.isArray(response?.items) ? response.items : [];
    items.push(...pageItems);

    if (pageItems.length < FETCH_PAGE_SIZE) {
      hasMore = false;
    } else {
      page += 1;
    }
  }

  if (items.length === 0) {
    return { windows: [] };
  }

  // 2. Separate meta item from tabs (legacy support: ignore meta item)
  const tabItems = items.filter(
    (item) => item.link !== 'https://nenya.local/meta',
  );

  // 3. Group tabs by windowId and then by groupId
  const windowsMap = new Map();
  tabItems.forEach((item) => {
    const tabData = getItemMetadata(item);
    const windowId = tabData.windowId || 0;
    if (!windowsMap.has(windowId)) {
      windowsMap.set(windowId, {
        id: windowId,
        items: [], // list of all tab items in this window
      });
    }
    windowsMap.get(windowId).items.push({
      id: item._id,
      url: unwrapInternalUrl(item.link),
      title: item.title,
      pinned: tabData.pinned || false,
      index: tabData.index || 0,
      groupId: tabData.tabGroupId,
      groupTitle: tabData.groupTitle,
      groupColor: tabData.groupColor,
      groupCollapsed: tabData.groupCollapsed,
    });
  });

  const windows = Array.from(windowsMap.values()).map((win) => {
    // Sort all tabs by index
    win.items.sort((a, b) => a.index - b.index);

    // Group tabs into groups or leave ungrouped
    const tree = [];
    const processedGroupIds = new Set();

    win.items.forEach((tab) => {
      if (tab.groupId !== undefined && tab.groupId !== -1) {
        if (!processedGroupIds.has(tab.groupId)) {
          const groupTabs = win.items.filter((t) => t.groupId === tab.groupId);
          tree.push({
            type: 'group',
            id: tab.groupId,
            title: tab.groupTitle || 'Group',
            color: tab.groupColor || 'grey',
            collapsed: tab.groupCollapsed || false,
            tabs: groupTabs,
          });
          processedGroupIds.add(tab.groupId);
        }
      } else {
        tree.push({
          type: 'tab',
          ...tab,
        });
      }
    });

    return {
      id: win.id,
      tree,
    };
  });

  return { windows };
}

/**
 * Restore a session from a Raindrop collection.
 * @param {number} collectionId
 * @returns {Promise<{success: boolean}>}
 */
async function handleRestoreSession(collectionId) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  // 1. Fetch all items in the collection
  const items = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await raindropRequest(
      `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}`,
      tokens,
    );
    const pageItems = Array.isArray(response?.items) ? response.items : [];
    items.push(...pageItems);

    if (pageItems.length < FETCH_PAGE_SIZE) {
      hasMore = false;
    } else {
      page += 1;
    }
  }

  if (items.length === 0) {
    return { success: true };
  }

  // 2. Separate meta item from tabs (legacy support: ignore meta item)
  const tabItems = items.filter(
    (item) => item.link !== 'https://nenya.local/meta',
  );

  const groupDefinitions = new Map(); // groupId -> {title, color, collapsed, windowId}

  // 3. Group tabs by their original windowId
  const tabsByWindow = new Map();
  tabItems.forEach((item) => {
    const tabData = getItemMetadata(item);
    const windowId = tabData.windowId || 0;
    if (!tabsByWindow.has(windowId)) {
      tabsByWindow.set(windowId, []);
    }

    if (tabData.tabGroupId && tabData.tabGroupId !== -1) {
      // Ideally multiple tabs in the same group have the same info.
      if (!groupDefinitions.has(tabData.tabGroupId)) {
        groupDefinitions.set(tabData.tabGroupId, {
          id: tabData.tabGroupId,
          windowId: windowId,
          title: tabData.groupTitle || 'Group',
          color: tabData.groupColor || 'grey',
          collapsed: tabData.groupCollapsed || false,
        });
      }
    }

    tabsByWindow.get(windowId).push({
      url: unwrapInternalUrl(item.link),
      pinned: tabData.pinned || false,
      index: tabData.index,
      groupId: tabData.tabGroupId,
    });
  });

  // 4. Restore each window
  for (const [oldWindowId, tabs] of tabsByWindow.entries()) {
    // Sort tabs by their original index
    tabs.sort((a, b) => (a.index || 0) - (b.index || 0));

    // Create a new window with the first tab
    const firstTab = tabs[0];
    const newWindow = await chrome.windows.create({
      url: firstTab.url,
      focused: true,
    });

    if (
      !newWindow ||
      !newWindow.id ||
      !newWindow.tabs ||
      newWindow.tabs.length === 0
    )
      continue;
    const windowId = newWindow.id;
    const firstCreatedTabId = newWindow.tabs[0].id;
    if (firstCreatedTabId === undefined) continue;

    if (firstTab.pinned) {
      await chrome.tabs.update(firstCreatedTabId, { pinned: true });
    }

    // Create remaining tabs
    const createdTabs = [
      { id: firstCreatedTabId, oldGroupId: firstTab.groupId },
    ];
    for (let i = 1; i < tabs.length; i++) {
      const tabInfo = tabs[i];
      const newTab = await chrome.tabs.create({
        windowId: windowId,
        url: tabInfo.url,
        pinned: tabInfo.pinned,
      });
      if (newTab && newTab.id !== undefined) {
        createdTabs.push({ id: newTab.id, oldGroupId: tabInfo.groupId });
      }
    }

    // Restore tab groups if definitions are available
    if (groupDefinitions.size > 0) {
      const windowGroups = Array.from(groupDefinitions.values()).filter(
        (g) => g.windowId === oldWindowId,
      );

      for (const oldGroup of windowGroups) {
        const tabIdsInGroup = createdTabs
          .filter((t) => t.oldGroupId === oldGroup.id)
          .map((t) => t.id);

        if (tabIdsInGroup.length > 0) {
          const newGroupId = await /** @type {Promise<number>} */ (
            chrome.tabs.group({
              tabIds: /** @type {any} */ (tabIdsInGroup),
              createProperties: { windowId: windowId },
            })
          );
          await chrome.tabGroups.update(newGroupId, {
            title: oldGroup.title,
            color: oldGroup.color,
            collapsed: oldGroup.collapsed,
          });
        }
      }
    }
  }

  return { success: true };
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

  const items = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await raindropRequest(
      `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}`,
      tokens,
    );
    const pageItems = Array.isArray(response?.items) ? response.items : [];
    items.push(...pageItems);

    if (pageItems.length < FETCH_PAGE_SIZE) {
      hasMore = false;
    } else {
      page += 1;
    }
  }

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
const NOTIFICATION_ICON_PATH = 'assets/icons/icon-128x128.png';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const FETCH_PAGE_SIZE = 50; // Raindrop API limits perpage to 50 max for some endpoints
const DEFAULT_BADGE_ANIMATION_DELAY = 300;

const ANIMATION_DOWN_SEQUENCE = ['🔽', '⏬'];
const ANIMATION_UP_SEQUENCE = ['🔼', '⏫'];
const AUTO_EXPORT_ALARM_NAME = 'nenya-session-export';
const AUTO_EXPORT_INTERVAL_MINUTES = 1;

/** @type {BadgeAnimationHandle | null} */
let currentBadgeAnimationHandle = null;
let badgeAnimationSequence = 0;
let lastStartedBadgeToken = 0;
/** @type {Map<string, string>} */
const notificationLinks = new Map();
/** @type {NotificationPreferences} */
let notificationPreferencesCache = createDefaultNotificationPreferences();
let notificationPreferencesLoaded = false;
/** @type {Promise<NotificationPreferences> | null} */
let notificationPreferencesPromise = null;
/** @type {Record<string, string> | null} */
let itemBookmarkMapCache = null;
/** @type {Promise<Record<string, string>> | null} */
let itemBookmarkMapPromise = null;

if (chrome && chrome.notifications) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    const targetUrl = notificationLinks.get(notificationId);
    if (!targetUrl) {
      return;
    }

    notificationLinks.delete(notificationId);

    if (!chrome.tabs || typeof chrome.tabs.create !== 'function') {
      return;
    }

    try {
      // Convert nenya.local split URLs back to extension format
      const restoredUrl = convertSplitUrlForRestore(targetUrl);
      const maybePromise = chrome.tabs.create({ url: restoredUrl });
      if (isPromiseLike(maybePromise)) {
        void maybePromise.catch((error) => {
          console.warn(
            '[notifications] Failed to open tab for notification click:',
            error,
          );
        });
      }
    } catch (error) {
      console.warn(
        '[notifications] Failed to open tab for notification click:',
        error,
      );
    }
  });

  chrome.notifications.onClosed.addListener((notificationId) => {
    notificationLinks.delete(notificationId);
  });
}

/**
 * Update the extension action badge text.
 * @param {string} text
 * @returns {void}
 */
function setActionBadgeText(text) {
  if (!chrome?.action) {
    return;
  }

  const badgeText = typeof text === 'string' ? text : '';

  try {
    const maybePromise = chrome.action.setBadgeText({ text: badgeText });
    if (maybePromise && typeof maybePromise.then === 'function') {
      void maybePromise.catch((error) => {
        console.warn('[badge] Failed to set badge text:', error);
      });
    }
  } catch (error) {
    console.warn('[badge] Failed to set badge text:', error);
  }
}

/**
 * Set the extension action badge text and color.
 * @param {string} text
 * @param {string} color
 * @param {number} [clearDelayMs=0]
 * @returns {void}
 */
function setActionBadge(text, color, clearDelayMs = 0) {
  if (!chrome?.action) {
    return;
  }

  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });

  if (clearDelayMs > 0) {
    setTimeout(() => {
      chrome.action.setBadgeBackgroundColor({ color: '' });
      chrome.action.setBadgeText({ text: '' });
    }, clearDelayMs);
  }
}

/**
 * Animate the extension action badge with emoji frames.
 * @param {string[]} emojis
 * @param {number} [delayMs=DEFAULT_BADGE_ANIMATION_DELAY]
 * @returns {BadgeAnimationHandle}
 */
export function animateActionBadge(
  emojis,
  delayMs = DEFAULT_BADGE_ANIMATION_DELAY,
) {
  badgeAnimationSequence += 1;
  const token = badgeAnimationSequence;

  if (currentBadgeAnimationHandle) {
    currentBadgeAnimationHandle.stop();
    currentBadgeAnimationHandle = null;
  }

  lastStartedBadgeToken = token;

  /** @type {ReturnType<typeof setInterval> | null} */
  let intervalId = null;

  /** @type {BadgeAnimationHandle} */
  const handle = {
    token,
    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (
        currentBadgeAnimationHandle &&
        currentBadgeAnimationHandle.token === token
      ) {
        currentBadgeAnimationHandle = null;
      }
      setActionBadgeText('');
    },
  };

  if (!chrome?.action || !Array.isArray(emojis)) {
    return handle;
  }

  const frames = emojis
    .map((emoji) => {
      if (typeof emoji !== 'string') {
        return '';
      }
      const trimmed = emoji.trim();
      return trimmed;
    })
    .filter((emoji) => emoji.length > 0);

  if (frames.length === 0) {
    return handle;
  }

  const computedDelay = Number(delayMs);
  const frameDelay =
    Number.isFinite(computedDelay) && computedDelay > 0
      ? computedDelay
      : DEFAULT_BADGE_ANIMATION_DELAY;

  let frameIndex = 0;

  const tick = () => {
    const nextText = frames[frameIndex];
    frameIndex = (frameIndex + 1) % frames.length;
    setActionBadgeText(nextText);
  };

  tick();
  intervalId = setInterval(tick, frameDelay);
  currentBadgeAnimationHandle = handle;

  return handle;
}

/**
 * Stop a badge animation and optionally show a final emoji if this is the latest started animation.
 * @param {BadgeAnimationHandle} handle
 * @param {string} finalEmoji
 * @returns {void}
 */
function concludeActionBadge(handle, finalEmoji) {
  if (!handle) {
    return;
  }

  badgeAnimationSequence += 1;
  const clearToken = badgeAnimationSequence;

  const isCurrent = Boolean(
    currentBadgeAnimationHandle &&
    currentBadgeAnimationHandle.token === handle.token,
  );
  const isLatestStart = handle.token === lastStartedBadgeToken;
  if (isCurrent) {
    handle.stop();
  }
  if (!isLatestStart) {
    return;
  }

  setActionBadgeText(finalEmoji);

  setTimeout(() => {
    if (badgeAnimationSequence !== clearToken) {
      return;
    }
    setActionBadgeText('');
  }, 2000);
}

/**
 * Create the default notification preferences object.
 * @returns {NotificationPreferences}
 */
function createDefaultNotificationPreferences() {
  return {
    enabled: true,
    bookmark: {
      enabled: true,
      pullFinished: true,
      unsortedSaved: true,
    },
    clipboard: {
      enabled: true,
      copySuccess: true,
    },
  };
}

/**
 * Clone notification preferences to avoid shared references.
 * @param {NotificationPreferences} value
 * @returns {NotificationPreferences}
 */
function cloneNotificationPreferences(value) {
  return {
    enabled: Boolean(value.enabled),
    bookmark: {
      enabled: Boolean(value.bookmark.enabled),
      pullFinished: Boolean(value.bookmark.pullFinished),
      unsortedSaved: Boolean(value.bookmark.unsortedSaved),
    },
    clipboard: {
      enabled: Boolean(value.clipboard?.enabled),
      copySuccess: Boolean(value.clipboard?.copySuccess),
    },
  };
}

function normalizeNotificationPreferences(value) {
  const fallback = createDefaultNotificationPreferences();
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw =
    /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings>, clipboard?: Partial<NotificationClipboardSettings> }} */ (
      value
    );
  const bookmark = raw.bookmark ?? {};
  const clipboard = raw.clipboard ?? {};

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    bookmark: {
      enabled:
        typeof bookmark.enabled === 'boolean'
          ? bookmark.enabled
          : fallback.bookmark.enabled,
      pullFinished:
        typeof bookmark.pullFinished === 'boolean'
          ? bookmark.pullFinished
          : fallback.bookmark.pullFinished,
      unsortedSaved:
        typeof bookmark.unsortedSaved === 'boolean'
          ? bookmark.unsortedSaved
          : fallback.bookmark.unsortedSaved,
    },
    clipboard: {
      enabled:
        typeof clipboard.enabled === 'boolean'
          ? clipboard.enabled
          : fallback.clipboard.enabled,
      copySuccess:
        typeof clipboard.copySuccess === 'boolean'
          ? clipboard.copySuccess
          : fallback.clipboard.copySuccess,
    },
  };
}

/**
 * Load notification preferences from storage.
 * @returns {Promise<NotificationPreferences>}
 */
async function loadNotificationPreferences() {
  if (!chrome?.storage?.local) {
    const defaults = createDefaultNotificationPreferences();
    updateNotificationPreferencesCache(defaults);
    return defaults;
  }

  try {
    const result = await chrome.storage.local.get(NOTIFICATION_PREFERENCES_KEY);
    const stored = result?.[NOTIFICATION_PREFERENCES_KEY];
    const normalized = normalizeNotificationPreferences(stored);
    updateNotificationPreferencesCache(normalized);
  } catch (error) {
    console.warn(
      '[notifications] Failed to load preferences; using defaults.',
      error,
    );
    const defaults = createDefaultNotificationPreferences();
    updateNotificationPreferencesCache(defaults);
  }

  return notificationPreferencesCache;
}

/**
 * Retrieve cached notification preferences, loading them if needed.
 * @returns {Promise<NotificationPreferences>}
 */
export async function getNotificationPreferences() {
  if (notificationPreferencesLoaded) {
    return notificationPreferencesCache;
  }

  if (!notificationPreferencesPromise) {
    notificationPreferencesPromise = loadNotificationPreferences().finally(
      () => {
        notificationPreferencesPromise = null;
      },
    );
  }

  return notificationPreferencesPromise;
}

/**
 * Respond to updates from chrome.storage for notification preferences.
 * @param {NotificationPreferences} value
 * @returns {void}
 */
function updateNotificationPreferencesCache(value) {
  notificationPreferencesCache = cloneNotificationPreferences(value);
  notificationPreferencesLoaded = true;
}

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    const detail = changes[NOTIFICATION_PREFERENCES_KEY];
    if (!detail) {
      return;
    }

    const next = normalizeNotificationPreferences(detail.newValue);
    updateNotificationPreferencesCache(next);
  });
}

// Listen for chrome.alarms events
if (chrome?.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_EXPORT_ALARM_NAME) {
      void handleAutoExportAlarm();
    }
  });
}

/**
 * Create a unique notification id.
 * @param {string} prefix
 * @returns {string}
 */
function createNotificationId(prefix) {
  const base =
    typeof prefix === 'string' && prefix.trim().length > 0
      ? prefix.trim()
      : 'nenya';
  const random = Math.random().toString(36).slice(2, 10);
  return base + '-' + Date.now().toString(36) + '-' + random;
}

/**
 * Resolve the notification icon URL.
 * @returns {string}
 */
function getNotificationIconUrl() {
  if (
    !chrome ||
    !chrome.runtime ||
    typeof chrome.runtime.getURL !== 'function'
  ) {
    return NOTIFICATION_ICON_PATH;
  }

  try {
    return chrome.runtime.getURL(NOTIFICATION_ICON_PATH);
  } catch (error) {
    console.warn('[notifications] Failed to resolve icon URL:', error);
    return NOTIFICATION_ICON_PATH;
  }
}

/**
 * Create a Chrome notification.
 * @param {string} prefix
 * @param {string} title
 * @param {string} message
 * @param {string} [targetUrl]
 * @param {string} [contextMessage]
 * @returns {Promise<void>}
 */
export async function pushNotification(
  prefix,
  title,
  message,
  targetUrl,
  contextMessage,
) {
  if (!chrome || !chrome.notifications) {
    return;
  }

  const safeTitle =
    typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : 'Nenya';
  const safeMessage =
    typeof message === 'string' && message.trim().length > 0
      ? message.trim()
      : '';

  if (safeMessage.length === 0) {
    return;
  }

  const notificationId = createNotificationId(prefix);
  /** @type {chrome.notifications.NotificationCreateOptions} */
  const options = {
    type: 'basic',
    iconUrl: getNotificationIconUrl(),
    title: safeTitle,
    message: safeMessage,
    priority: 0,
  };

  if (typeof contextMessage === 'string' && contextMessage.trim().length > 0) {
    options.contextMessage = contextMessage.trim();
  }

  let created = false;

  created = await new Promise((resolve) => {
    try {
      chrome.notifications.create(notificationId, options, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.warn(
            '[notifications] Failed to create notification:',
            lastError.message,
          );
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      console.warn('[notifications] Failed to create notification:', error);
      resolve(false);
    }
  });

  if (created && targetUrl) {
    notificationLinks.set(notificationId, targetUrl);
  }
}

/**
 * Normalize notification message text.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeNotificationMessage(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return 'Unknown error.';
  }
  if (text.length <= 180) {
    return text;
  }
  return text.slice(0, 177) + '...';
}

/**
 * Format a count with a noun.
 * @param {number} count
 * @param {string} noun
 * @returns {string}
 */
function formatCountLabel(count, noun) {
  const safeCount = Number.isFinite(count) ? count : 0;
  const baseNoun = noun.trim();
  if (safeCount === 1) {
    return safeCount + ' ' + baseNoun;
  }
  if (baseNoun.endsWith('y')) {
    return safeCount + ' ' + baseNoun.slice(0, -1) + 'ies';
  }
  return safeCount + ' ' + baseNoun + 's';
}

const MIRROR_STAT_LABELS = {
  foldersCreated: ['folder created', 'folders created'],
  foldersRemoved: ['folder removed', 'folders removed'],
  foldersMoved: ['folder moved', 'folders moved'],
  bookmarksCreated: ['bookmark created', 'bookmarks created'],
  bookmarksUpdated: ['bookmark updated', 'bookmarks updated'],
  bookmarksMoved: ['bookmark moved', 'bookmarks moved'],
  bookmarksDeleted: ['bookmark deleted', 'bookmarks deleted'],
};

/**
 * Notify about the result of saving URLs to Unsorted.
 * @param {SaveUnsortedResult} summary
 * @returns {Promise<void>}
 */
async function notifyUnsortedSaveOutcome(summary) {
  if (!summary) {
    return;
  }

  const preferences = await getNotificationPreferences();
  if (
    !preferences.enabled ||
    !preferences.bookmark.enabled ||
    !preferences.bookmark.unsortedSaved
  ) {
    return;
  }

  if (summary.ok) {
    const createdCount = Number(summary.created || 0);
    const updatedCount = Number(summary.updated || 0);
    const savedCount = createdCount + updatedCount;
    const title = 'Saved to Unsorted';
    const message =
      'Saved ' +
      savedCount +
      ' ' +
      (savedCount === 1 ? 'URL' : 'URLs') +
      ' to Raindrop Unsorted.';
    const contextParts = [];

    if (savedCount === 0) {
      contextParts.push('All provided URLs were already saved.');
    }

    if (summary.skipped > 0) {
      contextParts.push(formatCountLabel(summary.skipped, 'duplicate'));
    }

    const contextMessage =
      contextParts.length > 0 ? contextParts.join(', ') : undefined;
    await pushNotification(
      'unsorted-success',
      title,
      message,
      RAINDROP_UNSORTED_URL,
      contextMessage,
    );
    return;
  }

  const reason =
    summary.error ||
    (Array.isArray(summary.errors) ? summary.errors[0] : '') ||
    'Unknown error.';
  await pushNotification(
    'unsorted-failure',
    'Failed to Save URLs',
    sanitizeNotificationMessage(reason),
  );
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
    const shouldProcessUrl = options.skipUrlProcessing !== true;

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

      const processedUrl = shouldProcessUrl
        ? await processUrl(normalizedUrl, 'save-to-raindrop')
        : normalizedUrl;

      const finalUrl = convertSplitUrlForSave(processedUrl);

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

    for (const entry of dedupeResult.entries) {
      try {
        const pleaseParse = options.pleaseParse || !entry.title;
        const payload = {
          link: entry.url,
          collectionId: -1,
          ...(pleaseParse ? { pleaseParse: {} } : {}),
          ...(entry.cover ? { cover: entry.cover } : {}),
          ...(entry.title ? { title: entry.title } : {}),
          ...(entry.excerpt ? { excerpt: entry.excerpt } : {}),
        };

        const response = await raindropRequest('/raindrop', tokens, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response || typeof response !== 'object' || !response.item) {
          throw new Error(
            'Invalid response from Raindrop API: missing item field',
          );
        }

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
            `/raindrop/${response.item._id}/cover`,
            tokens,
            {
              method: 'PUT',
              body: formData,
            },
          );
        }

        summary.created += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push(
          entry.url +
          ': ' +
          (error instanceof Error ? error.message : String(error)),
        );
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
    const EXCLUDED_COLLECTION_NAME = 'nenya / options backup';

    // Identify excluded collection IDs
    const excludedCollectionIds = new Set();
    allCollections.forEach((c) => {
      if (c.title?.toLowerCase() === EXCLUDED_COLLECTION_NAME) {
        excludedCollectionIds.add(c._id);
      }
    });

    // Create a map of collectionId -> title and collectionId -> parentId
    const SESSIONS_COLLECTION_NAME = 'nenya / sessions';
    let sessionsCollectionId = null;
    const collectionIdTitleMap = new Map();
    const collectionIdParentMap = new Map();
    allCollections.forEach((c) => {
      if (c.title === SESSIONS_COLLECTION_NAME) {
        sessionsCollectionId = c._id;
      }
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
          // Check if this collection is a session (child of "nenya / sessions")
          const parentId = collectionIdParentMap.get(item.collectionId);
          if (sessionsCollectionId && parentId === sessionsCollectionId) {
            item.isSession = true;
          }
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
          if (sessionsCollectionId && parentId === sessionsCollectionId) {
            c.isSession = true;
          }
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

const BROWSER_ID_WORDS = [
  // Animals
  'Tiger',
  'Panda',
  'Eagle',
  'Dolphin',
  'Wolf',
  'Lion',
  'Fox',
  'Owl',
  'Bear',
  'Shark',
  'Leopard',
  'Falcon',
  'Penguin',
  'Rabbit',
  'Otter',
  'Raven',
  'Lynx',
  'Snake',
  'Horse',
  'Elephant',
  'Moose',
  'Giraffe',
  'Zebra',
  'Koala',
  'Wombat',
  'Peacock',
  'Cheetah',
  'Hawk',
  'Viper',
  'Cobra',
  'Frog',
  'Kangaroo',
  'Coyote',
  'Mole',
  'Bison',
  'Hedgehog',
  'Platypus',

  // Colors
  'Red',
  'Blue',
  'Green',
  'Gold',
  'Silver',
  'Amber',
  'Emerald',
  'Sapphire',
  'Ruby',
  'Onyx',
  'Violet',
  'Indigo',
  'Crimson',
  'Scarlet',
  'Ivory',
  'Teal',
  'Cyan',
  'Coral',
  'Lilac',
  'Rose',
  'Charcoal',
  'Bronze',
  'Pearl',
  'Jade',
  'Turquoise',
  'Azure',
  'Lavender',
  'Magenta',
  'Sand',
  'Obsidian',

  // Cities
  'Tokyo',
  'Paris',
  'London',
  'Berlin',
  'Oslo',
  'Seoul',
  'Sydney',
  'Istanbul',
  'Vienna',
  'Rome',
  'Madrid',
  'Dublin',
  'Moscow',
  'Toronto',
  'Prague',
  'Venice',
  'Zurich',
  'Cairo',
  'Lisbon',
  'Dubai',
  'Boston',
  'Chicago',
  'Munich',
  'Budapest',
  'Amsterdam',
  'Athens',
  'Stockholm',
  'Helsinki',
  'Brussels',
  'Edinburgh',

  // Famous People (first names or surnames for privacy)
  'Newton',
  'Tesla',
  'Einstein',
  'Curie',
  'DaVinci',
  'Hopper',
  'Turing',
  'Edison',
  'Galileo',
  'Ada',
  'Elvis',
  'Oprah',
  'Cleo',
  'Lincoln',
  'Gandhi',
  'Mozart',
  'Bowie',
  'Picasso',
  'Nightingale',
  'Aristotle',
  'Bach',
  'Hemingway',
  'Jobs',
  'Sagan',
  'Amelia',
  'Earhart',
  'Mandela',
  'Houdini',
  'Grace',
  'Marie',

  // Common Objects
  'Rocket',
  'Comet',
  'Anchor',
  'Bridge',
  'Compass',
  'Lantern',
  'Quill',
  'Candle',
  'Mirror',
  'Globe',
  'Pencil',
  'Hammer',
  'Anvil',
  'Vase',
  'Helmet',
  'Book',
  'Map',
  'Clock',
  'Bell',
  'Flute',
  'Violin',
  'Crown',
  'Key',
  'Locket',
  'Pinwheel',
  'Coin',
  'Scarf',
  'Boot',
  'Cup',
  'Bottle',

  // Misc
  'Storm',
  'Cloud',
  'Drift',
  'Blaze',
  'Spark',
  'Zenith',
  'Echo',
  'Nova',
  'Bliss',
  'Quest',
];

/**
 * Generate a stable unique browser ID and save it to storage.
 * Format: "<Browser Brand> - <OS type> - <random word>"
 * @param {Set<string>} [existingNames=new Set()]
 * @returns {Promise<string>}
 */
async function getOrCreateBrowserId(existingNames = new Set()) {
  const result = await chrome.storage.local.get('browserId');
  if (result.browserId) {
    return result.browserId;
  }

  // Get OS info
  const platformInfo = await chrome.runtime.getPlatformInfo();
  let os = 'UnknownOS';
  if (platformInfo.os === 'mac') os = 'Mac';
  else if (platformInfo.os === 'win') os = 'Windows';
  else if (platformInfo.os === 'linux') os = 'Linux';
  else if (platformInfo.os === 'cros') os = 'ChromeOS';
  else if (platformInfo.os === 'android') os = 'Android';

  // Determine Browser Brand (roughly)
  let brand = 'Chrome';
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) brand = 'Edge';
  else if (ua.includes('Brave/')) brand = 'Brave';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) brand = 'Opera';

  let browserId = '';
  let attempts = 0;
  const MAX_ATTEMPTS = 50;

  do {
      // Pick random word
      const word = BROWSER_ID_WORDS[Math.floor(Math.random() * BROWSER_ID_WORDS.length)];
      browserId = `${brand} - ${os} - ${word}`;
      attempts++;
  } while (existingNames.has(browserId) && attempts < MAX_ATTEMPTS);

  if (attempts >= MAX_ATTEMPTS) {
      console.warn('Could not generate unique browser ID after ' + MAX_ATTEMPTS + ' attempts. Appending timestamp.');
      browserId += ` - ${Date.now()}`;
  }

  await chrome.storage.local.set({ browserId });
  return browserId;
}

/** @type {Promise<void> | null} */
let ensureNenyaSessionsCollectionPromise = null;

/** @type {number | null} */
let deviceCollectionId = null;
/** @type {Promise<void> | null} */
let currentExportPromise = null;
/** @type {Promise<number> | null} */
let ensuringDeviceCollectionPromise = null;

/**
 * Get or create the parent "nenya / sessions" collection.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<number>}
 */
async function ensureSessionsCollection(tokens) {
  const SESSIONS_COLLECTION_NAME = 'nenya / sessions';

  // 1. Fetch root level collections
  const response = await raindropRequest('/collections', tokens);
  const collections = Array.isArray(response?.items) ? response.items : [];

  // 2. Check if there is one named "nenya / sessions"
  const sessionsCollection = collections.find(
    (c) => c.title === SESSIONS_COLLECTION_NAME,
  );

  // 3. If no, create it
  let sessionsCollectionId;
  if (!sessionsCollection) {
    console.log(
      `[mirror] Creating Raindrop collection: ${SESSIONS_COLLECTION_NAME}`,
    );
    const createResult = await raindropRequest('/collection', tokens, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: SESSIONS_COLLECTION_NAME,
      }),
    });
    sessionsCollectionId = createResult?.item?._id;
    console.log(`[mirror] Collection created: ${SESSIONS_COLLECTION_NAME}`);
  } else {
    sessionsCollectionId = sessionsCollection._id;
    console.log(
      `[mirror] Raindrop collection already exists: ${SESSIONS_COLLECTION_NAME}`,
    );
  }

  if (!sessionsCollectionId) {
    throw new Error('Failed to obtain sessions collection ID');
  }

  return sessionsCollectionId;
}

/**
 * Ensure the device collection exists without deleting it.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<number>}
 */
async function ensureDeviceCollection(tokens) {
  if (ensuringDeviceCollectionPromise) {
    return ensuringDeviceCollectionPromise;
  }

  ensuringDeviceCollectionPromise = (async () => {
    const sessionsCollectionId = await ensureSessionsCollection(tokens);

    // Fetch children of "nenya / sessions"
    const childrenResult = await raindropRequest(
      '/collections/childrens',
      tokens,
    );
    const childCollections = Array.isArray(childrenResult?.items)
      ? childrenResult.items
      : [];

    const sessions = childCollections.filter(
      (c) => c.parent?.$id === sessionsCollectionId,
    );
    const existingNames = new Set(sessions.map((c) => c.title));
    const browserId = await getOrCreateBrowserId(existingNames);

    const deviceCollection = sessions.find(
      (c) => c.title === browserId,
    );

    if (deviceCollection) {
      console.log(`[mirror] Found existing device collection: ${browserId}`);
      return deviceCollection._id;
    }

    // Create new if not exists
    console.log(`[mirror] Creating new device collection: ${browserId}`);
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
    const newCollectionId = createResult?.item?._id;

    if (!newCollectionId) {
      throw new Error('Failed to create device collection');
    }

    return newCollectionId;
  })();

  // Clear the lock when done
  ensuringDeviceCollectionPromise.finally(() => {
    ensuringDeviceCollectionPromise = null;
  });

  return ensuringDeviceCollectionPromise;
}

/**
 * Complete export flow: delete old collection, create new one, and export session.
 * This function follows the required three-step process:
 * 1. Delete entire old device collection on raindrop
 * 2. Create new device collection
 * 3. Create raindrop items from current session
 * @param {StoredProviderTokens} [providedTokens]
 * @returns {Promise<void>}
 */
/**
 * Unified entry point for exporting the current session.
 * Handles locking, token validation, and collection insurance.
 * @param {any} [providedTokens]
 * @param {number} [providedCollectionId]
 * @returns {Promise<void>}
 */
async function ensureDeviceCollectionAndExport(providedTokens, providedCollectionId) {
  // Prevent concurrent exports - if one is already running, wait for it
  if (currentExportPromise) {
    console.log('[mirror] Export already in progress, waiting...');
    await currentExportPromise;
    console.log('[mirror] Previous export completed, starting new export');
  }

  // Create a new export promise
  currentExportPromise = (async () => {
    try {
      console.log('[mirror] ===== Starting new export =====');

      // Get valid tokens
      const tokens = providedTokens || (await loadValidProviderTokens());
      if (!tokens) {
        console.log('[mirror] No valid tokens, skipping export');
        return;
      }

      // Step 1: Ensure device collection exists (non-destructive) or use provided ID
      let collectionId = providedCollectionId;
      if (!collectionId) {
        console.log(
          '[mirror] Step 1: Ensuring device collection existing',
        );
        collectionId = await ensureDeviceCollection(tokens);
      }
      console.log(`[mirror] Device collection ID: ${collectionId}`);

      // Store for future auto-exports
      deviceCollectionId = collectionId;

      // Step 3: Create raindrop items from current session
      console.log('[mirror] Step 3: Creating new items from current session');
      await exportCurrentSessionToRaindrop(collectionId, tokens);

      console.log('[mirror] ===== Export completed successfully =====');
    } catch (error) {
      console.warn('[mirror] Export failed:', error);
      throw error;
    } finally {
      // Clear the promise so next export can proceed
      currentExportPromise = null;
    }
  })();

  return currentExportPromise;
}

/**
 * Ensure the "nenya / sessions" collection exists in Raindrop.
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

      // Use the unified export function
      await ensureDeviceCollectionAndExport(tokens);

      // Start auto-export if not already running
      startAutoExport();
    } catch (error) {
      console.warn(
        '[mirror] Failed to ensure nenya sessions collection:',
        error,
      );
    }
  })();

  return ensureNenyaSessionsCollectionPromise;
}

/**
 * Delete all items in a Raindrop collection.
 * Step 1: Fetch all item IDs from all pages
 * Step 2: Batch delete all items
 * @param {number} collectionId
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<void>}
 */
async function deleteAllItemsInCollection(collectionId, tokens) {
  try {
    console.log(
      `[mirror] Starting to delete all items from collection ${collectionId}`,
    );

    // Step 1: Fetch all item IDs from all pages
    const allItemIds = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await raindropRequest(
        `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}`,
        tokens,
      );
      const items = Array.isArray(response?.items) ? response.items : [];

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      // Extract and collect item IDs
      const itemIds = items
        .map((item) => extractItemId(item))
        .filter((id) => Number.isFinite(id));

      allItemIds.push(...itemIds);

      // Check if there are more pages
      if (items.length < FETCH_PAGE_SIZE) {
        hasMore = false;
      } else {
        page += 1;
      }
    }

    console.log(
      `[mirror] Found ${allItemIds.length} items to delete from collection ${collectionId}`,
    );

    // Step 2: Batch delete all items (in chunks if needed)
    if (allItemIds.length > 0) {
      // Raindrop batch delete API limit
      const DELETE_CHUNK_SIZE = 100;
      for (let i = 0; i < allItemIds.length; i += DELETE_CHUNK_SIZE) {
        const chunk = allItemIds.slice(i, i + DELETE_CHUNK_SIZE);
        console.log(
          `[mirror] Deleting items ${i + 1}-${Math.min(
            i + chunk.length,
            allItemIds.length,
          )} of ${allItemIds.length}`,
          chunk,
        );

        // Use the correct API endpoint: DELETE /raindrops/{collectionId}
        // We send both 'ids' and 'id' to be safe as documentation is ambiguous
        const response = await raindropRequest(
          `/raindrops/${collectionId}`,
          tokens,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: chunk, id: chunk }),
          },
        );

        console.log(
          `[mirror] Delete response for chunk ${i / DELETE_CHUNK_SIZE + 1}:`,
          response,
        );

        // If DELETE didn't work (modified: 0), try the fallback method:
        // Moving items to Trash (-99) using PUT
        if (response && response.modified === 0 && chunk.length > 0) {
          console.log(
            '[mirror] DELETE returned modified: 0. Trying fallback: move to Trash via PUT',
          );
          const fallbackResponse = await raindropRequest(
            `/raindrops/${collectionId}`,
            tokens,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ids: chunk,
                collection: { $id: -99 },
              }),
            },
          );
          console.log('[mirror] Fallback PUT response:', fallbackResponse);
        }
      }

      console.log(
        `[mirror] Successfully deleted ${allItemIds.length} items from collection ${collectionId}`,
      );
    } else {
      console.log(
        `[mirror] Collection ${collectionId} is already empty, no items to delete`,
      );
    }
  } catch (error) {
    console.warn(
      `[mirror] Failed to delete items from collection ${collectionId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Check if any browser window is active (not minimized or hidden).
 * @returns {Promise<boolean>}
 */
async function checkIfAnyWindowIsActive() {
  try {
    const windows = await chrome.windows.getAll();
    return windows.some((win) => win.state !== 'minimized');
  } catch (error) {
    console.warn('[mirror] Failed to check window state:', error);
    return false;
  }
}

/**
 * Handle auto-export when alarm fires.
 * @returns {Promise<void>}
 */
async function handleAutoExportAlarm() {
  try {
    // Check if any window is active
    const isAnyWindowActive = await checkIfAnyWindowIsActive();
    if (!isAnyWindowActive) {
      console.log('[mirror] No active windows, skipping auto-export');
      return;
    }

    console.log('[mirror] Auto-export triggered');

    // Use the unified export function that follows the three-step process:
    // 1. Create device collection if not exists, reuse if exists
    // 2. Delete ALL raindrop items in the collection with batch API
    // 3. Save new raindrop items to the collection with batch API
    await ensureDeviceCollectionAndExport();
  } catch (error) {
    console.warn('[mirror] Auto-export failed:', error);
  }
}

/**
 * Start the auto-export alarm.
 * @returns {void}
 */
function startAutoExport() {
  if (!chrome?.alarms) {
    console.warn('[mirror] chrome.alarms API not available');
    return;
  }

  console.log('[mirror] Starting auto-export alarm (every 1 minute)');

  // Create a repeating alarm that fires every minute
  chrome.alarms.create(AUTO_EXPORT_ALARM_NAME, {
    delayInMinutes: AUTO_EXPORT_INTERVAL_MINUTES,
    periodInMinutes: AUTO_EXPORT_INTERVAL_MINUTES,
  });
}

/**
 * Stop the auto-export alarm.
 * @returns {void}
 */
function stopAutoExport() {
  if (!chrome?.alarms) {
    return;
  }

  chrome.alarms.clear(AUTO_EXPORT_ALARM_NAME, (wasCleared) => {
    if (wasCleared) {
      console.log('[mirror] Stopped auto-export alarm');
    }
  });
}

/**
 * Export all open tabs and metadata to a specific device collection.
 * @param {number} deviceCollectionId
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<void>}
 */
/**
 * Generate a unique ID for a tab based on its window ID.
 * @param {number} tabId
 * @param {number} windowId
 * @returns {string}
 */
function getTabUniqueId(tabId, windowId) {
  return `${tabId}-${windowId}`;
}

/**
 * Compare two tab objects to see if they differ.
 * @param {object} item
 * @param {object} tab
 * @param {string} finalUrl
 * @param {object} excerptData
 * @returns {boolean}
 */
function hasTabChanged(item, tab, finalUrl, excerptData) {
  // Check basic fields
  if (item.link !== finalUrl) return true;
  if (item.title !== (tab.title || 'Untitled')) return true;

  // Check metadata fields
  const oldData = getItemMetadata(item);
  if (Object.keys(oldData).length === 0) return true; // Force update if no metadata

  // Check windowId (defensive check - shouldn't change for same uniqueId, but verify)
  if (oldData.windowId !== excerptData.windowId) return true;
  // Check tabId (defensive check)
  if (oldData.tabId !== excerptData.tabId) return true;
  
  if (oldData.pinned !== excerptData.pinned) return true;
  if (oldData.index !== excerptData.index) return true;
  if (oldData.tabGroupId !== excerptData.tabGroupId) return true;

  // Check group details if they exist
  if (excerptData.tabGroupId > -1) {
    if (oldData.groupTitle !== excerptData.groupTitle) return true;
    if (oldData.groupColor !== excerptData.groupColor) return true;
    if (oldData.groupCollapsed !== excerptData.groupCollapsed) return true;
  }

  return false;
}

/**
 * Upload a cover image to a Raindrop item from a tab snapshot thumbnail.
 * @param {string} raindropId - The Raindrop item ID
 * @param {string} thumbnailDataUrl - Base64 data URL of the thumbnail
 * @param {Object} tokens - Raindrop authentication tokens
 * @returns {Promise<void>}
 */
async function uploadCoverFromSnapshot(raindropId, thumbnailDataUrl, tokens) {
  try {
    if (!thumbnailDataUrl || thumbnailDataUrl.length === 0) {
      return; // No thumbnail available
    }

    // Convert data URL to blob
    const blob = await (await fetch(thumbnailDataUrl)).blob();
    const formData = new FormData();
    formData.append('cover', blob, 'screenshot.jpg');

    await raindropRequest(`/raindrop/${raindropId}/cover`, tokens, {
      method: 'PUT',
      body: formData,
    });
  } catch (error) {
    console.warn(
      `[mirror] Failed to upload cover from snapshot for raindrop ${raindropId}:`,
      error,
    );
    // Don't throw - cover upload failure shouldn't break the sync
  }
}

async function exportCurrentSessionToRaindrop(deviceCollectionId, tokens) {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const groups = await chrome.tabGroups.query({});
    const groupsMap = new Map();
    groups.forEach((g) => groupsMap.set(g.id, g));

    // 1. Fetch ALL existing items from Raindrop
    const existingItems = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const pageItems = await fetchRaindropItems(tokens, deviceCollectionId, page);
      if (pageItems && pageItems.length > 0) {
        existingItems.push(...pageItems);
        // Optimization: if less than page size, we are done
        if (pageItems.length < FETCH_PAGE_SIZE) hasMore = false;
        else page++;
      } else {
        hasMore = false;
      }
    }

    // Maps for matching current tabs to existing Raindrop items
    const metadataMap = new Map(); // uniqueId -> item (keep only one per uniqueId)
    const duplicateIdsByUniqueId = new Map(); // uniqueId -> Array<item._id> (track duplicates for deletion)
    const urlMap = new Map(); // url -> Array<item> (only for items without metadata)
    const allExistingIds = new Set();

    existingItems.forEach((item) => {
      allExistingIds.add(item._id);
      const data = getItemMetadata(item);
      if (data.tabId !== undefined && data.windowId !== undefined) {
        const uniqueId = getTabUniqueId(data.tabId, data.windowId);
        if (!metadataMap.has(uniqueId)) {
          // First item with this uniqueId - keep it
          metadataMap.set(uniqueId, item);
          duplicateIdsByUniqueId.set(uniqueId, []);
        } else {
          // Duplicate found - track it for deletion
          const duplicates = duplicateIdsByUniqueId.get(uniqueId) || [];
          duplicates.push(item._id);
          duplicateIdsByUniqueId.set(uniqueId, duplicates);
        }
      } else {
        // If metadata is missing or invalid, index by URL as a fallback
        // Only use this for items that truly have no metadata
        const url = item.link;
        if (!urlMap.has(url)) {
          urlMap.set(url, []);
        }
        urlMap.get(url).push(item);
      }
    });

    const toCreate = [];
    const toUpdate = [];
    const processedRaindropIds = new Set();

    // 2. Identify Creates and Updates
    for (const win of windows) {
      if (!win.tabs) continue;

      for (const tab of win.tabs) {
        if (!tab.url) continue;

        const finalUrl = isValidRaindropUrl(tab.url)
          ? tab.url
          : wrapInternalUrl(tab.url);

        const metadata = {
          tabId: tab.id,
          tabGroupId: tab.groupId,
          windowId: tab.windowId,
          pinned: tab.pinned,
          index: tab.index,
        };

        if (tab.groupId > -1 && groupsMap.has(tab.groupId)) {
          const g = groupsMap.get(tab.groupId);
          metadata.groupTitle = g.title;
          metadata.groupColor = g.color;
          metadata.groupCollapsed = g.collapsed;
        }

        if (tab.id === undefined || tab.windowId === undefined) continue;
        const uniqueId = getTabUniqueId(tab.id, tab.windowId);
        
        // Match Strategy: Strictly match by uniqueId (tabId + windowId)
        // Only use URL fallback if NO item exists with this uniqueId AND
        // the item has no metadata (to handle edge cases where metadata was lost)
        let existingItem = metadataMap.get(uniqueId);
        
        // Note: Duplicates for this uniqueId are tracked in duplicateIdsByUniqueId
        // but NOT added to processedRaindropIds, so they will be deleted
        
        if (!existingItem) {
          // Only use URL fallback if we truly have no match by uniqueId
          // AND the item has no metadata (to prevent incorrect matches)
          const itemsWithSameUrl = urlMap.get(finalUrl);
          if (itemsWithSameUrl && itemsWithSameUrl.length > 0) {
            // Find an item that truly has no metadata (not just missing tabId/windowId)
            const itemWithoutMetadata = itemsWithSameUrl.find((urlItem) => {
              const urlItemData = getItemMetadata(urlItem);
              return !urlItemData.tabId || !urlItemData.windowId;
            });
            if (itemWithoutMetadata) {
              existingItem = itemWithoutMetadata;
              // Remove from urlMap to prevent duplicate matches
              const index = itemsWithSameUrl.indexOf(itemWithoutMetadata);
              if (index > -1) {
                itemsWithSameUrl.splice(index, 1);
              }
            }
          }
        }

        const payload = {
          link: finalUrl,
          title: tab.title || 'Untitled',
          collection: { $id: deviceCollectionId },
          excerpt: JSON.stringify(metadata),
        };

        if (existingItem) {
          // Mark the matched item as processed (so it won't be deleted)
          processedRaindropIds.add(existingItem._id);
          if (hasTabChanged(existingItem, tab, finalUrl, metadata)) {
            toUpdate.push({ id: existingItem._id, tabId: tab.id, ...payload });
          }
          // If item was matched by URL fallback but now has proper metadata,
          // we still update it to ensure it has the correct uniqueId in metadata
          // This handles the case where an item lost its metadata
        } else {
          // Store tabId with payload so we can match back after creation
          toCreate.push({ tabId: tab.id, ...payload });
        }
      }
    }

    // 3. Identify Deletes (Any item in Raindrop NOT matched to a current tab)
    const idsToDelete = [];
    allExistingIds.forEach((id) => {
      if (!processedRaindropIds.has(id)) {
        idsToDelete.push(id);
      }
    });

    // 4. Execute Batch Operations

    // Get tab snapshots once for cover uploads
    const snapshots = await getSnapshots();
    const snapshotMap = new Map();
    snapshots.forEach((snapshot) => {
      if (snapshot.tabId && snapshot.thumbnail && snapshot.thumbnail.length > 0) {
        snapshotMap.set(snapshot.tabId, snapshot.thumbnail);
      }
    });

    // Batch Create
    if (toCreate.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
        const chunk = toCreate.slice(i, i + CHUNK_SIZE);
        console.log(`[mirror] Batch Creating ${chunk.length} items`);
        
        // Extract tabIds before sending (Raindrop API doesn't need them)
        const tabIds = chunk.map((item) => item.tabId);
        const itemsToCreate = chunk.map(({ tabId, ...item }) => item);
        
        const response = await raindropRequest('/raindrops', tokens, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsToCreate }),
        });

        // Upload covers from tab snapshots for newly created items
        if (response && response.items && Array.isArray(response.items)) {
          for (let j = 0; j < response.items.length; j++) {
            const createdItem = response.items[j];
            const tabId = tabIds[j];
            if (createdItem && createdItem._id && tabId) {
              const thumbnail = snapshotMap.get(tabId);
              if (thumbnail) {
                await uploadCoverFromSnapshot(createdItem._id, thumbnail, tokens);
              }
            }
          }
        }
      }
    }

    // Batch Delete
    if (idsToDelete.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
        const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
        console.log(`[mirror] Batch Deleting ${chunk.length} items`);
        
        // Use the same robust delete logic as deleteAllItemsInCollection
        // sending both 'ids' and 'id' to be safe
        const response = await raindropRequest(`/raindrops/${deviceCollectionId}`, tokens, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: chunk, id: chunk }),
        });

        // If DELETE didn't work (modified: 0), try the fallback method:
        // Moving items to Trash (-99) using PUT
        if (response && response.modified === 0 && chunk.length > 0) {
          console.log(
            '[mirror] DELETE returned modified: 0. Trying fallback: move to Trash via PUT',
          );
          await raindropRequest(`/raindrops/${deviceCollectionId}`, tokens, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ids: chunk,
              collection: { $id: -99 },
            }),
          });
        }
      }
    }

    // Individual Updates
    if (toUpdate.length > 0) {
      console.log(`[mirror] Updating ${toUpdate.length} items individually`);
      for (const item of toUpdate) {
        // PUT /raindrop/:id
        await raindropRequest(`/raindrop/${item.id}`, tokens, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            link: item.link,
            title: item.title,
            excerpt: item.excerpt, // Use excerpt for metadata
            // collection is not needed if not moving
          }),
        });

        // Upload cover from tab snapshot if available
        if (item.tabId) {
          const thumbnail = snapshotMap.get(item.tabId);
          if (thumbnail) {
            await uploadCoverFromSnapshot(item.id, thumbnail, tokens);
          }
        }
      }
    }

    console.log(
      `[mirror] Session sync complete: ${toCreate.length} created, ${toUpdate.length} updated, ${idsToDelete.length} deleted.`,
    );

  } catch (error) {
    console.warn('[mirror] Failed to export current session:', error);
  }
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

/**
 * @typedef {Object} CollectionNode
 * @property {number} id
 * @property {string} title
 * @property {number} sort
 * @property {number | null} parentId
 * @property {CollectionNode[]} children
 */

/**
 * Update the name of a session collection.
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

  // Update the collection title in Raindrop
  await raindropRequest(
    `/collection/${collectionId}`,
    tokens,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: newName,
      }),
    }
  );

  // If the old name was the browserId, update it
  const browserId = await getOrCreateBrowserId();
  if (oldName === browserId) {
    await chrome.storage.local.set({ browserId: newName });
  }

  return { success: true };
}

/**
 * Upload a cover image to a Raindrop collection.
 * @param {number} collectionId - The collection ID
 * @param {string} iconPath - Path to the icon file (relative to assets/browser-icons/)
 * @returns {Promise<{success: boolean}>}
 */
async function handleUploadCollectionCover(collectionId, iconPath) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  // Fetch the icon file and convert to blob
  const iconUrl = chrome.runtime.getURL(`assets/browser-icons/${iconPath}`);
  const response = await fetch(iconUrl);
  if (!response.ok) {
    throw new Error(`Failed to load icon: ${iconPath}`);
  }
  
  const blob = await response.blob();
  const formData = new FormData();
  formData.append('cover', blob, iconPath);

  // Upload the cover
  await raindropRequest(`/collection/${collectionId}/cover`, tokens, {
    method: 'PUT',
    body: formData,
  });

  return { success: true };
}
