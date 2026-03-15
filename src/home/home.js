(() => {
  const HOME_BACKGROUND_URL = 'https://unsplash.it/2560/1440';
  const BACKGROUND_DATA_URL_KEY = 'nenya.home.backgroundDataUrl';
  const BACKGROUND_FETCHED_AT_KEY = 'nenya.home.backgroundFetchedAt';
  const ZEN_MODE_KEY = 'nenya.home.zenMode';
  const WALLPAPER_STYLE_KEY = '--home-wallpaper-image';
  const rootElement = document.documentElement;

  /** @type {HTMLButtonElement | null} */
  let changeBackgroundButton = null;
  /** @type {HTMLButtonElement | null} */
  let toggleZenModeButton = null;
  /** @type {number | null} */
  let statusTimeoutId = null;
  let isFetchingBackground = false;

  /**
   * Read a local storage string value.
   * @param {string} key
   * @returns {string | null}
   */
  function readLocalStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      console.warn('[home] Failed to read localStorage key.', key, error);
      return null;
    }
  }

  /**
   * Apply the wallpaper image to the root element.
   * @param {string} dataUrl
   * @returns {void}
   */
  function applyBackground(dataUrl) {
    rootElement.style.setProperty(WALLPAPER_STYLE_KEY, `url("${dataUrl}")`);
    rootElement.dataset.homeHasWallpaper = 'true';
  }

  /**
   * Apply zen mode state to the document and controls.
   * @param {boolean} enabled
   * @returns {void}
   */
  function applyZenMode(enabled) {
    rootElement.dataset.homeZenMode = enabled ? 'true' : 'false';

    if (!toggleZenModeButton) {
      return;
    }

    toggleZenModeButton.textContent = enabled ? 'Show dashboard' : 'Zen mode';
    toggleZenModeButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  /**
   * Show a transient status message using the shared status element.
   * @param {string} text
   * @param {'success' | 'error' | 'info'} tone
   * @param {number} delay
   * @returns {void}
   */
  function showStatus(text, tone, delay = 3000) {
    const statusMessage = /** @type {HTMLDivElement | null} */ (
      document.getElementById('statusMessage')
    );
    if (!statusMessage) {
      return;
    }

    statusMessage.textContent = text;
    statusMessage.classList.remove(
      'opacity-0',
      'text-success',
      'text-error',
      'text-base-content/80',
      'text-base-content/85',
    );

    if (tone === 'success') {
      statusMessage.classList.add('text-success');
    } else if (tone === 'error') {
      statusMessage.classList.add('text-error');
    } else {
      statusMessage.classList.add('text-base-content/85');
    }

    if (statusTimeoutId !== null) {
      window.clearTimeout(statusTimeoutId);
    }

    statusTimeoutId = window.setTimeout(() => {
      statusMessage.classList.add('opacity-0');
      statusTimeoutId = null;
    }, delay);
  }

  /**
   * Update the loading state for the refresh button.
   * @param {boolean} isLoading
   * @returns {void}
   */
  function setChangeButtonLoadingState(isLoading) {
    if (!changeBackgroundButton) {
      return;
    }

    changeBackgroundButton.disabled = isLoading;
    changeBackgroundButton.textContent = isLoading ? 'Loading...' : 'Change image';
  }

  /**
   * Convert a Blob to a data URL string.
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Expected a string data URL result.'));
      };
      reader.onerror = () => {
        reject(reader.error || new Error('Failed to read image blob.'));
      };
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Persist a freshly fetched wallpaper without discarding the previous cache on failure.
   * @param {string} dataUrl
   * @param {string} fetchedAt
   * @returns {boolean}
   */
  function persistBackgroundCache(dataUrl, fetchedAt) {
    const previousDataUrl = readLocalStorage(BACKGROUND_DATA_URL_KEY);
    const previousFetchedAt = readLocalStorage(BACKGROUND_FETCHED_AT_KEY);

    try {
      window.localStorage.setItem(BACKGROUND_DATA_URL_KEY, dataUrl);
      window.localStorage.setItem(BACKGROUND_FETCHED_AT_KEY, fetchedAt);
      return true;
    } catch (error) {
      console.warn('[home] Failed to persist cached wallpaper.', error);

      try {
        if (typeof previousDataUrl === 'string') {
          window.localStorage.setItem(BACKGROUND_DATA_URL_KEY, previousDataUrl);
        } else {
          window.localStorage.removeItem(BACKGROUND_DATA_URL_KEY);
        }

        if (typeof previousFetchedAt === 'string') {
          window.localStorage.setItem(BACKGROUND_FETCHED_AT_KEY, previousFetchedAt);
        } else {
          window.localStorage.removeItem(BACKGROUND_FETCHED_AT_KEY);
        }
      } catch (restoreError) {
        console.warn('[home] Failed to restore previous cached wallpaper.', restoreError);
      }

      return false;
    }
  }

  /**
   * Fetch, cache, and apply a new random background image.
   * @returns {Promise<void>}
   */
  async function refreshBackgroundImage() {
    if (isFetchingBackground) {
      return;
    }

    isFetchingBackground = true;
    setChangeButtonLoadingState(true);

    try {
      const response = await fetch(HOME_BACKGROUND_URL, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Unexpected response status ${response.status}.`);
      }

      const imageBlob = await response.blob();
      if (!imageBlob.type.startsWith('image/')) {
        throw new Error(`Unexpected content type ${imageBlob.type || 'unknown'}.`);
      }

      const backgroundDataUrl = await blobToDataUrl(imageBlob);
      const fetchedAt = new Date().toISOString();
      const cacheSaved = persistBackgroundCache(backgroundDataUrl, fetchedAt);
      if (!cacheSaved) {
        showStatus('Unable to cache the new background locally.', 'error', 3500);
        return;
      }

      applyBackground(backgroundDataUrl);
      showStatus('Background image updated.', 'success', 2500);
    } catch (error) {
      console.error('[home] Failed to refresh background image.', error);
      showStatus('Unable to refresh the background image.', 'error', 3500);
    } finally {
      isFetchingBackground = false;
      setChangeButtonLoadingState(false);
    }
  }

  /**
   * Toggle zen mode and persist the preference.
   * @returns {void}
   */
  function handleZenModeToggle() {
    const nextValue = rootElement.dataset.homeZenMode !== 'true';

    try {
      window.localStorage.setItem(ZEN_MODE_KEY, nextValue ? 'true' : 'false');
      applyZenMode(nextValue);
    } catch (error) {
      console.warn('[home] Failed to persist zen mode.', error);
      showStatus('Unable to save zen mode preference.', 'error', 3500);
    }
  }

  /**
   * Initialize cached background and zen mode before the page renders.
   * @returns {void}
   */
  function applyCachedState() {
    const cachedBackground = readLocalStorage(BACKGROUND_DATA_URL_KEY);
    if (cachedBackground) {
      applyBackground(cachedBackground);
    }

    applyZenMode(readLocalStorage(ZEN_MODE_KEY) === 'true');
  }

  /**
   * Attach DOM event listeners and trigger the first background fetch when needed.
   * @returns {void}
   */
  function initializeHomePage() {
    changeBackgroundButton = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('changeBackgroundButton')
    );
    toggleZenModeButton = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('toggleZenModeButton')
    );

    applyZenMode(rootElement.dataset.homeZenMode === 'true');

    changeBackgroundButton?.addEventListener('click', () => {
      void refreshBackgroundImage();
    });
    toggleZenModeButton?.addEventListener('click', handleZenModeToggle);

    if (!readLocalStorage(BACKGROUND_DATA_URL_KEY)) {
      void refreshBackgroundImage();
    }
  }

  applyCachedState();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHomePage, {
      once: true,
    });
  } else {
    initializeHomePage();
  }
})();
