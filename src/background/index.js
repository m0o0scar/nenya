import {
  saveUrlsToUnsorted,
  normalizeHttpUrl,
  pushNotification,
  handleTokenValidationMessage,
  handleRaindropSearch,
  ensureNenyaSessionsCollection,
  handleFetchSessions,
  handleRestoreSession,
  handleOpenAllItemsInCollection,
  handleFetchSessionDetails,
  handleUpdateSessionName,
  handleDeleteSession,
  handleUploadCollectionCover,
  handleUpdateRaindropUrl,
  exportCurrentSessionToRaindrop,
  ensureDeviceCollectionAndExport,
  loadValidProviderTokens,
} from './mirror.js';

import {
  initializeOptionsBackupService,
  handleOptionsBackupMessage,
  runAutomaticRestore,
  runStartupSync,
} from './options-backup.js';
import {
  initializeAutoReloadFeature,
  handleAutoReloadAlarm,
  getActiveAutoReloadStatus,
  evaluateAllTabs,
} from './auto-reload.js';

import {
  setupClipboardContextMenus,
  handleClipboardContextMenuClick,
  handleClipboardCommand,
  handleMultiTabCopy,
  handleScreenshotCopy,
  setCopySuccessBadge,
  setCopyFailureBadge,
} from './clipboard.js';
import {
  setupContextMenus as setupCentralizedContextMenus,
  updateRunCodeSubmenu,
  updateSplitMenuVisibility,
  updateScreenshotMenuVisibility,
  COPY_MENU_IDS,
  RAINDROP_MENU_IDS,
  NENYA_MENU_IDS,
  PARENT_MENU_IDS,
  isCopyMenuItem,
  isRaindropMenuItem,
  parseRunCodeMenuItem,
  parseLLMMenuItem,
  getCopyFormatType,
} from '../shared/contextMenus.js';
import { initializeTabSnapshots } from './tab-snapshots.js';
import {
  LLM_PROVIDER_META,
  isLLMPage,
  getLLMProviderFromURL,
} from '../shared/llmProviders.js';
import { processUrl } from '../shared/urlProcessor.js';
import {
  convertSplitUrlForSave,
  convertSplitUrlForRestore,
} from '../shared/splitUrl.js';
import { handleOpenInPopup } from './popup.js';
import { addClipboardItem } from './clipboardHistory.js';
import {
  initRaindropExport,
  exportRaindropItemsToBookmarks,
} from './raindrop-export.js';
import { handlePictureInPicture } from './pip-handler.js';
import {
  handleScreenRecordingToggle,
  handleActionClickDuringRecording,
  isRecording,
  handleScreenRecorderMessage,
} from './screen-recorder.js';

const SAVE_UNSORTED_MESSAGE = 'mirror:saveToUnsorted';
const ENCRYPT_AND_SAVE_MESSAGE = 'mirror:encryptAndSave';
const CLIPBOARD_SAVE_TO_UNSORTED_MESSAGE = 'clipboard:saveToUnsorted';
const TAKE_SCREENSHOT_MESSAGE = 'clipboard:takeScreenshot';
const SHOW_SAVE_TO_UNSORTED_DIALOG_MESSAGE =
  'showSaveToUnsortedDialog';
const GET_CURRENT_TAB_ID_MESSAGE = 'getCurrentTabId';
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
const DELETE_SESSION_MESSAGE = 'mirror:deleteSession';
const UPDATE_RAINDROP_URL_MESSAGE = 'mirror:updateRaindropUrl';
const GET_AUTO_RELOAD_STATUS_MESSAGE = 'autoReload:getStatus';
const AUTO_RELOAD_RE_EVALUATE_MESSAGE = 'autoReload:reEvaluate';
const COLLECT_PAGE_CONTENT_MESSAGE = 'collect-page-content-as-markdown';
const COLLECT_AND_SEND_TO_LLM_MESSAGE = 'collect-and-send-to-llm';
const OPEN_LLM_TABS_MESSAGE = 'open-llm-tabs';
const CLOSE_LLM_TABS_MESSAGE = 'close-llm-tabs';
const SWITCH_LLM_PROVIDER_MESSAGE = 'switch-llm-provider';
const RAINDROP_EXPORT_TO_BOOKMARKS_MESSAGE = 'raindrop:exportToBookmarks';
const ENCRYPT_SERVICE_URL = 'https://oh-auth.vercel.app/secret/encrypt';
const ENCRYPT_COVER_URL = 'https://picsum.photos/640/360';

// ============================================================================
// KEYBOARD SHORTCUTS (COMMANDS)
// Set up command listeners as early as possible to ensure they're ready
// when the service worker wakes up from a keyboard shortcut
// ============================================================================

/**
 * Handle keyboard shortcuts (commands).
 * This listener is set up early to ensure it's ready when the service worker
 * wakes up from a keyboard shortcut press.
 * @param {string} command
 * @returns {void}
 */
chrome.commands.onCommand.addListener((command) => {
  if (
    command === 'tabs-activate-left-tab' ||
    command === 'tabs-activate-right-tab'
  ) {
    void (async () => {
      try {
        const window = await chrome.windows.getCurrent({ populate: true });
        if (!window.tabs) {
          return;
        }
        const activeTabIndex = window.tabs.findIndex((tab) => tab.active);
        if (activeTabIndex === -1) {
          return;
        }

        let newIndex;
        if (command === 'tabs-activate-left-tab') {
          newIndex =
            (activeTabIndex - 1 + window.tabs.length) % window.tabs.length;
        } else {
          // 'tabs-activate-right-tab'
          newIndex = (activeTabIndex + 1) % window.tabs.length;
        }

        const newTab = window.tabs[newIndex];
        if (newTab && newTab.id) {
          await chrome.tabs.update(newTab.id, { active: true });
        }
      } catch (error) {
        console.warn('[commands] Tab activation failed:', error);
      }
    })();
    return;
  }

  if (command === 'bookmarks-save-to-unsorted-encrypted') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const activeTab = tabs && tabs[0];
        const url = typeof activeTab?.url === 'string' ? activeTab.url : '';
        if (!url) {
          return;
        }
        const title =
          typeof activeTab?.title === 'string' ? activeTab.title : '';
        const tabId = typeof activeTab?.id === 'number' ? activeTab.id : null;
        const result = await handleEncryptAndSave({
          rawUrl: url,
          title,
          tabId,
          notifyOnError: true,
        });
        if (!result.ok && result.error) {
          console.warn('[commands] Encrypt & Save failed:', result.error);
        }
      } catch (error) {
        console.warn('[commands] Encrypt & Save failed:', error);
      }
    })();
    return;
  }

  if (command === 'bookmarks-save-to-unsorted') {
    void handleSaveToUnsortedRequest();
    return;
  }

  if (command === 'bookmarks-save-clipboard-to-unsorted') {
    void (async () => {
      try {
        const clipboardResult = await readClipboardFromTab();
        if (clipboardResult.error) {
          console.warn(
            '[commands] Failed to read clipboard:',
            clipboardResult.error,
          );
          return;
        }
        const result = await handleSaveClipboardUrlToUnsorted(
          clipboardResult.text || '',
        );
        if (!result.ok && result.error) {
          console.warn(
            '[commands] Save clipboard to Unsorted failed:',
            result.error,
          );
        }
      } catch (error) {
        console.warn('[commands] Save clipboard to Unsorted failed:', error);
      }
    })();
    return;
  }



  if (command === 'pip-quit') {
    void (async () => {
      try {
        const storage = await chrome.storage.local.get('pipTabId');
        const { pipTabId } = storage;

        if (pipTabId) {
          await chrome.scripting.executeScript({
            target: { tabId: pipTabId },
            func: () => {
              if (document.pictureInPictureElement) {
                const pipVideo = document.pictureInPictureElement;
                document.exitPictureInPicture();
                // Pause the video after exiting PiP
                if (pipVideo instanceof HTMLVideoElement && !pipVideo.paused) {
                  pipVideo.pause();
                }
              }
            },
          });
          await chrome.storage.local.remove('pipTabId');
        } else {
          console.warn(
            '[commands] ⚠️ No pipTabId found in storage! Cannot quit PiP.',
          );
        }
      } catch (error) {
        console.error('[commands] Quit PiP failed:', error);
      }
    })();
    return;
  }

  // Handle clipboard commands
  if (
    command === 'copy-title' ||
    command === 'copy-title-url' ||
    command === 'copy-title-dash-url' ||
    command === 'copy-markdown-link' ||
    command === 'copy-screenshot'
  ) {
    void handleClipboardCommand(command).catch((error) => {
      console.warn('[commands] Clipboard command failed:', error);
    });
    return;
  }

  if (command === 'split-screen-toggle') {
    void (async () => {
      try {
        const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');

        // Get all highlighted tabs
        const highlightedTabs = await chrome.tabs.query({
          currentWindow: true,
          highlighted: true,
        });

        // Check if any highlighted tab is a split.html page
        const existingSplitTab = highlightedTabs.find(
          (tab) => tab.url && tab.url.startsWith(splitBaseUrl),
        );

        if (existingSplitTab && highlightedTabs.length > 1) {
          // If there are multiple highlighted tabs and one is split.html, activate it
          if (existingSplitTab.id) {
            await chrome.tabs.update(existingSplitTab.id, { active: true });
          }
          return;
        }

        // Get current active tab
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const currentTab = tabs && tabs[0];
        if (!currentTab) {
          return;
        }

        const isSplitPage =
          currentTab.url && currentTab.url.startsWith(splitBaseUrl);

        if (isSplitPage) {
          // Current tab is split.html - unsplit it
          await handleUnsplitTabsContextMenu(currentTab);
        } else {
          // Current tab is NOT split.html - create split page
          await handleSplitTabsContextMenu(currentTab);
        }
      } catch (error) {
        console.warn('[commands] Toggle split screen failed:', error);
      }
    })();
    return;
  }

  if (command === 'block-element-picker') {
    void (async () => {
      try {
        // Get the current active tab
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const currentTab = tabs && tabs[0];
        if (!currentTab || !currentTab.id) {
          console.warn('[commands] No active tab found for element picker');
          return;
        }

        // Launch the element picker
        await launchElementPicker(currentTab.id);
      } catch (error) {
        console.warn('[commands] Element picker failed:', error);
      }
    })();
    return;
  }

  if (command === 'llm-chat-with-llm') {
    void (async () => {
      try {
        // Set a flag in storage to indicate we should navigate to chat page
        await chrome.storage.local.set({ openChatPage: true });

        // Open the extension popup (this will trigger the popup to open)
        // The popup will check the flag and navigate to chat.html
        await chrome.action.openPopup();
      } catch (error) {
        console.warn('[commands] Chat with LLM failed:', error);
      }
    })();
    return;
  }

  if (command === 'llm-download-markdown') {
    void (async () => {
      try {
        // Get highlighted tabs or active tab
        /** @type {chrome.tabs.Tab[]} */
        let tabs = await chrome.tabs.query({
          currentWindow: true,
          highlighted: true,
        });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ currentWindow: true, active: true });
        }

        // Filter to only include tabs with http/https URLs
        const filteredTabs = (tabs || []).filter((tab) => {
          const url = tab.url || '';
          return url.startsWith('http://') || url.startsWith('https://');
        });

        if (filteredTabs.length === 0) {
          console.warn('[commands] No valid tabs available for download');
          return;
        }

        // Get tab IDs
        const tabIds = filteredTabs
          .map((t) => t.id)
          .filter((id) => typeof id === 'number');

        // Collect content from tabs
        const contents = await collectPageContentFromTabs(tabIds);

        if (contents.length === 0) {
          console.warn('[commands] No content collected from tabs');
          return;
        }

        // Build the markdown content
        let markdownContent = '';

        // Add page contents
        contents.forEach((content, index) => {
          markdownContent += `## Page ${index + 1}: ${content.title}\n\n`;
          markdownContent += `**URL:** ${content.url}\n\n`;
          markdownContent += content.content;
          markdownContent += '\n\n---\n\n';
        });

        // Get active tab to inject download script
        const activeTabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const activeTab = activeTabs && activeTabs[0];

        if (!activeTab || typeof activeTab.id !== 'number') {
          console.warn('[commands] No active tab found for download');
          return;
        }

        // Generate filename with timestamp
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `page-content-${timestamp}.md`;

        // Inject script to trigger download in the active tab
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (markdown, fileName) => {
            // Create a blob and download it
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);

            // Create a temporary link and trigger download
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            // Clean up
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          },
          args: [markdownContent, filename],
        });
      } catch (error) {
        console.warn('[commands] Download markdown failed:', error);
      }
    })();
    return;
  }

  if (command === 'emoji-picker-show') {
    void (async () => {
      try {
        // Set a flag in storage to indicate we should navigate to emoji page
        await chrome.storage.local.set({ openEmojiPage: true });

        // Open the extension popup (this will trigger the popup to open)
        // The popup will check the flag and navigate to emoji.html
        await chrome.action.openPopup();
      } catch (error) {
        console.warn('[commands] Emoji picker failed:', error);
      }
    })();
    return;
  }
  if (command === 'open-in-popup') {
    void handleOpenInPopup();
    return;
  }

  if (command === 'screen-recording-start') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        await handleScreenRecordingToggle(tabId);
      } catch (error) {
        console.warn('[commands] Screen recording failed:', error);
      }
    })();
    return;
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Prompt the user for a title in the provided tab.
 * @param {number | null} tabId
 * @param {string} prefillTitle
 * @returns {Promise<string>}
 */
