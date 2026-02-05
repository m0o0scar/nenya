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

        // Ensure stream is active
        if (!stream.active) {
            throw new Error('Stream is not active immediately after creation');
        }

        // Add a small delay to ensure stream is stable
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!stream.active) {
             throw new Error('Stream became inactive during initialization');
        }

        // Determine supported mime type
        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm;codecs=vp8';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = undefined; // Let browser choose default
                }
            }
        }

        const options = mimeType ? { mimeType } : {};
        recorder = new MediaRecorder(stream, options);
        data = [];

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                data.push(event.data);
            }
        };

        recorder.onstop = async () => {
            try {
                const type = mimeType || (data[0] ? data[0].type : 'video/webm');
                const blob = new Blob(data, { type });
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

        recorder.start(1000); // Collect data every second to avoid huge chunks

    } catch (error) {
        console.error('Recorder error:', error);
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
