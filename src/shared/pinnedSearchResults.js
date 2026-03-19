/**
 * Normalize pinned search results stored in extension storage.
 * @param {unknown} value
 * @returns {Array<{title: string, url: string, type: string}>}
 */
export function normalizePinnedSearchResults(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce((accumulator, item) => {
    if (!item || typeof item !== 'object') {
      return accumulator;
    }

    const title = typeof item.title === 'string' ? item.title : '';
    const url = typeof item.url === 'string' ? item.url : '';
    const type = typeof item.type === 'string' ? item.type : '';

    if (!title || !url) {
      return accumulator;
    }

    accumulator.push({ title, url, type });
    return accumulator;
  }, /** @type {Array<{title: string, url: string, type: string}>} */ ([]));
}