async function promptForTitle(tabId, prefillTitle) {
  if (!chrome.scripting || typeof tabId !== 'number') {
    return prefillTitle;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (originalTitle) => {
        const userTitle = window.prompt(
          'Enter an optional title to save to unsorted collection',
          originalTitle,
        );
        return userTitle;
      },
      args: [prefillTitle],
      world: 'MAIN',
    });

    const value =
      Array.isArray(results) && results[0] ? results[0].result : null;

    if (value === null) {
      return prefillTitle;
    }

    return value.trim() || prefillTitle;
  } catch (error) {
    console.warn('[promptForTitle] Unable to prompt for title:', error);
    return prefillTitle;
  }
}

const FRIENDLY_TITLE_WORDS = [
  'hidden',
  'quiet',
  'ember',
  'lantern',
  'meadow',
  'harbor',
  'compass',
  'willow',
  'prairie',
  'atlas',
  'haven',
  'spark',
  'cove',
  'trail',
  'pine',
  'aurora',
  'echo',
  'breeze',
  'fox',
  'otter',
  'lynx',
  'sparrow',
  'tiger',
  'panda',
  'dolphin',
  'river',
  'garden',
  'bridge',
  'market',
  'sunrise',
  'maple',
  'london',
  'kyoto',
  'oslo',
  'berlin',
  'lagos',
  'atlanta',
];

function buildFriendlyEncryptedTitle() {
  const count = Math.random() < 0.5 ? 2 : 3;
  const words = [];
  for (let i = 0; i < count; i += 1) {
    const word =
      FRIENDLY_TITLE_WORDS[
      Math.floor(Math.random() * FRIENDLY_TITLE_WORDS.length)
      ];
    if (word) {
      words.push(word.charAt(0).toUpperCase() + word.slice(1));
    }
  }
  if (words.length === 0) {
    return 'Encrypted Link';
  }
  return words.join(' ');
}

/**
 * Prompt the user for an encryption password in the provided tab.
 * @param {number | null} tabId
 * @returns {Promise<{ password: string, error?: string }>}
 */
async function promptForEncryptionPassword(tabId) {
  if (!chrome.scripting || typeof tabId !== 'number') {
    return {
      password: '',
      error: 'Active tab unavailable for password entry.',
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const input = window.prompt(
          'Enter a password to encrypt this link (leave blank to save without encryption).',
        );
        return input === null ? null : String(input);
      },
      world: 'MAIN',
    });
    const value =
      Array.isArray(results) && results[0] ? results[0].result : null;
    const password =
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
    return { password };
  } catch (error) {
    console.warn('[encrypt-save] Unable to prompt for password:', error);
    return {
      password: '',
      error: 'Password prompt is not available on this page.',
    };
  }
}

/**
 * Encrypt a URL using the external service.
 * @param {string} url
 * @param {string} password
 * @returns {Promise<string>}
 */
async function encryptUrlWithPassword(url, password) {
  const response = await fetch(ENCRYPT_SERVICE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, password }),
  });

  if (!response.ok) {
    throw new Error(
      'Encryption failed: ' +
      response.status +
      (response.statusText ? ' ' + response.statusText : ''),
    );
  }

  const data = await response.json();
  const encryptedUrl = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!encryptedUrl) {
    throw new Error('Encryption service did not return a URL.');
  }
  return encryptedUrl;
}

/**
 * Choose a title for plain saves using selection text or a fallback.
 * @param {string} selectionText
 * @param {string} fallbackTitle
 * @returns {string}
 */
function derivePlainTitle(selectionText, fallbackTitle) {
  const selection =
    typeof selectionText === 'string' ? selectionText.trim() : '';
  if (selection) {
    return selection;
  }
  if (typeof fallbackTitle === 'string') {
    return fallbackTitle;
  }
  return '';
}

/**
 * Read clipboard text from active tab using scripting API.
 * @returns {Promise<{ text?: string, error?: string }>}
 */
async function readClipboardFromTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      return { error: 'No active tab found' };
    }

    // Inject script to read clipboard
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        try {
          const text = await navigator.clipboard.readText();
          return { text };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });

    const result = results?.[0]?.result;
    if (!result) {
      return { error: 'Failed to read clipboard' };
    }

    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process clipboard text and save to Raindrop Unsorted if it contains a valid URL.
 * @param {string} clipboardText - The text from clipboard
 * @returns {Promise<{ ok: boolean, created?: number, updated?: number, skipped?: number, error?: string }>}
 */
async function handleSaveClipboardUrlToUnsorted(clipboardText) {
  try {
    if (!clipboardText || !clipboardText.trim()) {
      const error = 'Clipboard is empty';
      void pushNotification('clipboard-save', 'Clipboard save failed', error);
      return { ok: false, error };
    }

    const text = clipboardText.trim();

    // Validate URL
    const normalizedUrl = normalizeHttpUrl(text);
    if (!normalizedUrl) {
      const error = 'Clipboard does not contain a valid URL';
      void pushNotification('clipboard-save', 'Clipboard save failed', error);
      return { ok: false, error };
    }

    // Process URL through the standard pipeline
    const convertedUrl = convertSplitUrlForSave(normalizedUrl);
    const processedUrl = await processUrl(convertedUrl, 'save-to-raindrop');

    // Derive title from URL
    const title = new URL(processedUrl).hostname || processedUrl;

    // Save to Unsorted using existing pipeline
    const saveResult = await saveUrlsToUnsorted(
      [{ url: processedUrl, title }],
      { pleaseParse: true },
    );

    return {
      ok: saveResult.ok,
      created: saveResult.created,
      updated: saveResult.updated,
      skipped: saveResult.skipped,
      error: saveResult.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void pushNotification('clipboard-save', 'Clipboard save failed', message);
    return { ok: false, error: message };
  }
}

/**
 * Handle encrypt-and-save flow shared by commands, context menus, and popup.
 * @param {{ rawUrl: string, title?: string, selectionText?: string, tabId?: number | null, notifyOnError?: boolean }} options
 * @returns {Promise<{ ok: boolean, mode?: 'plain' | 'encrypted', error?: string, saveResult?: any }>}
 */
async function handleEncryptAndSave(options) {
  const rawUrl = typeof options.rawUrl === 'string' ? options.rawUrl : '';
  const tabId = typeof options.tabId === 'number' ? options.tabId : null;
  const notifyOnError = Boolean(options.notifyOnError);

  if (!rawUrl) {
    const error = 'No URL available to save.';
    if (notifyOnError) {
      void pushNotification('encrypt-unsorted', 'Encrypt & save failed', error);
    }
    return { ok: false, error };
  }

  const normalizedUrl = normalizeHttpUrl(rawUrl);
  if (!normalizedUrl) {
    const error = 'This URL cannot be saved.';
    if (notifyOnError) {
      void pushNotification('encrypt-unsorted', 'Encrypt & save failed', error);
    }
    return { ok: false, error };
  }

  let processedUrl = normalizedUrl;
  try {
    processedUrl = await processUrl(normalizedUrl, 'save-to-raindrop');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to prepare URL.';
    if (notifyOnError) {
      void pushNotification(
        'encrypt-unsorted',
        'Encrypt & save failed',
        message,
      );
    }
    return { ok: false, error: message };
  }
  const finalUrl = convertSplitUrlForSave(processedUrl);
  if (!finalUrl) {
    const error = 'This URL cannot be saved.';
    if (notifyOnError) {
      void pushNotification('encrypt-unsorted', 'Encrypt & save failed', error);
    }
    return { ok: false, error };
  }

  const passwordResult = await promptForEncryptionPassword(tabId);
  if (passwordResult.error) {
    if (notifyOnError) {
      void pushNotification(
        'encrypt-unsorted',
        'Encrypt & save failed',
        passwordResult.error,
      );
    }
    return { ok: false, error: passwordResult.error };
  }

  const password = passwordResult.password;
  if (!password) {
    const plainTitle = derivePlainTitle(
      options.selectionText || '',
      options.title || '',
    );
    const saveResult = await saveUrlsToUnsorted(
      [{ url: finalUrl, title: plainTitle }],
      { skipUrlProcessing: true },
    );
    return {
      ok: saveResult.ok,
      mode: 'plain',
      saveResult,
      error: saveResult.error,
    };
  }

  let encryptedUrl;
  try {
    encryptedUrl = await encryptUrlWithPassword(finalUrl, password);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Encryption failed.';
    if (notifyOnError) {
      void pushNotification(
        'encrypt-unsorted',
        'Encrypt & save failed',
        message,
      );
    }
    return { ok: false, mode: 'encrypted', error: message };
  }

  const generatedTitle = buildFriendlyEncryptedTitle();
  let coverUrl = ENCRYPT_COVER_URL;
  try {
    if (coverUrl.includes('picsum.photos')) {
      const response = await fetch(coverUrl);
      if (response.ok && response.url) {
        coverUrl = response.url;
      }
    }
  } catch (error) {
    console.warn('[encrypt-save] Failed to resolve cover URL redirect:', error);
  }
  const saveResult = await saveUrlsToUnsorted(
    [{ url: encryptedUrl, title: generatedTitle, cover: coverUrl }],
    { pleaseParse: false, skipUrlProcessing: true, keepEntryTitle: true },
  );
  return {
    ok: saveResult.ok,
    mode: 'encrypted',
    saveResult,
    error: saveResult.error,
  };
}
/**
 * Handle one-time initialization tasks.
 * @param {string} trigger
 * @returns {void}
 */
function handleLifecycleEvent(trigger) {
  setupCentralizedContextMenus();
  setupClipboardContextMenus();
  initializeTabSnapshots();
  void initializeOptionsBackupService();
  void runStartupSync();
  chrome.alarms.create('options-backup-check', {
    periodInMinutes: 1,
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  handleLifecycleEvent('install');

  // Perform one-time migrations on install or update
  if (details.reason === 'install' || details.reason === 'update') {
    // Migration: pinnedItems -> pinnedSearchResults
    try {
      const oldKey = 'pinnedItems';
      const newKey = 'pinnedSearchResults';
      const storage = await chrome.storage.local.get([oldKey, newKey]);
      if (storage[oldKey] && !storage[newKey]) {
        await chrome.storage.local.set({ [newKey]: storage[oldKey] });
        await chrome.storage.local.remove(oldKey);
        console.log('[migration] Migrated pinnedItems to pinnedSearchResults.');
      }
    } catch (error) {
      console.error('[migration] Pinned items migration failed:', error);
    }
  }

  if (details.reason === 'install' || details.reason === 'update') {
    // Restore split pages on extension reload/update (not on wake-up)
    // Use a small delay to ensure all initialization is complete
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await restoreSplitPages();
      await ensureNenyaSessionsCollection();
    })();

    // Inject content scripts into existing tabs instead of reloading them
    // This preserves user state (scroll position, form data, etc.)
    // ⚡ Bolt: Use Promise.all to inject scripts into all tabs concurrently for faster startup.
    const windows = await chrome.windows.getAll({ populate: true });
    const allTabs = windows.flatMap((window) => window.tabs || []);

    const contentScripts = [
      [
        'src/contentScript/bright-mode.js',
        'src/contentScript/block-elements.js',
        'src/contentScript/custom-js-css.js',
      ],
      [
        'src/contentScript/video-controller.js',
        'src/contentScript/highlight-text.js',
      ],
    ];
    const cssFiles = ['src/contentScript/video-controller.css'];

    const injectionPromises = allTabs
      .filter(
        (tab) =>
          tab.id &&
          tab.url &&
          (tab.url.startsWith('http:') || tab.url.startsWith('https:')) &&
          !tab.discarded,
      )
      .map((tab) => {
        const tabId = tab.id;
        return (async () => {
          try {
            await Promise.all(
              cssFiles.map((file) =>
                chrome.scripting
                  .insertCSS({ target: { tabId }, files: [file] })
                  .catch((e) =>
                    console.warn(
                      `CSS injection failed for ${file} in tab ${tabId}:`,
                      e,
                    ),
                  ),
              ),
            );
            for (const scriptGroup of contentScripts) {
              await chrome.scripting
                .executeScript({ target: { tabId }, files: scriptGroup })
                .catch((e) =>
                  console.warn(
                    `JS injection failed for group in tab ${tabId}:`,
                    e,
                  ),
                );
            }
          } catch (error) {
            console.warn(
              `Content script injection failed for tab ${tabId}:`,
              error,
            );
            try {
              await chrome.tabs.reload(tabId, { bypassCache: true });
            } catch (reloadError) {
              console.warn(`Tab reload failed for tab ${tabId}:`, reloadError);
            }
          }
        })();
      });

    await Promise.all(injectionPromises);
  }
});

