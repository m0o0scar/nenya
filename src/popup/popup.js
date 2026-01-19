/* global chrome */

import '../options/theme.js';
import '../shared/iconUrl.js';
import {
  isUserLoggedIn,
  toggleMirrorSection,
  showLoginMessage,
  getTokenValidationStatus,
  handleEncryptAndSaveActive,
  handleSaveToUnsorted,
  showSaveToUnsortedDialog,
} from './mirror.js';
import { concludeStatus } from './shared.js';

import { debounce } from '../shared/debounce.js';

/**
 * Gets all custom search engines from storage.
 * @returns {Promise<Array<{id: string, name: string, shortcut: string, searchUrl: string}>>}
 */
async function getCustomSearchEngines() {
  const result = await chrome.storage.local.get('customSearchEngines');
  return result.customSearchEngines || [];
}

/**
 * Available shortcut buttons configuration
 * @type {Record<string, { emoji: string, tooltip: string, handler: () => void | Promise<void> }>}
 */
const SHORTCUT_CONFIG = {
  getMarkdown: {
    emoji: '💬',
    tooltip: 'Chat with llm',
    handler: () => handleGetMarkdown(),
  },
  saveUnsorted: {
    emoji: '📤',
    tooltip: 'Save to unsorted',
    handler: () => {
      if (saveUnsortedButton && statusMessage) {
        void handleSaveToUnsorted(saveUnsortedButton, statusMessage);
      }
    },
  },
  encryptSave: {
    emoji: '🔐',
    tooltip: 'Encrypt & save to unsorted',
    handler: () => {
      if (encryptSaveButton && statusMessage) {
        void handleEncryptAndSaveActive(encryptSaveButton, statusMessage);
      }
    },
  },
  saveClipboardToUnsorted: {
    emoji: '🔗',
    tooltip: 'Save link in clipboard to unsorted',
    handler: () => void handleSaveClipboardToUnsorted(),
  },
  importCustomCode: {
    emoji: '💾',
    tooltip: 'Import custom JS/CSS rule',
    handler: () => {
      if (importCustomCodeFileInput) {
        importCustomCodeFileInput.click();
      }
    },
  },
  customFilter: {
    emoji: '⚡️',
    tooltip: 'Hide elements in page',
    handler: () => void handleCustomFilter(),
  },
  splitPage: {
    emoji: '🈹',
    tooltip: 'Split page',
    handler: () => void handleSplitPage(),
  },
  autoReload: {
    emoji: '🔁',
    tooltip: 'Auto reload this page',
    handler: () => void handleAutoReload(),
  },
  brightMode: {
    emoji: '🔆',
    tooltip: 'Render this page in bright mode',
    handler: () => void handleBrightMode(),
  },
  darkMode: {
    emoji: '🌘',
    tooltip: 'Render this page in dark mode',
    handler: () => void handleDarkMode(),
  },
  highlightText: {
    emoji: '🟨',
    tooltip: 'Highlight text in this page',
    handler: () => void handleHighlightText(),
  },
  customCode: {
    emoji: '📑',
    tooltip: 'Inject js/css into this page',
    handler: () => void handleCustomCode(),
  },
  pictureInPicture: {
    emoji: '🖼️',
    tooltip: 'Picture in Picture',
    handler: () => void handlePictureInPicture(),
  },
  openInPopup: {
    emoji: '↗️',
    tooltip: 'Open in popup',
    handler: () => handleOpenInPopup(),
  },
  openOptions: {
    emoji: '⚙️',
    tooltip: 'Open options',
    handler: () => {
      chrome.runtime.openOptionsPage(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.error('[popup] Unable to open options page.', error);
          if (statusMessage) {
            concludeStatus(
              'Unable to open options page.',
              'error',
              3000,
              statusMessage,
            );
          }
        }
      });
    },
  },
};

const STORAGE_KEY = 'pinnedShortcuts';

/** @type {string[]} Default pinned shortcuts */
const DEFAULT_PINNED_SHORTCUTS = [
  'getMarkdown', // Chat with llm
  'saveUnsorted', // Save to unsorted
  'encryptSave', // Encrypt & save to unsorted
  'saveClipboardToUnsorted', // Save clipboard link to unsorted
  'customFilter', // Hide elements in page
  'openInPopup', // Open in popup
];

const shortcutsContainer = /** @type {HTMLDivElement | null} */ (
  document.getElementById('shortcutsContainer')
);

// Keep references to buttons for backward compatibility
let getMarkdownButton = null;
let saveUnsortedButton = null;
let encryptSaveButton = null;
let openOptionsButton = null;
let customFilterButton = null;
let importCustomCodeButton = null;
let splitPageButton = null;
let autoReloadButton = null;
let brightModeButton = null;
let darkModeButton = null;
let highlightTextButton = null;
let customCodeButton = null;
let pictureInPictureButton = null;



const importCustomCodeFileInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('importCustomCodeFileInput')
);
const statusMessage = /** @type {HTMLDivElement | null} */ (
  document.getElementById('statusMessage')
);
const autoReloadStatusElement = /** @type {HTMLSpanElement | null} */ (
  document.getElementById('autoReloadStatus')
);

const bookmarksSearchInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('bookmarksSearchInput')
);
const bookmarksSearchResults = /** @type {HTMLDivElement | null} */ (
  document.getElementById('bookmarksSearchResults')
);
const mirrorSection = /** @type {HTMLElement | null} */ (
  document.querySelector('article[aria-labelledby="mirror-heading"]')
);

/**
 * Handle opening the current tab in a small popup window.
 * @returns {Promise<void>}
 */
async function handleOpenInPopup() {
  try {
    await chrome.runtime.sendMessage({ type: 'open-in-popup' });
    window.close();
  } catch (error) {
    console.error('[popup] Error opening in popup window:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to open in popup window.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Load pinned shortcuts from storage and render buttons
 * @returns {Promise<void>}
 */
async function loadAndRenderShortcuts() {
  if (!shortcutsContainer) {
    return;
  }

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const pinnedIds = Array.isArray(stored?.[STORAGE_KEY])
      ? stored[STORAGE_KEY]
      : [];

    // If no shortcuts are pinned, use defaults
    const shortcutsToRender =
      pinnedIds.length > 0 ? pinnedIds : DEFAULT_PINNED_SHORTCUTS;

    // Filter out openOptions - it's always shown separately at the end
    const filteredShortcuts = shortcutsToRender.filter(
      (id) => id !== 'openOptions',
    );

    // Clear container
    shortcutsContainer.innerHTML = '';

    // Reset button references
    getMarkdownButton = null;
    saveUnsortedButton = null;
    encryptSaveButton = null;
    openOptionsButton = null;
    customFilterButton = null;
    importCustomCodeButton = null;
    splitPageButton = null;
    autoReloadButton = null;
    brightModeButton = null;
    darkModeButton = null;
    highlightTextButton = null;
    customCodeButton = null;
    pictureInPictureButton = null;

    // Render buttons based on pinned shortcuts
    filteredShortcuts.forEach((shortcutId) => {
      const config = SHORTCUT_CONFIG[shortcutId];
      if (!config) {
        return;
      }

      const tooltipDiv = document.createElement('div');
      tooltipDiv.className = 'tooltip tooltip-left';
      tooltipDiv.setAttribute('data-tip', config.tooltip);

      const button = document.createElement('button');
      button.id = `${shortcutId}Button`;
      button.className = 'btn btn-square btn-sm btn-ghost';
      button.type = 'button';
      button.textContent = config.emoji;
      button.addEventListener('click', () => {
        void config.handler();
      });

      tooltipDiv.appendChild(button);
      shortcutsContainer.appendChild(tooltipDiv);

      // Store button reference for backward compatibility
      switch (shortcutId) {
        case 'getMarkdown':
          getMarkdownButton = button;
          break;
        case 'saveUnsorted':
          saveUnsortedButton = button;
          break;
        case 'encryptSave':
          encryptSaveButton = button;
          break;
        case 'openOptions':
          openOptionsButton = button;
          break;
        case 'customFilter':
          customFilterButton = button;
          break;
        case 'importCustomCode':
          importCustomCodeButton = button;
          break;
        case 'splitPage':
          splitPageButton = button;
          break;
        case 'autoReload':
          autoReloadButton = button;
          break;
        case 'brightMode':
          brightModeButton = button;
          break;
        case 'darkMode':
          darkModeButton = button;
          break;
        case 'highlightText':
          highlightTextButton = button;
          break;
        case 'customCode':
          customCodeButton = button;
          break;
        case 'pictureInPicture':
          pictureInPictureButton = button;
          break;
      }
    });

    // Always render options button at the end
    const optionsTooltipDiv = document.createElement('div');
    optionsTooltipDiv.className = 'tooltip tooltip-left';
    optionsTooltipDiv.setAttribute('data-tip', 'Open options');

    const optionsButton = document.createElement('button');
    optionsButton.id = 'openOptionsButton';
    optionsButton.className = 'btn btn-square btn-sm btn-ghost';
    optionsButton.type = 'button';
    optionsButton.textContent = '⚙️';
    optionsButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.error('[popup] Unable to open options page.', error);
          if (statusMessage) {
            concludeStatus(
              'Unable to open options page.',
              'error',
              3000,
              statusMessage,
            );
          }
        }
      });
    });

    optionsTooltipDiv.appendChild(optionsButton);
    shortcutsContainer.appendChild(optionsTooltipDiv);
    openOptionsButton = optionsButton;

    // Setup import custom code file input handler
    if (importCustomCodeButton && importCustomCodeFileInput) {
      importCustomCodeFileInput.addEventListener('change', (event) => {
        const target = /** @type {HTMLInputElement | null} */ (event.target);
        if (!target) {
          return;
        }
        const file = target.files?.[0];
        if (file) {
          void handleImportCustomCode(file);
        }
        // Reset the input so the same file can be selected again
        target.value = '';
      });
    }
  } catch (error) {
    console.error('[popup] Failed to load pinned shortcuts:', error);
  }
}



