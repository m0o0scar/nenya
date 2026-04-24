/* global chrome */

import {
  getValidTokens,
  TOKEN_VALIDATION_MESSAGE,
} from '../shared/tokenRefresh.js';

/**
 * @typedef {Object} StoredProviderTokens
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt
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
 * @typedef {Object} BadgeAnimationHandle
 * @property {() => void} stop
 * @property {number} token
 */

const PROVIDER_ID = 'raindrop';
const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1';
const RAINDROP_COLLECTION_URL_BASE = 'https://app.raindrop.io/my/';
const FETCH_PAGE_SIZE = 50;
const DEFAULT_BADGE_ANIMATION_DELAY = 300;
const ANIMATION_UP_SEQUENCE = ['🔼', '⏫'];

/** @type {BadgeAnimationHandle | null} */
let currentBadgeAnimationHandle = null;
let badgeAnimationSequence = 0;
let lastStartedBadgeToken = 0;

export {
  concludeActionBadge,
  fetchAllItemsInCollection,
  fetchRaindropItems,
  handleOpenAllItemsInCollection,
  handleRaindropSearch,
  handleTokenValidationMessage,
  handleUpdateRaindropUrl,
  loadValidProviderTokens,
  normalizeHttpUrl,
  raindropRequest,
  saveUrlsToUnsorted,
  setActionBadge,
};

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
    throw new Error(
      data.errorMessage ||
        data.error ||
        'Raindrop API returned an error result',
    );
  }

  return data;
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
      'Raindrop credentials expired. Reconnect in Options to continue.',
    );
  }

  return validationResult.tokens || undefined;
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
 * Fetch a page of Raindrop items for a collection.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {number} page
 * @returns {Promise<any[] | null>}
 */
async function fetchRaindropItems(tokens, collectionId, page = 0) {
  try {
    const path = `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}&sort=-created`;
    const response = await raindropRequest(path, tokens);
    return Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    console.warn(
      `[raindrop] Failed to fetch items for collection ${collectionId} page ${page}:`,
      error,
    );
    return null;
  }
}

/**
 * Fetch all items in a Raindrop collection.
 * @param {number} collectionId
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<any[]>}
 */
async function fetchAllItemsInCollection(collectionId, tokens) {
  const firstPageResponse = await raindropRequest(
    `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=0`,
    tokens,
  );

  const items = Array.isArray(firstPageResponse?.items)
    ? [...firstPageResponse.items]
    : [];
  const totalCount = firstPageResponse?.count;

  if (items.length < FETCH_PAGE_SIZE) {
    return items;
  }

  if (typeof totalCount === 'number' && totalCount > items.length) {
    const totalPages = Math.ceil(totalCount / FETCH_PAGE_SIZE);
    const pageIndices = [];
    for (let page = 1; page < totalPages; page += 1) {
      pageIndices.push(page);
    }

    const concurrencyLimit = 5;
    for (let i = 0; i < pageIndices.length; i += concurrencyLimit) {
      const chunk = pageIndices.slice(i, i + concurrencyLimit);
      const results = await Promise.all(
        chunk.map((page) =>
          raindropRequest(
            `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}`,
            tokens,
          ).then((response) =>
            Array.isArray(response?.items) ? response.items : [],
          ),
        ),
      );
      results.forEach((pageItems) => items.push(...pageItems));
    }
    return items;
  }

  let page = 1;
  while (true) {
    const response = await raindropRequest(
      `/raindrops/${collectionId}?perpage=${FETCH_PAGE_SIZE}&page=${page}`,
      tokens,
    );
    const pageItems = Array.isArray(response?.items) ? response.items : [];
    items.push(...pageItems);
    if (pageItems.length < FETCH_PAGE_SIZE) {
      break;
    }
    page += 1;
  }

  return items;
}

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
      return parsed.searchParams.get('url') || url;
    } catch (error) {
      return url;
    }
  }

  return url;
}

/**
 * Check if a URL is valid for Raindrop.
 * @param {string} url
 * @returns {boolean}
 */
function isValidRaindropUrl(url) {
  return Boolean(normalizeHttpUrl(url));
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
 * Fetch and open all items in a Raindrop collection.
 * @param {number} collectionId
 * @param {string} [_collectionTitle]
 * @returns {Promise<{success: boolean, opened: number}>}
 */
async function handleOpenAllItemsInCollection(collectionId, _collectionTitle) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found');
  }

  const items = await fetchAllItemsInCollection(collectionId, tokens);
  const links = items
    .map((item) => (typeof item?.link === 'string' ? unwrapInternalUrl(item.link) : ''))
    .filter((url) => Boolean(normalizeHttpUrl(url)));

  await Promise.all(
    links.map((url) => chrome.tabs.create({ url, active: false })),
  );

  return { success: true, opened: links.length };
}

