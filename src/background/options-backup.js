/* global chrome */

import { debounce } from '../shared/debounce.js';
import { OPTIONS_BACKUP_MESSAGES } from '../shared/optionsBackupMessages.js';
import {
  OPTION_KEYS,
  getOptionsSyncStatus,
  initializeAutomergeOptionsSync,
  isApplyingRemoteOptions,
  recordLocalOptionChanges,
  resetOptionsToDefaults as resetSyncedOptionsToDefaults,
  syncOptionsWithRemote,
} from './automerge-options-sync.js';

const STATE_STORAGE_KEY = 'optionsBackupState';
const LOCAL_DOC_STORAGE_KEY = 'automergeOptionsDoc';
const ACTOR_ID_STORAGE_KEY = 'automergeActorId';

let listenerInitialized = false;

/**
 * Execute an immediate merge sync.
 * @returns {Promise<{ ok: boolean, errors: string[], state: any }>}
 */
export async function runManualBackup() {
  return syncOptionsWithRemote({ trigger: 'manual-backup' });
}

/**
 * Execute a destructive remote restore for recovery.
 * @returns {Promise<{ ok: boolean, errors: string[], state: any }>}
 */
export async function runManualRestore() {
  return syncOptionsWithRemote({
    trigger: 'manual-restore',
    forceRestore: true,
  });
}

/**
 * Execute the periodic background sync.
 * @returns {Promise<void>}
 */
export async function runAutomaticRestore() {
  const result = await syncOptionsWithRemote({
    trigger: 'alarm',
    notifyOnError: true,
  });
  if (
    !result.ok &&
    !String(result.errors?.[0] || '').startsWith('No Raindrop connection')
  ) {
    console.warn('[options-backup] Automatic options sync failed:', result.errors);
  }
}

/**
 * Execute startup/install sync.
 * @returns {Promise<void>}
 */
export async function runStartupSync() {
  const result = await syncOptionsWithRemote({
    trigger: 'startup',
    notifyOnError: true,
  });
  if (
    !result.ok &&
    !String(result.errors?.[0] || '').startsWith('No Raindrop connection')
  ) {
    console.warn('[options-backup] Startup options sync failed:', result.errors);
  }
}

/**
 * Retrieve the latest sync status snapshot.
 * @returns {Promise<{ ok: boolean, state: any, loggedIn: boolean }>}
 */
export async function getBackupStatus() {
  return getOptionsSyncStatus();
}

/**
 * Reset configurable options to defaults and clear sync state errors.
 * @returns {Promise<{ ok: boolean, errors: string[], state: any }>}
 */
export async function resetOptionsToDefaults() {
  return resetSyncedOptionsToDefaults();
}

/**
 * Handle incoming runtime messages related to options sync.
 * @param {{ type?: string }} message
 * @param {(response?: any) => void} sendResponse
 * @returns {boolean}
 */
export function handleOptionsBackupMessage(message, sendResponse) {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  switch (message.type) {
    case OPTIONS_BACKUP_MESSAGES.STATUS: {
      void getBackupStatus()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.BACKUP_NOW: {
      void runManualBackup()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errors: [
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
            ],
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESTORE_NOW: {
      void runManualRestore()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errors: [
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
            ],
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESTORE_AFTER_LOGIN:
    case OPTIONS_BACKUP_MESSAGES.SYNC_AFTER_LOGIN: {
      void syncOptionsWithRemote({ trigger: 'login' })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errors: [
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
            ],
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESET_DEFAULTS: {
      void resetOptionsToDefaults()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
          }),
        );
      return true;
    }
    default:
      return false;
  }
}

/**
 * Initialize the sync service and storage listener.
 * @returns {Promise<void>}
 */
export async function initializeOptionsBackupService() {
  await initializeAutomergeOptionsSync();
  setupAutoSyncListener();
}

/**
 * Set up a listener for option changes to update the CRDT and queue sync.
 * @returns {void}
 */
function setupAutoSyncListener() {
  if (listenerInitialized) {
    return;
  }
  listenerInitialized = true;

  const debouncedSync = debounce(() => {
    void syncOptionsWithRemote({
      trigger: 'storage',
      notifyOnError: true,
    }).catch((error) => {
      console.warn('[options-backup] Debounced options sync failed:', error);
    });
  }, 5000);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || isApplyingRemoteOptions()) {
      return;
    }

    const keys = Object.keys(changes);
    const ignoredKeys = new Set([
      STATE_STORAGE_KEY,
      LOCAL_DOC_STORAGE_KEY,
      ACTOR_ID_STORAGE_KEY,
    ]);
    if (keys.every((key) => ignoredKeys.has(key))) {
      return;
    }

    const hasOptionChanges = keys.some((key) => OPTION_KEYS.includes(key));
    if (!hasOptionChanges) {
      return;
    }

    void recordLocalOptionChanges(changes)
      .then(() => debouncedSync())
      .catch((error) => {
        console.warn('[options-backup] Failed to record local option change:', error);
      });
  });
}

/**
 * Lifecycle handler retained for older call sites.
 * @param {string} trigger
 * @returns {Promise<void>}
 */
export async function handleOptionsBackupLifecycle(trigger) {
  await syncOptionsWithRemote({
    trigger: trigger || 'lifecycle',
    notifyOnError: true,
  });
}