// Flag to prevent concurrent restoration
let isRestoringSplitPages = false;

/**
 * Update split page group information in storage
 * @param {string} url - The split page URL
 * @param {string | null} groupName - The group name, or null if ungrouped
 * @returns {Promise<void>}
 */
async function updateSplitPageGroupInfo(url, groupName) {
  try {
    const result = await chrome.storage.local.get(['splitPageUrls']);
    const savedEntries = Array.isArray(result.splitPageUrls)
      ? result.splitPageUrls
      : [];

    // Normalize entries (handle backward compatibility with string URLs)
    const normalizedEntries = savedEntries.map((entry) => {
      if (typeof entry === 'string') {
        return { url: entry };
      }
      return entry;
    });

    // Find the existing entry for this URL
    const existingEntry = normalizedEntries.find((entry) => entry.url === url);
    const existingGroupName =
      existingEntry && typeof existingEntry.groupName === 'string'
        ? existingEntry.groupName
        : null;

    // Only update if the group name actually changed
    if (existingGroupName === groupName) {
      return; // No change needed
    }

    // Find and update the entry for this URL
    const updatedEntries = normalizedEntries.map((entry) => {
      if (entry.url === url) {
        const updatedEntry = { url };
        if (groupName) {
          updatedEntry.groupName = groupName;
        }
        return updatedEntry;
      }
      return entry;
    });

    // Save updated entries
    await chrome.storage.local.set({ splitPageUrls: updatedEntries });
  } catch (error) {
    console.warn('[background] Failed to update split page group info:', error);
  }
}

/**
 * Find a tab group by name
 * @param {string} groupName - The name of the tab group to find
 * @returns {Promise<number | null>} The group ID if found, null otherwise
 */
async function findTabGroupByName(groupName) {
  if (!chrome.tabGroups || typeof chrome.tabGroups.get !== 'function') {
    return null;
  }

  try {
    // Get all tabs to find unique group IDs
    const allTabs = await chrome.tabs.query({});
    const noneGroupId = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;
    const groupIds = new Set();

    allTabs.forEach((tab) => {
      if (typeof tab.groupId === 'number' && tab.groupId !== noneGroupId) {
        groupIds.add(tab.groupId);
      }
    });

    // Check each group to find one with matching name
    for (const groupId of groupIds) {
      try {
        const group = await new Promise((resolve, reject) => {
          chrome.tabGroups.get(groupId, (group) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              reject(new Error(lastError.message));
              return;
            }
            resolve(group);
          });
        });

        if (
          group &&
          typeof group.title === 'string' &&
          group.title.trim() === groupName.trim()
        ) {
          return groupId;
        }
      } catch (error) {
        // Continue to next group if this one fails
        continue;
      }
    }
  } catch (error) {
    console.warn('[background] Failed to find tab group by name:', error);
  }

  return null;
}

/**
 * Restore split pages from storage
 * Called on startup, extension reload, and when service worker initializes
 * Includes deduplication logic to prevent opening duplicate tabs
 * Restores tabs in their corresponding tab groups if the group exists
 */
async function restoreSplitPages() {
  // Prevent concurrent restoration
  if (isRestoringSplitPages) {
    return;
  }

  isRestoringSplitPages = true;

  try {
    const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
    const result = await chrome.storage.local.get(['splitPageUrls']);
    const savedEntries = Array.isArray(result.splitPageUrls)
      ? result.splitPageUrls
      : [];

    if (savedEntries.length === 0) {
      return;
    }

    // Normalize entries (handle backward compatibility with string URLs)
    const normalizedEntries = savedEntries.map((entry) => {
      if (typeof entry === 'string') {
        return { url: entry };
      }
      return entry;
    });

    // Step 1: De-duplicate entries by URL
    const urlMap = new Map();
    normalizedEntries.forEach((entry) => {
      if (!urlMap.has(entry.url)) {
        urlMap.set(entry.url, entry);
      }
    });
    const uniqueEntries = Array.from(urlMap.values());

    if (uniqueEntries.length !== normalizedEntries.length) {
      // Update storage with de-duplicated entries
      await chrome.storage.local.set({ splitPageUrls: uniqueEntries });
    }

    // Step 2: Check if there is already a tab with the same URL (any tab, not just split pages)
    const allTabs = await chrome.tabs.query({});
    const existingUrls = new Set(
      allTabs
        .filter((tab) => tab.url && typeof tab.url === 'string')
        .map((tab) => String(tab.url)),
    );

    // Open split pages that aren't already open
    const entriesToOpen = uniqueEntries.filter(
      (entry) => !existingUrls.has(entry.url),
    );

    if (entriesToOpen.length === 0) {
      return;
    }

    // ⚡ Bolt: Use Promise.all to restore tabs concurrently for faster startup.
    await Promise.all(
      entriesToOpen.map(async (entry) => {
        try {
          const url = entry.url;
          // Double-check the tab wasn't opened between the query and now
          const currentTabs = await chrome.tabs.query({ url });
          if (currentTabs.length > 0) {
            return;
          }

          // Create the tab
          const tab = await chrome.tabs.create({ url, active: false });

          // If entry has a group name, try to add it to that group
          if (
            entry.groupName &&
            typeof entry.groupName === 'string' &&
            tab.id
          ) {
            try {
              const groupId = await findTabGroupByName(entry.groupName);

              if (
                groupId !== null &&
                chrome.tabs &&
                typeof chrome.tabs.group === 'function'
              ) {
                // Add tab to existing group
                await new Promise((resolve, reject) => {
                  chrome.tabs.group(
                    { tabIds: tab.id, groupId },
                    (resultGroupId) => {
                      const lastError = chrome.runtime.lastError;
                      if (lastError) {
                        console.warn(
                          `[background] Error adding tab to group: ${lastError.message}`,
                        );
                        reject(new Error(lastError.message));
                        return;
                      }
                      resolve(resultGroupId);
                    },
                  );
                });
              }
            } catch (error) {
              console.warn(
                `[background] Failed to add split page to group "${entry.groupName}":`,
                error,
              );
            }
          }
        } catch (error) {
          console.warn(
            '[background] Failed to restore split page:',
            entry.url,
            error,
          );
        }
      }),
    );
  } catch (error) {
    console.warn('[background] Failed to restore split pages:', error);
  } finally {
    // Reset flag after a short delay to allow for any concurrent calls to complete
    setTimeout(() => {
      isRestoringSplitPages = false;
    }, 1000);
  }
}

chrome.runtime.onStartup.addListener(() => {
  handleLifecycleEvent('startup');
  void (async () => {
    // Restore split pages from storage
    await restoreSplitPages();
  })();
});

// Ensure backup service is initialized immediately when service worker starts
initializeOptionsBackupService();
void ensureNenyaSessionsCollection();

void initializeAutoReloadFeature().catch((error) => {
  console.error('[auto-reload] Initialization failed:', error);
});

// Initialize Raindrop export to bookmarks feature
initRaindropExport();

chrome.tabs.onHighlighted.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    const hasMultipleTabs = tabs && tabs.length > 1;
    await updateScreenshotMenuVisibility(hasMultipleTabs);
  } catch (error) {
    console.warn(
      '[contextMenu] Failed to update screenshot visibility:',
      error,
    );
  }
});

// Handle action button click during recording
// When recording, the popup is disabled, so this listener fires
chrome.action.onClicked.addListener(async (tab) => {
  // Check if we're recording
  if (isRecording()) {
    // Stop recording and open preview
    const handled = await handleActionClickDuringRecording();
    if (handled) {
      return;
    }
  }
  // If not recording, this shouldn't happen since popup is enabled
  // But just in case, open the popup manually
  try {
    await chrome.action.openPopup();
  } catch (error) {
    // openPopup might fail in some contexts, ignore
    console.warn('[background] Failed to open popup:', error);
  }
});

// Update context menu visibility when tabs change
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab) {
      void updateContextMenuVisibility(tab);

      // Also check and update split page group info when tab is activated
      // This helps catch group changes that might not trigger onUpdated reliably
      if (tab.url && typeof tab.url === 'string') {
        const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
        if (tab.url.startsWith(splitBaseUrl)) {
          void (async () => {
            try {
              let groupName = null;
              if (typeof tab.groupId === 'number') {
                const noneGroupId = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;
                if (tab.groupId !== noneGroupId && chrome.tabGroups?.get) {
                  const group = await new Promise((resolve) => {
                    chrome.tabGroups.get(tab.groupId, (group) => {
                      const lastError = chrome.runtime.lastError;
                      if (lastError) {
                        resolve(null);
                        return;
                      }
                      resolve(group || null);
                    });
                  });
                  if (
                    group &&
                    typeof group.title === 'string' &&
                    group.title.trim()
                  ) {
                    groupName = group.title.trim();
                  }
                }
              }
              if (typeof tab.url === 'string') {
                await updateSplitPageGroupInfo(tab.url, groupName);
              }
            } catch (error) {
              // Ignore errors - group info update is optional
            }
          })();
        }
      }
    }
  } catch (error) {
    console.warn('Failed to get tab for context menu update:', error);
  }
});

// Clean up when tabs close
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Remove split page URL from storage if this was a split page tab
  // Since the tab is already removed when onRemoved fires, we check all open tabs
  // and remove any URLs from storage that are no longer open
  // Use a delay to avoid race conditions during extension reload
  void (async () => {
    try {
      // Wait a bit to allow restoration to complete if extension just reloaded
      await new Promise((resolve) => setTimeout(resolve, 500));

      const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
      const result = await chrome.storage.local.get(['splitPageUrls']);
      const savedEntries = Array.isArray(result.splitPageUrls)
        ? result.splitPageUrls
        : [];

      if (savedEntries.length === 0) {
        return;
      }

      // Normalize entries (handle backward compatibility with string URLs)
      const normalizedEntries = savedEntries.map((entry) => {
        if (typeof entry === 'string') {
          return { url: entry };
        }
        return entry;
      });

      // Check all open tabs to see which split URLs are still open
      const allTabs = await chrome.tabs.query({});
      const openSplitUrls = new Set(
        allTabs
          .filter(
            (tab) =>
              tab.url &&
              typeof tab.url === 'string' &&
              tab.url.startsWith(splitBaseUrl),
          )
          .map((tab) => String(tab.url)),
      );

      // Remove entries that are no longer open
      const updatedEntries = normalizedEntries.filter((entry) =>
        openSplitUrls.has(entry.url),
      );

      if (updatedEntries.length !== normalizedEntries.length) {
        await chrome.storage.local.set({ splitPageUrls: updatedEntries });
      }
    } catch (error) {
      console.warn('[background] Failed to clean up split page URL:', error);
    }
  })();
});

// Intercept navigation to nenya.local split URLs early
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (
      details.frameId === 0 && // Only main frame
      details.url &&
      details.url.startsWith('https://nenya.local/split')
    ) {
      const restoredUrl = convertSplitUrlForRestore(details.url);
      if (restoredUrl !== details.url) {
        try {
          await chrome.tabs.update(details.tabId, { url: restoredUrl });
        } catch (error) {
          console.warn(
            '[background] Failed to redirect nenya.local URL:',
            error,
          );
        }
      }
    }
  });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Intercept nenya.local split URLs and convert them to extension URLs
  // Check both changeInfo.url (when URL changes) and tab.url (current URL)
  const urlToCheck = changeInfo.url || (tab ? tab.url : null);
  if (
    urlToCheck &&
    typeof urlToCheck === 'string' &&
    urlToCheck.startsWith('https://nenya.local/split')
  ) {
    const restoredUrl = convertSplitUrlForRestore(urlToCheck);
    if (restoredUrl !== urlToCheck) {
      try {
        await chrome.tabs.update(tabId, { url: restoredUrl });
        return; // Don't process further if we redirected
      } catch (error) {
        console.warn('[background] Failed to redirect nenya.local URL:', error);
      }
    }
  }

  // Update split page group info when tab group changes
  // Check if this is a split page and update group info
  if (tab && tab.url && typeof tab.url === 'string') {
    const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
    if (tab.url.startsWith(splitBaseUrl)) {
      // This is a split page tab - check and update group info
      // Use a small delay to ensure groupId is updated after group changes
      void (async () => {
        try {
          // Small delay to ensure groupId is updated
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Re-fetch the tab to get the latest groupId
          const updatedTab = await chrome.tabs.get(tabId);
          if (!updatedTab || !updatedTab.url) {
            return;
          }

          let groupName = null;
          if (typeof updatedTab.groupId === 'number') {
            const noneGroupId = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;
            if (updatedTab.groupId !== noneGroupId && chrome.tabGroups?.get) {
              const group = await new Promise((resolve) => {
                chrome.tabGroups.get(updatedTab.groupId, (group) => {
                  const lastError = chrome.runtime.lastError;
                  if (lastError) {
                    resolve(null);
                    return;
                  }
                  resolve(group || null);
                });
              });
              if (
                group &&
                typeof group.title === 'string' &&
                group.title.trim()
              ) {
                groupName = group.title.trim();
              }
            }
          }
          await updateSplitPageGroupInfo(updatedTab.url, groupName);
        } catch (error) {
          // Ignore errors - group info update is optional
        }
      })();
    }
  }

  if (changeInfo.status === 'complete' && tab) {
    void updateContextMenuVisibility(tab);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void (async () => {
    if (alarm.name === 'options-backup-check') {
      await runAutomaticRestore();
    } else {
      await handleAutoReloadAlarm(alarm);
    }
  })();
});

