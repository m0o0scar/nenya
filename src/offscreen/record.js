// Global FFmpeg from script tags
// window.FFmpegWASM is the UMD export.
const { FFmpeg } = window.FFmpegWASM;
const { fetchFile } = window.FFmpegUtil;

let recorder;
let data = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_RECORDING') {
    startRecording(message.streamId).catch(err => console.error(err));
  } else if (message.type === 'STOP_RECORDING') {
    stopRecording();
  }
});

async function startRecording(streamId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            data.push(event.data);
        }
    };
    recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop());
        await processVideo();
    };
    recorder.start();
  } catch (err) {
    console.error('Offscreen: Start recording failed', err);
  }
}

function stopRecording() {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
  }
}

async function processVideo() {
    try {
        const blob = new Blob(data, { type: 'video/webm' });

        // Initialize FFmpeg
        const ffmpeg = new FFmpeg();

        // Define paths relative to this offscreen file (src/offscreen/)
        // ffmpeg files are in ../libs/ffmpeg/
        const baseURL = '../libs/ffmpeg';

        // Log for debugging
        ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]', message);
        });

        await ffmpeg.load({
            coreURL: `${baseURL}/ffmpeg-core.js`,
            wasmURL: `${baseURL}/ffmpeg-core.wasm`
        });

        // Write file
        await ffmpeg.writeFile('input.webm', await fetchFile(blob));

        // Convert to mp4
        await ffmpeg.exec(['-i', 'input.webm', 'output.mp4']);

        // Read result
        const mp4Data = await ffmpeg.readFile('output.mp4');
        const mp4Blob = new Blob([mp4Data.buffer], { type: 'video/mp4' });

        // Store in IndexedDB
        await storeRecording(mp4Blob);

        // Open preview tab
        await chrome.tabs.create({
            url: 'src/tabs/preview.html'
        });

        // Notify background
        chrome.runtime.sendMessage({ type: 'RECORDING_COMPLETE' });

    } catch (err) {
        console.error('Offscreen: Conversion failed', err);
    }
}

function storeRecording(blob) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('NenyaRecordings', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('recordings')) {
                db.createObjectStore('recordings');
            }
        };
        request.onsuccess = (event) => {
            const db = event.target.result;
            const tx = db.transaction('recordings', 'readwrite');
            const store = tx.objectStore('recordings');
            store.put(blob, 'latest');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
    });
}
