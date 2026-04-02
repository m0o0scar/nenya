(function () {
  'use strict';

  const MIN_VIDEO_WIDTH = 640;
  const MIN_VIDEO_HEIGHT = 360;

  /**
   * @typedef {Object} StoredVideoState
   * @property {HTMLElement | null} parent
   * @property {ChildNode | null} nextSibling
   * @property {string} style
   * @property {boolean} controls
   */

  /** @type {WeakMap<HTMLVideoElement, StoredVideoState>} */
  const originalVideoData = new WeakMap();

  /**
   * @param {HTMLVideoElement} video
   * @param {number} [timeoutMs=2000]
   * @returns {Promise<void>}
   */
  function waitForVideoMetadata(video, timeoutMs = 2000) {
    if (video.readyState >= 1) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      const onLoaded = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      };
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      }, timeoutMs);
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
    });
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {boolean}
   */
  function isLargeEnough(video) {
    const width = video.videoWidth || video.clientWidth || 0;
    const height = video.videoHeight || video.clientHeight || 0;
    return width >= MIN_VIDEO_WIDTH && height >= MIN_VIDEO_HEIGHT;
  }

  /**
   * @param {HTMLVideoElement} video
   */
  function enterFullscreen(video) {
    if (video.classList.contains('video-fullscreen')) {
      return;
    }

    originalVideoData.set(video, {
      parent: video.parentElement,
      nextSibling: video.nextSibling,
      style: video.getAttribute('style') || '',
      controls: video.controls,
    });

    document.body.appendChild(video);
    video.classList.add('video-fullscreen');
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '100vw';
    video.style.height = '100vh';
    video.style.zIndex = '2147483647';
    video.style.backgroundColor = 'black';
    video.style.objectFit = 'contain';
    video.style.objectPosition = 'center';
    video.style.isolation = 'isolate';
    video.style.transform = 'translateZ(0)';
    video.controls = false;
  }

  /**
   * @param {HTMLVideoElement} video
   */
  function exitFullscreen(video) {
    const originalData = originalVideoData.get(video);
    if (!originalData) {
      return;
    }

    video.classList.remove('video-fullscreen');
    video.removeAttribute('style');
    if (originalData.style) {
      video.setAttribute('style', originalData.style);
    }
    video.controls = originalData.controls;

    if (originalData.parent) {
      if (originalData.nextSibling) {
        originalData.parent.insertBefore(video, originalData.nextSibling);
      } else {
        originalData.parent.appendChild(video);
      }
    }

    originalVideoData.delete(video);
  }

  /**
   * @param {HTMLElement} element
   * @returns {void}
   */
  function ensureRelativePosition(element) {
    const style = window.getComputedStyle(element);
    if (style.position === 'static') {
      element.style.position = 'relative';
    }
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {void}
   */
  function setupPipTracking(video) {
    if (video.hasAttribute('data-pip-tracking')) {
      return;
    }
    video.setAttribute('data-pip-tracking', 'true');

    video.addEventListener('enterpictureinpicture', () => {
      chrome.runtime.sendMessage({ type: 'getCurrentTabId' }, (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        if (response && response.tabId) {
          chrome.storage.local.set({ pipTabId: response.tabId });
        }
      });
    });

    video.addEventListener('leavepictureinpicture', () => {
      chrome.storage.local.remove('pipTabId');
      if (!video.paused) {
        video.pause();
      }
    });
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {void}
   */
  function addControls(video) {
    if (video.hasAttribute('data-video-controller')) {
      return;
    }

    video.setAttribute('data-video-controller', 'true');
    setupPipTracking(video);

    const container = document.createElement('div');
    container.classList.add('video-controller-container');

    const pipButton = document.createElement('button');
    pipButton.type = 'button';
    pipButton.textContent = 'PiP';
    pipButton.classList.add('video-controller-button');
    pipButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (error) {
        console.error('[video-controller] PiP failed:', error);
        chrome.storage.local.remove('pipTabId');
      }
    });

    const fullscreenButton = document.createElement('button');
    fullscreenButton.type = 'button';
    fullscreenButton.textContent = 'Fullscreen';
    fullscreenButton.classList.add('video-controller-button');
    fullscreenButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (video.classList.contains('video-fullscreen')) {
        exitFullscreen(video);
      } else {
        enterFullscreen(video);
      }
    });

    container.appendChild(pipButton);
    container.appendChild(fullscreenButton);

    const parent = video.parentElement;
    if (!parent) {
      return;
    }

    ensureRelativePosition(parent);
    parent.appendChild(container);
  }

  /**
   * @returns {Promise<void>}
   */
  async function processVideos() {
    const videos = Array.from(document.querySelectorAll('video')).filter(
      (element) => element instanceof HTMLVideoElement,
    );

    await Promise.all(videos.map((video) => waitForVideoMetadata(video)));

    videos.forEach((video) => {
      setupPipTracking(video);
      if (isLargeEnough(video)) {
        addControls(video);
      }
    });
  }

  const observer = new MutationObserver(() => {
    void processVideos();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  void processVideos();

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    const fullscreenVideo = document.querySelector('.video-fullscreen');
    if (fullscreenVideo instanceof HTMLVideoElement) {
      exitFullscreen(fullscreenVideo);
      event.stopPropagation();
    }
  });
})();