// ============================================================================
// PAGE CONTENT COLLECTION
// ============================================================================

/**
 * Check if URL is a YouTube video page.
 * @param {string} url
 * @returns {boolean}
 */
function isYouTubeVideoPage(url) {
  return /^https?:\/\/(?:www\.)?youtube\.com\/watch/.test(url);
}

/**
 * Check if URL is a Notion page.
 * @param {string} url
 * @returns {boolean}
 */
function isNotionPage(url) {
  return /^https?:\/\/(?:www\.)?notion\.so\//.test(url);
}

/**
 * Inject content scripts to extract page content as markdown.
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function injectContentScripts(tabId) {
  try {
    // Get the tab to check its URL
    const tab = await chrome.tabs.get(tabId);
    const tabUrl = tab.url || '';

    let contentScriptFile = 'src/contentScript/getContent-general.js';

    // Determine which content extraction script to use
    if (isYouTubeVideoPage(tabUrl)) {
      contentScriptFile = 'src/contentScript/getContent-youtube.js';
    } else if (isNotionPage(tabUrl)) {
      contentScriptFile = 'src/contentScript/getContent-notion.js';
    }

    // For YouTube and Notion, we don't need Readability and Turndown
    if (isYouTubeVideoPage(tabUrl) || isNotionPage(tabUrl)) {
      // Just inject the specific content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [contentScriptFile],
      });
    } else {
      // For general pages, inject libraries first
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'src/libs/readability.min.js',
          'src/libs/turndown.7.2.0.js',
          'src/libs/turndown-plugin-gfm.1.0.2.js',
        ],
      });

      // Then inject content extraction script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [contentScriptFile],
      });
    }

    // Finally inject collector script (for all page types)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/contentScript/pageContentCollector.js'],
    });

    return true;
  } catch (error) {
    console.error('[background] Failed to inject content scripts:', error);
    return false;
  }
}

/**
 * Collect page content from a single tab.
 * @param {number} tabId
 * @param {number} timeout
 * @returns {Promise<{tabId: number, title: string, url: string, content: string} | null>}
 */
async function collectPageContent(tabId, timeout = 10000) {
  return new Promise((resolve) => {
    if (typeof tabId !== 'number') {
      resolve(null);
      return;
    }

    // Set up message listener for content
    const onMessage = (message, sender) => {
      if (sender?.tab?.id !== tabId) return;
      if (!message || message.type !== 'page-content-collected') return;

      clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(onMessage);

      resolve({
        tabId,
        title: message.title || '',
        url: message.url || '',
        content: message.content || '',
      });
    };

    chrome.runtime.onMessage.addListener(onMessage);

    // Fallback timeout
    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMessage);
      resolve(null);
    }, timeout);

    // Start extraction chain
    void injectContentScripts(tabId);
  });
}

/**
 * Collect page content from multiple tabs concurrently.
 * @param {number[]} tabIds
 * @returns {Promise<Array<{tabId: number, title: string, url: string, content: string}>>}
 */
async function collectPageContentFromTabs(tabIds) {
  // ⚡ Bolt: Use Promise.all to fetch content from all tabs concurrently for a significant speed boost.
  const promises = tabIds.map(async (tabId) => {
    if (typeof tabId !== 'number') {
      return null;
    }
    try {
      const content = await collectPageContent(tabId);
      return (
        content || {
          tabId,
          title: '',
          url: '',
          content: '(failed to collect content)',
        }
      );
    } catch (error) {
      console.error(
        `[background] Error collecting content from tab ${tabId}:`,
        error,
      );
      return {
        tabId,
        title: '',
        url: '',
        content: `(error: ${error.message})`,
      };
    }
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

// ============================================================================
// LLM TAB MANAGEMENT
// ============================================================================

/** @type {number[]} */
let llmTabIds = [];

/** @type {Array<{tabId: number, title: string, url: string, content: string}>} */
let collectedContents = [];

/** @type {string | null} */
let selectedPromptContent = null;

/** @type {Array<{name: string, type: string, dataUrl: string}>} */
let selectedLocalFiles = [];

/**
 * Map of session IDs to their opened LLM tabs
 * @type {Map<string, Map<string, number>>}
 */
const sessionToLLMTabs = new Map();

/**
 * Map of chat page tab IDs to session IDs (for cleanup when tab is closed)
 * @type {Map<number, string>}
 */
const tabIdToSessionId = new Map();

/**
 * Track which sessions have sent content to LLM tabs (should not auto-close)
 * @type {Set<string>}
 */
const sessionsWithSentContent = new Set();

/**
 * Track when chat pages are closed to cleanup their LLM tabs
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  const sessionId = tabIdToSessionId.get(tabId);
  if (sessionId) {
    // Chat page tab was closed, cleanup its LLM tabs only if content wasn't sent
    if (!sessionsWithSentContent.has(sessionId)) {
      const llmTabs = sessionToLLMTabs.get(sessionId);
      if (llmTabs) {
        for (const llmTabId of llmTabs.values()) {
          chrome.tabs.remove(llmTabId).catch(() => {
            // Tab might already be closed
          });
        }
      }
      sessionToLLMTabs.delete(sessionId);
    } else {
      // Clean up the sent content flag as it's no longer needed
      sessionsWithSentContent.delete(sessionId);
    }
    tabIdToSessionId.delete(tabId);
  }
});

/**
 * Handle port connections from chat pages to detect when they close
 */
chrome.runtime.onConnect.addListener((port) => {
  // Check if this is a chat page connection
  if (port.name && port.name.startsWith('chat-')) {
    const sessionId = port.name.substring(5); // Remove 'chat-' prefix

    port.onDisconnect.addListener(() => {
      // Only clean up LLM tabs if content hasn't been sent yet
      // If content was sent, keep the LLM tabs open for the user to continue
      if (!sessionsWithSentContent.has(sessionId)) {
        const llmTabs = sessionToLLMTabs.get(sessionId);
        if (llmTabs) {
          for (const llmTabId of llmTabs.values()) {
            chrome.tabs.remove(llmTabId).catch(() => {
              // Tab might already be closed
            });
          }
          sessionToLLMTabs.delete(sessionId);
        }
      } else {
        // Clean up the sent content flag as it's no longer needed
        sessionsWithSentContent.delete(sessionId);
      }

      // Clean up tab ID mapping
      for (const [tabId, sid] of tabIdToSessionId.entries()) {
        if (sid === sessionId) {
          tabIdToSessionId.delete(tabId);
        }
      }
    });
  }
});

/**
 * Inject the LLM page injector content script and wait for tab to be ready
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function injectLLMPageInjector(tabId) {
  try {
    // Wait for tab to be ready first
    await waitForTabReady(tabId);

    // Inject the script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/contentScript/llmPageInjector.js'],
    });

    return true;
  } catch (error) {
    console.error('[background] Failed to inject LLM page injector:', error);
    return false;
  }
}

/**
 * Wait for a tab to be ready (complete loading)
 * @param {number} tabId
 * @param {number} timeout
 * @returns {Promise<boolean>}
 */
async function waitForTabReady(tabId, timeout = 30000) {
  return new Promise((resolve) => {
    const checkTab = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          resolve(true);
          return;
        }
      } catch (error) {
        resolve(false);
        return;
      }
    };

    // Check immediately
    void checkTab();

    // Listen for tab updates
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeoutId);
        resolve(true);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Timeout
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeout);
  });
}

/**
 * Open LLM provider tabs for the chat page (positioned right next to current tab)
 * @param {string} sessionId - The session ID for this chat session
 * @param {number | null} chatPageTabId - The tab ID of the chat page (if opened as tab)
 * @param {string[]} providers - Array of provider IDs to open
 * @param {number} currentTabIndex - The index of the current active tab
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function openLLMTabs(
  sessionId,
  chatPageTabId,
  providers,
  currentTabIndex,
) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    if (!sessionToLLMTabs.has(sessionId)) {
      sessionToLLMTabs.set(sessionId, new Map());
    }

    // Track tab ID to session ID mapping for cleanup
    if (chatPageTabId !== null && typeof chatPageTabId === 'number') {
      tabIdToSessionId.set(chatPageTabId, sessionId);
    }

    const llmTabsMap = sessionToLLMTabs.get(sessionId);
    if (!llmTabsMap) {
      return { success: false, error: 'Failed to create LLM tabs map' };
    }

    const insertIndex = currentTabIndex + 1;

    // Open tabs for each provider and wait for them to be ready
    const tabPromises = providers.map(async (providerId, i) => {
      const meta = LLM_PROVIDER_META[providerId];
      if (!meta) return;

      // Check if we already have a tab for this provider
      if (llmTabsMap.has(providerId)) {
        return;
      }

      // Create new tab positioned right next to current tab
      const newTab = await chrome.tabs.create({
        url: meta.url,
        active: false,
        index: insertIndex + i,
      });

      if (newTab.id) {
        llmTabsMap.set(providerId, newTab.id);
        // Wait for the tab to complete loading
        await waitForTabReady(newTab.id);
      }
    });

    await Promise.all(tabPromises);

    return { success: true };
  } catch (error) {
    console.error('[background] Failed to open LLM tabs:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Close LLM tabs associated with a chat session
 * @param {string} sessionId - The session ID for this chat session
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function closeLLMTabs(sessionId) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    const llmTabs = sessionToLLMTabs.get(sessionId);
    if (llmTabs) {
      for (const llmTabId of llmTabs.values()) {
        await chrome.tabs.remove(llmTabId).catch(() => {
          // Tab might already be closed
        });
      }
      sessionToLLMTabs.delete(sessionId);

      // Clean up tab ID mapping
      for (const [tabId, sid] of tabIdToSessionId.entries()) {
        if (sid === sessionId) {
          tabIdToSessionId.delete(tabId);
        }
      }
    }

    // Clean up sent content flag
    sessionsWithSentContent.delete(sessionId);

    return { success: true };
  } catch (error) {
    console.error('[background] Failed to close LLM tabs:', error);
    return { success: true }; // Return success even on error to not block
  }
}

/**
 * Switch an LLM provider by updating the tab URL
 * @param {string} sessionId - The session ID for this chat session
 * @param {string} oldProviderId - The provider to replace
 * @param {string} newProviderId - The new provider to load
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function switchLLMProvider(sessionId, oldProviderId, newProviderId) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    const llmTabs = sessionToLLMTabs.get(sessionId);
    if (!llmTabs) {
      return {
        success: false,
        error: 'No LLM tabs found for this chat session',
      };
    }

    const oldTabId = llmTabs.get(oldProviderId);
    if (!oldTabId) {
      return { success: false, error: 'Old provider tab not found' };
    }

    const newMeta = LLM_PROVIDER_META[newProviderId];
    if (!newMeta) {
      return { success: false, error: 'Invalid new provider' };
    }

    // Update the tab to load the new provider URL
    await chrome.tabs.update(oldTabId, { url: newMeta.url });

    // Update the mapping
    llmTabs.delete(oldProviderId);
    llmTabs.set(newProviderId, oldTabId);

    return { success: true };
  } catch (error) {
    console.error('[background] Failed to switch LLM provider:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reuse LLM tabs to send content and prompt
 * @param {string} sessionId - The session ID for this chat session
 * @param {string[]} selectedLLMProviders - Array of provider IDs to send to
 * @param {Array<{tabId: number, title: string, url: string, content: string}>} contents - Content to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function reuseLLMTabs(sessionId, selectedLLMProviders, contents) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    // Mark this session as having sent content IMMEDIATELY (before anything else)
    // This prevents auto-cleanup if the popup closes while we're processing
    sessionsWithSentContent.add(sessionId);

    const llmTabs = sessionToLLMTabs.get(sessionId);
    if (!llmTabs) {
      sessionsWithSentContent.delete(sessionId); // Clean up if we're failing
      return {
        success: false,
        error: 'No LLM tabs found for this chat session',
      };
    }

    // Find the first valid tab and activate it immediately
    let firstTabId = null;
    for (const providerId of selectedLLMProviders) {
      const tabId = llmTabs.get(providerId);
      if (tabId) {
        try {
          await chrome.tabs.get(tabId);
          firstTabId = tabId;
          break;
        } catch (error) {
          // Tab was closed, continue searching
          llmTabs.delete(providerId);
        }
      }
    }

    // Activate the first tab immediately so user sees it right away
    if (firstTabId) {
      await chrome.tabs.update(firstTabId, { active: true });
    }

    // Process all tabs in parallel for better performance
    const injectionPromises = selectedLLMProviders.map(async (providerId) => {
      const tabId = llmTabs.get(providerId);
      if (!tabId) return;

      const meta = LLM_PROVIDER_META[providerId];
      if (!meta) return;

      // Check if tab still exists
      try {
        await chrome.tabs.get(tabId);
      } catch (error) {
        // Tab was closed, skip it
        llmTabs.delete(providerId);
        return;
      }

      // Inject the script and wait for it to be ready
      const ok = await injectLLMPageInjector(tabId);
      if (ok) {
        // Small delay to ensure the content script is fully initialized
        // and message listener is set up (50ms should be enough)
        await new Promise((resolve) => setTimeout(resolve, 50));

        await chrome.tabs.sendMessage(tabId, {
          type: 'inject-llm-data',
          tabs: contents,
          promptContent: selectedPromptContent,
          files: selectedLocalFiles,
          sendButtonSelector: meta.sendButtonSelector || null,
        });
      }
    });

    // Wait for all injections to complete
    await Promise.all(injectionPromises);

    return { success: true };
  } catch (error) {
    console.error('[background] Failed to reuse LLM tabs:', error);
    // Remove from sent content tracking if we failed
    sessionsWithSentContent.delete(sessionId);
    return { success: false, error: error.message };
  }
}

/**
 * Open or reuse LLM tabs and inject content
 * @param {chrome.tabs.Tab} currentTab
 * @param {string[]} selectedLLMProviders
 * @param {Array<{tabId: number, title: string, url: string, content: string}>} contents
 * @returns {Promise<void>}
 */
