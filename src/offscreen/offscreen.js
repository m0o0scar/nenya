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

async function startRecordingActual(streamId) {
    if (recorder && recorder.state === 'recording') {
        console.warn('Recorder is already recording.');
        return;
    }

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

        if (!stream.active) {
            throw new Error('Stream is not active');
        }

        const mimeType = 'video/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
             throw new Error(`${mimeType} is not supported`);
        }

        recorder = new MediaRecorder(stream, { mimeType });
        data = [];

        recorder.ondataavailable = (event) => data.push(event.data);
        recorder.onstop = async () => {
            try {
                const blob = new Blob(data, { type: mimeType });
                await saveRecording(blob);
            } catch (error) {
                console.error('Failed to save recording:', error);
            } finally {
                // Close stream tracks
                stream.getTracks().forEach(t => t.stop());
                // Notify background
                chrome.runtime.sendMessage({ type: 'recording-complete' });
                recorder = null;
            }
        };

        // If the user stops sharing via the browser UI (the "Stop sharing" bar)
        stream.getVideoTracks()[0].onended = () => {
            if (recorder && recorder.state === 'recording') {
                stopRecording();
            }
        };

        recorder.start();

    } catch (error) {
        console.error('Recorder error:', error);
        chrome.runtime.sendMessage({ type: 'recording-error', error: error.message || error.name });
    }
}

// Re-assigning to the function used in listener
// eslint-disable-next-line no-func-assign
const startRecording = startRecordingActual;

function stopRecording() {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
  }
}
