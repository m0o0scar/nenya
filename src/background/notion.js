/* global chrome */

const NOTION_INTEGRATION_SECRET_KEY = 'notionIntegrationSecret';
const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2026-03-11';
const NOTION_SEARCH_PAGE_SIZE = 50;

/**
 * @typedef {Object} NotionSearchResult
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string} lastEditedTime
 * @property {'page' | 'data_source'} object
 */

export {
  loadNotionSecret,
  notionRequest,
  validateNotionSecret,
  searchNotion,
};

/**
 * Normalize a Notion secret value.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeNotionSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Load the saved Notion integration secret.
 * @returns {Promise<string>}
 */
async function loadNotionSecret() {
  const stored = await chrome.storage.local.get(NOTION_INTEGRATION_SECRET_KEY);
  return normalizeNotionSecret(stored?.[NOTION_INTEGRATION_SECRET_KEY]);
}

/**
 * Build a readable error message from a Notion API error response.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function buildNotionError(response) {
  try {
    const payload = await response.json();
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch (error) {
    // Ignore JSON parsing errors and fall back to status text.
  }

  if (response.status === 401 || response.status === 403) {
    return 'Invalid Notion integration secret.';
  }

  return response.statusText || 'Notion request failed.';
}

/**
 * Issue a request to the Notion API.
 * @param {string} path
 * @param {Object} [body]
 * @param {string} [secretOverride]
 * @returns {Promise<any>}
 */
async function notionRequest(path, body = {}, secretOverride = '') {
  const secret = normalizeNotionSecret(secretOverride) || (await loadNotionSecret());
  if (!secret) {
    throw new Error('No Notion integration secret configured.');
  }

  const response = await fetch(NOTION_API_BASE_URL + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + secret,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await buildNotionError(response));
  }

  return response.json();
}

/**
 * Extract plain text from a Notion rich text array.
 * @param {unknown} value
 * @returns {string}
 */
function extractRichText(value) {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      return typeof item.plain_text === 'string' ? item.plain_text : '';
    })
    .join('')
    .trim();
}

/**
 * Extract the best title available from a Notion page result.
 * @param {any} page
 * @returns {string}
 */
function extractPageTitle(page) {
  const properties =
    page?.properties && typeof page.properties === 'object'
      ? page.properties
      : {};

  for (const property of Object.values(properties)) {
    if (
      property &&
      typeof property === 'object' &&
      property.type === 'title' &&
      Array.isArray(property.title)
    ) {
      const title = extractRichText(property.title);
      if (title) {
        return title;
      }
    }
  }

  const fallbackTitle = extractRichText(page?.title);
  if (fallbackTitle) {
    return fallbackTitle;
  }

  return 'Untitled';
}

/**
 * Extract the best title available from a Notion data source result.
 * @param {any} dataSource
 * @returns {string}
 */
function extractDataSourceTitle(dataSource) {
  const title = extractRichText(dataSource?.title);
  if (title) {
    return title;
  }

  if (typeof dataSource?.name === 'string' && dataSource.name.trim()) {
    return dataSource.name.trim();
  }

  return 'Untitled';
}

/**
 * Normalize a single Notion search result.
 * @param {any} result
 * @returns {NotionSearchResult | null}
 */
function normalizeSearchResult(result) {
  if (!result || typeof result !== 'object') {
    return null;
  }

  if (result.archived === true || result.in_trash === true) {
    return null;
  }

  const url = typeof result.url === 'string' ? result.url.trim() : '';
  if (!url) {
    return null;
  }

  const id = typeof result.id === 'string' ? result.id : '';
  const lastEditedTime =
    typeof result.last_edited_time === 'string' ? result.last_edited_time : '';

  if (result.object === 'page') {
    return {
      id,
      title: extractPageTitle(result),
      url,
      lastEditedTime,
      object: 'page',
    };
  }

  if (result.object === 'data_source') {
    return {
      id,
      title: extractDataSourceTitle(result),
      url,
      lastEditedTime,
      object: 'data_source',
    };
  }

  return null;
}

/**
 * Deduplicate Notion search results by URL and sort them by edit time.
 * @param {NotionSearchResult[]} results
 * @returns {NotionSearchResult[]}
 */
function finalizeResults(results) {
  const deduped = [];
  const seenUrls = new Set();

  results.forEach((result) => {
    if (seenUrls.has(result.url)) {
      return;
    }
    seenUrls.add(result.url);
    deduped.push(result);
  });

  deduped.sort((a, b) => {
    const timeA = Date.parse(a.lastEditedTime || '') || 0;
    const timeB = Date.parse(b.lastEditedTime || '') || 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return a.title.localeCompare(b.title);
  });

  return deduped;
}

/**
 * Validate a Notion integration secret before it is saved.
 * @param {string} secret
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function validateNotionSecret(secret) {
  const normalizedSecret = normalizeNotionSecret(secret);
  if (!normalizedSecret) {
    return {
      ok: false,
      error: 'Enter a Notion integration secret first.',
    };
  }

  try {
    await notionRequest(
      '/search',
      {
        page_size: 1,
      },
      normalizedSecret,
    );

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Invalid Notion integration secret.',
    };
  }
}

/**
 * Search shared Notion pages and data sources.
 * @param {string} query
 * @returns {Promise<{ notionPages: NotionSearchResult[], notionDataSources: NotionSearchResult[] }>}
 */
async function searchNotion(query) {
  const trimmedQuery = typeof query === 'string' ? query.trim() : '';
  if (!trimmedQuery) {
    return {
      notionPages: [],
      notionDataSources: [],
    };
  }

  const secret = await loadNotionSecret();
  if (!secret) {
    return {
      notionPages: [],
      notionDataSources: [],
    };
  }

  /** @type {NotionSearchResult[]} */
  const notionPages = [];
  /** @type {NotionSearchResult[]} */
  const notionDataSources = [];
  /** @type {string | undefined} */
  let nextCursor;

  do {
    /** @type {{ query: string, page_size: number, sort: { timestamp: string, direction: string }, start_cursor?: string }} */
    const body = {
      query: trimmedQuery,
      page_size: NOTION_SEARCH_PAGE_SIZE,
      sort: {
        timestamp: 'last_edited_time',
        direction: 'descending',
      },
    };
    if (nextCursor) {
      body.start_cursor = nextCursor;
    }

    const response = await notionRequest('/search', body, secret);
    const results = Array.isArray(response?.results) ? response.results : [];

    results.forEach((result) => {
      const normalized = normalizeSearchResult(result);
      if (!normalized) {
        return;
      }

      if (normalized.object === 'page') {
        notionPages.push(normalized);
        return;
      }

      notionDataSources.push(normalized);
    });

    nextCursor =
      response?.has_more && typeof response?.next_cursor === 'string'
        ? response.next_cursor
        : undefined;
  } while (nextCursor);

  return {
    notionPages: finalizeResults(notionPages),
    notionDataSources: finalizeResults(notionDataSources),
  };
}