async function openOrReuseLLMTabs(currentTab, selectedLLMProviders, contents) {
  llmTabIds = [];
  const providersToOpen = [...selectedLLMProviders];
  let firstTabToActivateId = null;

  // Check if current tab can be reused
  if (currentTab && currentTab.url && isLLMPage(currentTab.url)) {
    for (const providerId of selectedLLMProviders) {
      const meta = LLM_PROVIDER_META[providerId];
      if (meta && currentTab.url.startsWith(meta.url)) {
        // Found a match, reuse this tab
        const index = providersToOpen.indexOf(providerId);
        if (index > -1) {
          providersToOpen.splice(index, 1);
        }

        // Inject into current tab
        if (currentTab.id) {
          const ok = await injectLLMPageInjector(currentTab.id);
          if (ok) {
            llmTabIds.push(currentTab.id);
            firstTabToActivateId = currentTab.id;

            // Small delay to ensure script is settled
            await new Promise((resolve) => setTimeout(resolve, 100));

            await chrome.tabs.sendMessage(currentTab.id, {
              type: 'inject-llm-data',
              tabs: contents,
              promptContent: selectedPromptContent,
              files: selectedLocalFiles,
              sendButtonSelector: meta.sendButtonSelector || null,
            });
          }
        }
        break;
      }
    }
  }

  // Create new tabs for remaining providers
  const tabCreationPromises = providersToOpen.map((providerId) => {
    const meta = LLM_PROVIDER_META[providerId];
    if (!meta) return Promise.resolve(null);

    return chrome.tabs.create({
      url: meta.url,
      active: false,
    });
  });

  const createdTabs = await Promise.all(tabCreationPromises);

  // Inject into new tabs
  for (let i = 0; i < createdTabs.length; i++) {
    const newTab = createdTabs[i];
    const providerId = providersToOpen[i];

    if (newTab && newTab.id) {
      const meta = LLM_PROVIDER_META[providerId];
      if (!meta) continue;

      const ok = await injectLLMPageInjector(newTab.id);
      if (ok) {
        llmTabIds.push(newTab.id);
        if (!firstTabToActivateId) {
          firstTabToActivateId = newTab.id;
        }

        // Small delay to ensure script is settled
        await new Promise((resolve) => setTimeout(resolve, 100));

        await chrome.tabs.sendMessage(newTab.id, {
          type: 'inject-llm-data',
          tabs: contents,
          promptContent: selectedPromptContent,
          files: selectedLocalFiles,
          sendButtonSelector: meta.sendButtonSelector || null,
        });
      }
    }
  }

  // Activate first tab
  if (firstTabToActivateId) {
    await chrome.tabs.update(firstTabToActivateId, { active: true });
  }
}

/**
 * Handle sending page content to an LLM provider from the context menu.
 * @param {string} providerId
 * @param {chrome.tabs.Tab} currentTab
 * @returns {Promise<void>}
 */
async function handleSendToLLM(providerId, currentTab) {
  try {
    if (!currentTab.id) {
      return;
    }

    // 1. Collect page content
    const contents = await collectPageContentFromTabs([currentTab.id]);
    if (!contents || contents.length === 0) {
      console.warn('[background] No content collected from tab');
      return;
    }

    const providerMeta = LLM_PROVIDER_META[providerId];
    if (!providerMeta) {
      console.warn(
        `[background] No metadata found for LLM provider: ${providerId}`,
      );
      return;
    }

    // 2. Capture screenshot if the tab has a valid URL
    let files = [];
    if (
      currentTab.url &&
      (currentTab.url.startsWith('http://') ||
        currentTab.url.startsWith('https://'))
    ) {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(
          currentTab.windowId,
          { format: 'jpeg', quality: 80 },
        );
        if (dataUrl) {
          files.push({
            name: 'screenshot.jpg',
            type: 'image/jpeg',
            dataUrl,
          });
        }
      } catch (error) {
        console.warn('[background] Failed to capture screenshot:', error);
      }
    }

    // 3. Open new tab for the LLM provider
    const newTab = await chrome.tabs.create({
      url: providerMeta.url,
      active: true, // Make the new tab active
    });

    if (!newTab.id) {
      console.warn('[background] Could not create new tab for LLM provider');
      return;
    }

    // 4. Inject content into the new tab
    const ok = await injectLLMPageInjector(newTab.id);
    if (ok) {
      // Small delay to ensure script is settled
      await new Promise((resolve) => setTimeout(resolve, 100));

      await chrome.tabs.sendMessage(newTab.id, {
        type: 'inject-llm-data',
        tabs: contents,
        promptContent: '', // No prompt content from context menu
        files: files,
        // IMPORTANT: Omit sendButtonSelector to prevent auto-sending
      });
    }
  } catch (error) {
    console.error(`[background] Error in handleSendToLLM:`, error);
  }
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

/**
 * Restore a single window from its structured tree.
 * @param {any[]} tree
 * @returns {Promise<void>}
 */