// Initialize bookmarks search functionality
if (bookmarksSearchInput && bookmarksSearchResults) {
  void initializeBookmarksSearch(bookmarksSearchInput, bookmarksSearchResults);
}

if (!statusMessage) {
  console.error('[popup] Status element not found.');
}

// Initialize shortcuts on page load
void loadAndRenderShortcuts();

// Listen for storage changes to update buttons dynamically
if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[STORAGE_KEY]) {
      void loadAndRenderShortcuts();
    }
  });
}

/**
 * Handle opening dark mode options with current tab URL prefilled.
 * @returns {Promise<void>}
 */

async function handleDarkMode() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (statusMessage) {
        concludeStatus('No active tab found.', 'error', 3000, statusMessage);
      }
      return;
    }

    const currentTab = tabs[0];
    const currentUrl = typeof currentTab.url === 'string' ? currentTab.url : '';

    if (!currentUrl) {
      if (statusMessage) {
        concludeStatus(
          'No URL found for current tab.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Open options page with dark mode section hash
    const optionsUrl = chrome.runtime.getURL('src/options/index.html');
    chrome.tabs.create({
      url: `${optionsUrl}#dark-mode-heading&url=${encodeURIComponent(
        currentUrl,
      )}`,
    });
    window.close();
  } catch (error) {
    console.error('[popup] Error opening dark mode options:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to open dark mode options.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Handle the custom filter creation.
 * @returns {Promise<void>}
 */
async function handleCustomFilter() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (statusMessage) {
        concludeStatus('No active tab found.', 'error', 3000, statusMessage);
      }
      return;
    }

    const currentTab = tabs[0];

    // Check if tab has a valid ID
    if (typeof currentTab.id !== 'number') {
      if (statusMessage) {
        concludeStatus('Invalid tab ID.', 'error', 3000, statusMessage);
      }
      return;
    }

    // Send message to background to launch the element picker
    await chrome.runtime.sendMessage({
      type: 'launchElementPicker',
      tabId: currentTab.id,
    });

    // Close the popup
    window.close();
  } catch (error) {
    console.error('[popup] Error launching element picker:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to launch element picker.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * @typedef {Object} CustomCodeRule
 * @property {string} id
 * @property {string} pattern
 * @property {string} css
 * @property {string} js
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const CUSTOM_CODE_STORAGE_KEY = 'customCodeRules';

/**
 * Generate a unique identifier for new rules.
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
 * Validate imported custom code rule data.
 * @param {unknown} data - The parsed JSON data
 * @returns {{ isValid: boolean, rule?: CustomCodeRule, error?: string }}
 */
function validateImportedRule(data) {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'Invalid JSON structure' };
  }

  const raw = /** @type {Record<string, unknown>} */ (data);

  // Check required fields
  if (typeof raw.pattern !== 'string' || !raw.pattern.trim()) {
    return { isValid: false, error: 'Missing or invalid pattern field' };
  }

  if (typeof raw.css !== 'string' && typeof raw.js !== 'string') {
    return {
      isValid: false,
      error: 'At least one of CSS or JS code must be provided',
    };
  }

  // Validate URL pattern
  try {
    // eslint-disable-next-line no-new
    // @ts-ignore - URLPattern is a browser API not yet in TypeScript types
    new URLPattern(raw.pattern);
  } catch (error) {
    return { isValid: false, error: 'Invalid URL pattern format' };
  }

  // Create validated rule
  const rule = {
    id: generateRuleId(), // Generate new ID to avoid conflicts
    pattern: raw.pattern.trim(),
    css: typeof raw.css === 'string' ? raw.css : '',
    js: typeof raw.js === 'string' ? raw.js : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { isValid: true, rule };
}

/**
 * Load existing custom code rules from storage.
 * @returns {Promise<CustomCodeRule[]>}
 */
async function loadCustomCodeRules() {
  try {
    const stored = await chrome.storage.local.get(CUSTOM_CODE_STORAGE_KEY);
    const rules = stored?.[CUSTOM_CODE_STORAGE_KEY] || [];
    return Array.isArray(rules) ? rules : [];
  } catch (error) {
    console.error('[popup] Failed to load custom code rules:', error);
    return [];
  }
}

/**
 * Save custom code rules to storage.
 * @param {CustomCodeRule[]} rules - The rules to save
 * @returns {Promise<void>}
 */
async function saveCustomCodeRules(rules) {
  try {
    await chrome.storage.local.set({
      [CUSTOM_CODE_STORAGE_KEY]: rules,
    });
  } catch (error) {
    console.error('[popup] Failed to save custom code rules:', error);
    throw error;
  }
}

/**
 * Handle importing a custom code rule from JSON file.
 * @param {File} file - The JSON file to import
 * @returns {Promise<void>}
 */
async function handleImportCustomCode(file) {
  try {
    // Validate file type
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      if (statusMessage) {
        concludeStatus(
          'Please select a valid JSON file.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Read file content
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      if (statusMessage) {
        concludeStatus(
          'Invalid JSON file format.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Validate rule data
    const validation = validateImportedRule(data);
    if (!validation.isValid) {
      if (statusMessage) {
        concludeStatus(
          `Import failed: ${validation.error}`,
          'error',
          4000,
          statusMessage,
        );
      }
      return;
    }

    const newRule = validation.rule;
    if (!newRule) {
      if (statusMessage) {
        concludeStatus(
          'Failed to create rule from import.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Load existing rules
    const existingRules = await loadCustomCodeRules();

    // Check for duplicate pattern
    const duplicatePattern = existingRules.find(
      (rule) => rule.pattern === newRule.pattern,
    );
    if (duplicatePattern) {
      if (statusMessage) {
        concludeStatus(
          'A rule with this pattern already exists.',
          'error',
          4000,
          statusMessage,
        );
      }
      return;
    }

    // Add new rule
    const updatedRules = [...existingRules, newRule];
    await saveCustomCodeRules(updatedRules);

    if (statusMessage) {
      concludeStatus(
        `Custom code rule imported successfully for "${newRule.pattern}"`,
        'success',
        4000,
        statusMessage,
      );
    }
  } catch (error) {
    console.error('[popup] Error importing custom code rule:', error);
    if (statusMessage) {
      concludeStatus(
        'Failed to import custom code rule.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Handle saving/syncing the current session to a collection.
 * @param {number} collectionId
 * @param {HTMLButtonElement} button
 */
async function handleSaveSession(collectionId, button) {
  if (button.classList.contains('loading')) return;

  const originalContent = button.innerHTML;
  button.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';
  button.classList.add('loading');

  try {
    const response = await chrome.runtime.sendMessage({
      type: SAVE_SESSION_MESSAGE,
      collectionId
    });

    if (response && response.ok) {
      button.innerHTML = '✅';
      setTimeout(() => {
        button.innerHTML = originalContent;
        button.classList.remove('loading');
      }, 2000);
      if (statusMessage) {
        concludeStatus('Session synced successfully', 'success', 3000, statusMessage);
      }
    } else {
      throw new Error(response?.error || 'Unknown error');
    }
  } catch (error) {
    console.warn('[popup] Save session failed:', error);
    button.innerHTML = '❌';
    setTimeout(() => {
      button.innerHTML = originalContent;
      button.classList.remove('loading');
    }, 3000);
    if (statusMessage) {
      concludeStatus(
        'Failed to sync session: ' + error.message,
        'error',
        4000,
        statusMessage,
      );
    }
  }
}

const RAINDROP_SEARCH_MESSAGE = 'mirror:search';
const FETCH_SESSIONS_MESSAGE = 'mirror:fetchSessions';
const FETCH_SESSION_DETAILS_MESSAGE = 'mirror:fetchSessionDetails';
const RESTORE_SESSION_MESSAGE = 'mirror:restoreSession';
const RESTORE_WINDOW_MESSAGE = 'mirror:restoreWindow';
const RESTORE_GROUP_MESSAGE = 'mirror:restoreGroup';
const RESTORE_TAB_MESSAGE = 'mirror:restoreTab';
const OPEN_ALL_ITEMS_MESSAGE = 'mirror:openAllItems';
const SAVE_SESSION_MESSAGE = 'mirror:saveSession';
const UPDATE_SESSION_NAME_MESSAGE = 'mirror:updateSessionName';
const SESSIONS_CACHE_KEY = 'sessionsCache';

/**
 * Format a timestamp based on proximity to current time.
 * - within same day: HH:mm
 * - yesterday: Yesterday, HH:mm
 * - within 7 days: ddd, HH:mm
 * - within 30 days: N days ago, HH:mm
 * - within same year: MMM D, HH:mm
 * - others: YYYY MMM D, HH:mm
 * @param {string | number | undefined} value
 * @returns {string}
 */
function formatTimestamp(value) {
  if (!value) {
    return '—';
  }
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '—';

    const now = new Date();
    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    const isYesterday = (d1, d2) => {
      const yesterday = new Date(d1);
      yesterday.setDate(d1.getDate() - 1);
      return isSameDay(yesterday, d2);
    };

    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const timeStr = `${HH}:${mm}`;

    if (isSameDay(now, date)) {
      return timeStr;
    }

    if (isYesterday(now, date)) {
      return `Yesterday, ${timeStr}`;
    }

    if (diffDays < 7) {
      const ddd = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(
        date,
      );
      return `${ddd}, ${timeStr}`;
    }

    if (diffDays < 30) {
      return `${diffDays} days ago, ${timeStr}`;
    }

    if (date.getFullYear() === now.getFullYear()) {
      const MMM = new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
      const D = date.getDate();
      return `${MMM} ${D}, ${timeStr}`;
    }

    const YYYY = date.getFullYear();
    const MMM = new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
    const D = date.getDate();
    return `${YYYY} ${MMM} ${D}, ${timeStr}`;
  } catch (error) {
    return '—';
  }
}

/**
 * Initialize the sessions list in the popup.
 * @returns {Promise<void>}
 */
async function initializeSessions() {
  const sessionsSection = document.getElementById('sessionsSection');
  const sessionsList = document.getElementById('sessionsList');
  const loadingIndicator = document.getElementById('sessionsLoadingIndicator');

  if (!sessionsSection || !sessionsList) {
    return;
  }

  // --- Preserve State ---
  // 1. Save scroll position
  const scrollPosition = sessionsList.scrollTop;

  // 2. Save expanded session IDs
  const expandedSessionIds = new Set();
  sessionsList.querySelectorAll('.session-item').forEach((item) => {
    const details = item.querySelector('.session-details');
    if (details && !details.classList.contains('hidden')) {
      const sessionId = item.dataset.sessionId;
      if (sessionId) {
        expandedSessionIds.add(sessionId);
      }
    }
  });
  // --- End Preserve State ---

  // 1. Load and render cached sessions immediately if available
  try {
    const result = await chrome.storage.local.get(SESSIONS_CACHE_KEY);
    const cachedSessions = result[SESSIONS_CACHE_KEY];
    if (Array.isArray(cachedSessions) && cachedSessions.length > 0) {
      sessionsSection.classList.remove('hidden');
      renderSessions(cachedSessions, sessionsList, expandedSessionIds);
      sessionsList.scrollTop = scrollPosition; // Restore scroll after initial render
    }
  } catch (err) {
    console.warn('[popup] Failed to load sessions cache:', err);
  }

  // 2. Show loading indicator and fetch latest sessions
  if (loadingIndicator) {
    loadingIndicator.classList.remove('hidden');
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: FETCH_SESSIONS_MESSAGE,
    });

    if (response && response.ok && Array.isArray(response.sessions)) {
      if (response.sessions.length > 0) {
        sessionsSection.classList.remove('hidden');
        renderSessions(response.sessions, sessionsList, expandedSessionIds);
        // Update cache
        await chrome.storage.local.set({ [SESSIONS_CACHE_KEY]: response.sessions });
      } else {
        // If no sessions found on server, clear UI and cache
        sessionsSection.classList.add('hidden');
        sessionsList.innerHTML = '';
        await chrome.storage.local.remove(SESSIONS_CACHE_KEY);
      }
    } else {
      console.warn('[popup] Failed to fetch sessions:', response?.error);
      // If we don't have any sessions (rendered from cache or now), hide section
      if (sessionsList.children.length === 0) {
        sessionsSection.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('[popup] Error initializing sessions:', error);
    if (sessionsList.children.length === 0) {
      sessionsSection.classList.add('hidden');
    }
  } finally {
    if (loadingIndicator) {
      loadingIndicator.classList.add('hidden');
    }
    // --- Restore State ---
    // Restore scroll position after final render
    sessionsList.scrollTop = scrollPosition;
    // --- End Restore State ---
  }
}

/**
 * Render the sessions list.
 * @param {Array<{id: number, title: string, isCurrent: boolean}>} sessions
 * @param {HTMLElement} container
 * @param {Set<string>} [expandedSessionIds=new Set()]
 */
function renderSessions(sessions, container, expandedSessionIds = new Set()) {
  container.innerHTML = '';

  sessions.forEach((session) => {
    const sessionItem = document.createElement('div');
    sessionItem.className = 'session-item flex flex-col gap-1';
    sessionItem.dataset.sessionId = String(session.id);

    const header = document.createElement('div');
    header.className =
      'flex items-center justify-between p-2 hover:bg-base-300 rounded-md group cursor-pointer';

    const leftSide = document.createElement('div');
    leftSide.className = 'flex items-center gap-2 overflow-hidden';

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'text-[10px] transition-transform duration-200';
    toggleIcon.textContent = '▶';
    leftSide.appendChild(toggleIcon);

    // Add cover icon if available
    const coverUrl = Array.isArray(session.cover) ? session.cover[0] : session.cover;
    if (coverUrl && typeof coverUrl === 'string' && coverUrl.trim().length > 0) {
      const iconImg = document.createElement('img');
      iconImg.src = coverUrl;
      iconImg.className = 'w-4 h-4 rounded-sm object-cover';
      leftSide.appendChild(iconImg);
    }

    const titleContainer = document.createElement('div');
    titleContainer.className = 'flex flex-col overflow-hidden';

    const titleRow = document.createElement('div');
    titleRow.className = 'flex items-center gap-2';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'truncate font-medium text-sm';
    titleSpan.textContent = session.title;
    titleRow.appendChild(titleSpan);

    if (session.isCurrent) {
      const chip = document.createElement('span');
      chip.className = 'badge badge-sm badge-primary text-[10px] h-4 shrink-0';
      chip.textContent = 'Current';
      titleRow.appendChild(chip);
    }
    titleContainer.appendChild(titleRow);

    if (session.lastUpdate) {
      const lastUpdateSpan = document.createElement('span');
      lastUpdateSpan.className = 'text-[10px] opacity-50 truncate';
      lastUpdateSpan.textContent = `Last update: ${formatTimestamp(session.lastUpdate)}`;
      titleContainer.appendChild(lastUpdateSpan);
    }

    leftSide.appendChild(titleContainer);

    const restoreButton = document.createElement('button');
    restoreButton.className =
      'btn btn-square btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity';
    restoreButton.innerHTML = '↗️';
    restoreButton.title = 'Restore session';
    restoreButton.addEventListener('click', (e) => {
      e.stopPropagation();
      void handleRestoreSession(session.id, restoreButton);
    });

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'flex items-center gap-1';

    if (session.isCurrent) {
      const editButton = document.createElement('button');
      editButton.className =
        'btn btn-square btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity';
      editButton.innerHTML = '✏️';
      editButton.title = 'Edit session name';
      editButton.addEventListener('click', (e) => {
        e.stopPropagation();
        void handleEditSessionName(session.id, session.title);
      });
      actionsContainer.appendChild(editButton);
    }

    actionsContainer.appendChild(restoreButton);

    header.appendChild(leftSide);
    header.appendChild(actionsContainer);

    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'session-details pl-4 hidden';

    const isExpanded = expandedSessionIds.has(String(session.id));
    if (isExpanded) {
      detailsContainer.classList.remove('hidden');
      toggleIcon.classList.add('rotate-90');
      // Fetch details immediately if it was already expanded
      void fetchAndRenderSessionDetails(session.id, detailsContainer);
    }


    header.addEventListener('click', () => {
      const isHidden = detailsContainer.classList.contains('hidden');
      if (isHidden) {
        detailsContainer.classList.remove('hidden');
        toggleIcon.classList.add('rotate-90');
        void fetchAndRenderSessionDetails(session.id, detailsContainer);
      } else {
        detailsContainer.classList.add('hidden');
        toggleIcon.classList.remove('rotate-90');
      }
    });

    sessionItem.appendChild(header);
    sessionItem.appendChild(detailsContainer);
    container.appendChild(sessionItem);
  });
}

/**
 * Handle editing a session's name using a modal dialog.
 * @param {number} collectionId
 * @param {string} currentName
 */
async function handleEditSessionName(collectionId, currentName) {
  const modal = /** @type {HTMLDialogElement | null} */ (document.getElementById('editSessionNameModal'));
  const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('editSessionNameInput'));
  const cancelButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('editSessionNameCancelButton'));
  const confirmButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('editSessionNameConfirmButton'));
  const iconPicker = /** @type {HTMLElement | null} */ (document.getElementById('editSessionIconPicker'));

  if (!modal || !nameInput || !cancelButton || !confirmButton || !iconPicker) {
    console.error('Edit session name dialog elements not found');
    if (statusMessage) {
      concludeStatus('Could not open edit dialog.', 'error', 3000, statusMessage);
    }
    return;
  }

  nameInput.value = currentName;
  
  // Track selected icon
  let selectedIcon = '';
  const iconOptions = iconPicker.querySelectorAll('.icon-option');
  
  // Reset icon selection UI
  iconOptions.forEach((btn) => {
    btn.classList.remove('btn-active');
    if (btn.getAttribute('data-icon') === '') {
      btn.classList.add('btn-active');
    }
  });
  
  // Handle icon selection using event delegation
  const handleIconClick = (/** @type {Event} */ e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const btn = target.closest('.icon-option');
    if (btn) {
      selectedIcon = btn.getAttribute('data-icon') || '';
      iconOptions.forEach((b) => b.classList.remove('btn-active'));
      btn.classList.add('btn-active');
    }
  };
  
  iconPicker.addEventListener('click', handleIconClick);

  const handleConfirm = async () => {
    if (confirmButton.disabled) return;
    const newName = nameInput.value.trim();
    const nameChanged = newName && newName !== currentName;
    const iconSelected = selectedIcon && selectedIcon !== '';

    if (nameChanged || iconSelected) {
      // Show loading state
      const originalButtonContent = confirmButton.innerHTML;
      confirmButton.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Saving...';
      confirmButton.disabled = true;
      cancelButton.disabled = true;

      try {
        // Update name if changed
        if (nameChanged) {
          const response = await chrome.runtime.sendMessage({
            type: UPDATE_SESSION_NAME_MESSAGE,
            collectionId,
            oldName: currentName,
            newName: newName,
          });

          if (!response || !response.ok) {
            throw new Error(response?.error || 'Failed to update session name');
          }
        }
        
        // Upload cover if icon selected
        if (iconSelected) {
          const uploadResponse = await chrome.runtime.sendMessage({
            type: 'mirror:uploadCollectionCover',
            collectionId,
            iconPath: selectedIcon,
          });

          if (!uploadResponse || !uploadResponse.ok) {
            throw new Error(uploadResponse?.error || 'Failed to upload cover');
          }
        }

        if (statusMessage) {
          const messages = [];
          if (nameChanged) messages.push('Session name updated');
          if (iconSelected) messages.push('Cover uploaded');
          concludeStatus(messages.join('. ') + '.', 'success', 3000, statusMessage);
        }
        await initializeSessions(); // Refresh the list
      } catch (error) {
        console.error('[popup] Error updating session:', error);
        if (statusMessage) {
          concludeStatus(`Error: ${error.message}`, 'error', 4000, statusMessage);
        }
      } finally {
        // Restore button state
        confirmButton.innerHTML = originalButtonContent;
        confirmButton.disabled = false;
        cancelButton.disabled = false;
      }
    }
    modal.close();
  };

  const handleCancel = () => {
    modal.close();
  };

  const handleWindowKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      modal.close();
    } else if (e.key === 'Enter') {
      // If a button is focused, let the browser handle the Enter key to click it
      if (document.activeElement instanceof HTMLButtonElement) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      void handleConfirm();
    }
  };

  const handleCancelEvent = (/** @type {Event} */ e) => {
    e.preventDefault(); // Prevent default dialog close to handle it via our window listener
    e.stopPropagation();
  };

  // Store original button content for restoration
  const originalConfirmButtonContent = confirmButton.innerHTML;

  confirmButton.addEventListener('click', handleConfirm, { once: true });
  cancelButton.addEventListener('click', handleCancel, { once: true });
  window.addEventListener('keydown', handleWindowKeyDown, true);
  modal.addEventListener('cancel', handleCancelEvent);

  modal.addEventListener('close', () => {
    confirmButton.removeEventListener('click', handleConfirm);
    cancelButton.removeEventListener('click', handleCancel);
    window.removeEventListener('keydown', handleWindowKeyDown, true);
    modal.removeEventListener('cancel', handleCancelEvent);
    iconPicker.removeEventListener('click', handleIconClick);
    // Restore button state in case modal was closed while loading
    if (confirmButton.classList.contains('loading')) {
      confirmButton.innerHTML = originalConfirmButtonContent;
      confirmButton.disabled = false;
      cancelButton.disabled = false;
    }
  }, { once: true });

  modal.showModal();
  // Focus input after modal is shown with a small delay to override browser default focus
  setTimeout(() => {
    nameInput.focus();
    nameInput.select(); // Select all text for easy editing
  }, 50);
}

/**
 * Fetch and render the tree details of a session.
 * @param {number} collectionId
 * @param {HTMLElement} container
 */
async function fetchAndRenderSessionDetails(collectionId, container) {
  container.innerHTML =
    '<div class="flex items-center justify-center py-2"><span class="loading loading-spinner loading-xs"></span></div>';

  try {
    const response = await chrome.runtime.sendMessage({
      type: FETCH_SESSION_DETAILS_MESSAGE,
      collectionId,
    });

    if (response && response.ok && response.details) {
      renderSessionTree(response.details, container);
    } else {
      container.innerHTML =
        '<div class="text-xs text-error p-2">Failed to load details</div>';
    }
  } catch (error) {
    console.error('[popup] Error fetching session details:', error);
    container.innerHTML =
      '<div class="text-xs text-error p-2">Error loading details</div>';
  }
}

/**
 * Render the structured tree of windows, groups, and tabs.
 * @param {any} details
 * @param {HTMLElement} container
 */
function renderSessionTree(details, container) {
  container.innerHTML = '';

  if (!details.windows || details.windows.length === 0) {
    container.innerHTML =
      '<div class="text-xs text-base-content/50 p-2 italic text-center">No open tabs in this session</div>';
    return;
  }

  details.windows.forEach((win, index) => {
    const windowItem = document.createElement('div');
    windowItem.className = 'flex flex-col gap-1 mt-1';

    const header = document.createElement('div');
    header.className =
      'flex items-center justify-between p-1 hover:bg-base-300 rounded-md group cursor-pointer';

    const leftSide = document.createElement('div');
    leftSide.className = 'flex items-center gap-2 overflow-hidden';

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'text-[8px] transition-transform duration-200 rotate-90';
    toggleIcon.textContent = '▶';
    leftSide.appendChild(toggleIcon);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'truncate text-xs font-semibold opacity-70';
    titleSpan.textContent = `Window ${index + 1}`;
    leftSide.appendChild(titleSpan);

    const restoreButton = document.createElement('button');
    restoreButton.className =
      'btn btn-square btn-ghost btn-[10px] h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity';
    restoreButton.innerHTML = '↗️';
    restoreButton.title = 'Restore window';
    restoreButton.addEventListener('click', (e) => {
      e.stopPropagation();
      void handleRestoreWindow(win.tree, restoreButton);
    });

    header.appendChild(leftSide);
    header.appendChild(restoreButton);

    const treeContainer = document.createElement('div');
    treeContainer.className = 'pl-3 flex flex-col gap-0.5';

    header.addEventListener('click', () => {
      const isHidden = treeContainer.classList.contains('hidden');
      if (isHidden) {
        treeContainer.classList.remove('hidden');
        toggleIcon.classList.add('rotate-90');
      } else {
        treeContainer.classList.add('hidden');
        toggleIcon.classList.remove('rotate-90');
      }
    });

    win.tree.forEach((node) => {
      if (node.type === 'tab') {
        treeContainer.appendChild(renderTabItem(node));
      } else if (node.type === 'group') {
        treeContainer.appendChild(renderGroupItem(node));
      }
    });

    windowItem.appendChild(header);
    windowItem.appendChild(treeContainer);
    container.appendChild(windowItem);
  });
}

/**
 * Render a tab item.
 * @param {any} tab
 * @returns {HTMLElement}
 */
function renderTabItem(tab) {
  const item = document.createElement('div');
  item.className =
    'flex items-center justify-between p-1 hover:bg-base-300 rounded-sm group';

  const leftSide = document.createElement('div');
  leftSide.className = 'flex items-center gap-2 overflow-hidden flex-1';

  const icon = document.createElement('span');
  icon.textContent = '📄';
  icon.className = 'text-[10px] opacity-50';
  leftSide.appendChild(icon);

  const titleSpan = document.createElement('span');
  titleSpan.className = 'truncate text-[11px]';
  titleSpan.textContent = tab.title || tab.url;
  leftSide.appendChild(titleSpan);

  const restoreButton = document.createElement('button');
  restoreButton.className =
    'btn btn-square btn-ghost btn-[10px] h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity';
  restoreButton.innerHTML = '↗️';
  restoreButton.title = 'Restore tab';
  restoreButton.addEventListener('click', (e) => {
    e.stopPropagation();
    void handleRestoreTab(tab, restoreButton);
  });

  item.appendChild(leftSide);
  item.appendChild(restoreButton);
  return item;
}

/**
 * Render a group item.
 * @param {any} group
 * @returns {HTMLElement}
 */
function renderGroupItem(group) {
  const groupItem = document.createElement('div');
  groupItem.className = 'flex flex-col gap-0.5';

  const header = document.createElement('div');
  header.className =
    'flex items-center justify-between p-1 hover:bg-base-300 rounded-sm group cursor-pointer';

  const leftSide = document.createElement('div');
  leftSide.className = 'flex items-center gap-2 overflow-hidden';

  const colorBar = document.createElement('div');
  colorBar.className = 'w-1 h-3 rounded-full';
  colorBar.style.backgroundColor = group.color || 'grey';
  leftSide.appendChild(colorBar);

  const titleSpan = document.createElement('span');
  titleSpan.className = 'truncate text-[11px] font-bold';
  titleSpan.textContent = group.title || 'Group';
  leftSide.appendChild(titleSpan);

  const restoreButton = document.createElement('button');
  restoreButton.className =
    'btn btn-square btn-ghost btn-[10px] h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity';
  restoreButton.innerHTML = '↗️';
  restoreButton.title = 'Restore group';
  restoreButton.addEventListener('click', (e) => {
    e.stopPropagation();
    void handleRestoreGroup(group, restoreButton);
  });

  header.appendChild(leftSide);
  header.appendChild(restoreButton);

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'pl-3 flex flex-col gap-0.5 border-l border-base-content/10 ml-1.5';

  header.addEventListener('click', () => {
    const isHidden = tabsContainer.classList.contains('hidden');
    if (isHidden) {
      tabsContainer.classList.remove('hidden');
    } else {
      tabsContainer.classList.add('hidden');
    }
  });

  group.tabs.forEach((tab) => {
    tabsContainer.appendChild(renderTabItem(tab));
  });

  groupItem.appendChild(header);
  groupItem.appendChild(tabsContainer);
  return groupItem;
}

/**
 * Handle window restoration.
 * @param {any[]} tree
 * @param {HTMLButtonElement} button
 */
async function handleRestoreWindow(tree, button) {
  const originalContent = button.innerHTML;
  button.innerHTML = '<span class="loading loading-spinner loading-[10px]"></span>';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: RESTORE_WINDOW_MESSAGE,
      tree,
    });

    if (response && response.ok) {
      if (statusMessage) {
        concludeStatus('Window restored successfully.', 'success', 3000, statusMessage);
      }
    } else {
      throw new Error(response?.error || 'Failed to restore window');
    }
  } catch (error) {
    console.error('[popup] Error restoring window:', error);
    if (statusMessage) {
      concludeStatus(`Error: ${error.message}`, 'error', 3000, statusMessage);
    }
  } finally {
    button.innerHTML = originalContent;
    button.disabled = false;
  }
}

/**
 * Handle group restoration.
 * @param {any} group
 * @param {HTMLButtonElement} button
 */
async function handleRestoreGroup(group, button) {
  const originalContent = button.innerHTML;
  button.innerHTML = '<span class="loading loading-spinner loading-[10px]"></span>';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: RESTORE_GROUP_MESSAGE,
      group,
    });

    if (response && response.ok) {
      if (statusMessage) {
        concludeStatus('Group restored successfully.', 'success', 3000, statusMessage);
      }
    } else {
      throw new Error(response?.error || 'Failed to restore group');
    }
  } catch (error) {
    console.error('[popup] Error restoring group:', error);
    if (statusMessage) {
      concludeStatus(`Error: ${error.message}`, 'error', 3000, statusMessage);
    }
  } finally {
    button.innerHTML = originalContent;
    button.disabled = false;
  }
}

/**
 * Handle tab restoration.
 * @param {any} tab
 * @param {HTMLButtonElement} button
 */
async function handleRestoreTab(tab, button) {
  const originalContent = button.innerHTML;
  button.innerHTML = '<span class="loading loading-spinner loading-[10px]"></span>';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: RESTORE_TAB_MESSAGE,
      url: tab.url,
      pinned: tab.pinned,
    });

    if (response && response.ok) {
      if (statusMessage) {
        concludeStatus('Tab restored successfully.', 'success', 3000, statusMessage);
      }
    } else {
      throw new Error(response?.error || 'Failed to restore tab');
    }
  } catch (error) {
    console.error('[popup] Error restoring tab:', error);
    if (statusMessage) {
      concludeStatus(`Error: ${error.message}`, 'error', 3000, statusMessage);
    }
  } finally {
    button.innerHTML = originalContent;
    button.disabled = false;
  }
}

