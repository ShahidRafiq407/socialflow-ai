"use client";

const DB_NAME = "socialflow_media_db";
const STORE_NAME = "custom_media";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveMediaToIndexedDB(key: string, url: string, type: "image" | "video"): Promise<void> {
  try {
    // Don't persist blob: or large data: URLs — they break on refresh
    if (url.startsWith("blob:") || (url.startsWith("data:") && url.length > 500)) return;
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, url, type, updatedAt: Date.now() });
  } catch (err) {
    console.warn("[IndexedDB] Failed to save media:", err);
  }
}

export async function saveAllMediaToIndexedDB(mediaDict: Record<string, { url: string; type: "image" | "video" }>): Promise<void> {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const [key, item] of Object.entries(mediaDict)) {
      // Only persist clean URLs — blob: and large data: URLs break on refresh
      if (item?.url && !item.url.startsWith("blob:") && !(item.url.startsWith("data:") && item.url.length > 500)) {
        store.put({ key, url: item.url, type: item.type, updatedAt: Date.now() });
      }
    }
  } catch (err) {
    console.warn("[IndexedDB] Failed to save all media:", err);
  }
}

export async function loadAllMediaFromIndexedDB(): Promise<Record<string, { url: string; type: "image" | "video" }>> {
  try {
    const db = await openDB();
    if (!db) return {};
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        const result: Record<string, { url: string; type: "image" | "video" }> = {};
        for (const item of items) {
          if (item.key && item.url) {
            result[item.key] = { url: item.url, type: item.type };
          }
        }
        resolve(result);
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

export async function removeMediaFromIndexedDB(key: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
  } catch {}
}

export async function clearAllMediaFromIndexedDB(): Promise<void> {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch {}
}
