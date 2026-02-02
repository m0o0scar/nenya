
/**
 * Handle Picture-in-Picture mode for the largest video in the specified tab.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export async function handlePictureInPicture(tabId) {
  try {
    // Inject script to find largest video and trigger PiP
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        // Find all video elements
        const videos = Array.from(document.querySelectorAll('video'));

        if (videos.length === 0) {
          return {
            success: false,
            error: 'No video elements found on this page.',
          };
        }

        // Find the largest video by area (width * height)
        let largestVideo = null;
        let largestArea = 0;

        for (const video of videos) {
          // Get video dimensions, prefer actual video dimensions over display size
          const width = video.videoWidth || video.clientWidth || 0;
          const height = video.videoHeight || video.clientHeight || 0;
          const area = width * height;

          if (area > largestArea) {
            largestArea = area;
            largestVideo = video;
          }
        }

        if (!largestVideo) {
          return { success: false, error: 'No valid video element found.' };
        }

        // Set up event listeners for PiP if not already set up
        if (!largestVideo.hasAttribute('data-pip-listeners-set')) {
          largestVideo.setAttribute('data-pip-listeners-set', 'true');

          largestVideo.addEventListener('leavepictureinpicture', () => {
            chrome.storage.local.remove('pipTabId');
            if (!largestVideo.paused) {
              largestVideo.pause();
            }
          });
        }

        try {
          // Check if Picture-in-Picture is already active
          if (document.pictureInPictureElement) {
            // Exit PiP if same video
            if (document.pictureInPictureElement === largestVideo) {
              await document.exitPictureInPicture();
              return { success: true, action: 'exited' };
            }
            // Exit current PiP first, then enter new one
            await document.exitPictureInPicture();
            await largestVideo.requestPictureInPicture();
            return { success: true, action: 'entered' };
          }

          // Request Picture-in-Picture
          await largestVideo.requestPictureInPicture();
          return { success: true, action: 'entered' };
        } catch (error) {
          return { success: false, error: error.message || String(error) };
        }
      },
    });

    const result = results?.[0]?.result;
    if (result && result.success) {
      // If PiP was entered successfully, store the tab ID
      if (result.action === 'entered') {
        await chrome.storage.local.set({ pipTabId: tabId });
      } else if (result.action === 'exited') {
        // If PiP was exited, remove the stored tab ID
        await chrome.storage.local.remove('pipTabId');
      }
    } else {
      console.warn('[background] PiP failed:', result?.error);
    }
  } catch (error) {
    console.error('[background] Error triggering Picture-in-Picture:', error);
  }
}