/**
 * Handle session restoration.
 * @param {number} collectionId
 * @param {HTMLButtonElement} button
 */
async function handleRestoreSession(collectionId, button) {
  const originalContent = button.innerHTML;
  button.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: RESTORE_SESSION_MESSAGE,
      collectionId,
    });

    if (response && response.ok) {
      if (statusMessage) {
        concludeStatus('Session restored successfully.', 'success', 3000, statusMessage);
      }
      window.close();
    } else {
      throw new Error(response?.error || 'Failed to restore session');
    }
  } catch (error) {
    console.error('[popup] Error restoring session:', error);
    if (statusMessage) {
      concludeStatus(`Error: ${error.message}`, 'error', 3000, statusMessage);
    }
    button.innerHTML = originalContent;
    button.disabled = false;
  }
}

/**
 * Initialize the popup based on login status.
 * @returns {Promise<void>}
 */
async function initializePopup() {
  try {
    const validationStatus = await getTokenValidationStatus();

    if (validationStatus.isValid) {
      // Tokens are valid, show full UI
      if (mirrorSection) {
        toggleMirrorSection(true, mirrorSection);
      }
      // Initialize sessions only if logged in
      void initializeSessions();
    } else if (validationStatus.needsReauth) {
      // Tokens exist but expired/invalid and couldn't be refreshed
      // Show login message with reauth prompt
      if (statusMessage && openOptionsButton) {
        showLoginMessage(
          statusMessage,
          openOptionsButton,
          validationStatus.error ||
          'Session expired. Please reconnect in Options.',
        );
      }
    } else {
      // No tokens at all
      if (statusMessage && openOptionsButton) {
        showLoginMessage(statusMessage, openOptionsButton);
      }
    }
  } catch (error) {
    console.error('[popup] Error initializing popup:', error);
    if (statusMessage && openOptionsButton) {
      showLoginMessage(statusMessage, openOptionsButton);
    }
  }
}

