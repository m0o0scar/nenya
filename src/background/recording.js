/**
 * Recording service for Nenya extension.
 * Manages offscreen document lifecycle and recording state.
 */

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/record.html';
let isRecording = false;

/**
 * Start recording the current tab.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export async function startRecording(tabId) {
  if (isRecording) {
    console.warn('[recording] Already recording');
    return;
  }

  try {
    // 1. Get stream ID for the tab
    // @ts-ignore
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

    // 2. Create offscreen document if it doesn't exist
    await ensureOffscreenDocument();

    // 3. Send stream ID to offscreen document to start recording
    await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      target: 'offscreen',
      streamId,
      tabId
    });

    isRecording = true;

    // 4. Update action button
    await updateRecordingUI(true);

    console.log('[recording] Recording started for tab:', tabId);
  } catch (error) {
    console.error('[recording] Failed to start recording:', error);
    await stopRecording(); // Cleanup
  }
}

/**
 * Stop the current recording.
 * @returns {Promise<void>}
 */
export async function stopRecording() {
  try {
    await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING',
      target: 'offscreen'
    });
  } catch (error) {
    // Offscreen might already be closed
    console.warn('[recording] Failed to send stop message:', error);
  }

  isRecording = false;
  await updateRecordingUI(false);
// Don't close immediately, wait for conversion and download in offscreen
// Unless it's a manual stop from somewhere else
  console.log('[recording] Recording stopped');
}

/**
 * Check if currently recording.
 * @returns {boolean}
 */
export function getIsRecording() {
  return isRecording;
}

/**
 * Ensure the offscreen document is created.
 */
async function ensureOffscreenDocument() {
  // @ts-ignore
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // @ts-ignore
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['TAB_CAPTURE'],
    justification: 'Recording tab content'
  });
}

/**
 * Close the offscreen document.
 */
async function closeOffscreenDocument() {
  try {
    // @ts-ignore
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });

    if (existingContexts.length > 0) {
      // @ts-ignore
      await chrome.offscreen.closeDocument();
    isRecording = false;
    }
  } catch (error) {
    console.warn('[recording] Failed to close offscreen document:', error);
  }
}

/**
 * Update the extension UI for recording state.
 * @param {boolean} recording
 */
async function updateRecordingUI(recording) {
  if (recording) {
    // Show badge
    await chrome.action.setBadgeText({ text: '⏺️' });
    // Disable popup so click stops recording
    await chrome.action.setPopup({ popup: '' });
  } else {
    // Clear badge
    await chrome.action.setBadgeText({ text: '' });
    // Restore popup
    await chrome.action.setPopup({ popup: 'src/popup/index.html' });
  }
}

// Listen for messages from offscreen document
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'RECORDING_COMPLETE') {
    void closeOffscreenDocument();
    void updateRecordingUI(false);
  }
});
