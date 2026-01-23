
let recordingOffscreenCreated = false;
const OFFSCREEN_PATH = 'src/offscreen/record.html';

/**
 * Start recording the current tab.
 * @param {chrome.tabs.Tab} tab
 */
export async function handleStartRecording(tab) {
  if (!tab || !tab.id) return;

  try {
    // Get media stream ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      consumerTabId: tab.id,
      targetTabId: tab.id
    });

    if (!streamId) {
      console.error('Failed to get media stream ID');
      return;
    }

    // Create offscreen document if not exists
    if (!recordingOffscreenCreated) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Recording tab content'
      });
      recordingOffscreenCreated = true;
      // Give it a moment to register listeners
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Send start message to offscreen
    chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      streamId: streamId,
      tabId: tab.id
    });

    // Update UI
    await chrome.action.setBadgeText({ text: '⏺️' });
    await chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });

    // Disable popup to allow action click handling
    await chrome.action.setPopup({ popup: '' });

  } catch (err) {
    console.error('Failed to start recording:', err);
  }
}

/**
 * Stop recording.
 */
export async function handleStopRecording() {
  try {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

    // Reset UI
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setPopup({ popup: 'src/popup/index.html' });

    // We don't close offscreen immediately here, it will handle conversion and then close itself or we close it on message
    // Actually, keeping it open for conversion is good.
    // The offscreen doc can signal when it's done.

  } catch (err) {
    console.error('Failed to stop recording:', err);
  }
}

/**
 * Handle action button click (only works when popup is disabled).
 */
export async function handleActionClick() {
  await handleStopRecording();
}

/**
 * Handle messages from offscreen document
 */
export async function handleRecorderMessage(message) {
    if (message.type === 'RECORDING_COMPLETE') {
        // Close offscreen document
        if (recordingOffscreenCreated) {
            await chrome.offscreen.closeDocument();
            recordingOffscreenCreated = false;
        }
    }
}