/**
 * Update the URL of a Raindrop item.
 * @param {number} id
 * @param {string} url
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
    const searchTerms = queryLower
      .split(' ')
      .filter((term) => term.length > 0);
    const excludedCollectionName = 'nenya / options';
    const excludedCollectionIds = new Set();

    allCollections.forEach((collection) => {
      if (collection.title?.toLowerCase() === excludedCollectionName) {
        excludedCollectionIds.add(collection._id);
      }
    });

    const collectionIdTitleMap = new Map();
    const collectionIdParentMap = new Map();
    allCollections.forEach((collection) => {
      if (collection._id && collection.title) {
        collectionIdTitleMap.set(collection._id, collection.title);
      }
      if (collection._id && collection.parent?.$id) {
        collectionIdParentMap.set(collection._id, collection.parent.$id);
      }
    });
    collectionIdTitleMap.set(-1, 'Unsorted');

    const filteredItems = items
      .filter((item) => {
        if (excludedCollectionIds.has(item.collectionId)) {
          return false;
        }

        const title = (item.title || '').toLowerCase();
        const link = (item.link || '').toLowerCase();
        const excerpt = (item.excerpt || '').toLowerCase();
        const tags = Array.isArray(item.tags)
          ? item.tags.map((tag) => String(tag).toLowerCase())
          : [];

        if (
          link.startsWith('https://api.raindrop.io') ||
          link.startsWith('https://up.raindrop.io')
        ) {
          return searchTerms.every((term) => title.includes(term));
        }

        const linkWithoutDomain = link
          .replace('https://raindrop.io', '')
          .replace('http://raindrop.io', '');
        const searchableText = `${title} ${excerpt} ${tags.join(' ')} ${linkWithoutDomain}`;
        return searchTerms.every((term) => searchableText.includes(term));
      })
      .map((item) => {
        if (item.collectionId !== undefined) {
          item.collectionTitle = collectionIdTitleMap.get(item.collectionId);
        }
        return item;
      });

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
      return 0;
    });

    const filteredCollections = allCollections
      .filter((collection) => {
        const collectionTitle = (collection.title || '').toLowerCase();
        return (
          collectionTitle !== excludedCollectionName &&
          searchTerms.every((term) => collectionTitle.includes(term))
        );
      })
      .map((collection) => {
        const parentId = collectionIdParentMap.get(collection._id);
        if (parentId !== undefined) {
          collection.parentCollectionTitle = collectionIdTitleMap.get(parentId);
        }
        return collection;
      });

    if ('unsorted'.includes(queryLower)) {
      const alreadyHasUnsorted = filteredCollections.some(
        (collection) => collection._id === -1,
      );
      if (!alreadyHasUnsorted) {
        filteredCollections.unshift({
          _id: -1,
          title: 'Unsorted',
        });
      }
    }

    return { items: filteredItems, collections: filteredCollections };
  } catch (error) {
    console.error('[raindrop] Search failed:', error);
    return { items: [], collections: [] };
  }
}

/**
 * Save URLs to the Raindrop Unsorted collection.
 * @param {SaveUnsortedEntry[]} entries
 * @param {{ pleaseParse?: boolean, skipUrlProcessing?: boolean, keepEntryTitle?: boolean }} [options]
 * @returns {Promise<SaveUnsortedResult>}
 */
async function saveUrlsToUnsorted(entries, options = {}) {
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

  try {
    if (!Array.isArray(entries)) {
      summary.error = 'No URLs provided.';
      return summary;
    }

    /** @type {SaveUnsortedEntry[]} */
    const sanitized = [];
    const seenUrls = new Set();

    for (const entry of entries) {
      const rawUrl = typeof entry?.url === 'string' ? entry.url.trim() : '';
      const normalizedUrl = normalizeHttpUrl(rawUrl);
      if (!normalizedUrl) {
        summary.skipped += 1;
        continue;
      }

      if (seenUrls.has(normalizedUrl)) {
        summary.skipped += 1;
        continue;
      }

      seenUrls.add(normalizedUrl);
      sanitized.push({
        url: normalizedUrl,
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
      return summary;
    }

    let tokens;
    try {
      tokens = await loadValidProviderTokens();
    } catch (error) {
      summary.error = error instanceof Error ? error.message : String(error);
      return summary;
    }

    if (!tokens) {
      summary.error =
        'No Raindrop connection found. Connect in Options to enable saving.';
      return summary;
    }

    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < sanitized.length; i += chunkSize) {
      chunks.push(sanitized.slice(i, i + chunkSize));
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

        if (
          !response ||
          typeof response !== 'object' ||
          !Array.isArray(response.items)
        ) {
          throw new Error(
            'Invalid response from Raindrop API: missing items array',
          );
        }

        for (let i = 0; i < response.items.length; i += 1) {
          const createdItem = response.items[i];
          const entry = chunk[i];

          if (!createdItem || !createdItem._id) {
            summary.failed += 1;
            summary.errors.push(
              `${entry.url}: Failed to create item (no ID returned)`,
            );
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
            summary.failed += 1;
            summary.errors.push(
              entry.url +
                ': Screenshot failed: ' +
                (error instanceof Error ? error.message : String(error)),
            );
          }
        }
      } catch (error) {
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

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    throw error;
  } finally {
    concludeActionBadge(badgeAnimation, summary.ok ? '✅' : '❌');
  }
}
