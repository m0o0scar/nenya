/* global chrome */

import {
  getBookmarkFolderPath,
  ensureBookmarkFolderPath,
} from '../shared/bookmarkFolders.js';
import {
  getWhitelistPatterns,
  setPatterns,
  isValidUrlPattern,
} from './brightMode.js';
import { loadRules as loadHighlightTextRules } from './highlightText.js';
import { migrateHighlightRules } from '../shared/highlightTextMigration.js';
import { loadRules as loadVideoEnhancementRules } from './videoEnhancements.js';
import { loadLLMPrompts } from './llmPrompts.js';
import { loadRules as loadUrlProcessRules } from './urlProcessRules.js';
import { loadRules as loadTitleTransformRules } from './titleTransformRules.js';
import { loadRules as loadAutoGoogleLoginRules } from './autoGoogleLogin.js';

/**
 * @typedef {Object} RootFolderSettings
 * @property {string} parentFolderId
 * @property {string} rootFolderName
 */

/**
 * @typedef {Object} RootFolderBackupSettings
 * @property {string} rootFolderName
 * @property {string} parentFolderPath
 * @property {string} [parentFolderId]
 */

/**
 * @typedef {RootFolderBackupSettings} RootFolderImportSettings
 */

/**
 * @typedef {Object} AutoReloadRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {number} intervalSeconds
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} NotificationBookmarkSettings
 * @property {boolean} enabled
 * @property {boolean} pullFinished
 * @property {boolean} unsortedSaved
 */

/**
 * @typedef {Object} NotificationProjectSettings
 * @property {boolean} enabled
 * @property {boolean} saveProject
 * @property {boolean} addTabs
 * @property {boolean} replaceItems
 * @property {boolean} deleteProject
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
 * @property {NotificationProjectSettings} project
 * @property {NotificationClipboardSettings} clipboard
 */

/**
 * @typedef {Object} BrightModePatternSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} BrightModeSettings
 * @property {BrightModePatternSettings[]} whitelist
 */

/**
 * @typedef {import('../shared/highlightTextMigration.js').HighlightEntry} HighlightEntry
 * @typedef {import('../shared/highlightTextMigration.js').HighlightTextRuleSettings} HighlightTextRuleSettings
 */

/**
 * @typedef {Object} VideoEnhancementRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {'url-pattern' | 'wildcard'} patternType
 * @property {{ autoFullscreen: boolean }} enhancements
 * @property {boolean} [disabled]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} BlockElementRuleSettings
 * @property {string} id
 * @property {string} urlPattern
 * @property {string[]} selectors
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} CustomCodeRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string} css
 * @property {string} js
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} RunCodeInPageRuleSettings
 * @property {string} id
 * @property {string} title
 * @property {string[]} patterns
 * @property {string} code
 * @property {boolean | undefined} disabled
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} LLMPromptSettings
 * @property {string} id
 * @property {string} name
 * @property {string} prompt
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {'add' | 'replace' | 'remove'} ProcessorType
 */

/**
 * @typedef {'copy-to-clipboard' | 'save-to-raindrop'} ApplyWhenOption
 */

/**
 * @typedef {Object} UrlProcessor
 * @property {string} id
 * @property {ProcessorType} type
 * @property {string} name - Parameter name (string or regex pattern)
 * @property {string} [value] - Value for add/replace processors
 */

/**
 * @typedef {Object} UrlProcessRuleSettings
 * @property {string} id
 * @property {string} name
 * @property {string[]} urlPatterns
 * @property {UrlProcessor[]} processors
 * @property {ApplyWhenOption[]} applyWhen - When to apply this rule
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} AutoGoogleLoginRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string} [email]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {'remove' | 'replace' | 'prefix' | 'suffix'} TitleTransformOperationType
 */

/**
 * @typedef {Object} TitleTransformOperationSettings
 * @property {string} id
 * @property {TitleTransformOperationType} type
 * @property {string} [pattern] - Regex pattern for remove/replace operations
 * @property {string} [value] - Replacement value for replace, or text for prefix/suffix
 */

/**
 * @typedef {Object} TitleTransformRuleSettings
 * @property {string} id
 * @property {string} name
 * @property {string[]} urlPatterns
 * @property {TitleTransformOperationSettings[]} operations
 * @property {boolean | undefined} disabled
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} ScreenshotSettings
 * @property {boolean} autoSave
 */

/**
 * @typedef {Object} ExportPayload
 * @property {string} provider
 * @property {RootFolderBackupSettings} mirrorRootFolderSettings
 * @property {NotificationPreferences} notificationPreferences
 * @property {AutoReloadRuleSettings[]} autoReloadRules
 * @property {BrightModeSettings} brightModeSettings
 * @property {HighlightTextRuleSettings[]} highlightTextRules
 * @property {VideoEnhancementRuleSettings[]} videoEnhancementRules
 * @property {BlockElementRuleSettings[]} blockElementRules
 * @property {CustomCodeRuleSettings[]} customCodeRules
 * @property {RunCodeInPageRuleSettings[]} runCodeInPageRules
 * @property {LLMPromptSettings[]} llmPrompts
 * @property {UrlProcessRuleSettings[]} urlProcessRules
 * @property {TitleTransformRuleSettings[]} titleTransformRules
 * @property {AutoGoogleLoginRuleSettings[]} autoGoogleLoginRules
 * @property {ScreenshotSettings} screenshotSettings
 * @property {string[]} pinnedShortcuts
 * @property {any[]} pinnedSearchResults
 */

/**
 * @typedef {Object} ExportFile
 * @property {number} version
 * @property {ExportPayload} data
 */

