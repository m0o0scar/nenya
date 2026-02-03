/* global chrome, URLPattern */

/**
 * @typedef {'remove' | 'replace' | 'prefix' | 'suffix'} TitleTransformOperationType
 */

/**
 * @typedef {Object} TitleTransformOperation
 * @property {string} id
 * @property {TitleTransformOperationType} type
 * @property {string} [pattern] - Regex pattern for remove/replace operations
 * @property {string} [value] - Replacement value for replace, or text for prefix/suffix
 */

/**
 * @typedef {Object} TitleTransformRule
 * @property {string} id
 * @property {string} name
 * @property {string[]} urlPatterns
 * @property {TitleTransformOperation[]} operations
 * @property {boolean | undefined} disabled
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const STORAGE_KEY = 'titleTransformRules';

/**
 * Load title transform rules from storage.
 * @returns {Promise<TitleTransformRule[]>}
 */
async function loadRules() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const rules = result?.[STORAGE_KEY];
    if (!Array.isArray(rules)) {
      return [];
    }
    return rules;
  } catch (error) {
    console.warn('[titleTransform] Failed to load rules:', error);
    return [];
  }
}

/**
 * Check if a URL matches any of the given URL patterns.
 * @param {string} url - The URL to check
 * @param {string[]} patterns - Array of URL patterns
 * @returns {boolean}
 */
function urlMatchesPatterns(url, patterns) {
  if (!url || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }

  // Check if URLPattern is supported
  if (typeof URLPattern === 'undefined') {
    try {
      // Fallback: simple string matching
      return patterns.some(pattern => url.includes(pattern));
    } catch {
      return false;
    }
  }

  try {
    const urlObj = new URL(url);
    for (const pattern of patterns) {
      try {
        let urlPattern;
        if (pattern.includes('://')) {
          // Full URL pattern
          urlPattern = new URLPattern(pattern);
        } else if (pattern.startsWith('/')) {
          // Pathname pattern
          urlPattern = new URLPattern({ pathname: pattern });
        } else if (pattern.includes('*') || pattern.includes(':')) {
          // Pattern with wildcards or named groups - treat as pathname
          urlPattern = new URLPattern({ pathname: '/' + pattern });
        } else {
          // Domain or hostname pattern
          urlPattern = new URLPattern({ hostname: pattern });
        }

        if (urlPattern.test(url)) {
          return true;
        }
      } catch (error) {
        // Invalid pattern, skip
        continue;
      }
    }
    return false;
  } catch (error) {
    // Invalid URL, can't match
    return false;
  }
}

/**
 * Apply a single transform operation to a title.
 * @param {string} title - The title to transform
 * @param {TitleTransformOperation} operation - The operation to apply
 * @returns {string} - The transformed title
 */
function applyOperation(title, operation) {
  if (!title || typeof title !== 'string') {
    return title || '';
  }

  try {
    const { type, pattern, value } = operation;

    if (type === 'remove') {
      if (!pattern) {
        return title;
      }
      try {
        // Remove slashes if present (regex format: /pattern/)
        const regexPattern = pattern.startsWith('/') && pattern.endsWith('/')
          ? pattern.slice(1, -1)
          : pattern;
        const regex = new RegExp(regexPattern, 'gi');
        return title.replace(regex, '');
      } catch (error) {
        // Invalid regex, skip
        return title;
      }
    } else if (type === 'replace') {
      if (!pattern) {
        return title;
      }
      try {
        // Remove slashes if present (regex format: /pattern/)
        const regexPattern = pattern.startsWith('/') && pattern.endsWith('/')
          ? pattern.slice(1, -1)
          : pattern;
        const regex = new RegExp(regexPattern, 'gi');
        const replacement = value !== undefined ? value : '';
        return title.replace(regex, replacement);
      } catch (error) {
        // Invalid regex, skip
        return title;
      }
    } else if (type === 'prefix') {
      const prefix = value !== undefined ? value : '';
      return prefix + title;
    } else if (type === 'suffix') {
      const suffix = value !== undefined ? value : '';
      return title + suffix;
    }

    return title;
  } catch (error) {
    // Failed to transform, return original
    return title;
  }
}

/**
 * Transform a title by applying matching title transform rules.
 * @param {string} title - The title to transform
 * @param {string} url - The URL of the page (for matching rules)
 * @returns {Promise<string>} - The transformed title
 */
export async function transformTitle(title, url) {
  if (!title || typeof title !== 'string') {
    return title || '';
  }

  if (!url || typeof url !== 'string') {
    return title;
  }

  try {
    const rules = await loadRules();
    let transformedTitle = title;

    if (rules.length > 0) {
      // Find all matching rules for this URL
      const matchingRules = rules.filter((rule) => {
        // Check if rule is disabled
        if (rule.disabled) {
          return false;
        }
        // Check if URL matches any pattern in this rule
        return urlMatchesPatterns(url, rule.urlPatterns);
      });

      // Apply operations from all matching rules sequentially
      for (const rule of matchingRules) {
        // Apply operations within each rule in order
        for (const operation of rule.operations) {
          transformedTitle = applyOperation(transformedTitle, operation);
        }
      }
    }

    // Always trim the title before returning (even when no rules match)
    return transformedTitle.trim();
  } catch (error) {
    console.warn('[titleTransform] Failed to transform title:', error);
    return title.trim();
  }
}

