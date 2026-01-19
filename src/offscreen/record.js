/* global FFmpegWASM, FFmpegUtil */

let mediaRecorder;
let recordedChunks = [];
let stream;

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target !== 'offscreen') return;

    if (message.type === 'START_RECORDING') {
        startRecording(message.streamId);
    } else if (message.type === 'STOP_RECORDING') {
        stopRecording();
    }
});

async function startRecording(streamId) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') return;

    recordedChunks = [];

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            }
        });

        // Listen for when the stream ends (e.g., tab closed)
        stream.getTracks().forEach(track => {
            track.onended = () => {
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    stopRecording();
                }
            };
        });

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm';

        mediaRecorder = new MediaRecorder(stream, { mimeType });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const webmBlob = new Blob(recordedChunks, { type: 'video/webm' });

            // Stop stream tracks immediately
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }

            await convertAndDownload(webmBlob);
        };

        mediaRecorder.start();
        console.log('[offscreen] MediaRecorder started');
    } catch (error) {
        console.error('[offscreen] Failed to start recording:', error);
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        console.log('[offscreen] MediaRecorder stopped');
    }
}

/**
 * Downloads a blob using a temporary anchor element.
 * This is safe to use in an offscreen document.
 * @param {Blob} blob
 * @param {string} filename
 */
async function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    try {
        // We use chrome.downloads.download because it's more robust in extension contexts
        // even though a.click() might work in offscreen.
        await chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        });
        console.log(`[offscreen] Download initiated: ${filename}`);
    } catch (error) {
        console.warn('[offscreen] chrome.downloads.download failed, falling back to anchor click:', error);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } finally {
        // We shouldn't revoke immediately because the download might still be starting,
        // but since chrome.downloads.download copies the data or starts immediately, it's usually fine after a delay.
        // Actually, for chrome.downloads.download with a blob URL, it's better to keep it alive for a bit.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
}

async function convertAndDownload(webmBlob) {
    console.log('[offscreen] Starting conversion to MP4...');

    try {
        const { FFmpeg } = FFmpegWASM;
        const { fetchFile } = FFmpegUtil;
        const ffmpeg = new FFmpeg();

        // Load FFmpeg
        await ffmpeg.load({
            coreURL: chrome.runtime.getURL('src/libs/ffmpeg/ffmpeg-core.js'),
            wasmURL: chrome.runtime.getURL('src/libs/ffmpeg/ffmpeg-core.wasm'),
        });

        const inputName = 'input.webm';
        const outputName = 'output.mp4';

        await ffmpeg.writeFile(inputName, await fetchFile(webmBlob));

        // Run conversion with reasonable defaults for MP4
        await ffmpeg.exec(['-i', inputName, '-preset', 'ultrafast', outputName]);

        const data = await ffmpeg.readFile(outputName);
        const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        await downloadBlob(mp4Blob, `recording-${timestamp}.mp4`);

        console.log('[offscreen] Conversion and download complete');
    } catch (error) {
        console.error('[offscreen] Conversion failed:', error);
        // Fallback: download webm if mp4 fails
        await downloadBlob(webmBlob, `recording-fallback-${Date.now()}.webm`);
    } finally {
        // Notify background that we are done, so it can close the offscreen document
        chrome.runtime.sendMessage({ type: 'RECORDING_COMPLETE' });
    }
}
