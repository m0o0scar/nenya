/**
 * Highlight Text Migration Utilities
 * 
 * Provides types and migration functions for converting legacy single-pattern/single-highlight
 * rules to the new multi-pattern/multi-highlight structure.
 */

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
  // Legacy rules have 'pattern' (string) instead of 'patterns' (array)
  return typeof rule.pattern === 'string' && !Array.isArray(rule.patterns);
}

/**
 * Migrate a single legacy rule to the new structure.
 * Returns the rule unchanged if already in new format.
 * 
 * @param {LegacyHighlightTextRule | HighlightTextRuleSettings} rule
 * @returns {HighlightTextRuleSettings}
 */
function migrateHighlightRule(rule) {
  // Already migrated - return as-is
  if (!isLegacyRule(rule)) {
    return /** @type {HighlightTextRuleSettings} */ (rule);
  }

  const legacyRule = /** @type {LegacyHighlightTextRule} */ (rule);

  // Extract highlight entry from flat fields
  /** @type {HighlightEntry} */
  const highlightEntry = {
    id: generateHighlightId(),
    type: legacyRule.type || 'whole-phrase',
    value: legacyRule.value || '',
    textColor: legacyRule.textColor || '#000000',
    backgroundColor: legacyRule.backgroundColor || '#ffff00',
    bold: typeof legacyRule.bold === 'boolean' ? legacyRule.bold : false,
    italic: typeof legacyRule.italic === 'boolean' ? legacyRule.italic : false,
    underline: typeof legacyRule.underline === 'boolean' ? legacyRule.underline : false,
    ignoreCase: typeof legacyRule.ignoreCase === 'boolean' ? legacyRule.ignoreCase : false,
  };

  // Build new structure
  /** @type {HighlightTextRuleSettings} */
  const migratedRule = {
    id: legacyRule.id,
    patterns: [legacyRule.pattern],
    highlights: [highlightEntry],
  };

  // Preserve optional fields
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
 * Migrate an array of rules, returning the migrated array and a flag
 * indicating whether any migration occurred.
 * 
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

// Export for ES modules (options page)
export {
  generateHighlightId,
  isLegacyRule,
  migrateHighlightRule,
  migrateHighlightRules,
};

