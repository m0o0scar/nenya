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
        console.log('[offscreen] Requesting user media for streamId:', streamId);
        // Try to get stream with standard desktop capture constraints
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId
                }
            }
        });

        console.log('[offscreen] Stream obtained:', stream.id, 'active:', stream.active);
        // Ensure stream is active
        if (!stream.active) {
            throw new Error('Stream is not active immediately after creation');
        }

        // Check tracks
        const tracks = stream.getTracks();
        console.log('[offscreen] Stream tracks:', tracks.map(t => ({ kind: t.kind, readyState: t.readyState, enabled: t.enabled })));

        if (tracks.length === 0) {
             throw new Error('Stream has no tracks');
        }

        // Create recorder
        // Use default mimeType to be safe, avoid hardcoded codecs for now to rule out issues
        try {
            recorder = new MediaRecorder(stream);
        } catch (e) {
            // Fallback if default fails (unlikely in Chrome)
            console.warn('[offscreen] Failed to create MediaRecorder with default settings, trying video/webm', e);
            recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        }

        console.log('[offscreen] MediaRecorder created, state:', recorder.state, 'mimeType:', recorder.mimeType);

        data = [];

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                data.push(event.data);
            }
        };

        recorder.onstop = async () => {
            console.log('[offscreen] Recorder stopped');
            try {
                // Use the recorder's actual mimeType if available
                const type = recorder.mimeType || 'video/webm';
                const blob = new Blob(data, { type });
                await saveRecording(blob);
                console.log('[offscreen] Recording saved, size:', blob.size);
            } catch (error) {
                console.error('[offscreen] Failed to save recording:', error);
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
            console.log('[offscreen] Video track ended (user stopped sharing?)');
            if (recorder && recorder.state === 'recording') {
                stopRecording();
            }
        };

        // Start recording
        // Remove timeslice for now to be safe, although 1000ms is standard
        console.log('[offscreen] Starting recorder...');
        recorder.start(1000);
        console.log('[offscreen] Recorder started');

    } catch (error) {
        console.error('[offscreen] Recorder error:', error);
        chrome.runtime.sendMessage({
            type: 'recording-error',
            error: `${error.name}: ${error.message}`
        });
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
