
document.addEventListener('DOMContentLoaded', async () => {
    const video = document.getElementById('previewVideo');
    const downloadLink = document.getElementById('downloadLink');

    try {
        const blob = await getLatestRecording();
        if (blob) {
            const url = URL.createObjectURL(blob);
            video.src = url;

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `recording-${timestamp}.mp4`;

            downloadLink.href = url;
            downloadLink.download = filename;

            // Clean up when page is closed?
            // The blob URL is tied to document, so it's auto-revoked on unload.
        } else {
            console.error('No recording found in IndexedDB');
            // alert('No recording found. Please try recording again.');
        }
    } catch (err) {
        console.error('Failed to load recording:', err);
    }
});

function getLatestRecording() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('NenyaRecordings', 1);
        request.onsuccess = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('recordings')) {
                resolve(null);
                return;
            }
            const tx = db.transaction('recordings', 'readonly');
            const store = tx.objectStore('recordings');
            const getRequest = store.get('latest');
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        };
        request.onerror = () => reject(request.error);
    });
}