const PROVIDER_ID = 'raindrop';
const EXPORT_VERSION = 12;
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
const BRIGHT_MODE_WHITELIST_KEY = 'brightModeWhitelist';
const HIGHLIGHT_TEXT_RULES_KEY = 'highlightTextRules';
const VIDEO_ENHANCEMENT_RULES_KEY = 'videoEnhancementRules';
const BLOCK_ELEMENT_RULES_KEY = 'blockElementRules';
const CUSTOM_CODE_RULES_KEY = 'customCodeRules';
const RUN_CODE_IN_PAGE_RULES_KEY = 'runCodeInPageRules';
const LLM_PROMPTS_KEY = 'llmPrompts';
const URL_PROCESS_RULES_KEY = 'urlProcessRules';
const TITLE_TRANSFORM_RULES_KEY = 'titleTransformRules';
const AUTO_GOOGLE_LOGIN_RULES_KEY = 'autoGoogleLoginRules';
const SCREENSHOT_SETTINGS_KEY = 'screenshotSettings';
const PINNED_SHORTCUTS_KEY = 'pinnedShortcuts';
const PINNED_SEARCH_RESULTS_KEY = 'pinnedSearchResults';
const CUSTOM_SEARCH_ENGINES_KEY = 'customSearchEngines';
const MIN_RULE_INTERVAL_SECONDS = 5;
const DEFAULT_PARENT_PATH = '/Bookmarks Bar';

const importButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsFloatingImportButton')
);
const exportButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsFloatingExportButton')
);
const fileInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('optionsFloatingImportFileInput')
);

/** @typedef {'success' | 'error' | 'info'} ToastVariant */

const TOAST_BACKGROUND_BY_VARIANT = {
  success: 'linear-gradient(135deg, #22c55e, #16a34a)',
  error: 'linear-gradient(135deg, #f97316, #ea580c)',
  info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
};

/**
 * Show a toast via Toastify when available.
 * @param {string} message
 * @param {ToastVariant} [variant='info']
 * @returns {void}
 */
function showToast(message, variant = 'info') {
  /** @type {{ Toastify?: (options: any) => { showToast: () => void } }} */
  const windowWithToastify = /** @type {any} */ (window);
  const background =
    TOAST_BACKGROUND_BY_VARIANT[variant] || TOAST_BACKGROUND_BY_VARIANT.info;
  if (typeof windowWithToastify.Toastify === 'function') {
    windowWithToastify
      .Toastify({
        text: message,
        duration: 4000,
        gravity: 'top',
        position: 'right',
        close: true,
        style: { background },
      })
      .showToast();
    return;
  }
  // Fallback
  try {
    // eslint-disable-next-line no-alert
    alert(message);
  } catch (_) {
    // ignore
  }
}

/**
 * Normalize pinned search results array.
 * @param {unknown} value
 * @returns {any[]}
 */
function normalizePinnedSearchResults(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => {
    return (
      item &&
      typeof item === 'object' &&
      typeof item.title === 'string' &&
      typeof item.url === 'string' &&
      typeof item.type === 'string'
    );
  });
}

/**
 * Deep clone helper for preferences.
 * @param {NotificationPreferences} value
 * @returns {NotificationPreferences}
 */
function clonePreferences(value) {
  return {
    enabled: Boolean(value?.enabled),
    bookmark: {
      enabled: Boolean(value?.bookmark?.enabled),
      pullFinished: Boolean(value?.bookmark?.pullFinished),
      unsortedSaved: Boolean(value?.bookmark?.unsortedSaved),
    },
    project: {
      enabled: Boolean(value?.project?.enabled),
      saveProject: Boolean(value?.project?.saveProject),
      addTabs: Boolean(value?.project?.addTabs),
      replaceItems: Boolean(value?.project?.replaceItems),
      deleteProject: Boolean(value?.project?.deleteProject),
    },
    clipboard: {
      enabled: Boolean(value?.clipboard?.enabled),
      copySuccess: Boolean(value?.clipboard?.copySuccess),
    },
  };
}

/**
 * Generate a stable identifier for auto reload rules lacking one.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'rule-' + Date.now().toString(36) + '-' + random;
}

/**
 * Sort rules in a stable order for exports.
 * @param {AutoReloadRuleSettings[]} rules
 * @returns {AutoReloadRuleSettings[]}
 */
function sortAutoReloadRules(rules) {
  return [...rules].sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) {
      return patternCompare;
    }
    return a.intervalSeconds - b.intervalSeconds;
  });
}

/**
 * Normalize auto reload rules read from storage or input.
 * @param {unknown} value
 * @returns {AutoReloadRuleSettings[]}
 */
function normalizeAutoReloadRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {AutoReloadRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, intervalSeconds?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    try {
      // Throws if invalid
      // eslint-disable-next-line no-new
      new URLPattern(pattern);
    } catch (error) {
      console.warn(
        '[importExport:autoReload] Ignoring invalid pattern:',
        pattern,
        error,
      );
      return;
    }

    const intervalCandidate = Math.floor(Number(raw.intervalSeconds));
    const intervalSeconds =
      Number.isFinite(intervalCandidate) && intervalCandidate > 0
        ? Math.max(MIN_RULE_INTERVAL_SECONDS, intervalCandidate)
        : MIN_RULE_INTERVAL_SECONDS;

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {AutoReloadRuleSettings} */
    const normalized = {
      id,
      pattern,
      intervalSeconds,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sortAutoReloadRules(sanitized);
}

/**
 * Normalize bright mode patterns from storage or input.
 * @param {unknown} value
 * @returns {BrightModePatternSettings[]}
 */
function normalizeBrightModePatterns(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {BrightModePatternSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    if (!isValidUrlPattern(pattern)) {
      console.warn(
        '[importExport:brightMode] Ignoring invalid pattern:',
        pattern,
      );
      return;
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {BrightModePatternSettings} */
    const normalized = {
      id,
      pattern,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/**
 * Normalize highlight text rules from storage or input.
 * Handles both legacy single-pattern format and new multi-pattern/highlight format.
 * @param {unknown} value
 * @returns {HighlightTextRuleSettings[]}
 */
function normalizeHighlightTextRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  // First, migrate any legacy rules to the new format
  const { rules: migratedRules } = migrateHighlightRules(value);

  /** @type {HighlightTextRuleSettings[]} */
  const sanitized = [];

  migratedRules.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    // Validate required fields for new format
    if (!Array.isArray(entry.patterns) || entry.patterns.length === 0) {
      return;
    }
    if (!Array.isArray(entry.highlights) || entry.highlights.length === 0) {
      return;
    }

    // Validate all patterns
    const validPatterns = entry.patterns.filter((p) => {
      if (typeof p !== 'string' || !p.trim()) {
        return false;
      }
      if (!isValidUrlPattern(p)) {
        console.warn(
          '[importExport:highlightText] Ignoring invalid pattern:',
          p,
        );
        return false;
      }
      return true;
    });

    if (validPatterns.length === 0) {
      return;
    }

    // Validate all highlights
    const validHighlights = entry.highlights
      .filter((h) => {
        if (!h || typeof h !== 'object') {
          return false;
        }
        if (typeof h.value !== 'string' || !h.value.trim()) {
          return false;
        }
        const validTypes = ['whole-phrase', 'comma-separated', 'regex'];
        if (!validTypes.includes(h.type)) {
          console.warn(
            '[importExport:highlightText] Ignoring invalid type:',
            h.type,
          );
          return false;
        }
        if (h.type === 'regex') {
          try {
            new RegExp(h.value);
          } catch (error) {
            console.warn(
              '[importExport:highlightText] Ignoring invalid regex:',
              h.value,
              error,
            );
            return false;
          }
        }
        return true;
      })
      .map((h) => ({
        id:
          typeof h.id === 'string' && h.id.trim()
            ? h.id.trim()
            : generateRuleId(),
        type: /** @type {'whole-phrase' | 'comma-separated' | 'regex'} */ (
          h.type
        ),
        value: h.value.trim(),
        textColor: typeof h.textColor === 'string' ? h.textColor : '#000000',
        backgroundColor:
          typeof h.backgroundColor === 'string' ? h.backgroundColor : '#ffff00',
        bold: typeof h.bold === 'boolean' ? h.bold : false,
        italic: typeof h.italic === 'boolean' ? h.italic : false,
        underline: typeof h.underline === 'boolean' ? h.underline : false,
        ignoreCase: typeof h.ignoreCase === 'boolean' ? h.ignoreCase : false,
      }));

    if (validHighlights.length === 0) {
      return;
    }

    const id =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : generateRuleId();

    /** @type {HighlightTextRuleSettings} */
    const normalized = {
      id,
      patterns: validPatterns,
      highlights: validHighlights,
    };

    if (typeof entry.disabled === 'boolean') {
      normalized.disabled = entry.disabled;
    }
    if (typeof entry.createdAt === 'string') {
      normalized.createdAt = entry.createdAt;
    }
    if (typeof entry.updatedAt === 'string') {
      normalized.updatedAt = entry.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.patterns[0].localeCompare(b.patterns[0]));
}

/**
 * Validate wildcard patterns used by video enhancements.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidEnhancementWildcardPattern(pattern) {
  const value = pattern.trim();
  if (!value) {
    return false;
  }
  return !/\s/.test(value);
}

/**
 * Normalize video enhancement rules from storage or input.
 * @param {unknown} value
 * @returns {VideoEnhancementRuleSettings[]}
 */
function normalizeVideoEnhancementRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {VideoEnhancementRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, patternType?: unknown, enhancements?: { autoFullscreen?: unknown }, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    /** @type {'url-pattern' | 'wildcard'} */
    const patternType =
      raw.patternType === 'wildcard' ? 'wildcard' : 'url-pattern';

    if (
      (patternType === 'url-pattern' && !isValidUrlPattern(pattern)) ||
      (patternType === 'wildcard' &&
        !isValidEnhancementWildcardPattern(pattern))
    ) {
      console.warn(
        '[importExport:videoEnhancements] Ignoring invalid pattern:',
        pattern,
      );
      return;
    }

    const autoFullscreen =
      typeof raw.enhancements?.autoFullscreen === 'boolean'
        ? raw.enhancements.autoFullscreen
        : false;

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {VideoEnhancementRuleSettings} */
    const normalized = {
      id,
      pattern,
      patternType,
      enhancements: {
        autoFullscreen,
      },
      disabled: Boolean(raw.disabled),
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    if (aTime === bTime) {
      return a.pattern.localeCompare(b.pattern);
    }
    return bTime - aTime;
  });
}

/**
 * Normalize block element rules from storage or input.
 * @param {unknown} value
 * @returns {BlockElementRuleSettings[]}
 */
function normalizeBlockElementRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {BlockElementRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, urlPattern?: unknown, selectors?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const urlPattern =
      typeof raw.urlPattern === 'string' ? raw.urlPattern.trim() : '';
    if (!urlPattern) {
      return;
    }

    if (!isValidUrlPattern(urlPattern)) {
      console.warn(
        '[importExport:blockElements] Ignoring invalid pattern:',
        urlPattern,
      );
      return;
    }

    const selectors = Array.isArray(raw.selectors)
      ? raw.selectors.filter((s) => typeof s === 'string' && s.trim())
      : [];

    if (selectors.length === 0) {
      return;
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {BlockElementRuleSettings} */
    const normalized = {
      id,
      urlPattern,
      selectors,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.urlPattern.localeCompare(b.urlPattern));
}

/**
 * Normalize custom code rules from storage or input.
 * @param {unknown} value
 * @returns {CustomCodeRuleSettings[]}
 */
function normalizeCustomCodeRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {CustomCodeRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, css?: unknown, js?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    if (!isValidUrlPattern(pattern)) {
      console.warn(
        '[importExport:customCode] Ignoring invalid pattern:',
        pattern,
      );
      return;
    }

    const css = typeof raw.css === 'string' ? raw.css : '';
    const js = typeof raw.js === 'string' ? raw.js : '';

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {CustomCodeRuleSettings} */
    const normalized = {
      id,
      pattern,
      css,
      js,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/**
 * Normalize run code in page rules from storage or input.
 * @param {unknown} value
 * @returns {RunCodeInPageRuleSettings[]}
 */
function normalizeRunCodeInPageRules(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    /** @type {RunCodeInPageRuleSettings[]} */
    const sanitized = [];

    value.forEach((entry) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        const raw =
            /** @type {{ id?: unknown, title?: unknown, patterns?: unknown, code?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */
            (entry);

        const title = typeof raw.title === 'string' ? raw.title.trim() : '';
        if (!title) {
            return;
        }

        const patterns = Array.isArray(raw.patterns) ?
            raw.patterns.filter(p => {
                if (typeof p !== 'string' || !p.trim()) return false;
                try {
                    new URLPattern(p);
                    return true;
                } catch {
                    return false;
                }
            }) :
            [];

        const code = typeof raw.code === 'string' ? raw.code : '';

        const id =
            typeof raw.id === 'string' && raw.id.trim() ?
            raw.id.trim() :
            generateRuleId();

        /** @type {RunCodeInPageRuleSettings} */
        const normalized = {
            id,
            title,
            patterns,
            code,
            disabled: !!raw.disabled,
        };

        if (typeof raw.createdAt === 'string') {
            normalized.createdAt = raw.createdAt;
        }
        if (typeof raw.updatedAt === 'string') {
            normalized.updatedAt = raw.updatedAt;
        }

        sanitized.push(normalized);
    });

    return sanitized.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Normalize LLM prompts from storage or input.
 * @param {unknown} value
 * @returns {LLMPromptSettings[]}
 */
function normalizeLLMPrompts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {LLMPromptSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, name?: unknown, prompt?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) {
      return;
    }

    const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
    if (!prompt) {
      return;
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {LLMPromptSettings} */
    const normalized = {
      id,
      name,
      prompt,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Normalize URL process rules from storage or input.
 * @param {unknown} value
 * @returns {UrlProcessRuleSettings[]}
 */
function normalizeUrlProcessRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {UrlProcessRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, name?: unknown, urlPatterns?: unknown, processors?: unknown, applyWhen?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) {
      return;
    }

    const urlPatterns = Array.isArray(raw.urlPatterns)
      ? raw.urlPatterns
          .map((p) => (typeof p === 'string' ? p.trim() : ''))
          .filter((p) => p && isValidUrlPattern(p))
      : [];
    if (urlPatterns.length === 0) {
      return;
    }

    const processors = Array.isArray(raw.processors)
      ? raw.processors
          .map((p) => {
            if (!p || typeof p !== 'object') {
              return null;
            }
            const procRaw =
              /** @type {{ id?: unknown, type?: unknown, name?: unknown, value?: unknown }} */ (
                p
              );
            const type = procRaw.type;
            if (
              typeof type !== 'string' ||
              !['add', 'replace', 'remove'].includes(type)
            ) {
              return null;
            }
            const procName =
              typeof procRaw.name === 'string' ? procRaw.name.trim() : '';
            if (!procName) {
              return null;
            }
            // For replace and remove, name can be regex
            if (type === 'replace' || type === 'remove') {
              if (procName.startsWith('/') && procName.endsWith('/')) {
                const regexPattern = procName.slice(1, -1);
                try {
                  new RegExp(regexPattern);
                } catch {
                  return null;
                }
              }
            }
            const procId =
              typeof procRaw.id === 'string' && procRaw.id.trim()
                ? procRaw.id.trim()
                : generateRuleId();

            /** @type {UrlProcessor} */
            const processor = {
              id: procId,
              type: /** @type {'add' | 'replace' | 'remove'} */ (type),
              name: procName,
            };

            if (type === 'add' || type === 'replace') {
              const procValue =
                typeof procRaw.value === 'string' ? procRaw.value : '';
              processor.value = procValue;
            }

            return processor;
          })
          .filter((p) => p !== null)
      : [];
    if (processors.length === 0) {
      return;
    }

    const applyWhen = Array.isArray(raw.applyWhen)
      ? raw.applyWhen.filter((aw) =>
          ['copy-to-clipboard', 'save-to-raindrop'].includes(aw),
        )
      : [];
    if (applyWhen.length === 0) {
      return;
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {UrlProcessRuleSettings} */
    const normalized = {
      id,
      name,
      urlPatterns,
      processors,
      applyWhen: /** @type {ApplyWhenOption[]} */ (applyWhen),
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Normalize title transform rules from storage or input.
 * @param {unknown} value
 * @returns {TitleTransformRuleSettings[]}
 */
function normalizeTitleTransformRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {TitleTransformRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, name?: unknown, urlPatterns?: unknown, operations?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) {
      return;
    }

    const urlPatterns = Array.isArray(raw.urlPatterns)
      ? raw.urlPatterns
          .map((p) => (typeof p === 'string' ? p.trim() : ''))
          .filter((p) => p && isValidUrlPattern(p))
      : [];
    if (urlPatterns.length === 0) {
      return;
    }

    const operations = Array.isArray(raw.operations)
      ? raw.operations
          .map((op) => {
            if (!op || typeof op !== 'object') {
              return null;
            }
            const opRaw =
              /** @type {{ id?: unknown, type?: unknown, pattern?: unknown, value?: unknown }} */ (
                op
              );
            const type = opRaw.type;
            if (
              typeof type !== 'string' ||
              !['remove', 'replace', 'prefix', 'suffix'].includes(type)
            ) {
              return null;
            }

            /** @type {TitleTransformOperationSettings} */
            const operation = {
              id:
                typeof opRaw.id === 'string' && opRaw.id.trim()
                  ? opRaw.id.trim()
                  : 'op-' +
                    Date.now().toString(36) +
                    '-' +
                    Math.random().toString(36).slice(2),
              type: /** @type {TitleTransformOperationType} */ (type),
            };

            // For remove and replace, pattern is required
            if (type === 'remove' || type === 'replace') {
              const pattern =
                typeof opRaw.pattern === 'string' ? opRaw.pattern.trim() : '';
              if (!pattern) {
                return null;
              }
              operation.pattern = pattern;
              // For replace, value is optional (defaults to empty string)
              if (type === 'replace') {
                operation.value =
                  typeof opRaw.value === 'string' ? opRaw.value : '';
              }
            } else {
              // For prefix and suffix, value is required
              const value = typeof opRaw.value === 'string' ? opRaw.value : '';
              if (!value) {
                return null;
              }
              operation.value = value;
            }

            return operation;
          })
          .filter((op) => op !== null)
      : [];
    if (operations.length === 0) {
      return;
    }

    /** @type {TitleTransformRuleSettings} */
    const normalized = {
      id:
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : 'rule-' +
            Date.now().toString(36) +
            '-' +
            Math.random().toString(36).slice(2),
      name,
      urlPatterns,
      operations,
      disabled: !!raw.disabled,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Normalize auto Google login rules from storage or input.
 * @param {unknown} value
 * @returns {AutoGoogleLoginRuleSettings[]}
 */
function normalizeAutoGoogleLoginRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {AutoGoogleLoginRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, email?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    if (!isValidUrlPattern(pattern)) {
      console.warn(
        '[importExport:autoGoogleLogin] Ignoring invalid pattern:',
        pattern,
      );
      return;
    }

    const email = typeof raw.email === 'string' ? raw.email.trim() : undefined;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        console.warn(
          '[importExport:autoGoogleLogin] Ignoring invalid email:',
          email,
        );
        return;
      }
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {AutoGoogleLoginRuleSettings} */
    const normalized = {
      id,
      pattern,
    };

    if (email) {
      normalized.email = email;
    }

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) {
      return patternCompare;
    }
    const emailA = a.email || '';
    const emailB = b.email || '';
    return emailA.localeCompare(emailB);
  });
}

/**
 * Normalize pinned shortcuts array.
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizePinnedShortcuts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  // Valid shortcut IDs (excluding openOptions which is always shown)
  const validIds = [
    'getMarkdown',
    'saveUnsorted',
    'encryptSave',
    'saveClipboardToUnsorted',
    'importCustomCode',
    'customFilter',
    'splitPage',
    'autoReload',
    'brightMode',
    'darkMode',
    'highlightText',
    'customCode',
    'pictureInPicture',
    'takeScreenshot',
    'screenRecording',
    'openInPopup',
    'emojiPicker',
  ];

  return value
    .filter((id) => typeof id === 'string' && validIds.includes(id))
    .slice(0, 7); // Limit to max 7 shortcuts
}

/**
 * Normalize screenshot settings.
 * @param {unknown} value
 * @returns {ScreenshotSettings}
 */
function normalizeScreenshotSettings(value) {
  const fallback = { autoSave: false };
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw = /** @type {Partial<ScreenshotSettings>} */ (value);
  return {
    autoSave:
      typeof raw.autoSave === 'boolean' ? raw.autoSave : fallback.autoSave,
  };
}

/**
 * Normalize custom search engines.
 * @param {any} value
 * @returns {Array<{id: string, name: string, shortcut: string, searchUrl: string}>}
 */
function normalizeCustomSearchEngines(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((engine) => {
      return (
        engine &&
        typeof engine === 'object' &&
        typeof engine.id === 'string' &&
        engine.id.trim() &&
        typeof engine.name === 'string' &&
        engine.name.trim() &&
        typeof engine.shortcut === 'string' &&
        engine.shortcut.trim() &&
        typeof engine.searchUrl === 'string' &&
        engine.searchUrl.includes('%s')
      );
    })
    .map((engine) => ({
      id: engine.id.trim(),
      name: engine.name.trim(),
      shortcut: engine.shortcut.trim(),
      searchUrl: engine.searchUrl.trim(),
    }));
}

/**
 * Normalize possibly partial preferences.
 * @param {unknown} value
 * @returns {NotificationPreferences}
 */
function normalizePreferences(value) {
  const fallback = clonePreferences({
    enabled: true,
    bookmark: { enabled: true, pullFinished: true, unsortedSaved: true },
    project: {
      enabled: true,
      saveProject: true,
      addTabs: true,
      replaceItems: true,
      deleteProject: true,
    },
    clipboard: {
      enabled: true,
      copySuccess: true,
    },
  });
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const raw =
    /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings>, project?: Partial<NotificationProjectSettings>, clipboard?: Partial<NotificationClipboardSettings> }} */ (
      value
    );
  const bookmark = raw.bookmark ?? {};
  const project = raw.project ?? {};
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
    project: {
      enabled:
        typeof project.enabled === 'boolean'
          ? project.enabled
          : fallback.project.enabled,
      saveProject:
        typeof project.saveProject === 'boolean'
          ? project.saveProject
          : fallback.project.saveProject,
      addTabs:
        typeof project.addTabs === 'boolean'
          ? project.addTabs
          : fallback.project.addTabs,
      replaceItems:
        typeof project.replaceItems === 'boolean'
          ? project.replaceItems
          : fallback.project.replaceItems,
      deleteProject:
        typeof project.deleteProject === 'boolean'
          ? project.deleteProject
          : fallback.project.deleteProject,
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
 * Read current settings used by Options backup.
 * @returns {Promise<{ rootFolder: RootFolderBackupSettings, notifications: NotificationPreferences, autoReloadRules: AutoReloadRuleSettings[], brightModeSettings: BrightModeSettings, highlightTextRules: HighlightTextRuleSettings[], videoEnhancementRules: VideoEnhancementRuleSettings[], blockElementRules: BlockElementRuleSettings[], customCodeRules: CustomCodeRuleSettings[], runCodeInPageRules: RunCodeInPageRules[], llmPrompts: LLMPromptSettings[], urlProcessRules: UrlProcessRuleSettings[], titleTransformRules: TitleTransformRuleSettings[], autoGoogleLoginRules: AutoGoogleLoginRuleSettings[], screenshotSettings: ScreenshotSettings, pinnedShortcuts: string[], pinnedSearchResults: any[] }>}
 */
async function readCurrentOptions() {
  const [
    rootResp,
    notifResp,
    reloadResp,
    whitelistPatterns,
    highlightTextRules,
    videoEnhancementRules,
    blockElementResp,
    customCodeResp,
    runCodeInPageResp,
    llmPromptsResp,
    urlProcessRulesResp,
    titleTransformRulesResp,
    autoGoogleLoginRulesResp,
    pinnedShortcutsResp,
    pinnedSearchResultsResp,
    customSearchEnginesResp,
  ] = await Promise.all([
    chrome.storage.local.get(ROOT_FOLDER_SETTINGS_KEY),
    chrome.storage.local.get(NOTIFICATION_PREFERENCES_KEY),
    chrome.storage.local.get(AUTO_RELOAD_RULES_KEY),
    getWhitelistPatterns(),
    loadHighlightTextRules(),
    loadVideoEnhancementRules(),
    chrome.storage.local.get(BLOCK_ELEMENT_RULES_KEY),
    chrome.storage.local.get(CUSTOM_CODE_RULES_KEY),
    chrome.storage.local.get(RUN_CODE_IN_PAGE_RULES_KEY),
    loadLLMPrompts(),
    loadUrlProcessRules(),
    loadTitleTransformRules(),
    loadAutoGoogleLoginRules(),
    chrome.storage.local.get(PINNED_SHORTCUTS_KEY),
    chrome.storage.local.get(PINNED_SEARCH_RESULTS_KEY),
    chrome.storage.local.get(CUSTOM_SEARCH_ENGINES_KEY),
  ]);

  /** @type {Record<string, RootFolderSettings> | undefined} */
  const rootMap = /** @type {*} */ (rootResp?.[ROOT_FOLDER_SETTINGS_KEY]);
  const rootCandidate = rootMap?.[PROVIDER_ID];
  const parentFolderId =
    typeof rootCandidate?.parentFolderId === 'string' &&
    rootCandidate.parentFolderId
      ? rootCandidate.parentFolderId
      : '1';
  const rootFolderName =
    typeof rootCandidate?.rootFolderName === 'string' &&
    rootCandidate.rootFolderName
      ? rootCandidate.rootFolderName
      : 'Raindrop';

  let parentFolderPath = '';
  try {
    parentFolderPath = await getBookmarkFolderPath(parentFolderId);
  } catch (error) {
    console.warn(
      '[importExport] Failed to resolve parent folder path for export:',
      error,
    );
  }
  if (!parentFolderPath) {
    parentFolderPath = DEFAULT_PARENT_PATH;
  }

  /** @type {RootFolderBackupSettings} */
  const rootFolder = {
    parentFolderId,
    parentFolderPath,
    rootFolderName,
  };

  const notifications = normalizePreferences(
    notifResp?.[NOTIFICATION_PREFERENCES_KEY],
  );
  const autoReloadRules = normalizeAutoReloadRules(
    reloadResp?.[AUTO_RELOAD_RULES_KEY],
  );

  const brightModeSettings = {
    whitelist: whitelistPatterns,
  };

  const blockElementRules = normalizeBlockElementRules(
    blockElementResp?.[BLOCK_ELEMENT_RULES_KEY],
  );

  const customCodeRules = normalizeCustomCodeRules(
    customCodeResp?.[CUSTOM_CODE_RULES_KEY],
  );

  const runCodeInPageRules = normalizeRunCodeInPageRules(
    runCodeInPageResp?.[RUN_CODE_IN_PAGE_RULES_KEY],
  );

  const llmPrompts = normalizeLLMPrompts(llmPromptsResp);

  const urlProcessRules = normalizeUrlProcessRules(urlProcessRulesResp);

  const titleTransformRules = normalizeTitleTransformRules(
    titleTransformRulesResp,
  );

  const autoGoogleLoginRules = normalizeAutoGoogleLoginRules(
    autoGoogleLoginRulesResp,
  );

  const pinnedShortcuts = normalizePinnedShortcuts(
    pinnedShortcutsResp?.[PINNED_SHORTCUTS_KEY],
  );
  const pinnedSearchResults = normalizePinnedSearchResults(
    pinnedSearchResultsResp?.[PINNED_SEARCH_RESULTS_KEY],
  );

  const screenshotSettingsResp = await chrome.storage.local.get(
    SCREENSHOT_SETTINGS_KEY,
  );
  const screenshotSettings = normalizeScreenshotSettings(
    screenshotSettingsResp?.[SCREENSHOT_SETTINGS_KEY],
  );

  const customSearchEngines = normalizeCustomSearchEngines(
    customSearchEnginesResp?.[CUSTOM_SEARCH_ENGINES_KEY],
  );

  return {
    rootFolder,
    notifications,
    autoReloadRules,
    brightModeSettings,
    highlightTextRules,
    videoEnhancementRules,
    blockElementRules,
    customCodeRules,
    runCodeInPageRules,
    llmPrompts,
    urlProcessRules,
    titleTransformRules,
    autoGoogleLoginRules,
    screenshotSettings,
    pinnedShortcuts,
    pinnedSearchResults,
    customSearchEngines,
  };
}

/**
 * Trigger a download of the given data as a JSON file.
 * @param {any} data
 * @param {string} filename
 */
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * Export current options to a JSON file.
 * @returns {Promise<void>}
 */
async function handleExportClick() {
  try {
    const {
      rootFolder,
      notifications,
      autoReloadRules,
      brightModeSettings,
      highlightTextRules,
      videoEnhancementRules,
      blockElementRules,
      customCodeRules,
      runCodeInPageRules,
      llmPrompts,
      urlProcessRules,
      titleTransformRules,
      autoGoogleLoginRules,
      screenshotSettings,
      pinnedShortcuts,
      pinnedSearchResults,
      customSearchEngines,
    } = await readCurrentOptions();
    /** @type {ExportFile} */
    const payload = {
      version: EXPORT_VERSION,
      data: {
        provider: PROVIDER_ID,
        mirrorRootFolderSettings: rootFolder,
        notificationPreferences: notifications,
        autoReloadRules,
        brightModeSettings,
        highlightTextRules,
        videoEnhancementRules,
        blockElementRules,
        customCodeRules,
        runCodeInPageRules,
        llmPrompts,
        urlProcessRules,
        titleTransformRules,
        autoGoogleLoginRules,
        screenshotSettings,
        pinnedShortcuts,
        pinnedSearchResults,
        customSearchEngines,
      },
    };
    const now = new Date();
    const YYYY = String(now.getFullYear());
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const filename =
      'nenya-options-' + YYYY + MM + DD + '-' + HH + mm + '.json';
    downloadJson(payload, filename);
    showToast('Exported options to ' + filename, 'success');
  } catch (error) {
    console.warn('[importExport] Export failed:', error);
    showToast('Failed to export options.', 'error');
  }
}

/**
 * Apply imported settings to storage.
 * @param {RootFolderImportSettings} rootFolder
 * @param {NotificationPreferences} notifications
 * @param {AutoReloadRuleSettings[]} autoReloadRules
 * @param {BrightModeSettings} brightModeSettings
 * @param {HighlightTextRuleSettings[]} highlightTextRules
 * @param {VideoEnhancementRuleSettings[]} videoEnhancementRules
 * @param {BlockElementRuleSettings[]} blockElementRules
 * @param {CustomCodeRuleSettings[]} customCodeRules
 * @param {RunCodeInPageRuleSettings[]} runCodeInPageRules
 * @param {LLMPromptSettings[]} llmPrompts
 * @param {UrlProcessRuleSettings[]} urlProcessRules
 * @param {AutoGoogleLoginRuleSettings[]} autoGoogleLoginRules
 * @param {ScreenshotSettings} screenshotSettings
 * @param {string[]} pinnedShortcuts
 * @param {any[]} pinnedSearchResults
 * @param {Array<{id: string, name: string, shortcut: string, searchUrl: string}>} customSearchEngines
 * @returns {Promise<void>}
 */
async function applyImportedOptions(
  rootFolder,
  notifications,
  autoReloadRules,
  brightModeSettings,
  highlightTextRules,
  videoEnhancementRules,
  blockElementRules,
  customCodeRules,
  runCodeInPageRules,
  llmPrompts,
  urlProcessRules,
  titleTransformRules,
  autoGoogleLoginRules,
  screenshotSettings,
  pinnedShortcuts,
  pinnedSearchResults,
  customSearchEngines,
) {
  let parentFolderId = '';
  const desiredPath =
    typeof rootFolder?.parentFolderPath === 'string'
      ? rootFolder.parentFolderPath.trim()
      : '';

  if (desiredPath) {
    try {
      const ensuredId = await ensureBookmarkFolderPath(desiredPath);
      if (ensuredId) {
        parentFolderId = ensuredId;
      }
    } catch (error) {
      console.warn(
        '[importExport] Failed to ensure parent folder path during import:',
        error,
      );
    }
  }

  if (!parentFolderId) {
    parentFolderId =
      typeof rootFolder?.parentFolderId === 'string' &&
      rootFolder.parentFolderId
        ? rootFolder.parentFolderId
        : '';
  }

  if (!parentFolderId) {
    parentFolderId = '1';
  }

  // Sanitize
  const sanitizedRoot = {
    parentFolderId,
    rootFolderName:
      typeof rootFolder?.rootFolderName === 'string' &&
      rootFolder.rootFolderName
        ? rootFolder.rootFolderName
        : 'Raindrop',
  };
  const sanitizedNotifications = normalizePreferences(notifications);
  const sanitizedRules = normalizeAutoReloadRules(autoReloadRules);
  const sanitizedHighlightTextRules = normalizeHighlightTextRules(
    highlightTextRules || [],
  );
  const sanitizedVideoEnhancementRules = normalizeVideoEnhancementRules(
    videoEnhancementRules || [],
  );
  const sanitizedBlockElementRules = normalizeBlockElementRules(
    blockElementRules || [],
  );

  const sanitizedCustomCodeRules = normalizeCustomCodeRules(
    customCodeRules || [],
  );

  const sanitizedRunCodeInPageRules = normalizeRunCodeInPageRules(
    runCodeInPageRules || [],
  );

  const sanitizedLLMPrompts = normalizeLLMPrompts(llmPrompts || []);

  const sanitizedUrlProcessRules = normalizeUrlProcessRules(
    urlProcessRules || [],
  );

  const sanitizedTitleTransformRules = normalizeTitleTransformRules(
    titleTransformRules || [],
  );

  const sanitizedAutoGoogleLoginRules = normalizeAutoGoogleLoginRules(
    autoGoogleLoginRules || [],
  );

  const sanitizedScreenshotSettings = normalizeScreenshotSettings(
    screenshotSettings || { autoSave: false },
  );

  const sanitizedPinnedShortcuts = normalizePinnedShortcuts(
    pinnedShortcuts || [],
  );

  const sanitizedPinnedSearchResults = normalizePinnedSearchResults(
    pinnedSearchResults || [],
  );

  const sanitizedCustomSearchEngines = normalizeCustomSearchEngines(
    customSearchEngines || [],
  );

  // Handle bright mode settings - support both old and new format
  let sanitizedWhitelist = [];

  if (brightModeSettings && typeof brightModeSettings === 'object') {
    // New format: { whitelist: [...] }
    sanitizedWhitelist = normalizeBrightModePatterns(
      brightModeSettings.whitelist || [],
    );
  } else {
    // Fallback for old format or missing data
    sanitizedWhitelist = [];
  }

  // Read existing map to preserve other providers if any
  const existing = await chrome.storage.local.get(ROOT_FOLDER_SETTINGS_KEY);
  /** @type {Record<string, RootFolderSettings>} */
  const map = /** @type {*} */ (existing?.[ROOT_FOLDER_SETTINGS_KEY]) || {};
  map[PROVIDER_ID] = sanitizedRoot;

  // Persist all keys (custom code rules go to local storage due to size)
  await Promise.all([
    chrome.storage.local.set({
      [ROOT_FOLDER_SETTINGS_KEY]: map,
      [NOTIFICATION_PREFERENCES_KEY]: sanitizedNotifications,
      [AUTO_RELOAD_RULES_KEY]: sanitizedRules,
      [BRIGHT_MODE_WHITELIST_KEY]: sanitizedWhitelist,
      [HIGHLIGHT_TEXT_RULES_KEY]: sanitizedHighlightTextRules,
      [VIDEO_ENHANCEMENT_RULES_KEY]: sanitizedVideoEnhancementRules,
      [BLOCK_ELEMENT_RULES_KEY]: sanitizedBlockElementRules,
      [LLM_PROMPTS_KEY]: sanitizedLLMPrompts,
      [URL_PROCESS_RULES_KEY]: sanitizedUrlProcessRules,
      [TITLE_TRANSFORM_RULES_KEY]: sanitizedTitleTransformRules,
      [AUTO_GOOGLE_LOGIN_RULES_KEY]: sanitizedAutoGoogleLoginRules,
      [SCREENSHOT_SETTINGS_KEY]: sanitizedScreenshotSettings,
      [PINNED_SHORTCUTS_KEY]: sanitizedPinnedShortcuts,
      [PINNED_SEARCH_RESULTS_KEY]: sanitizedPinnedSearchResults,
      [CUSTOM_SEARCH_ENGINES_KEY]: sanitizedCustomSearchEngines,
      [CUSTOM_CODE_RULES_KEY]: sanitizedCustomCodeRules,
      [RUN_CODE_IN_PAGE_RULES_KEY]: sanitizedRunCodeInPageRules,
    }),
  ]);
}

/**
 * Handle selected import file.
 * @returns {Promise<void>}
 */
async function handleFileChosen() {
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    return;
  }
  const file = fileInput.files[0];
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid file.');
    }

    /** @type {any} */
    const data = parsed.data ?? parsed;
    const provider =
      typeof data?.provider === 'string' ? data.provider : PROVIDER_ID;
    if (provider !== PROVIDER_ID) {
      throw new Error('Unsupported provider in file.');
    }

    const root = /** @type {RootFolderImportSettings} */ (
      data.mirrorRootFolderSettings
    );
    const notifications = /** @type {NotificationPreferences} */ (
      data.notificationPreferences
    );
    const autoReloadRules = /** @type {AutoReloadRuleSettings[]} */ (
      data.autoReloadRules
    );
    const highlightTextRules = /** @type {HighlightTextRuleSettings[]} */ (
      data.highlightTextRules || []
    );
    const videoEnhancementRules =
      /** @type {VideoEnhancementRuleSettings[]} */ (
        data.videoEnhancementRules || []
      );
    const blockElementRules = /** @type {BlockElementRuleSettings[]} */ (
      data.blockElementRules || []
    );
    const customCodeRules = /** @type {CustomCodeRuleSettings[]} */ (
      data.customCodeRules || []
    );
    const runCodeInPageRules = /** @type {RunCodeInPageRuleSettings[]} */ (
      data.runCodeInPageRules || []
    );
    const llmPrompts = /** @type {LLMPromptSettings[]} */ (
      data.llmPrompts || []
    );
    const urlProcessRules = /** @type {UrlProcessRuleSettings[]} */ (
      data.urlProcessRules || []
    );
    const titleTransformRules = /** @type {TitleTransformRuleSettings[]} */ (
      data.titleTransformRules || []
    );
    const autoGoogleLoginRules = /** @type {AutoGoogleLoginRuleSettings[]} */ (
      data.autoGoogleLoginRules || []
    );
    const screenshotSettings = /** @type {ScreenshotSettings} */ (
      data.screenshotSettings || { autoSave: false }
    );
    const pinnedShortcuts = /** @type {string[]} */ (
      data.pinnedShortcuts || []
    );
    const pinnedSearchResults = /** @type {any[]} */ (
      data.pinnedSearchResults || []
    );
    const customSearchEngines =
      /** @type {Array<{id: string, name: string, shortcut: string, searchUrl: string}>} */ (
        data.customSearchEngines || []
      );

    // Handle bright mode settings - support both old and new format
    let brightModeSettings = data.brightModeSettings;
    if (
      !brightModeSettings &&
      (data.brightModeWhitelist || data.brightModeBlacklist)
    ) {
      // Convert old format to new format (ignore blacklist)
      brightModeSettings = {
        whitelist: data.brightModeWhitelist || [],
      };
    }
    brightModeSettings = brightModeSettings || { whitelist: [] };

    await applyImportedOptions(
      root,
      notifications,
      autoReloadRules,
      brightModeSettings,
      highlightTextRules,
      videoEnhancementRules,
      blockElementRules,
      customCodeRules,
      runCodeInPageRules,
      llmPrompts,
      urlProcessRules,
      titleTransformRules,
      autoGoogleLoginRules,
      screenshotSettings,
      pinnedShortcuts,
      pinnedSearchResults,
      customSearchEngines,
    );
    showToast('Options imported successfully.', 'success');
  } catch (error) {
    console.warn('[importExport] Import failed:', error);
    showToast(
      'Failed to import options. Please select a valid export file.',
      'error',
    );
  } finally {
    // Reset input to allow re-selecting the same file
    fileInput.value = '';
  }
}

/**
 * Initialize listeners for import/export controls.
 * @returns {void}
 */
function initImportExport() {
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      void handleExportClick();
    });
  }
  if (importButton && fileInput) {
    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      void handleFileChosen();
    });
  }
}

initImportExport();
