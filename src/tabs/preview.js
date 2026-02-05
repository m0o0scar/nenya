import { getRecording } from '../shared/idb-helper.js';

const videoElement = document.getElementById('previewVideo');
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');
const downloadButton = document.getElementById('downloadButton');

async function loadRecording() {
  try {
    const blob = await getRecording();
    if (!blob) {
      throw new Error('No recording found');
    }

    const url = URL.createObjectURL(blob);
    videoElement.src = url;
    videoElement.style.display = 'block';
    loadingMessage.style.display = 'none';
    downloadButton.disabled = false;

    downloadButton.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `screen-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

  } catch (error) {
    console.error('Failed to load recording:', error);
    loadingMessage.style.display = 'none';
    errorMessage.style.display = 'block';
    errorMessage.textContent = error.message || 'Failed to load recording';
  }
}

loadRecording();