async function restoreWindowFromTree(tree) {
  const tabs = [];
  // Flatten tree to get all tabs first to create the window
  tree.forEach((node) => {
    if (node.type === 'tab') {
      tabs.push(node);
    } else if (node.type === 'group') {
      node.tabs.forEach((t) => tabs.push(t));
    }
  });

  if (tabs.length === 0) return;

  const firstTab = tabs[0];
  const newWindow = await chrome.windows.create({
    url: firstTab.url,
    focused: true,
  });

  const windowId = newWindow.id;
  if (windowId === undefined || !newWindow.tabs) return;

  const firstCreatedTabId = newWindow.tabs[0].id;
  if (firstCreatedTabId === undefined) return;

  if (firstTab.pinned) {
    await chrome.tabs.update(firstCreatedTabId, { pinned: true });
  }

  const createdTabs = [{ id: firstCreatedTabId, oldGroupId: firstTab.groupId }];

  // Create remaining tabs
  for (let i = 1; i < tabs.length; i++) {
    const tabInfo = tabs[i];
    const newTab = await chrome.tabs.create({
      windowId,
      url: tabInfo.url,
      pinned: tabInfo.pinned,
    });
    if (newTab && newTab.id !== undefined) {
      createdTabs.push({ id: newTab.id, oldGroupId: tabInfo.groupId });
    }
  }

  // Restore groups in this window
  for (const node of tree) {
    if (node.type === 'group') {
      const tabIdsInGroup = createdTabs
        .filter((t) => t.oldGroupId === node.id)
        .map((t) => t.id);

      if (tabIdsInGroup.length > 0) {
        const newGroupId = await chrome.tabs.group({
          tabIds: /** @type {any} */ (tabIdsInGroup),
          createProperties: { windowId },
        });
        await chrome.tabGroups.update(newGroupId, {
          title: node.title,
          color: node.color,
          collapsed: node.collapsed,
        });
      }
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'addClipboardItem') {
    void addClipboardItem(message.data);
    return;
  }
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (handleOptionsBackupMessage(message, sendResponse)) {
    return true;
  }

  if (handleTokenValidationMessage(message, sendResponse)) {
    return true;
  }

  // Handle screen recorder messages
  const screenRecorderResult = handleScreenRecorderMessage(message, sender, sendResponse);
  if (screenRecorderResult !== undefined) {
    return screenRecorderResult;
  }

  // Screen recording toggle from popup
  if (message.type === 'screen-recorder:toggle') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        await handleScreenRecordingToggle(tabId);
        sendResponse({ success: true });
      } catch (error) {
        console.error('[background] Screen recording toggle failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Start new recording from preview page
  if (message.type === 'screen-recorder:start-new') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        await handleScreenRecordingToggle(tabId);
        sendResponse({ success: true });
      } catch (error) {
        console.error('[background] Screen recording start failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === GET_AUTO_RELOAD_STATUS_MESSAGE) {
    const status = getActiveAutoReloadStatus();
    sendResponse({ status });
    return true;
  }

  if (message.type === AUTO_RELOAD_RE_EVALUATE_MESSAGE) {
    void evaluateAllTabs()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.warn(
          '[background] Failed to re-evaluate auto reload rules:',
          error,
        );
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === OPEN_ALL_ITEMS_MESSAGE) {
    const collectionId = Number(message.collectionId);
    const collectionTitle = message.collectionTitle;
    if (!Number.isFinite(collectionId)) {
      sendResponse({ ok: false, error: 'Invalid collection ID' });
      return false;
    }
    handleOpenAllItemsInCollection(collectionId, collectionTitle)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error('[background] Open all items failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }
  
  if (message.type === UPDATE_RAINDROP_URL_MESSAGE) {
    const { id, url } = message;
    handleUpdateRaindropUrl(id, url)
      .then((result) => {
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        console.error('[background] Update Raindrop URL failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === GET_CURRENT_TAB_ID_MESSAGE) {
    if (sender.tab) {
      sendResponse({ tabId: sender.tab.id });
    } else {
      sendResponse({ tabId: null });
    }
    return true;
  }

  if (message.type === ENCRYPT_AND_SAVE_MESSAGE) {
    const url = typeof message.url === 'string' ? message.url : '';
    const title = typeof message.title === 'string' ? message.title : '';
    const selectionText =
      typeof message.selectionText === 'string' ? message.selectionText : '';
    const tabId = typeof message.tabId === 'number' ? message.tabId : null;

    handleEncryptAndSave({
      rawUrl: url,
      title,
      selectionText,
      tabId,
      notifyOnError: false,
    })
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === SAVE_UNSORTED_MESSAGE) {
    const entries = Array.isArray(message.entries) ? message.entries : [];
    saveUrlsToUnsorted(entries)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === RAINDROP_SEARCH_MESSAGE) {
    const query = typeof message.query === 'string' ? message.query : '';
    handleRaindropSearch(query)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[background] Raindrop search failed:', error);
        sendResponse({ items: [], collections: [] });
      });
    return true;
  }

  if (message.type === RAINDROP_EXPORT_TO_BOOKMARKS_MESSAGE) {
    exportRaindropItemsToBookmarks()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[background] Raindrop export to bookmarks failed:', error);
        sendResponse({ success: false, message: error.message || 'Export failed' });
      });
    return true;
  }

  if (message.type === FETCH_SESSIONS_MESSAGE) {
    handleFetchSessions()
      .then((result) => {
        sendResponse({ ok: true, sessions: result });
      })
      .catch((error) => {
        console.error('[background] Fetch sessions failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === FETCH_SESSION_DETAILS_MESSAGE) {
    const collectionId = Number(message.collectionId);
    handleFetchSessionDetails(collectionId)
      .then((result) => {
        sendResponse({ ok: true, details: result });
      })
      .catch((error) => {
        console.error('[background] Fetch session details failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === RESTORE_SESSION_MESSAGE) {
    const collectionId = Number(message.collectionId);
    if (!Number.isFinite(collectionId)) {
      sendResponse({ ok: false, error: 'Invalid collection ID' });
      return false;
    }
    handleRestoreSession(collectionId)
      .then((result) => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error('[background] Restore session failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === RESTORE_WINDOW_MESSAGE) {
    const { tree } = message;
    void (async () => {
      try {
        await restoreWindowFromTree(tree);
        sendResponse({ ok: true });
      } catch (error) {
        console.error('[background] Restore window failed:', error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === RESTORE_GROUP_MESSAGE) {
    const { group } = message;
    void (async () => {
      try {
        const currentWindow = await chrome.windows.getCurrent();
        const windowId = currentWindow.id;
        if (windowId === undefined) {
          throw new Error('Could not get current window');
        }

        const tabIds = [];
        for (const tab of group.tabs) {
          const newTab = await chrome.tabs.create({
            windowId,
            url: tab.url,
            pinned: tab.pinned,
            active: false, // Open tabs in the background
          });
          if (newTab && newTab.id !== undefined) {
            tabIds.push(newTab.id);
          }
        }

        if (tabIds.length > 0) {
          const newGroupId = await chrome.tabs.group({
            tabIds: /** @type {any} */ (tabIds),
            createProperties: { windowId },
          });
          await chrome.tabGroups.update(newGroupId, {
            title: group.title,
            color: group.color,
          });
        }
        sendResponse({ ok: true });
      } catch (error) {
        console.error('[background] Restore group failed:', error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === RESTORE_TAB_MESSAGE) {
    const { url, pinned } = message;
    void (async () => {
      try {
        await chrome.tabs.create({ url, pinned, active: true });
        sendResponse({ ok: true });
      } catch (error) {
        console.error('[background] Restore tab failed:', error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === SAVE_SESSION_MESSAGE) {
    const collectionId = Number(message.collectionId);
    if (!Number.isFinite(collectionId)) {
      sendResponse({ ok: false, error: 'Invalid collection ID' });
      return false;
    }
    void (async () => {
      try {
        const tokens = await loadValidProviderTokens();
        if (!tokens) {
          throw new Error('Not authenticated with Raindrop');
        }
        // Use the unified export function to handle locking and robust sync
        await ensureDeviceCollectionAndExport(tokens, collectionId);
        sendResponse({ ok: true });
      } catch (error) {
        console.error('[background] Save session failed:', error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'mirror:ensureSessionsCollection') {
    void (async () => {
      try {
        await ensureNenyaSessionsCollection();
        sendResponse({ ok: true });
      } catch (error) {
        console.warn(
          '[background] Failed to ensure sessions collection after login:',
          error,
        );
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === UPDATE_SESSION_NAME_MESSAGE) {
    const { collectionId, oldName, newName } = message;
    handleUpdateSessionName(collectionId, oldName, newName)
      .then((result) => {
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        console.error('[background] Update session name failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === DELETE_SESSION_MESSAGE) {
    const { collectionId } = message;
    handleDeleteSession(collectionId)
      .then((result) => {
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        console.error('[background] Delete session failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'mirror:uploadCollectionCover') {
    const { collectionId, iconPath } = message;
    handleUploadCollectionCover(collectionId, iconPath)
      .then((result) => {
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        console.error('[background] Upload collection cover failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === CLIPBOARD_SAVE_TO_UNSORTED_MESSAGE) {
    const clipboardText =
      typeof message.clipboardText === 'string' ? message.clipboardText : '';
    handleSaveClipboardUrlToUnsorted(clipboardText)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === TAKE_SCREENSHOT_MESSAGE) {
    const tabId = typeof message.tabId === 'number' ? message.tabId : null;
    void (async () => {
      try {
        let targetTabId = tabId;
        if (targetTabId === null) {
          const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tabs && tabs[0] && typeof tabs[0].id === 'number') {
            targetTabId = tabs[0].id;
          }
        }

        if (targetTabId !== null) {
          const success = await handleScreenshotCopy(targetTabId);
          sendResponse({ success });
        } else {
          sendResponse({ success: false, error: 'No active tab found' });
        }
      } catch (error) {
        console.warn('[background] Failed to take screenshot:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'launchElementPicker') {
    const tabId = typeof message.tabId === 'number' ? message.tabId : null;
    if (tabId === null) {
      sendResponse({ success: false, error: 'Invalid tab ID' });
      return false;
    }
    void launchElementPicker(tabId)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[background] Failed to launch element picker:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'splitTabs') {
    void (async () => {
      try {
        const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');

        // Get all highlighted tabs
        const highlightedTabs = await chrome.tabs.query({
          currentWindow: true,
          highlighted: true,
        });

        // Check if any highlighted tab is a split.html page
        const existingSplitTab = highlightedTabs.find(
          (tab) => tab.url && tab.url.startsWith(splitBaseUrl),
        );

        if (existingSplitTab && highlightedTabs.length > 1) {
          // If there are multiple highlighted tabs and one is split.html, activate it
          if (existingSplitTab.id) {
            await chrome.tabs.update(existingSplitTab.id, { active: true });
          }
          sendResponse({ success: true });
          return;
        }

        // Get current active tab
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const currentTab = tabs && tabs[0];
        if (!currentTab) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }

        const isSplitPage =
          currentTab.url && currentTab.url.startsWith(splitBaseUrl);

        if (isSplitPage) {
          // Current tab is split.html - unsplit it
          await handleUnsplitTabsContextMenu(currentTab);
        } else {
          // Current tab is NOT split.html - create split page
          await handleSplitTabsContextMenu(currentTab);
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('[background] Failed to split/unsplit tabs:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'blockElement:addSelector') {
    const selector =
      typeof message.selector === 'string' ? message.selector : '';
    const url = typeof message.url === 'string' ? message.url : '';

    if (!selector || !url) {
      sendResponse({ success: false, error: 'Invalid selector or URL' });
      return false;
    }

    void (async () => {
      try {
        // Extract URL pattern from the URL
        const urlObj = new URL(url);
        const urlPattern = `${urlObj.protocol}//${urlObj.hostname}/*`;

        // Load existing rules
        const STORAGE_KEY = 'blockElementRules';
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const rules = Array.isArray(stored?.[STORAGE_KEY])
          ? stored[STORAGE_KEY]
          : [];

        // Find existing rule for this URL pattern or create new one
        let rule = rules.find((r) => r.urlPattern === urlPattern);
        const now = new Date().toISOString();

        if (rule) {
          // Add selector if not already present
          if (!rule.selectors.includes(selector)) {
            rule.selectors.push(selector);
            rule.updatedAt = now;
          }
        } else {
          // Create new rule
          const generateRuleId = () => {
            if (typeof crypto?.randomUUID === 'function') {
              return crypto.randomUUID();
            }
            const random = Math.random().toString(36).slice(2);
            return 'rule-' + Date.now().toString(36) + '-' + random;
          };

          rule = {
            id: generateRuleId(),
            urlPattern,
            selectors: [selector],
            createdAt: now,
            updatedAt: now,
          };
          rules.push(rule);
        }

        // Save rules
        await chrome.storage.local.set({
          [STORAGE_KEY]: rules,
        });

        // Notify active tab to re-apply blocking rules immediately
        if (sender.tab && sender.tab.id) {
          void chrome.tabs.sendMessage(sender.tab.id, {
            type: 'blockElement:reapplyRules',
          });
        }

        sendResponse({ success: true, rule });
      } catch (error) {
        console.error('[background] Failed to save blocking rule:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'inject-iframe-monitor') {
    // Handle iframe monitoring script injection for cross-origin frames
    return handleIframeMonitorInjection(message, sender, sendResponse);
  }

  if (message.action === 'unsplit-tabs') {
    // Handle keyboard shortcut for unsplitting
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        void handleUnsplitTabsContextMenu(tabs[0]);
      }
    });
    return true;
  }

  if (message.type === COLLECT_PAGE_CONTENT_MESSAGE) {
    void (async () => {
      try {
        // Get tabs to collect content from
        let tabIds = Array.isArray(message.tabIds) ? message.tabIds : [];
        if (tabIds.length === 0) {
          // Get highlighted tabs or active tab
          const highlightedTabs = await chrome.tabs.query({
            currentWindow: true,
            highlighted: true,
          });
          if (highlightedTabs && highlightedTabs.length > 0) {
            tabIds = highlightedTabs
              .map((t) => t.id)
              .filter((id) => typeof id === 'number');
          } else {
            const activeTabs = await chrome.tabs.query({
              currentWindow: true,
              active: true,
            });
            if (
              activeTabs &&
              activeTabs[0] &&
              typeof activeTabs[0].id === 'number'
            ) {
              tabIds = [activeTabs[0].id];
            }
          }
        }

        // Collect content from each tab
        const contents = await collectPageContentFromTabs(tabIds);

        sendResponse({ success: true, contents });
      } catch (error) {
        console.error('[background] Error collecting page content:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === OPEN_LLM_TABS_MESSAGE) {
    void (async () => {
      try {
        const sessionId =
          typeof message.sessionId === 'string' ? message.sessionId : '';
        const chatPageTabId =
          typeof message.chatPageTabId === 'number'
            ? message.chatPageTabId
            : null;
        const providers = Array.isArray(message.providers)
          ? message.providers
          : [];
        const currentTabIndex =
          typeof message.currentTabIndex === 'number'
            ? message.currentTabIndex
            : 0;

        if (!sessionId) {
          sendResponse({
            success: false,
            error: 'Invalid session ID',
          });
          return;
        }

        const result = await openLLMTabs(
          sessionId,
          chatPageTabId,
          providers,
          currentTabIndex,
        );
        sendResponse(result);
      } catch (error) {
        console.error('[background] Error opening LLM tabs:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === CLOSE_LLM_TABS_MESSAGE) {
    void (async () => {
      try {
        const sessionId =
          typeof message.sessionId === 'string' ? message.sessionId : '';

        if (!sessionId) {
          sendResponse({ success: false, error: 'Invalid session ID' });
          return;
        }

        const result = await closeLLMTabs(sessionId);
        sendResponse(result);
      } catch (error) {
        console.error('[background] Error closing LLM tabs:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === SWITCH_LLM_PROVIDER_MESSAGE) {
    void (async () => {
      try {
        const sessionId =
          typeof message.sessionId === 'string' ? message.sessionId : '';
        const oldProviderId =
          typeof message.oldProviderId === 'string'
            ? message.oldProviderId
            : '';
        const newProviderId =
          typeof message.newProviderId === 'string'
            ? message.newProviderId
            : '';

        if (!sessionId) {
          sendResponse({ success: false, error: 'Invalid session ID' });
          return;
        }

        if (!oldProviderId || !newProviderId) {
          sendResponse({
            success: false,
            error: 'Invalid provider IDs',
          });
          return;
        }

        const result = await switchLLMProvider(
          sessionId,
          oldProviderId,
          newProviderId,
        );
        sendResponse(result);
      } catch (error) {
        console.error('[background] Error switching LLM provider:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === COLLECT_AND_SEND_TO_LLM_MESSAGE) {
    void (async () => {
      try {
        // Get tabs to collect content from
        let tabIds = Array.isArray(message.tabIds) ? message.tabIds : [];
        const llmProviders = Array.isArray(message.llmProviders)
          ? message.llmProviders
          : [];
        const promptContent =
          typeof message.promptContent === 'string'
            ? message.promptContent
            : '';
        const sessionId =
          typeof message.sessionId === 'string' ? message.sessionId : '';
        const useReuseTabs = message.useReuseTabs === true;

        if (tabIds.length === 0) {
          // Get highlighted tabs or active tab
          const highlightedTabs = await chrome.tabs.query({
            currentWindow: true,
            highlighted: true,
          });

          if (highlightedTabs.length > 0) {
            tabIds = highlightedTabs
              .map((t) => t.id)
              .filter((id) => typeof id === 'number');
          } else {
            const activeTabs = await chrome.tabs.query({
              currentWindow: true,
              active: true,
            });
            const activeTab = activeTabs && activeTabs[0];
            if (activeTab && typeof activeTab.id === 'number') {
              tabIds = [activeTab.id];
            }
          }
        }

        if (tabIds.length === 0) {
          sendResponse({
            success: false,
            error: 'No valid tabs to collect content from',
          });
          return;
        }

        if (llmProviders.length === 0) {
          sendResponse({
            success: false,
            error: 'No LLM providers selected',
          });
          return;
        }

        // Collect content from each tab
        collectedContents = await collectPageContentFromTabs(tabIds);
        selectedPromptContent = promptContent;
        selectedLocalFiles = [];

        // Get current tab
        const currentTabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const currentTab = currentTabs[0];

        // Capture screenshot if only current tab is selected
        if (tabIds.length === 1 && currentTab && tabIds[0] === currentTab.id) {
          try {
            const dataUrl = await chrome.tabs.captureVisibleTab(
              currentTab.windowId,
              { format: 'jpeg', quality: 80 },
            );
            if (dataUrl) {
              selectedLocalFiles.unshift({
                name: 'screenshot.jpg',
                type: 'image/jpeg',
                dataUrl,
              });
            }
          } catch (error) {
            console.warn('[background] Failed to capture screenshot:', error);
          }
        }

        // Use reuseLLMTabs if requested and session ID is provided
        if (useReuseTabs && sessionId) {
          const result = await reuseLLMTabs(
            sessionId,
            llmProviders,
            collectedContents,
          );
          sendResponse(result);
        } else {
          // Fallback to old behavior for backward compatibility
          await openOrReuseLLMTabs(currentTab, llmProviders, collectedContents);
          sendResponse({ success: true });
        }
      } catch (error) {
        console.error('[background] Error in collect-and-send-to-llm:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }



  if (message.type === 'INJECT_CUSTOM_JS') {
    const ruleId = message.ruleId;
    const code = typeof message.code === 'string' ? message.code : '';

    if (!code || !sender.tab || typeof sender.tab.id !== 'number') {
      sendResponse({ success: false, error: 'Invalid request' });
      return false;
    }

    const tabId = sender.tab.id;

    void (async () => {
      try {
        // Inject the custom JavaScript code into the MAIN world
        // This bypasses the page's CSP restrictions
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: (jsCode) => {
            // Execute the code in the page context
            try {
              // Use indirect eval to execute in global scope
              (0, eval)(jsCode);
            } catch (error) {
              console.error(
                '[Nenya CustomCode] Script execution error:',
                error,
              );
            }
          },
          args: [code],
        });

        sendResponse({ success: true });
      } catch (error) {
        console.error('[background] Failed to inject custom JS:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'auto-google-login-notification') {
    const title =
      typeof message.title === 'string' ? message.title : 'Auto Google Login';
    const notificationMessage =
      typeof message.message === 'string' ? message.message : '';
    const targetUrl =
      typeof message.targetUrl === 'string' ? message.targetUrl : undefined;

    if (notificationMessage) {
      void pushNotification(
        'auto-google-login',
        title,
        notificationMessage,
        targetUrl,
      );
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Missing message' });
    }
    return true;
  }

  if (message.type === 'open-in-popup') {
    void handleOpenInPopup();
    return true;
  }
  if (message.type === 'auto-google-login:checkTabActive') {
    void (async () => {
      try {
        if (!sender.tab || typeof sender.tab.id !== 'number') {
          sendResponse({ isActive: false });
          return;
        }

        const tabId = sender.tab.id;
        const windowId =
          typeof sender.tab.windowId === 'number' ? sender.tab.windowId : null;

        if (windowId === null) {
          sendResponse({ isActive: false });
          return;
        }

        // Get the window to check if it's focused
        const window = await chrome.windows.get(windowId);
        if (!window || !window.focused) {
          sendResponse({ isActive: false });
          return;
        }

        // Check if this tab is active in its window
        const tabs = await chrome.tabs.query({
          active: true,
          windowId: windowId,
        });

        const isActive =
          tabs.length > 0 &&
          typeof tabs[0]?.id === 'number' &&
          tabs[0].id === tabId;

        sendResponse({ isActive });
      } catch (error) {
        console.warn('[background] Failed to check tab active status:', error);
        sendResponse({ isActive: false });
      }
    })();
    return true;
  }

  return false;
});

/**
 * Launch the element picker in the specified tab.
 * @param {number} tabId - The tab ID to inject the picker into
 * @returns {Promise<void>}
 */
async function launchElementPicker(tabId) {
  try {
    // Inject the element picker content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['/src/contentScript/epicker.js'],
    });
  } catch (error) {
    console.error('[background] Failed to inject element picker:', error);
    throw error;
  }
}

/**
 * Handle iframe monitor injection request from split page
 * @param {object} message - The message object
 * @param {chrome.runtime.MessageSender} sender - The message sender
 * @param {Function} sendResponse - Response callback
 * @returns {boolean} True to indicate async response
 */
function handleIframeMonitorInjection(message, sender, sendResponse) {
  const { frameName, url } = message;

  if (!sender.tab || !sender.tab.id) {
    sendResponse({ success: false, error: 'No tab ID' });
    return false;
  }

  const tabId = sender.tab.id;

  // Find the frame by matching the URL
  // We'll inject the script into all frames and let it filter by name
  chrome.scripting
    .executeScript({
      target: { tabId, allFrames: true },
      func: (targetFrameName) => {
        // Only run in the target iframe
        if (window.name !== targetFrameName) {
          return;
        }

        // This is the monitoring script (inline version)
        (function () {
          'use strict';

          // Prevent double-injection
          if (window['__nenyaIframeMonitorInstalled']) {
            return;
          }
          window['__nenyaIframeMonitorInstalled'] = true;

          let lastUrl = window.location.href;
          let lastTitle = '';

          function sendUpdate() {
            const currentUrl = window.location.href;
            // Get title, but prefer a non-empty title over falling back to URL
            let currentTitle = document.title;
            if (!currentTitle || currentTitle.trim() === '') {
              // If title is empty, try to extract from meta tags
              const ogTitle = document.querySelector(
                'meta[property="og:title"]',
              );
              if (ogTitle && ogTitle instanceof HTMLMetaElement) {
                currentTitle = ogTitle.content;
              } else {
                // Only use URL as last resort
                currentTitle = currentUrl;
              }
            }

            if (currentUrl !== lastUrl || currentTitle !== lastTitle) {
              lastUrl = currentUrl;
              lastTitle = currentTitle;

              window.parent.postMessage(
                {
                  type: 'iframe-update',
                  url: currentUrl,
                  title: currentTitle,
                  frameName: window.name,
                },
                '*',
              );
            }
          }

          function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
              const later = () => {
                clearTimeout(timeout);
                func(...args);
              };
              clearTimeout(timeout);
              timeout = setTimeout(later, wait);
            };
          }

          const debouncedUpdate = debounce(sendUpdate, 100);

          // Monitor page load
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', sendUpdate);
          } else {
            sendUpdate();
          }

          window.addEventListener('load', sendUpdate);

          // Monitor SPA navigation
          const originalPushState = history.pushState;
          const originalReplaceState = history.replaceState;

          history.pushState = function (...args) {
            originalPushState.apply(this, args);
            sendUpdate();
          };

          history.replaceState = function (...args) {
            originalReplaceState.apply(this, args);
            sendUpdate();
          };

          window.addEventListener('popstate', sendUpdate);
          window.addEventListener('hashchange', sendUpdate);

          // Monitor DOM mutations for title changes
          const titleObserver = new MutationObserver(() => {
            const newTitle = document.title;
            if (newTitle !== lastTitle) {
              debouncedUpdate();
            }
          });

          titleObserver.observe(document.documentElement, {
            childList: true,
            characterData: true,
            subtree: true,
          });

          // Send initial update with retries to catch the title as it loads
          let retryCount = 0;
          const maxRetries = 5;
          const retryDelays = [50, 200, 500, 1000, 2000];

          function sendInitialUpdate() {
            const hadTitle = document.title && document.title.trim() !== '';
            sendUpdate();

            // If we still don't have a title and haven't exhausted retries, try again
            if (!hadTitle && retryCount < maxRetries) {
              setTimeout(sendInitialUpdate, retryDelays[retryCount]);
              retryCount++;
            }
          }

          // Start initial update sequence
          setTimeout(sendInitialUpdate, 50);
        })();
      },
      args: [frameName],
    })
    .then(() => {
      sendResponse({ success: true });
    })
    .catch((error) => {
      console.error('Failed to inject iframe monitor:', error);
      sendResponse({ success: false, error: error.message });
    });

  // Return true to indicate we'll respond asynchronously
  return true;
}

/**
 * Handle split tabs context menu click
 * @param {chrome.tabs.Tab} tab - The current tab
 * @returns {Promise<void>}
 */
async function handleSplitTabsContextMenu(tab) {
  try {
    // Get highlighted tabs first, fallback to current tab
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    // Filter to http/https tabs, sort by tab index, take first 4
    const httpTabs = tabs
      .filter(
        (t) =>
          typeof t.url === 'string' &&
          (t.url.startsWith('http://') || t.url.startsWith('https://')),
      )
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .slice(0, 4);

    if (httpTabs.length < 1) {
      return;
    }

    const state = {
      urls: httpTabs.map((t) => String(t.url)),
    };

    const splitUrl = `${chrome.runtime.getURL(
      'src/split/split.html',
    )}?state=${encodeURIComponent(JSON.stringify(state))}`;

    // Create new tab with split page
    const newTab = await chrome.tabs.create({
      url: splitUrl,
      windowId: tab.windowId,
    });

    // Close the original tab(s) after creating split page
    const tabIdsToClose = httpTabs
      .map((t) => t.id)
      .filter((id) => typeof id === 'number');

    if (tabIdsToClose.length > 0) {
      await chrome.tabs.remove(tabIdsToClose);
    }
  } catch (error) {
    console.error('Failed to split tabs:', error);
  }
}

/**
 * Handle unsplit tabs context menu click
 * @param {chrome.tabs.Tab} tab - The current tab (should be split page)
 * @returns {Promise<void>}
 */
async function handleSaveToUnsortedRequest() {
  try {
    const tabs = await chrome.tabs.query({
      currentWindow: true,
      active: true,
    });
    const activeTab = tabs && tabs[0];
    if (!activeTab) {
      pushNotification(
        'save-unsorted-request',
        'Save to Unsorted',
        'No active tab found.',
      );
      return;
    }

    await chrome.action.openPopup();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await chrome.runtime.sendMessage({
      type: SHOW_SAVE_TO_UNSORTED_DIALOG_MESSAGE,
      tab: {
        id: activeTab.id,
        url: activeTab.url,
        title: activeTab.title,
        windowId: activeTab.windowId,
      },
    });
  } catch (error) {
    console.warn('[background] Save to Unsorted request failed:', error);
    pushNotification(
      'save-unsorted-request',
      'Save to Unsorted',
      'An unexpected error occurred.',
    );
  }
}

/**
 * Handle unsplit tabs context menu click
 * @param {chrome.tabs.Tab} tab - The current tab (should be split page)
 * @returns {Promise<void>}
 */
async function handleUnsplitTabsContextMenu(tab) {
  try {
    if (!tab || typeof tab.id !== 'number') {
      return;
    }

    // Request the current URLs from the split page
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'get-current-urls',
    });

    const urls = (
      response && Array.isArray(response.urls) ? response.urls : []
    ).filter((url) => typeof url === 'string' && url.length > 0);

    if (urls.length === 0) {
      await chrome.tabs.remove(tab.id);
      return;
    }

    // Create new tabs for each URL
    const newTabs = await Promise.all(
      urls.map((url) =>
        chrome.tabs.create({
          url: url,
          windowId: tab.windowId,
        }),
      ),
    );

    // Close the split page tab
    await chrome.tabs.remove(tab.id);
  } catch (error) {
    console.error('Failed to unsplit tabs:', error);
  }
}

/**
 * Update context menu visibility based on current tab.
 * Uses the centralized context menu module for updates.
 * @param {chrome.tabs.Tab} tab - The current tab
 * @returns {Promise<void>}
 */
async function updateContextMenuVisibility(tab) {
  if (!chrome.contextMenus) return;

  try {
    // Update split/unsplit menu visibility
    await updateSplitMenuVisibility(tab);

    // Update Run Code menu based on current URL
    if (tab && tab.url) {
      await updateRunCodeSubmenu(tab.url);
    }

    // Update screenshot visibility based on tab selection
    const highlightedTabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    const hasMultipleTabs = highlightedTabs && highlightedTabs.length > 1;
    await updateScreenshotMenuVisibility(hasMultipleTabs);
  } catch (error) {
    console.warn('Failed to update context menu visibility:', error);
  }
}

/**
 * Ensure extension context menu entries exist.
 * Uses the centralized context menu module for hierarchical menus.
 * @returns {void}
 */
function setupContextMenus() {
  if (!chrome.contextMenus) {
    return;
  }

  // Use the centralized context menu setup
  void setupCentralizedContextMenus().catch((error) => {
    console.error('[contextMenu] Failed to setup context menus:', error);
  });
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const menuItemId = String(info.menuItemId);

    // ========================================================================
    // COPY MENU HANDLERS
    // ========================================================================
    if (isCopyMenuItem(menuItemId)) {
      const formatType = getCopyFormatType(menuItemId);
      if (formatType && tab) {
        void handleCopyContextMenuClick(formatType, tab);
      }
      return;
    }

    // ========================================================================
    // RAINDROP MENU HANDLERS
    // ========================================================================

    // Save current page to unsorted
    if (menuItemId === RAINDROP_MENU_IDS.SAVE_PAGE) {
      void handleSaveToUnsortedRequest();
      return;
    }

    // Save link to unsorted
    if (menuItemId === RAINDROP_MENU_IDS.SAVE_LINK) {
      const url = typeof info.linkUrl === 'string' ? info.linkUrl : '';
      if (!url) {
        return;
      }
      const convertedUrl = convertSplitUrlForSave(url);
      const normalizedUrl = normalizeHttpUrl(convertedUrl);
      if (!normalizedUrl) {
        return;
      }
      const processedUrl = await processUrl(normalizedUrl, 'save-to-raindrop');
      const selection =
        typeof info.selectionText === 'string' ? info.selectionText.trim() : '';
      const originalTitle =
        selection || (typeof tab?.title === 'string' ? tab.title : '');
      const title = await promptForTitle(tab?.id, originalTitle);
      void saveUrlsToUnsorted([{ url: processedUrl, title }]).catch((error) => {
        console.error('[contextMenu] Failed to save link:', error);
      });
      return;
    }

    // Save clipboard link to unsorted
    if (menuItemId === RAINDROP_MENU_IDS.SAVE_CLIPBOARD) {
      void (async () => {
        try {
          const clipboardResult = await readClipboardFromTab();
          if (clipboardResult.error) {
            console.error(
              '[contextMenu] Failed to read clipboard:',
              clipboardResult.error,
            );
            return;
          }
          await handleSaveClipboardUrlToUnsorted(clipboardResult.text || '');
        } catch (error) {
          console.error('[contextMenu] Failed to save clipboard link:', error);
        }
      })();
      return;
    }

    // Encrypt & save to unsorted
    if (menuItemId === RAINDROP_MENU_IDS.ENCRYPT_SAVE) {
      const targetUrl =
        typeof info.linkUrl === 'string' && info.linkUrl
          ? info.linkUrl
          : typeof info.pageUrl === 'string'
            ? info.pageUrl
            : '';
      if (!targetUrl) {
        return;
      }

      const selectionText =
        typeof info.selectionText === 'string' ? info.selectionText.trim() : '';
      const tabId = typeof tab?.id === 'number' ? tab.id : null;
      const title =
        selectionText || (typeof tab?.title === 'string' ? tab.title : '');

      void handleEncryptAndSave({
        rawUrl: targetUrl,
        title,
        selectionText,
        tabId,
        notifyOnError: true,
      }).catch((error) => {
        console.error('[contextMenu] Encrypt & save failed:', error);
      });
      return;
    }



    // ========================================================================
    // RUN CODE MENU HANDLERS
    // ========================================================================
    const runCodeMenuItem = parseRunCodeMenuItem(menuItemId);
    if (runCodeMenuItem) {
      void handleRunCodeFromContextMenu(runCodeMenuItem.ruleId, tab);
      return;
    }

    // ========================================================================
    // SEND TO LLM MENU HANDLERS
    // ========================================================================
    const llmMenuItem = parseLLMMenuItem(menuItemId);
    if (llmMenuItem) {
      if (tab) {
        void handleSendToLLM(llmMenuItem.providerId, tab);
      }
      return;
    }

    // ========================================================================
    // NENYA MENU HANDLERS
    // ========================================================================

    // Split tabs
    if (menuItemId === NENYA_MENU_IDS.SPLIT_TABS) {
      if (tab) {
        void handleSplitTabsContextMenu(tab);
      }
      return;
    }

    // Unsplit tabs
    if (menuItemId === NENYA_MENU_IDS.UNSPLIT_TABS) {
      if (tab) {
        void handleUnsplitTabsContextMenu(tab);
      }
      return;
    }

    // Open in popup
    if (menuItemId === NENYA_MENU_IDS.OPEN_IN_POPUP) {
      void handleOpenInPopup();
      return;
    }

    // Emoji Picker
    if (menuItemId === NENYA_MENU_IDS.EMOJI_PICKER) {
      void (async () => {
        try {
          await chrome.storage.local.set({ openEmojiPage: true });
          await chrome.action.openPopup();
        } catch (error) {
          console.warn('[contextMenu] Failed to open emoji picker:', error);
        }
      })();
      return;
    }

    // Take screenshot
    if (menuItemId === NENYA_MENU_IDS.TAKE_SCREENSHOT) {
      if (tab && typeof tab.id === 'number') {
        void handleScreenshotCopy(tab.id);
      }
      return;
    }

    // Screen recording
    if (menuItemId === NENYA_MENU_IDS.SCREEN_RECORDING) {
      if (tab && typeof tab.id === 'number') {
        void handleScreenRecordingToggle(tab.id);
      }
      return;
    }

    // Picture in Picture
    if (menuItemId === NENYA_MENU_IDS.PIP) {
      if (tab && typeof tab.id === 'number') {
        void handlePictureInPicture(tab.id);
      }
      return;
    }

    // Hide elements (Custom Filter)
    if (menuItemId === NENYA_MENU_IDS.CUSTOM_FILTER) {
      if (tab && typeof tab.id === 'number') {
        void launchElementPicker(tab.id);
      }
      return;
    }

    // Highlight Text
    if (menuItemId === NENYA_MENU_IDS.HIGHLIGHT_TEXT) {
      if (tab && tab.url) {
        await chrome.storage.local.set({ highlightTextPrefillUrl: tab.url });
        chrome.runtime.openOptionsPage();
      }
      return;
    }

    // Auto Reload
    if (menuItemId === NENYA_MENU_IDS.AUTO_RELOAD) {
      if (tab && tab.url) {
        await chrome.storage.local.set({ autoReloadPrefillUrl: tab.url });
        chrome.runtime.openOptionsPage();
      }
      return;
    }

    // Bright Mode
    if (menuItemId === NENYA_MENU_IDS.BRIGHT_MODE) {
      if (tab && tab.url) {
        await chrome.storage.local.set({ brightModePrefillUrl: tab.url });
        chrome.runtime.openOptionsPage();
      }
      return;
    }

    // Dark Mode
    if (menuItemId === NENYA_MENU_IDS.DARK_MODE) {
      if (tab && tab.url) {
        const optionsUrl = chrome.runtime.getURL('src/options/index.html');
        chrome.tabs.create({
          url: `${optionsUrl}#dark-mode-heading&url=${encodeURIComponent(
            tab.url,
          )}`,
        });
      }
      return;
    }

    // Inject JS/CSS (Custom Code Options)
    if (menuItemId === NENYA_MENU_IDS.CUSTOM_CODE_OPTIONS) {
      if (tab && tab.url) {
        await chrome.storage.local.set({ customCodePrefillUrl: tab.url });
        chrome.runtime.openOptionsPage();
      }
      return;
    }

    // Open Options
    if (menuItemId === NENYA_MENU_IDS.OPTIONS) {
      chrome.runtime.openOptionsPage();
      return;
    }

    // ========================================================================
    // BACKWARDS COMPATIBILITY - Handle old menu IDs
    // ========================================================================
    // Handle clipboard context menu clicks (legacy)
    if (tab) {
      void handleClipboardContextMenuClick(info, tab);
    }
  });
}

// ============================================================================
// CONTEXT MENU HELPER FUNCTIONS
// ============================================================================

/**
 * Handle copy context menu click.
 * @param {'title' | 'title-url' | 'title-dash-url' | 'markdown-link' | 'screenshot'} formatType
 * @param {chrome.tabs.Tab} tab
 * @returns {Promise<void>}
 */
async function handleCopyContextMenuClick(formatType, tab) {
  try {
    // Get highlighted tabs first, then fall back to active tab
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    if (!tabs || tabs.length === 0) {
      setCopyFailureBadge();
      return;
    }

    let success = false;

    if (formatType === 'screenshot') {
      // Screenshot only works with single tab
      if (tabs.length === 1 && typeof tabs[0].id === 'number') {
        success = await handleScreenshotCopy(tabs[0].id);
      }
    } else {
      success = await handleMultiTabCopy(formatType, tabs);
    }

    // Set badge based on result
    if (success) {
      setCopySuccessBadge();
    } else {
      setCopyFailureBadge();
    }
  } catch (error) {
    console.error('[contextMenu] Copy operation failed:', error);
    setCopyFailureBadge();
  }
}

/**
 * Handle create new project from context menu.
 * @param {chrome.tabs.Tab} [tab]
 * @returns {Promise<void>}
 */
async function handleCreateProjectFromContextMenu(tab) {
  try {
    // Get highlighted tabs for project
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    if (!tabs || tabs.length === 0) {
      return;
    }

    // Prompt for project name
    const projectName = await promptForProjectName(tab?.id);
    if (!projectName) {
      return;
    }

    // Convert tabs to project tab descriptors
    const tabDescriptors = tabs
      .filter((t) => t && typeof t.id === 'number' && t.url)
      .map((t) => ({
        id: t.id,
        windowId: t.windowId || -1,
        index: t.index || 0,
        groupId: t.groupId || -1,
        pinned: Boolean(t.pinned),
        url: t.url || '',
        title: t.title || '',
      }));

    await saveTabsAsProject(projectName, tabDescriptors);

    // Refresh project submenus after creating a new project
    void updateProjectSubmenus();
  } catch (error) {
    console.error('[contextMenu] Failed to create project:', error);
  }
}

/**
 * Handle add current page to project from context menu.
 * @param {number} projectId
 * @param {chrome.tabs.Tab} [tab]
 * @returns {Promise<void>}
 */
async function handleAddToProjectFromContextMenu(projectId, tab) {
  try {
    // Get highlighted tabs
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    if (!tabs || tabs.length === 0) {
      return;
    }

    // Convert tabs to project tab descriptors
    const tabDescriptors = tabs
      .filter((t) => t && typeof t.id === 'number' && t.url)
      .map((t) => ({
        id: t.id,
        windowId: t.windowId || -1,
        index: t.index || 0,
        groupId: t.groupId || -1,
        pinned: Boolean(t.pinned),
        url: t.url || '',
        title: t.title || '',
      }));

    // Import addTabsToProject
    const { addTabsToProject } = await import('./projects.js');
    await addTabsToProject(projectId, tabDescriptors);
  } catch (error) {
    console.error('[contextMenu] Failed to add to project:', error);
  }
}

/**
 * Handle replace project items from context menu.
 * @param {number} projectId
 * @param {chrome.tabs.Tab} [tab]
 * @returns {Promise<void>}
 */
async function handleReplaceProjectFromContextMenu(projectId, tab) {
  try {
    // Get highlighted tabs
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    if (!tabs || tabs.length === 0) {
      return;
    }

    // Convert tabs to project tab descriptors
    const tabDescriptors = tabs
      .filter((t) => t && typeof t.id === 'number' && t.url)
      .map((t) => ({
        id: t.id,
        windowId: t.windowId || -1,
        index: t.index || 0,
        groupId: t.groupId || -1,
        pinned: Boolean(t.pinned),
        url: t.url || '',
        title: t.title || '',
      }));

    // Import replaceProjectItems
    const { replaceProjectItems } = await import('./projects.js');
    await replaceProjectItems(projectId, tabDescriptors);
  } catch (error) {
    console.error('[contextMenu] Failed to replace project:', error);
  }
}

/**
 * Handle run code snippet from context menu.
 * @param {string} ruleId
 * @param {chrome.tabs.Tab} [tab]
 * @returns {Promise<void>}
 */
async function handleRunCodeFromContextMenu(ruleId, tab) {
  if (!tab || typeof tab.id !== 'number') {
    return;
  }

  try {
    // Load the "run code in page" rules
    const result = await chrome.storage.local.get('runCodeInPageRules');
    const rules = Array.isArray(result.runCodeInPageRules)
      ? result.runCodeInPageRules
      : [];
    const rule = rules.find((r) => r.id === ruleId);

    if (!rule) {
      console.warn('[contextMenu] Code rule not found:', ruleId);
      return;
    }

    // Inject code if present (using MAIN world to bypass CSP)
    if (rule.code && rule.code.trim()) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (jsCode) => {
          try {
            // Wrap code in async IIFE to prevent global pollution and support await
            const wrappedCode = `(async function() {\n${jsCode}\n})();`;
            (0, eval)(wrappedCode);
          } catch (error) {
            console.error('[Nenya RunCode] Script execution error:', error);
          }
        },
        args: [rule.code],
      });
    }
  } catch (error) {
    console.error('[contextMenu] Failed to run code:', error);
  }
}

/**
 * Prompt user for project name.
 * @param {number} [tabId]
 * @returns {Promise<string | null>}
 */
async function promptForProjectName(tabId) {
  if (typeof tabId !== 'number') {
    return 'New Project';
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return window.prompt('Enter project name:', 'New Project');
      },
    });

    if (results && results[0] && results[0].result) {
      return String(results[0].result).trim() || null;
    }
    return null;
  } catch (error) {
    console.warn('[contextMenu] Failed to prompt for project name:', error);
    return 'New Project';
  }
}

// ============================================================================
// STORAGE CHANGE LISTENERS FOR CONTEXT MENU UPDATES
// ============================================================================

/**
 * Listen for storage changes to update context menus dynamically.
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  // Update project submenus when cached projects change
  if (changes.cachedProjects) {
    void updateProjectSubmenus().catch((error) => {
      console.warn('[contextMenu] Failed to update project submenus:', error);
    });
  }

  // Update code submenus when "run code in page" rules change
  if (changes.runCodeInPageRules) {
    // We need to update for the current tab's URL
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tabs && tabs[0] && tabs[0].url) {
          await updateRunCodeSubmenu(tabs[0].url);
        }
      } catch (error) {
        console.warn('[contextMenu] Failed to update code submenus:', error);
      }
    })();
  }
});

// ============================================================================
// URL PROCESSING ON TAB OPEN
// ============================================================================

/**
 * Process URLs when tabs are opened or navigated to
 */
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    // Only process top-level navigation (not iframes)
    if (details.frameId !== 0) {
      return;
    }

    // Ignore about:, chrome:, and extension URLs
    if (
      details.url.startsWith('about:') ||
      details.url.startsWith('chrome:') ||
      details.url.startsWith('chrome-extension:')
    ) {
      return;
    }

    try {
      // Process the URL with 'open-in-new-tab' context
      const processedUrl = await processUrl(details.url, 'open-in-new-tab');

      // If URL was modified, update the tab
      if (processedUrl !== details.url) {
        await chrome.tabs.update(details.tabId, { url: processedUrl });
      }
    } catch (error) {
      console.error('[urlProcessor] Failed to process URL on tab open:', error);
    }
  });
}
