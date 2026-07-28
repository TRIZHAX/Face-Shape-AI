// IndexedDB + LocalStorage helpers. All data stays local.
const DB_NAME = 'faceshape-ai';
const DB_VERSION = 1;
const STORES = ['history', 'favorites', 'ratings'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach(s => {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: 'id' });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

export async function put(store, value) {
  const s = await tx(store, 'readwrite');
  return new Promise((res, rej) => {
    const r = s.put(value);
    r.onsuccess = () => res(value);
    r.onerror = () => rej(r.error);
  });
}
export async function del(store, id) {
  const s = await tx(store, 'readwrite');
  return new Promise((res, rej) => {
    const r = s.delete(id);
    r.onsuccess = () => res(true);
    r.onerror = () => rej(r.error);
  });
}
export async function getAll(store) {
  const s = await tx(store, 'readonly');
  return new Promise((res, rej) => {
    const r = s.getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
export async function clearAll() {
  const db = await openDB();
  await Promise.all(STORES.map(store => new Promise((res, rej) => {
    const r = db.transaction(store, 'readwrite').objectStore(store).clear();
    r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  })));
  localStorage.clear();
}

// Prefs via localStorage
const PREF_KEY = 'faceshape-ai:prefs';
export function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}
export function setPrefs(patch) {
  const cur = getPrefs();
  const next = { ...cur, ...patch };
  localStorage.setItem(PREF_KEY, JSON.stringify(next));
  return next;
}

// Ratings shape: { id: hairstyleId, likes, dislikes, avgRating, count, shapes: {shape: score} }
export async function recordRating(hairstyleId, action, faceShape, rating) {
  const store = await tx('ratings', 'readwrite');
  return new Promise((res, rej) => {
    const g = store.get(hairstyleId);
    g.onsuccess = () => {
      const cur = g.result || { id: hairstyleId, likes: 0, dislikes: 0, sum: 0, count: 0, shapes: {} };
      if (action === 'like') cur.likes += 1;
      if (action === 'dislike') cur.dislikes += 1;
      if (typeof rating === 'number') { cur.sum += rating; cur.count += 1; }
      if (faceShape) {
        const s = cur.shapes[faceShape] || { likes: 0, dislikes: 0, sum: 0, count: 0 };
        if (action === 'like') s.likes += 1;
        if (action === 'dislike') s.dislikes += 1;
        if (typeof rating === 'number') { s.sum += rating; s.count += 1; }
        cur.shapes[faceShape] = s;
      }
      const p = store.put(cur);
      p.onsuccess = () => res(cur);
      p.onerror = () => rej(p.error);
    };
    g.onerror = () => rej(g.error);
  });
}
export async function getRating(hairstyleId) {
  const store = await tx('ratings', 'readonly');
  return new Promise((res) => {
    const g = store.get(hairstyleId);
    g.onsuccess = () => res(g.result || null);
    g.onerror = () => res(null);
  });
}
export async function exportAll() {
  const [history, favorites, ratings] = await Promise.all([
    getAll('history'), getAll('favorites'), getAll('ratings')
  ]);
  return { version: 1, exportedAt: Date.now(), prefs: getPrefs(), history, favorites, ratings };
}
export async function importAll(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid file');
  if (payload.prefs) localStorage.setItem(PREF_KEY, JSON.stringify(payload.prefs));
  const putMany = async (name, arr) => { for (const v of (arr||[])) await put(name, v); };
  await putMany('history', payload.history);
  await putMany('favorites', payload.favorites);
  await putMany('ratings', payload.ratings);
}