// Check if we should navigate to chat page (triggered by keyboard shortcut)
void (async () => {
  try {
    const result = await chrome.storage.local.get('openChatPage');
    if (result.openChatPage) {
      // Clear the flag
      await chrome.storage.local.remove('openChatPage');
      // Navigate to chat page
      window.location.href = 'chat.html';
      return;
    }
  } catch (error) {
    console.error('[popup] Failed to check chat page flag:', error);
  }

  // Initialize the popup normally
  void initializePopup();
})();

const GET_AUTO_RELOAD_STATUS_MESSAGE = 'autoReload:getStatus';
const AUTO_RELOAD_STATUS_REFRESH_INTERVAL = 1000;
let autoReloadStatusTimer = null;

/**
 * Format remaining milliseconds into a human-friendly countdown.
 * @param {number} remainingMs
 * @returns {string}
 */
function formatRemainingCountdown(remainingMs) {
  const safeMs = Math.max(0, Number(remainingMs) || 0);
  if (safeMs === 0) {
    return 'This tab will be reloaded in 0 seconds';
  }
  if (safeMs >= 60000) {
    const minutes = Math.max(1, Math.ceil(safeMs / 60000));
    return (
      'This tab will be reloaded in ' +
      minutes +
      (minutes === 1 ? ' minute' : ' minutes')
    );
  }
  const seconds = Math.max(1, Math.ceil(safeMs / 1000));
  return (
    'This tab will be reloaded in ' +
    seconds +
    (seconds === 1 ? ' second' : ' seconds')
  );
}

