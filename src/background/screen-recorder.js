
import { pushNotification } from './mirror.js';

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';
let isRecording = false;
let blinkInterval = null;

/**
 * Ensure the offscreen document exists.
 * @returns {Promise<void>}
 */
async function setupOffscreenDocument() {
  try {
    // Check if offscreen document already exists
    if ('getContexts' in chrome.runtime) {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
      });

      if (existingContexts.length > 0) {
        return;
      }
    } else {
      // Fallback for older Chrome versions: just try to create it
      // and ignore error if it exists
    }
  } catch (error) {
    // Ignore error here
  }

  // Create offscreen document
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['USER_MEDIA'],
      justification: 'Recording screen'
    });
  } catch (error) {
    if (!error.message.startsWith('Only a single offscreen')) {
       console.warn('Failed to create offscreen document:', error);
    }
  }
}

/**
 * Start the blinking badge animation.
 */
function startBlinking() {
  if (blinkInterval) clearInterval(blinkInterval);
  let visible = true;
  chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  chrome.action.setBadgeText({ text: '⏺️' });

  blinkInterval = setInterval(() => {
    if (visible) {
      chrome.action.setBadgeText({ text: '' });
    } else {
      chrome.action.setBadgeText({ text: '⏺️' });
    }
    visible = !visible;
  }, 1000);
}

/**
 * Stop the blinking badge animation and reset badge.
 */
function stopBlinking() {
  if (blinkInterval) {
    clearInterval(blinkInterval);
    blinkInterval = null;
  }
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setBadgeBackgroundColor({ color: '#000000' }); // Reset to default?
}

/**
 * Start the screen recording flow.
 * @param {chrome.tabs.Tab} [tab] - The tab initiating the request (optional).
 * @returns {Promise<void>}
 */
export async function startScreenRecording(tab) {
  if (isRecording) return;

  try {
    await setupOffscreenDocument();

    const streamId = await new Promise((resolve, reject) => {
      // Prompt user to choose source
      // If tab is provided, we can pass it, otherwise pass null/undefined
      const targetTab = tab || null;

      chrome.desktopCapture.chooseDesktopMedia(
        ['screen', 'window', 'tab'],
        targetTab,
        (streamId) => {
          if (chrome.runtime.lastError) {
             reject(new Error(chrome.runtime.lastError.message));
          } else if (!streamId) {
            reject(new Error('User cancelled selection'));
          } else {
            resolve(streamId);
          }
        }
      );
    });

    // Send streamId to offscreen document
    await chrome.runtime.sendMessage({
      type: 'start-recording',
      streamId
    });

    isRecording = true;
    startBlinking();

    // Disable popup so onClicked works for stopping the recording
    await chrome.action.setPopup({ popup: '' });
    await chrome.action.setTitle({ title: 'Click to stop recording' });

    // Persist state in case service worker restarts
    await chrome.storage.local.set({ isScreenRecording: true });

  } catch (error) {
    console.warn('Failed to start recording:', error);
    // Only notify if it's not a user cancellation
    if (error.message !== 'User cancelled selection') {
        pushNotification('Screen Record', 'Failed to start recording', error.message);
    }
  }
}

/**
 * Stop the screen recording.
 * @returns {Promise<void>}
 */
export async function stopScreenRecording() {
  // We allow calling this even if isRecording is false, just to be safe in recovery scenarios
  // but generally we check isRecording.

  try {
    await chrome.runtime.sendMessage({ type: 'stop-recording' });
  } catch (error) {
    console.error('Failed to stop recording:', error);
  }
}

/**
 * Handle messages related to screen recording.
 * @param {any} message
 * @param {Function} [sendResponse]
 * @returns {boolean} True if handled
 */
export async function handleScreenRecorderMessage(message, sendResponse) {
  if (message.type === 'recording-complete') {
    isRecording = false;
    stopBlinking();

    // Restore popup
    await chrome.action.setPopup({ popup: 'src/popup/index.html' });
    await chrome.action.setTitle({ title: 'Nenya' });

    await chrome.storage.local.set({ isScreenRecording: false });

    // Open preview page
    chrome.tabs.create({ url: 'src/tabs/preview.html' });
    if (sendResponse) sendResponse({ success: true });
    return true;
  }

  if (message.type === 'recording-error') {
      isRecording = false;
      stopBlinking();

      await chrome.action.setPopup({ popup: 'src/popup/index.html' });
      await chrome.action.setTitle({ title: 'Nenya' });

      await chrome.storage.local.set({ isScreenRecording: false });

      pushNotification('Screen Record', 'Recording error', message.error);
      if (sendResponse) sendResponse({ success: true }); // Acknowledge error
      return true;
  }

  if (message.type === 'screen-record:start') {
      // Find active tab if available to pass to chooseDesktopMedia
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      await startScreenRecording(tab);
      if (sendResponse) sendResponse({ success: true });
      return true;
  }

  return false;
}

/**
 * Check recording state on startup.
 * @returns {Promise<void>}
 */
export async function checkRecordingState() {
  try {
    const { isScreenRecording } = await chrome.storage.local.get('isScreenRecording');
    if (isScreenRecording) {
      isRecording = true;
      startBlinking();
      await chrome.action.setPopup({ popup: '' });
      await chrome.action.setTitle({ title: 'Click to stop recording' });

      // Ensure offscreen document is alive?
      await setupOffscreenDocument();
    }
  } catch (error) {
    console.warn('Failed to check recording state:', error);
  }
}

/**
 * Handle action button click.
 * @returns {Promise<void>}
 */
export async function handleActionClick() {
    // Check local variable first
    if (isRecording) {
        await stopScreenRecording();
        return;
    }

    // Fallback: check storage in case SW restarted
    const { isScreenRecording } = await chrome.storage.local.get('isScreenRecording');
    if (isScreenRecording) {
        isRecording = true; // Restore state
        await stopScreenRecording();
    }
}
