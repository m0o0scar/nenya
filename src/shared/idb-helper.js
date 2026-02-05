
/**
 * @fileoverview IndexedDB helper for storing screen recordings.
 */

const DB_NAME = 'NenyaRecordingDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';
const KEY = 'latest';

/**
 * Open the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      reject(new Error('Failed to open IndexedDB: ' + request.error));
    };

    request.onsuccess = (event) => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Save a recording blob to IndexedDB.
 * @param {Blob} blob - The recording blob.
 * @returns {Promise<void>}
 */
export async function saveRecording(blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to save recording'));
  });
}

/**
 * Get the latest recording blob from IndexedDB.
 * @returns {Promise<Blob | null>}
 */
export async function getRecording() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('Failed to get recording'));
  });
}
