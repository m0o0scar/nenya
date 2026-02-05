import { saveRecording } from '../shared/idb-helper.js';

let recorder;
let data = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start-recording') {
    startRecording(message.streamId);
    sendResponse({ success: true });
  } else if (message.type === 'stop-recording') {
    stopRecording();
    sendResponse({ success: true });
  }
});

async function startRecording(streamId) {
  if (recorder && recorder.state === 'recording') {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      }
    });

    // In many cases, user might not want audio or system audio.
    // Chrome desktop capture usually provides system audio if checkbox checked.
    // If the user selects a tab, it might have audio.
    // If we fail to get audio (e.g. user didn't share audio), we might need to fallback to video only.
    // But getUserMedia throws if constraints fail.
    // Actually, usually we request both, and if audio is missing, it might work or fail depending on browser.
    // Let's try requesting audio, but catching error and trying video only if it fails is safer?
    // However, for simplicity, let's assume standard behavior.
    // Wait, typically one calls getUserMedia with audio: false to avoid feedback loops if recording own tab with mic.
    // But this is system audio.
    // Let's stick to video only first to be safe, or make audio optional?
    // The requirement didn't specify audio.
    // But screen recording usually implies visual.
    // Let's use `audio: false` for now to avoid complexity with system audio permissions.

    // RE-EVALUATING: The previous logic for `getUserMedia` above was just inside the thought process.
    // I should probably use `audio: false` to be safe unless requested.
    // Let's try video only.

    /*
      Actually, let's implement a fallback.
      But `chromeMediaSource` constraints are specific.
    */
  } catch (err) {
      console.error('Error starting recording:', err);
      // Try again without audio if that was the issue?
      // No, let's just do video only for now to ensure reliability.
  }

  // Let's overwrite the above with the actual implementation.
}

async function startRecordingActual(streamId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId
                }
            }
        });

        recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        data = [];

        recorder.ondataavailable = (event) => data.push(event.data);
        recorder.onstop = async () => {
            const blob = new Blob(data, { type: 'video/webm' });
            await saveRecording(blob);
            // Close stream tracks
            stream.getTracks().forEach(t => t.stop());

            // Notify background
            chrome.runtime.sendMessage({ type: 'recording-complete' });
        };

        // If the user stops sharing via the browser UI (the "Stop sharing" bar)
        stream.getVideoTracks()[0].onended = () => {
            if (recorder && recorder.state === 'recording') {
                stopRecording();
            }
        };

        recorder.start();

        // Notify background that we effectively started
        // (Background handles UI updates)
    } catch (error) {
        console.error('Recorder error:', error);
        chrome.runtime.sendMessage({ type: 'recording-error', error: error.message });
    }
}

// Re-assigning to the function used in listener
startRecording = startRecordingActual;

function stopRecording() {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
  }
}
