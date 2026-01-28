(function () {
  'use strict';

  /**
   * Debounce a function.
   * @param {Function} func
   * @param {number} delay
   * @returns {Function}
   */
  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }

  // ============================================================================
  // Types
  // ============================================================================

  /**
   * @typedef {Object} HighlightEntry
   * @property {string} id - Unique identifier within the rule
   * @property {'whole-phrase' | 'comma-separated' | 'regex'} type
   * @property {string} value
   * @property {string} textColor
   * @property {string} backgroundColor
   * @property {boolean} bold
   * @property {boolean} italic
   * @property {boolean} underline
   * @property {boolean} ignoreCase
   */

  /**
   * @typedef {Object} HighlightTextRuleSettings
   * @property {string} id
   * @property {string[]} patterns - One or more URL patterns
   * @property {HighlightEntry[]} highlights - One or more highlight definitions
   * @property {boolean} [disabled]
   * @property {string} [createdAt]
   * @property {string} [updatedAt]
   */

  /**
   * @typedef {Object} LegacyHighlightTextRule
   * @property {string} id
   * @property {string} pattern - Single URL pattern (legacy)
   * @property {'whole-phrase' | 'comma-separated' | 'regex'} type
   * @property {string} value
   * @property {string} textColor
   * @property {string} backgroundColor
   * @property {boolean} bold
   * @property {boolean} italic
   * @property {boolean} underline
   * @property {boolean} ignoreCase
   * @property {boolean} [disabled]
   * @property {string} [createdAt]
   * @property {string} [updatedAt]
   */

  // ============================================================================
  // Migration Utilities
  // ============================================================================

  /**
   * Generate a unique identifier for highlight entries.
   * @returns {string}
   */
  function generateHighlightId() {
    if (typeof crypto?.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const random = Math.random().toString(36).slice(2);
    return 'hl-' + Date.now().toString(36) + '-' + random;
  }

  /**
   * Check if a rule is in legacy format (single pattern instead of patterns array).
   * @param {Object} rule
   * @returns {boolean}
   */
  function isLegacyRule(rule) {
    if (!rule || typeof rule !== 'object') {
      return false;
    }
    return typeof rule.pattern === 'string' && !Array.isArray(rule.patterns);
  }

  /**
   * Migrate a single legacy rule to the new structure.
   * @param {LegacyHighlightTextRule | HighlightTextRuleSettings} rule
   * @returns {HighlightTextRuleSettings}
   */
  function migrateHighlightRule(rule) {
    if (!isLegacyRule(rule)) {
      return /** @type {HighlightTextRuleSettings} */ (rule);
    }

    const legacyRule = /** @type {LegacyHighlightTextRule} */ (rule);

    /** @type {HighlightEntry} */
    const highlightEntry = {
      id: generateHighlightId(),
      type: legacyRule.type || 'whole-phrase',
      value: legacyRule.value || '',
      textColor: legacyRule.textColor || '#000000',
      backgroundColor: legacyRule.backgroundColor || '#ffff00',
      bold: typeof legacyRule.bold === 'boolean' ? legacyRule.bold : false,
      italic:
        typeof legacyRule.italic === 'boolean' ? legacyRule.italic : false,
      underline:
        typeof legacyRule.underline === 'boolean'
          ? legacyRule.underline
          : false,
      ignoreCase:
        typeof legacyRule.ignoreCase === 'boolean'
          ? legacyRule.ignoreCase
          : false,
    };

    /** @type {HighlightTextRuleSettings} */
    const migratedRule = {
      id: legacyRule.id,
      patterns: [legacyRule.pattern],
      highlights: [highlightEntry],
    };

    if (typeof legacyRule.disabled === 'boolean') {
      migratedRule.disabled = legacyRule.disabled;
    }
    if (legacyRule.createdAt) {
      migratedRule.createdAt = legacyRule.createdAt;
    }
    if (legacyRule.updatedAt) {
      migratedRule.updatedAt = legacyRule.updatedAt;
    }

    return migratedRule;
  }

  /**
   * Migrate an array of rules.
   * @param {Array<LegacyHighlightTextRule | HighlightTextRuleSettings>} rules
   * @returns {{ rules: HighlightTextRuleSettings[], migrated: boolean }}
   */
  function migrateHighlightRules(rules) {
    if (!Array.isArray(rules)) {
      return { rules: [], migrated: false };
    }

    let migrated = false;
    const migratedRules = rules.map((rule) => {
      if (isLegacyRule(rule)) {
        migrated = true;
        return migrateHighlightRule(rule);
      }
      return /** @type {HighlightTextRuleSettings} */ (rule);
    });

    return { rules: migratedRules, migrated };
  }

  // ============================================================================
  // Constants and State
  // ============================================================================

  const HIGHLIGHT_TEXT_RULES_KEY = 'highlightTextRules';
  const HIGHLIGHT_CLASS_PREFIX = 'nenya-highlight-';

  /** @type {HighlightTextRuleSettings[]} */
  let rules = [];
  /** @type {Map<string, HTMLElement[]>} */
  let highlightedElements = new Map();
  /** @type {MutationObserver|null} */
  let domObserver = null;

  // ============================================================================
  // URL Pattern Matching
  // ============================================================================

  /**
   * Check if a URL matches a single pattern.
   * @param {string} url
   * @param {string} pattern
   * @returns {boolean}
   */
  function matchesSinglePattern(url, pattern) {
    try {
      const urlPattern = new URLPattern(pattern);
      return urlPattern.test(url);
    } catch (error) {
      // Fallback to simple pattern matching for basic cases
      if (pattern.includes('*')) {
        const regexPattern = pattern
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\*/g, '.*');
        const regex = new RegExp('^' + regexPattern + '$');
        return regex.test(url);
      }
      return url.includes(pattern);
    }
  }

  /**
   * Check if a URL matches any pattern in the patterns array.
   * @param {string} url
   * @param {string[]} patterns
   * @returns {boolean}
   */
  function matchesUrlPatterns(url, patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0) {
      return false;
    }
    return patterns.some((pattern) => matchesSinglePattern(url, pattern));
  }

  // ============================================================================
  // Highlighting Logic
  // ============================================================================

  /**
   * Check if a node is part of our highlight/minimap system.
   * @param {Node} node
   * @returns {boolean}
   */
  function isOwnNode(node) {
    if (!node) return false;

    // Check if it's one of our elements
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = /** @type {HTMLElement} */ (node);
      const className = String(element.className || '');
      const id = String(element.id || '');
      if (
        className.includes(HIGHLIGHT_CLASS_PREFIX) ||
        className.includes('nenya-minimap') ||
        id.includes('nenya-minimap')
      ) {
        return true;
      }
    }

    // Check if node is inside our elements
    if (node.parentElement) {
      const parent = node.parentElement;
      if (
        parent.closest('#nenya-minimap-container') ||
        parent.closest('[class*="' + HIGHLIGHT_CLASS_PREFIX + '"]')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create a highlight element.
   * @param {string} text
   * @param {string} ruleId
   * @param {HighlightEntry} highlight
   * @returns {HTMLElement}
   */
  function createHighlightElement(text, ruleId, highlight) {
    const span = document.createElement('span');
    span.className = HIGHLIGHT_CLASS_PREFIX + ruleId + '-' + highlight.id;
    span.style.color = highlight.textColor;
    span.style.backgroundColor = highlight.backgroundColor;
    span.style.padding = '1px 2px';
    span.style.borderRadius = '2px';

    if (highlight.bold) {
      span.style.fontWeight = 'bold';
    }
    if (highlight.italic) {
      span.style.fontStyle = 'italic';
    }
    if (highlight.underline) {
      span.style.textDecoration = 'underline';
    }

    span.textContent = text;
    return span;
  }

  /**
   * Highlight text in a text node using a specific highlight entry.
   * @param {Text} textNode
   * @param {string} ruleId
   * @param {HighlightEntry} highlight
   * @returns {boolean} Whether any highlighting was applied
   */
  function highlightTextNode(textNode, ruleId, highlight) {
    const text = textNode.textContent;
    if (!text || text.trim().length === 0) {
      return false;
    }

    let highlighted = false;
    const parent = textNode.parentNode;
    if (!parent) return false;

    switch (highlight.type) {
      case 'whole-phrase': {
        const searchText = highlight.ignoreCase ? text.toLowerCase() : text;
        const searchValue = highlight.ignoreCase
          ? highlight.value.toLowerCase()
          : highlight.value;
        if (!searchValue) {
          break;
        }
        const index = searchText.indexOf(searchValue);
        if (index !== -1) {
          const beforeText = text.substring(0, index);
          const matchText = text.substring(
            index,
            index + highlight.value.length,
          );
          const afterText = text.substring(index + highlight.value.length);

          const fragment = document.createDocumentFragment();
          if (beforeText) {
            fragment.appendChild(document.createTextNode(beforeText));
          }
          fragment.appendChild(
            createHighlightElement(matchText, ruleId, highlight),
          );
          if (afterText) {
            fragment.appendChild(document.createTextNode(afterText));
          }

          if (parent.contains(textNode)) {
            parent.replaceChild(fragment, textNode);
            highlighted = true;
          }
        }
        break;
      }
      case 'comma-separated': {
        const words = highlight.value
          .split(',')
          .map((w) => w.trim())
          .filter((w) => w.length > 0);
        const searchText = highlight.ignoreCase ? text.toLowerCase() : text;

        for (const word of words) {
          const searchWord = highlight.ignoreCase ? word.toLowerCase() : word;
          if (!searchWord) continue;
          const index = searchText.indexOf(searchWord);
          if (index !== -1) {
            const beforeText = text.substring(0, index);
            const matchText = text.substring(index, index + word.length);
            const afterText = text.substring(index + word.length);

            const fragment = document.createDocumentFragment();
            if (beforeText) {
              fragment.appendChild(document.createTextNode(beforeText));
            }
            fragment.appendChild(
              createHighlightElement(matchText, ruleId, highlight),
            );
            if (afterText) {
              fragment.appendChild(document.createTextNode(afterText));
            }

            if (parent.contains(textNode)) {
              parent.replaceChild(fragment, textNode);
              highlighted = true;
            }
            break;
          }
        }
        break;
      }
      case 'regex': {
        try {
          const flags = highlight.ignoreCase ? 'gi' : 'g';
          const regex = new RegExp(highlight.value, flags);
          const matches = [...text.matchAll(regex)];
          if (matches.length > 0) {
            let lastIndex = 0;
            const fragment = document.createDocumentFragment();

            for (const match of matches) {
              if (match.index !== undefined) {
                if (match.index > lastIndex) {
                  fragment.appendChild(
                    document.createTextNode(
                      text.substring(lastIndex, match.index),
                    ),
                  );
                }
                fragment.appendChild(
                  createHighlightElement(match[0], ruleId, highlight),
                );
                lastIndex = match.index + match[0].length;
              }
            }

            if (lastIndex < text.length) {
              fragment.appendChild(
                document.createTextNode(text.substring(lastIndex)),
              );
            }

            if (parent.contains(textNode)) {
              parent.replaceChild(fragment, textNode);
              highlighted = true;
            }
          }
        } catch (error) {
          console.warn(
            '[highlight-text] Invalid regex pattern:',
            highlight.value,
            error,
          );
        }
        break;
      }
    }

    return highlighted;
  }

  /**
   * Scan a root node and apply highlights.
   * @param {Node} root
   * @param {HighlightTextRuleSettings[]} applicableRules
   */
  function scanAndHighlight(root, applicableRules) {
    if (!root) return;

    // Helper: process a single text node
    const processTextNode = (node) => {
      let nodeProcessed = false;
      for (const rule of applicableRules) {
        if (nodeProcessed) break;
        for (const highlight of rule.highlights) {
          if (highlightTextNode(/** @type {Text} */ (node), rule.id, highlight)) {
            nodeProcessed = true;
            break;
          }
        }
      }
    };

    // If root is text, process it directly
    if (root.nodeType === Node.TEXT_NODE) {
      if (isOwnNode(root)) return;
      if (root.parentNode) {
        const tagName = root.parentNode.nodeName.toLowerCase();
        if (['script', 'style', 'code', 'pre', 'textarea', 'input', 'img', 'video', 'audio', 'canvas', 'svg', 'iframe', 'link', 'meta', 'br', 'hr', 'noscript'].includes(tagName)) return;
      }
      processTextNode(root);
      return;
    }

    // If root is element, use walker
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (isOwnNode(root)) return;
      const rootTag = /** @type {HTMLElement} */ (root).tagName.toLowerCase();
      if (['script', 'style', 'code', 'pre', 'textarea', 'input', 'img', 'video', 'audio', 'canvas', 'svg', 'iframe', 'link', 'meta', 'br', 'hr', 'noscript'].includes(rootTag)) return;

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              return NodeFilter.FILTER_ACCEPT;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = /** @type {HTMLElement} */ (node);
              const tagName = element.tagName.toLowerCase();
              if (
                [
                  'script',
                  'style',
                  'code',
                  'pre',
                  'textarea',
                  'input',
                  'img',
                  'video',
                  'audio',
                  'canvas',
                  'svg',
                  'iframe',
                  'link',
                  'meta',
                  'br',
                  'hr',
                  'noscript'
                ].includes(tagName)
              ) {
                return NodeFilter.FILTER_REJECT;
              }
              if (isOwnNode(element)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
          },
        },
      );

      const nodesToProcess = [];
      let node;
      while ((node = walker.nextNode())) {
        nodesToProcess.push(node);
      }

      for (const node of nodesToProcess) {
        if (node.nodeType === Node.TEXT_NODE) {
          processTextNode(node);
        }
      }
    }
  }

  /**
   * Remove all existing highlights regardless of rule.
   * @returns {void}
   */
  function removeAllHighlights() {
    const selector =
      '[class^="' +
      HIGHLIGHT_CLASS_PREFIX +
      '"], [class*=" ' +
      HIGHLIGHT_CLASS_PREFIX +
      '"]';
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const parent = element.parentNode;
      if (parent) {
        parent.replaceChild(
          document.createTextNode(element.textContent),
          element,
        );
        parent.normalize();
      }
    }
  }

  /**
   * Apply highlighting to the page.
   * @returns {void}
   */
  function applyHighlighting() {
    // Disconnect observer to prevent feedback loop from our own DOM changes
    if (domObserver) {
      domObserver.disconnect();
    }

    try {
      removeAllHighlights();
      highlightedElements.clear();

      const currentUrl = window.location.href;
      const applicableRules = rules.filter(
        (rule) =>
          !rule.disabled && matchesUrlPatterns(currentUrl, rule.patterns),
      );

      if (applicableRules.length === 0) {
        return;
      }

      scanAndHighlight(document.body, applicableRules);

    } finally {
      // Reconnect observer after DOM changes are complete
      if (domObserver && document.body) {
        domObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    }
  }

  /**
   * Load rules from storage, migrating legacy rules if needed.
   * @returns {Promise<void>}
   */
  async function loadRules() {
    try {
      const result = await chrome.storage.local.get(HIGHLIGHT_TEXT_RULES_KEY);
      const storedRules = result[HIGHLIGHT_TEXT_RULES_KEY];

      if (!Array.isArray(storedRules)) {
        rules = [];
        return;
      }

      // Migrate legacy rules
      const { rules: migratedRules, migrated } =
        migrateHighlightRules(storedRules);

      // Save back if migration occurred
      if (migrated) {
        await chrome.storage.local.set({
          [HIGHLIGHT_TEXT_RULES_KEY]: migratedRules,
        });
      }

      // Validate and normalize rules
      rules = migratedRules
        .filter((rule) => {
          return (
            rule &&
            typeof rule === 'object' &&
            typeof rule.id === 'string' &&
            Array.isArray(rule.patterns) &&
            rule.patterns.length > 0 &&
            Array.isArray(rule.highlights) &&
            rule.highlights.length > 0
          );
        })
        .map((rule) => ({
          ...rule,
          disabled: typeof rule.disabled === 'boolean' ? rule.disabled : false,
          highlights: rule.highlights.map((h) => ({
            ...h,
            bold: typeof h.bold === 'boolean' ? h.bold : false,
            italic: typeof h.italic === 'boolean' ? h.italic : false,
            underline: typeof h.underline === 'boolean' ? h.underline : false,
            ignoreCase:
              typeof h.ignoreCase === 'boolean' ? h.ignoreCase : false,
          })),
        }));
    } catch (error) {
      console.warn('[highlight-text] Failed to load rules:', error);
      rules = [];
    }
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the highlight text functionality.
   * @returns {Promise<void>}
   */
  async function initHighlightText() {
    await loadRules();
    applyHighlighting();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[HIGHLIGHT_TEXT_RULES_KEY]) {
        loadRules().then(() => {
          applyHighlighting();
        });
      }
    });

    // Track current URL to re-apply highlighting on navigation
    let currentUrl = window.location.href;

    // Re-apply highlighting when DOM changes (for dynamic content)
    // Used for full-rescan events like resize/popstate, or URL changes.
    const debouncedApplyHighlighting = debounce(applyHighlighting, 500);

    domObserver = new MutationObserver((mutations) => {
      let shouldReapply = false;

      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        shouldReapply = true;
      }

      if (shouldReapply) {
        debouncedApplyHighlighting();
        return;
      }

      // Incremental updates
      const applicableRules = rules.filter(
        (rule) =>
          !rule.disabled && matchesUrlPatterns(currentUrl, rule.patterns),
      );

      if (applicableRules.length === 0) return;

      for (const mutation of mutations) {
        // Skip mutations inside our own elements
        if (mutation.target && isOwnNode(mutation.target)) {
          continue;
        }

        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
             scanAndHighlight(node, applicableRules);
          }
        }
      }
    });

    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener('popstate', () => {
      debouncedApplyHighlighting();
    });

    window.addEventListener('resize', () => {
      debouncedApplyHighlighting();
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHighlightText);
  } else {
    initHighlightText();
  }
})();