/**
 * Update the auto reload status indicator from background state.
 * @returns {Promise<void>}
 */
async function updateAutoReloadStatus() {
  if (!autoReloadStatusElement) {
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: GET_AUTO_RELOAD_STATUS_MESSAGE,
    });
    const status = response?.status;
    if (
      !status ||
      typeof status.remainingMs !== 'number' ||
      status.tabId === undefined
    ) {
      autoReloadStatusElement.hidden = true;
      autoReloadStatusElement.textContent = '';
      return;
    }
    autoReloadStatusElement.hidden = false;
    autoReloadStatusElement.textContent = formatRemainingCountdown(
      status.remainingMs,
    );
  } catch (error) {
    autoReloadStatusElement.hidden = true;
    autoReloadStatusElement.textContent = '';
    console.warn('[popup] Failed to read auto reload status:', error);
  }
}

/**
 * Start polling for auto reload countdown updates while popup is open.
 * @returns {void}
 */
function startAutoReloadStatusUpdates() {
  if (!autoReloadStatusElement) {
    return;
  }
  void updateAutoReloadStatus();
  if (autoReloadStatusTimer !== null) {
    clearInterval(autoReloadStatusTimer);
  }
  autoReloadStatusTimer = setInterval(() => {
    void updateAutoReloadStatus();
  }, AUTO_RELOAD_STATUS_REFRESH_INTERVAL);
}

startAutoReloadStatusUpdates();

window.addEventListener('unload', () => {
  if (autoReloadStatusTimer !== null) {
    clearInterval(autoReloadStatusTimer);
    autoReloadStatusTimer = null;
  }
});

/**
 * Handle getting page content as markdown.
 * Opens the chat with LLM page within the same popup.
 * @returns {void}
 */
function handleGetMarkdown() {
  // Navigate to the chat page within the same popup window
  window.location.href = 'chat.html';
}

/**
 * Handle split page functionality.
 * Triggers the split/unsplit page feature for the current tab(s).
 * @returns {Promise<void>}
 */
