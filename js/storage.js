/**
 * Persistence. The photo itself lives in IndexedDB as a Blob; grid settings,
 * the selected square and the exact pan/zoom of both views live in
 * localStorage. Together they mean you can close the app mid-painting and come
 * back to the same square at the same zoom.
 */

const DB_NAME = 'image-graph';
const DB_VERSION = 1;
const STORE = 'photos';
const CURRENT_KEY = 'current';
const SETTINGS_KEY = 'image-graph:settings';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.onerror = () => reject(t.error);
        t.oncomplete = () => resolve(req?.result);
      }),
  );
}

export async function savePhoto(blob, name) {
  try {
    await tx('readwrite', (store) =>
      store.put({ blob, name, savedAt: Date.now() }, CURRENT_KEY),
    );
    return true;
  } catch (err) {
    console.warn('Could not store the photo for next time:', err);
    return false;
  }
}

export async function loadPhoto() {
  try {
    const rec = await tx('readonly', (store) => store.get(CURRENT_KEY));
    return rec?.blob ? rec : null;
  } catch (err) {
    console.warn('Could not read the stored photo:', err);
    return null;
  }
}

export async function clearPhoto() {
  try {
    await tx('readwrite', (store) => store.delete(CURRENT_KEY));
  } catch {
    /* nothing worth doing if the delete fails */
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let saveTimer = null;
export function saveSettings(settings) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* private mode / quota — the app still works, it just forgets */
    }
  }, 200);
}
