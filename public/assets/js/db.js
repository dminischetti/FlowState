(function () {
  if (!('indexedDB' in window)) {
    console.warn('IndexedDB not supported; offline cache disabled.');
    window.FlowStateDB = {
      async saveNoteLocally() {},
      async getNoteLocally() { return null; },
      async queueMutation() {},
      async fetchOutbox() { return []; },
      async clearMutation() {},
      async syncOutbox() { return true; }
    };
    return;
  }

  const DB_NAME = 'flowstate-db';
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDb() {
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'slug' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    return dbPromise;
  }

  async function withStore(storeName, mode, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try {
        result = callback(store);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveNoteLocally(note) {
    return withStore('notes', 'readwrite', store => store.put(note));
  }

  async function getNoteLocally(slug) {
    return withStore('notes', 'readonly', store => store.get(slug));
  }

  async function queueMutation(mutation) {
    mutation.status = 'pending';
    return withStore('outbox', 'readwrite', store => store.add(mutation));
  }

  async function fetchOutbox() {
    return withStore('outbox', 'readonly', store => store.getAll());
  }

  async function clearMutation(id) {
    return withStore('outbox', 'readwrite', store => store.delete(id));
  }

  async function syncOutbox() {
    const entries = await fetchOutbox();
    for (const entry of entries) {
      try {
        if (entry.type === 'update') {
          const res = await window.FlowStateApi.updateNote(entry.idValue, entry.payload, entry.etag);
          if (res && res.unauthorized) {
            return 'unauthorized';
          }
          if (!res || !res.ok) {
            console.warn('Skipping outbox entry', res);
            continue;
          }
        } else if (entry.type === 'create') {
          const res = await window.FlowStateApi.createNote(entry.payload);
          if (res && res.unauthorized) {
            return 'unauthorized';
          }
          if (!res || !res.ok) {
            console.warn('Skipping outbox entry', res);
            continue;
          }
        }
        await clearMutation(entry.id);
      } catch (err) {
        console.warn('Sync failed', err);
        return false;
      }
    }
    return true;
  }

  window.FlowStateDB = {
    saveNoteLocally,
    getNoteLocally,
    queueMutation,
    fetchOutbox,
    clearMutation,
    syncOutbox
  };
}());