async function handleSplitPage() {
  try {
    // Send message to background to trigger split/unsplit functionality
    await chrome.runtime.sendMessage({
      type: 'splitTabs',
    });

    // Close the popup
    window.close();
  } catch (error) {
    console.error('[popup] Error triggering split/unsplit page:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to trigger split/unsplit page.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Handle opening auto reload options with current tab URL prefilled.
 * @returns {Promise<void>}
 */
async function handleAutoReload() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (statusMessage) {
        concludeStatus('No active tab found.', 'error', 3000, statusMessage);
      }
      return;
    }

    const currentTab = tabs[0];
    const currentUrl = typeof currentTab.url === 'string' ? currentTab.url : '';

    if (!currentUrl) {
      if (statusMessage) {
        concludeStatus(
          'No URL found for current tab.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Store the URL to prefill in options page
    await chrome.storage.local.set({
      autoReloadPrefillUrl: currentUrl,
    });

    // Open options page with auto reload section hash
    chrome.runtime.openOptionsPage(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[popup] Unable to open options page.', error);
        if (statusMessage) {
          concludeStatus(
            'Unable to open options page.',
            'error',
            3000,
            statusMessage,
          );
        }
      } else {
        // Close the popup
        window.close();
      }
    });
  } catch (error) {
    console.error('[popup] Error opening auto reload options:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to open auto reload options.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Handle opening bright mode options with current tab URL prefilled in whitelist.
 * @returns {Promise<void>}
 */
async function handleBrightMode() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (statusMessage) {
        concludeStatus('No active tab found.', 'error', 3000, statusMessage);
      }
      return;
    }

    const currentTab = tabs[0];
    const currentUrl = typeof currentTab.url === 'string' ? currentTab.url : '';

    if (!currentUrl) {
      if (statusMessage) {
        concludeStatus(
          'No URL found for current tab.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Store the URL to prefill in options page
    await chrome.storage.local.set({
      brightModePrefillUrl: currentUrl,
    });

    // Open options page with bright mode section hash
    chrome.runtime.openOptionsPage(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[popup] Unable to open options page.', error);
        if (statusMessage) {
          concludeStatus(
            'Unable to open options page.',
            'error',
            3000,
            statusMessage,
          );
        }
      } else {
        // Close the popup
        window.close();
      }
    });
  } catch (error) {
    console.error('[popup] Error opening bright mode options:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to open bright mode options.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Handle opening highlight text options with current tab URL prefilled.
 * @returns {Promise<void>}
 */
async function handleHighlightText() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (statusMessage) {
        concludeStatus('No active tab found.', 'error', 3000, statusMessage);
      }
      return;
    }

    const currentTab = tabs[0];
    const currentUrl = typeof currentTab.url === 'string' ? currentTab.url : '';

    if (!currentUrl) {
      if (statusMessage) {
        concludeStatus(
          'No URL found for current tab.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Store the URL to prefill in options page
    await chrome.storage.local.set({
      highlightTextPrefillUrl: currentUrl,
    });

    // Open options page with highlight text section hash
    chrome.runtime.openOptionsPage(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[popup] Unable to open options page.', error);
        if (statusMessage) {
          concludeStatus(
            'Unable to open options page.',
            'error',
            3000,
            statusMessage,
          );
        }
      } else {
        // Close the popup
        window.close();
      }
    });
  } catch (error) {
    console.error('[popup] Error opening highlight text options:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to open highlight text options.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Handle opening custom JS/CSS options with current tab URL prefilled.
 * @returns {Promise<void>}
 */
async function handleCustomCode() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (statusMessage) {
        concludeStatus('No active tab found.', 'error', 3000, statusMessage);
      }
      return;
    }

    const currentTab = tabs[0];
    const currentUrl = typeof currentTab.url === 'string' ? currentTab.url : '';

    if (!currentUrl) {
      if (statusMessage) {
        concludeStatus(
          'No URL found for current tab.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Store the URL to prefill in options page
    await chrome.storage.local.set({
      customCodePrefillUrl: currentUrl,
    });

    // Open options page with custom code section hash
    chrome.runtime.openOptionsPage(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[popup] Unable to open options page.', error);
        if (statusMessage) {
          concludeStatus(
            'Unable to open options page.',
            'error',
            3000,
            statusMessage,
          );
        }
      } else {
        // Close the popup
        window.close();
      }
    });
  } catch (error) {
    console.error('[popup] Error opening custom code options:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to open custom code options.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Handle saving clipboard URL to Raindrop Unsorted.
 * @returns {Promise<void>}
 */
async function handleSaveClipboardToUnsorted() {
  try {
    // Read clipboard directly from popup (which is focused)
    let clipboardText;
    try {
      clipboardText = await navigator.clipboard.readText();
    } catch (clipError) {
      if (statusMessage) {
        concludeStatus(
          'Failed to read clipboard. Please allow clipboard access.',
          'error',
          4000,
          statusMessage,
        );
      }
      return;
    }

    if (!clipboardText || !clipboardText.trim()) {
      if (statusMessage) {
        concludeStatus('Clipboard is empty', 'error', 3000, statusMessage);
      }
      return;
    }

    // Send clipboard text to background for processing and saving
    const response = await chrome.runtime.sendMessage({
      type: 'clipboard:saveToUnsorted',
      clipboardText: clipboardText.trim(),
    });

    if (response?.ok) {
      if (statusMessage) {
        const message =
          response.created > 0
            ? `Saved ${response.created} link(s) from clipboard to Unsorted`
            : 'Clipboard link saved to Unsorted';
        concludeStatus(message, 'success', 3000, statusMessage);
      }
    } else {
      const errorMessage =
        response?.error || 'Failed to save clipboard link to Unsorted';
      if (statusMessage) {
        concludeStatus(errorMessage, 'error', 4000, statusMessage);
      }
    }
  } catch (error) {
    console.error('[popup] Error saving clipboard to Unsorted:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to save clipboard link to Unsorted.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * Handle Picture-in-Picture mode for the largest video in the current tab.
 * @returns {Promise<void>}
 */
async function handlePictureInPicture() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (statusMessage) {
        concludeStatus('No active tab found.', 'error', 3000, statusMessage);
      }
      return;
    }

    const currentTab = tabs[0];

    // Check if tab has a valid ID
    if (typeof currentTab.id !== 'number') {
      if (statusMessage) {
        concludeStatus('Invalid tab ID.', 'error', 3000, statusMessage);
      }
      return;
    }

    // Inject script to find largest video and trigger PiP
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: async () => {
          // Find all video elements
          const videos = Array.from(document.querySelectorAll('video'));

          if (videos.length === 0) {
            return {
              success: false,
              error: 'No video elements found on this page.',
            };
          }

          // Find the largest video by area (width * height)
          let largestVideo = null;
          let largestArea = 0;

          for (const video of videos) {
            // Get video dimensions, prefer actual video dimensions over display size
            const width = video.videoWidth || video.clientWidth || 0;
            const height = video.videoHeight || video.clientHeight || 0;
            const area = width * height;

            if (area > largestArea) {
              largestArea = area;
              largestVideo = video;
            }
          }

          if (!largestVideo) {
            return { success: false, error: 'No valid video element found.' };
          }

          // Set up event listeners for PiP if not already set up
          if (!largestVideo.hasAttribute('data-pip-listeners-set')) {
            largestVideo.setAttribute('data-pip-listeners-set', 'true');

            largestVideo.addEventListener('leavepictureinpicture', () => {
              chrome.storage.local.remove('pipTabId');
              if (!largestVideo.paused) {
                largestVideo.pause();
              }
            });
          }

          try {
            // Check if Picture-in-Picture is already active
            if (document.pictureInPictureElement) {
              // Exit PiP if same video
              if (document.pictureInPictureElement === largestVideo) {
                await document.exitPictureInPicture();
                return { success: true, action: 'exited' };
              }
              // Exit current PiP first, then enter new one
              await document.exitPictureInPicture();
              await largestVideo.requestPictureInPicture();
              return { success: true, action: 'entered' };
            }

            // Request Picture-in-Picture
            await largestVideo.requestPictureInPicture();
            return { success: true, action: 'entered' };
          } catch (error) {
            return { success: false, error: error.message || String(error) };
          }
        },
      });

      const result = results?.[0]?.result;
      if (!result) {
        if (statusMessage) {
          concludeStatus(
            'Failed to trigger Picture-in-Picture.',
            'error',
            3000,
            statusMessage,
          );
        }
        return;
      }

      if (!result.success) {
        if (statusMessage) {
          concludeStatus(
            result.error || 'Failed to trigger Picture-in-Picture.',
            'error',
            3000,
            statusMessage,
          );
        }
        return;
      }

      // If PiP was entered successfully, store the tab ID
      if (result.action === 'entered') {
        await chrome.storage.local.set({ pipTabId: currentTab.id });
      } else if (result.action === 'exited') {
        // If PiP was exited, remove the stored tab ID
        await chrome.storage.local.remove('pipTabId');
      }

      // Success message
      if (statusMessage) {
        const actionText = result.action === 'entered' ? 'entered' : 'exited';
        concludeStatus(
          `Picture-in-Picture ${actionText} successfully.`,
          'success',
          2000,
          statusMessage,
        );
      }

      // Close the popup
      window.close();
    } catch (injectError) {
      console.error('[popup] Error injecting PiP script:', injectError);
      if (statusMessage) {
        concludeStatus(
          'Unable to trigger Picture-in-Picture. Make sure the page has loaded.',
          'error',
          3000,
          statusMessage,
        );
      }
    }
  } catch (error) {
    console.error('[popup] Error triggering Picture-in-Picture:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to trigger Picture-in-Picture.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

// Listen for storage changes to update popup when user logs in/out
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.cloudAuthTokens) {
    void initializePopup();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'showSaveToUnsortedDialog') {
    showSaveToUnsortedDialog(message.tab);
    sendResponse({ ok: true });
    return;
  }
});

/**
 * Initializes the bookmark search functionality.
 * @param {HTMLInputElement} inputElement
 * @param {HTMLDivElement} resultsElement
 */
async function initializeBookmarksSearch(inputElement, resultsElement) {
  const pinnedItemsContainer = document.getElementById('pinnedItemsContainer');
  const PINNED_SEARCH_RESULTS_STORAGE_KEY = 'pinnedSearchResults';
  const SEARCH_RESULT_WEIGHTS_KEY = 'searchResultWeights';

  /**
   * Increments the weight of a search result URL in local storage.
   * @param {string} url
   * @returns {Promise<void>}
   */
  async function updateSearchResultWeight(url) {
    if (!url) return;
    try {
      const result = await chrome.storage.local.get(SEARCH_RESULT_WEIGHTS_KEY);
      const weights = result[SEARCH_RESULT_WEIGHTS_KEY] || {};
      weights[url] = (weights[url] || 0) + 1;
      await chrome.storage.local.set({ [SEARCH_RESULT_WEIGHTS_KEY]: weights });
    } catch (error) {
      console.warn('[popup] Failed to update search result weight:', error);
    }
  }

  const PINNED_COLOR_PALETTE = [
    { bg: '#fecaca', text: '#991b1b' }, // red-200 / red-900
    { bg: '#fed7aa', text: '#9a3412' }, // orange-200 / orange-900
    { bg: '#fef08a', text: '#854d0e' }, // yellow-200 / yellow-900
    { bg: '#bbf7d0', text: '#166534' }, // green-200 / green-900
    { bg: '#99f6e4', text: '#0f766e' }, // teal-200 / teal-900
    { bg: '#bae6fd', text: '#075985' }, // sky-200 / sky-900
    { bg: '#c7d2fe', text: '#3730a3' }, // indigo-200 / indigo-900
    { bg: '#e9d5ff', text: '#6b21a8' }, // purple-200 / purple-900
    { bg: '#fbcfe8', text: '#9d174d' }, // pink-200 / pink-900
    { bg: '#fecdd3', text: '#9f1239' }, // rose-200 / rose-900
  ];

  function getStableColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PINNED_COLOR_PALETTE.length;
    return PINNED_COLOR_PALETTE[index];
  }

  async function getPinnedItems() {
    const result = await chrome.storage.local.get(
      PINNED_SEARCH_RESULTS_STORAGE_KEY,
    );
    return result[PINNED_SEARCH_RESULTS_STORAGE_KEY] || [];
  }

  async function savePinnedItems(items) {
    await chrome.storage.local.set({
      [PINNED_SEARCH_RESULTS_STORAGE_KEY]: items,
    });
  }

  async function pinItem(item) {
    const pinnedItems = await getPinnedItems();
    const isPinned = pinnedItems.some((i) => i.url === item.url);
    if (!isPinned) {
      pinnedItems.push(item);
      await savePinnedItems(pinnedItems);
      await renderPinnedItems();
    }
  }

  async function unpinItem(url) {
    let pinnedItems = await getPinnedItems();
    pinnedItems = pinnedItems.filter((i) => i.url !== url);
    await savePinnedItems(pinnedItems);
    await renderPinnedItems();
  }

  async function renderPinnedItems() {
    if (!pinnedItemsContainer) return;
    const pinnedItems = await getPinnedItems();
    pinnedItemsContainer.innerHTML = '';
    pinnedItems.forEach((item, index) => {
      const colors = getStableColor(item.url);
      const chip = document.createElement('div');
      chip.className =
        'badge gap-2 cursor-pointer hover:opacity-80 pr-1 border-none';
      chip.style.backgroundColor = colors.bg;
      chip.style.color = colors.text;
      chip.innerHTML = `
        <span class="text-[10px] opacity-70 font-bold">${index + 1}</span>
        <span class="truncate max-w-xs">${escapeHtml(item.title)}</span>
        <button class="unpin-button btn btn-ghost btn-circle btn-xs" style="color: inherit">✕</button>
      `;
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('unpin-button')) return;
        void openBookmark(item.url);
      });
      const unpinButton = chip.querySelector('.unpin-button');
      if (unpinButton) {
        unpinButton.addEventListener('click', (e) => {
          e.stopPropagation();
          void unpinItem(item.url);
        });
      }
      pinnedItemsContainer.appendChild(chip);
    });
  }

  /** @type {number} */
  let highlightedIndex = -1;
  /** @type {Array<{type: 'bookmark'|'raindrop'|'raindrop-collection', data: any}>} */
  let currentResults = [];

  // Initial render of pinned items
  void renderPinnedItems();

  // Fetch and cache custom search engines once on initialization
  let customSearchEngines = [];
  try {
    customSearchEngines = await getCustomSearchEngines();
  } catch (error) {
    console.error('[popup] Failed to load custom search engines:', error);
  }

  /**
   * Opens a bookmark, reusing the current tab if it's empty.
   * @param {string} url - The URL of the bookmark to open.
   * @returns {Promise<void>}
   */
  async function openBookmark(url) {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs.length > 0) {
        const currentTab = tabs[0];
        // Check if the current tab is a new tab page or a blank page across different browsers.
        const newTabUrls = [
          'chrome://newtab/', // Chrome
          'about:newtab', // Firefox
          'edge://newtab/', // Edge
          'about:blank', // All browsers
        ];
        if (
          currentTab.id &&
          (!currentTab.url || newTabUrls.includes(currentTab.url))
        ) {
          await chrome.tabs.update(currentTab.id, { url });
        } else {
          await chrome.tabs.create({ url });
        }
      } else {
        // Fallback to creating a new tab if no active tab is found.
        await chrome.tabs.create({ url });
      }
      window.close();
    } catch (error) {
      console.error('Error opening bookmark:', error);
      // Fallback in case of error
      chrome.tabs.create({ url });
      window.close();
    }
  }

  /**
   * Updates the visual highlight of search results.
   * @param {number} index
   */
  function updateHighlight(index) {
    const items = resultsElement.querySelectorAll('.hover\\:bg-base-300');
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('bg-base-300');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('bg-base-300');
      }
    });
  }

  /**
   * Counts direct children bookmarks (not folders) in a folder.
   * @param {chrome.bookmarks.BookmarkTreeNode} folder
   * @returns {Promise<number>}
   */
  function countDirectChildrenBookmarks(folder) {
    return new Promise((resolve) => {
      if (!folder.id) {
        resolve(0);
        return;
      }

      // Get full folder details with children using getSubTree
      chrome.bookmarks.getSubTree(folder.id, (subTree) => {
        if (!subTree || subTree.length === 0) {
          resolve(0);
          return;
        }

        const folderNode = subTree[0];
        if (!folderNode.children || folderNode.children.length === 0) {
          resolve(0);
          return;
        }

        // Count only direct children that are bookmarks (have URLs)
        // Deduplicate by URL to ensure accurate count
        const seenUrls = new Set();
        const uniqueBookmarks = folderNode.children.filter((child) => {
          if (!child.url) {
            return false;
          }
          if (seenUrls.has(child.url)) {
            return false;
          }
          seenUrls.add(child.url);
          return true;
        });

        resolve(uniqueBookmarks.length);
      });
    });
  }

  /**
   * Escapes HTML special characters to prevent XSS.
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Truncates a URL to a maximum length, adding ellipsis if needed.
   * @param {string} url
   * @param {number} maxLength
   * @returns {string}
   */
  function truncateUrl(url, maxLength = 60) {
    if (url.length <= maxLength) {
      return url;
    }
    return url.substring(0, maxLength - 3) + '...';
  }

  /**
   * Renders the bookmark search results.
   * @param {Array<{type: 'bookmark', data: chrome.bookmarks.BookmarkTreeNode}>} results
   */
  function renderSearchResults(results) {
    resultsElement.innerHTML = '';
    results.forEach((result, index) => {
      const resultItem = document.createElement('div');
      resultItem.className =
        'group p-2 hover:bg-base-300 cursor-pointer rounded-md';
      resultItem.dataset.index = String(index);

      let title, url, typeIcon, itemType;

      if (result.type === 'raindrop') {
        const item = result.data;
        itemType = 'raindrop';
        title = item.title || item.link;
        url = item.link;
        typeIcon = '💧';
      } else if (result.type === 'raindrop-collection') {
        const collection = result.data;
        itemType = 'raindrop-collection';
        title = collection.title || 'Untitled';
        if (typeof collection.count === 'number') {
          title += ` (${collection.count})`;
        }
        url = `https://app.raindrop.io/my/${collection._id}`;
        typeIcon = '📥';
      }

      const truncatedUrl = url.startsWith('folder:')
        ? ''
        : truncateUrl(url);
      const collectionChip =
        result.type === 'raindrop' && result.data.collectionTitle
          ? `<span class="px-1.5 py-0.5 text-[9px] bg-base-200 text-base-content/70 rounded-md whitespace-nowrap ml-1 font-medium">
              ${escapeHtml(result.data.collectionTitle)}
            </span>`
          : '';
      const parentCollectionChip =
        result.type === 'raindrop-collection' &&
        result.data.parentCollectionTitle
          ? `<span class="px-1.5 py-0.5 text-[9px] bg-base-200 text-base-content/70 rounded-md whitespace-nowrap ml-1 font-medium">
              ${escapeHtml(result.data.parentCollectionTitle)}
            </span>`
          : '';

      const openAllButton =
        result.type === 'raindrop-collection'
          ? `<button class="open-all-button btn btn-ghost btn-xs hidden group-hover:inline-flex h-[18px] ml-1" title="Open all items in this collection">🗂️</button>`
          : '';

      resultItem.innerHTML = `
        <div class="flex items-center gap-1">
          <div class="relative w-4 h-4">
            <span class="icon absolute inset-0 transition-opacity duration-200 group-hover:opacity-0">${typeIcon}</span>
            <button class="pin-button btn btn-ghost btn-xs absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -ml-[2px] -mt-[2px]">📌</button>
          </div>
          <span class="flex-1 truncate">${escapeHtml(title)}</span>
          ${collectionChip}
          ${parentCollectionChip}
          ${openAllButton}
        </div>
        ${
          truncatedUrl
            ? `<div class="text-[10px] text-base-content/60 truncate mt-1 ml-5">
              ${escapeHtml(truncatedUrl)}
            </div>`
            : ''
        }
      `;

      resultItem.addEventListener('click', (e) => {
        if (
          e.target.classList.contains('pin-button') ||
          e.target.classList.contains('open-all-button')
        )
          return;

        void updateSearchResultWeight(url);
        void openBookmark(url);
      });

      const pinButton = resultItem.querySelector('.pin-button');
      if (pinButton) {
        pinButton.addEventListener('click', (e) => {
          e.stopPropagation();
          void pinItem({ title, url, type: itemType });
        });
      }

      const openAllBtn = resultItem.querySelector('.open-all-button');
      if (openAllBtn && result.type === 'raindrop-collection') {
        openAllBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const collectionId = result.data._id;
          if (collectionId !== undefined) {
            void chrome.runtime.sendMessage({
              type: OPEN_ALL_ITEMS_MESSAGE,
              collectionId,
            });
            window.close();
          }
        });
      }

      resultsElement.appendChild(resultItem);
    });
    // Reset highlight when results are re-rendered
    highlightedIndex = -1;
  }



  /**
   * Opens all direct children bookmarks of a folder in separate tabs.
   * @param {chrome.bookmarks.BookmarkTreeNode} folder
   * @returns {Promise<void>}
   */
  async function openFolderBookmarks(folder) {
    return new Promise((resolve) => {
      if (!folder.id) {
        resolve();
        return;
      }

      // Get full folder details with children
      chrome.bookmarks.getSubTree(folder.id, (subTree) => {
        if (!subTree || subTree.length === 0) {
          resolve();
          return;
        }

        const folderNode = subTree[0];
        if (!folderNode.children || folderNode.children.length === 0) {
          resolve();
          return;
        }

        // Filter to only direct children that are bookmarks (have URLs)
        const bookmarkChildren = folderNode.children.filter(
          (child) => child.url,
        );

        // Deduplicate by URL to prevent opening the same bookmark multiple times
        const seenUrls = new Set();
        const uniqueBookmarks = bookmarkChildren.filter((bookmark) => {
          if (!bookmark.url) {
            return false;
          }
          if (seenUrls.has(bookmark.url)) {
            return false;
          }
          seenUrls.add(bookmark.url);
          return true;
        });

        // Open each bookmark in a separate tab
        uniqueBookmarks.forEach((bookmark) => {
          if (bookmark.url) {
            chrome.tabs.create({ url: bookmark.url });
          }
        });

        window.close();
        resolve();
      });
    });
  }

  /**
   * Performs a bookmark search and renders the results.
   * Prioritizes bookmarks with title matches over URL matches.
   * Includes both bookmarks and folders in results.
   * @param {string} query
   */
  async function performSearch(query) {
    if (!query.trim()) {
      currentResults = [];
      resultsElement.innerHTML = '';
      return;
    }

    // Show loading indicator
    resultsElement.innerHTML = `
      <div class="p-2 flex items-center justify-center text-base-content/60">
        <span class="loading loading-spinner loading-xs mr-2"></span>
        <span>searching ...</span>
      </div>
    `;

    const results = [];

    // Search Raindrop
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'mirror:search',
        query,
      });

      if (response) {
        if (Array.isArray(response.items)) {
          response.items.forEach((item) => {
            results.push({
              type: 'raindrop',
              data: item,
            });
          });
        }
        if (Array.isArray(response.collections)) {
          response.collections.forEach((collection) => {
            results.push({
              type: 'raindrop-collection',
              data: collection,
            });
          });
        }
      }
    } catch (error) {
      console.warn('[popup] Raindrop search failed:', error);
    }

    // Deduplicate items with same URL and title (case-insensitive)
    // For collections, deduplicate by _id
    const seenKeys = new Set();
    const seenCollectionIds = new Set();
    const uniqueResults = results.filter((result) => {
      // Collections: deduplicate by _id
      if (result.type === 'raindrop-collection') {
        const collectionId = result.data._id;
        if (collectionId === undefined || collectionId === null) {
          return true; // Keep collections without IDs (shouldn't happen)
        }
        if (seenCollectionIds.has(collectionId)) {
          return false;
        }
        seenCollectionIds.add(collectionId);
        return true;
      }

      let url = '';
      let title = '';

      if (result.type === 'raindrop') {
        url = (result.data.link || '').toLowerCase();
        title = (result.data.title || '').toLowerCase();
      }

      // Skip items without URL (shouldn't happen for raindrops, but safety check)
      if (!url) {
        return true;
      }

      // Create a key from title and URL
      const key = `${title}|${url}`;

      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    });

    // Fetch weights for sorting
    let weights = {};
    try {
      const weightResult = await chrome.storage.local.get(SEARCH_RESULT_WEIGHTS_KEY);
      weights = weightResult[SEARCH_RESULT_WEIGHTS_KEY] || {};
    } catch (error) {
      console.warn('[popup] Failed to fetch weights for sorting:', error);
    }

    // Sort results by weight (DESC), lastUpdate (DESC), title (ASC), url (ASC)
    uniqueResults.sort((a, b) => {
      const urlA = a.type === 'raindrop' ? a.data.link : `https://app.raindrop.io/my/${a.data._id}`;
      const urlB = b.type === 'raindrop' ? b.data.link : `https://app.raindrop.io/my/${b.data._id}`;

      const weightA = weights[urlA] || 0;
      const weightB = weights[urlB] || 0;

      if (weightA !== weightB) {
        return weightB - weightA;
      }

      const lastUpdateA = new Date(a.data.lastUpdate || 0).getTime();
      const lastUpdateB = new Date(b.data.lastUpdate || 0).getTime();

      if (lastUpdateA !== lastUpdateB) {
        return lastUpdateB - lastUpdateA;
      }

      const titleA = (a.data.title || '').toLowerCase();
      const titleB = (b.data.title || '').toLowerCase();

      if (titleA !== titleB) {
        return titleA.localeCompare(titleB);
      }

      return urlA.localeCompare(urlB);
    });

    // Limit to top 50 results
    const topResults = uniqueResults.slice(0, 50);
    currentResults = topResults;
    if (topResults.length === 0) {
      resultsElement.innerHTML = `
        <div class="p-2 text-center text-base-content/60">
          No results found
        </div>
      `;
    } else {
      renderSearchResults(topResults);
    }
  }



  // Debounce search to improve performance and prevent excessive calls while typing.
  const debouncedSearch = debounce(performSearch, 300);

  inputElement.addEventListener('input', (event) => {
    const target = /** @type {HTMLInputElement | null} */ (event.target);
    if (!target) {
      return;
    }
    const query = target.value;
    highlightedIndex = -1; // Reset highlight when query changes

    const isCustomSearch = customSearchEngines.some((engine) =>
      query.toLowerCase().startsWith(engine.shortcut.toLowerCase() + ' '),
    );

    if (query.length >= 4 && !isCustomSearch) {
      debouncedSearch(query);
    } else {
      resultsElement.innerHTML = '';
      currentResults = [];
    }
  });

  inputElement.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const query = inputElement.value.trim();

      // If there's a highlighted result, open it
      if (highlightedIndex >= 0 && highlightedIndex < currentResults.length) {
        const highlightedResult = currentResults[highlightedIndex];

        if (highlightedResult.type === 'raindrop') {
          const item = highlightedResult.data;
          if (item.link) {
            void updateSearchResultWeight(item.link);
            void openBookmark(item.link);
          }
        } else if (highlightedResult.type === 'raindrop-collection') {
          const collection = highlightedResult.data;
          const collectionUrl = `https://app.raindrop.io/my/${collection._id}`;
          void updateSearchResultWeight(collectionUrl);
          void openBookmark(collectionUrl);
        }
        return;
      }

      // Otherwise, check for custom search engine shortcut
      if (query) {
        try {
          const engines = await getCustomSearchEngines();
          let engineFound = false;

          for (const engine of engines) {
            const shortcut = engine.shortcut;
            const lowerCaseQuery = query.toLowerCase();
            const lowerCaseShortcut = shortcut.toLowerCase();
            let searchQuery = '';

            // Prefix: "ss query"
            if (lowerCaseQuery.startsWith(lowerCaseShortcut + ' ')) {
              searchQuery = query.substring(shortcut.length + 1).trim();
            }
            // Suffix: "query ss"
            else if (lowerCaseQuery.endsWith(' ' + lowerCaseShortcut)) {
              searchQuery = query
                .substring(0, query.length - shortcut.length - 1)
                .trim();
            }

            if (searchQuery) {
              const searchUrl = engine.searchUrl.replace(
                '%s',
                encodeURIComponent(searchQuery),
              );
              chrome.tabs.create({ url: searchUrl });
              window.close();
              engineFound = true;
              break;
            }
          }

          if (!engineFound) {
            // Fall back to Google search
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
              query,
            )}`;
            chrome.tabs.create({ url: searchUrl });
            window.close();
          }
        } catch (error) {
          console.error('[popup] Failed to execute search:', error);
          // Fallback in case of any error during custom search logic
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
            query,
          )}`;
          chrome.tabs.create({ url: searchUrl });
          window.close();
        }
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (currentResults.length > 0) {
        highlightedIndex =
          highlightedIndex < currentResults.length - 1
            ? highlightedIndex + 1
            : 0;
        updateHighlight(highlightedIndex);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (currentResults.length > 0) {
        highlightedIndex =
          highlightedIndex > 0
            ? highlightedIndex - 1
            : currentResults.length - 1;
        updateHighlight(highlightedIndex);
      }
    }
  });

  // Handle Alt + Number shortcuts to open pinned items
  window.addEventListener('keydown', async (event) => {
    // Determine the digit from either event.key or event.code
    // event.code (e.g., 'Digit1') is more reliable on different keyboard layouts and OSes (like Mac)
    let digit = null;
    if (event.key >= '1' && event.key <= '9') {
      digit = event.key;
    } else if (event.code.startsWith('Digit')) {
      const d = event.code.substring(5);
      if (d >= '1' && d <= '9') {
        digit = d;
      }
    }

    if (event.altKey && digit) {
      const index = parseInt(digit, 10) - 1;
      // We must call preventDefault() synchronously before any await
      // to ensure the browser's default action is blocked.
      event.preventDefault();

      const pinnedItems = await getPinnedItems();
      if (index >= 0 && index < pinnedItems.length) {
        const item = pinnedItems[index];
        void openBookmark(item.url);
      }
    }
  });
}
