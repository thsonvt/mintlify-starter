/**
 * Highlights Offline Storage
 * IndexedDB-based storage with background sync to Supabase
 */

(function() {
  const DB_NAME = 'highlights-db';
  const DB_VERSION = 1;
  const STORES = {
    highlights: 'highlights',
    syncQueue: 'syncQueue',
    metadata: 'metadata'
  };

  // Configuration
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://thought-leadership-api.thsonvt.workers.dev';

  // State
  let db = null;
  let isOnline = navigator.onLine;
  let syncInProgress = false;
  let syncRetryTimeout = null;

  // Generate temporary ID for offline-created highlights
  function generateTempId() {
    return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Initialize IndexedDB
  function initDB() {
    return new Promise((resolve, reject) => {
      if (db) {
        resolve(db);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // Highlights store - keyed by ID
        if (!database.objectStoreNames.contains(STORES.highlights)) {
          const highlightsStore = database.createObjectStore(STORES.highlights, { keyPath: 'id' });
          highlightsStore.createIndex('article_id', 'article_id', { unique: false });
          highlightsStore.createIndex('user_id', 'user_id', { unique: false });
          highlightsStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Sync queue - operations pending sync
        if (!database.objectStoreNames.contains(STORES.syncQueue)) {
          const syncStore = database.createObjectStore(STORES.syncQueue, { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('type', 'type', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Metadata - last sync time, user info, etc.
        if (!database.objectStoreNames.contains(STORES.metadata)) {
          database.createObjectStore(STORES.metadata, { keyPath: 'key' });
        }
      };
    });
  }

  // Generic store operations
  async function getStore(storeName, mode = 'readonly') {
    const database = await initDB();
    const tx = database.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async function getAllFromStore(storeName) {
    return new Promise(async (resolve, reject) => {
      const store = await getStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getFromStore(storeName, key) {
    return new Promise(async (resolve, reject) => {
      const store = await getStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putInStore(storeName, data) {
    return new Promise(async (resolve, reject) => {
      const store = await getStore(storeName, 'readwrite');
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteFromStore(storeName, key) {
    return new Promise(async (resolve, reject) => {
      const store = await getStore(storeName, 'readwrite');
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get highlights by article ID
  async function getByIndex(storeName, indexName, value) {
    return new Promise(async (resolve, reject) => {
      const store = await getStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ========== PUBLIC API ==========

  // Save a new highlight (local first, then sync)
  async function saveHighlight(highlightData) {
    const tempId = generateTempId();
    const now = new Date().toISOString();

    const highlight = {
      ...highlightData,
      id: tempId,
      created_at: now,
      updated_at: now,
      _pending: true, // Mark as pending sync
      _syncAction: 'create'
    };

    // Save to local store
    await putInStore(STORES.highlights, highlight);

    // Add to sync queue
    await addToSyncQueue({
      type: 'create',
      highlightId: tempId,
      data: highlightData,
      timestamp: Date.now()
    });

    // Trigger sync if online
    if (isOnline) {
      scheduleSync();
    }

    return highlight;
  }

  // Get highlights for an article (from local store)
  async function getHighlights(articleId) {
    const highlights = await getByIndex(STORES.highlights, 'article_id', articleId);
    // Filter out deleted highlights that haven't synced yet
    return highlights.filter(h => h._syncAction !== 'delete');
  }

  // Get all highlights for current user
  async function getAllHighlights() {
    const highlights = await getAllFromStore(STORES.highlights);
    return highlights.filter(h => h._syncAction !== 'delete');
  }

  // Update a highlight
  async function updateHighlight(id, updates) {
    const highlight = await getFromStore(STORES.highlights, id);
    if (!highlight) {
      throw new Error('Highlight not found');
    }

    const updated = {
      ...highlight,
      ...updates,
      updated_at: new Date().toISOString(),
      _pending: true,
      _syncAction: highlight._syncAction === 'create' ? 'create' : 'update'
    };

    await putInStore(STORES.highlights, updated);

    // Only add to sync queue if it's not a pending create
    if (highlight._syncAction !== 'create') {
      await addToSyncQueue({
        type: 'update',
        highlightId: id,
        data: updates,
        timestamp: Date.now()
      });
    }

    if (isOnline) {
      scheduleSync();
    }

    return updated;
  }

  // Delete a highlight
  async function deleteHighlight(id) {
    const highlight = await getFromStore(STORES.highlights, id);
    if (!highlight) return;

    // If it was created offline and never synced, just remove it
    if (highlight._syncAction === 'create' && highlight.id.startsWith('temp_')) {
      await deleteFromStore(STORES.highlights, id);
      // Remove from sync queue too
      await removeFromSyncQueue('create', id);
      return;
    }

    // Mark for deletion (will be removed after sync)
    await putInStore(STORES.highlights, {
      ...highlight,
      _pending: true,
      _syncAction: 'delete'
    });

    await addToSyncQueue({
      type: 'delete',
      highlightId: id,
      timestamp: Date.now()
    });

    if (isOnline) {
      scheduleSync();
    }
  }

  // ========== SYNC QUEUE ==========

  async function addToSyncQueue(operation) {
    await putInStore(STORES.syncQueue, operation);
  }

  async function removeFromSyncQueue(type, highlightId) {
    const queue = await getAllFromStore(STORES.syncQueue);
    for (const item of queue) {
      if (item.type === type && item.highlightId === highlightId) {
        await deleteFromStore(STORES.syncQueue, item.id);
      }
    }
  }

  async function clearSyncQueue() {
    const database = await initDB();
    const tx = database.transaction(STORES.syncQueue, 'readwrite');
    const store = tx.objectStore(STORES.syncQueue);
    store.clear();
  }

  // ========== SYNC LOGIC ==========

  let syncScheduled = false;

  function scheduleSync(delay = 1000) {
    if (syncScheduled || syncInProgress) return;
    syncScheduled = true;
    setTimeout(() => {
      syncScheduled = false;
      sync();
    }, delay);
  }

  async function sync() {
    if (syncInProgress || !isOnline) return;

    const token = await window.highlightsAuth?.getToken();
    if (!token) return;

    syncInProgress = true;

    try {
      const queue = await getAllFromStore(STORES.syncQueue);

      // Sort by timestamp to process in order
      queue.sort((a, b) => a.timestamp - b.timestamp);

      for (const operation of queue) {
        try {
          await processOperation(operation, token);
          await deleteFromStore(STORES.syncQueue, operation.id);
        } catch (err) {
          console.error('Sync operation failed:', operation, err);
          // If it's a network error, stop syncing
          if (!navigator.onLine) {
            break;
          }
          // For other errors (like 404 for already deleted), remove from queue
          if (err.status === 404 || err.status === 409) {
            await deleteFromStore(STORES.syncQueue, operation.id);
          }
        }
      }

      // After processing queue, dispatch event
      window.dispatchEvent(new CustomEvent('highlights-synced'));

    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      syncInProgress = false;
    }
  }

  async function processOperation(operation, token) {
    const { type, highlightId, data } = operation;

    switch (type) {
      case 'create': {
        const response = await fetch(`${API_URL}/api/highlights`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = new Error('Failed to create highlight');
          error.status = response.status;
          throw error;
        }

        const { highlight: serverHighlight } = await response.json();

        // Replace temp highlight with server version
        await deleteFromStore(STORES.highlights, highlightId);
        await putInStore(STORES.highlights, {
          ...serverHighlight,
          _pending: false,
          _syncAction: null
        });

        // Dispatch event for ID mapping
        window.dispatchEvent(new CustomEvent('highlight-id-mapped', {
          detail: { tempId: highlightId, serverId: serverHighlight.id }
        }));
        break;
      }

      case 'update': {
        const response = await fetch(`${API_URL}/api/highlights/${highlightId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = new Error('Failed to update highlight');
          error.status = response.status;
          throw error;
        }

        // Mark as synced
        const highlight = await getFromStore(STORES.highlights, highlightId);
        if (highlight) {
          await putInStore(STORES.highlights, {
            ...highlight,
            _pending: false,
            _syncAction: null
          });
        }
        break;
      }

      case 'delete': {
        const response = await fetch(`${API_URL}/api/highlights/${highlightId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        // 404 is okay - already deleted
        if (!response.ok && response.status !== 404) {
          const error = new Error('Failed to delete highlight');
          error.status = response.status;
          throw error;
        }

        // Remove from local store
        await deleteFromStore(STORES.highlights, highlightId);
        break;
      }
    }
  }

  // Full sync from server (pull all data)
  async function fullSync() {
    const token = await window.highlightsAuth?.getToken();
    if (!token || !isOnline) return;

    try {
      // First, process any pending local changes
      await sync();

      // Then fetch all highlights from server
      const response = await fetch(`${API_URL}/api/highlights`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch highlights');
      }

      const { highlights: serverHighlights } = await response.json();

      // Get local highlights
      const localHighlights = await getAllFromStore(STORES.highlights);
      const localIds = new Set(localHighlights.map(h => h.id));
      const serverIds = new Set(serverHighlights.map(h => h.id));

      // Add/update server highlights locally
      for (const serverH of serverHighlights) {
        const localH = localHighlights.find(h => h.id === serverH.id);

        // Skip if local version has pending changes
        if (localH && localH._pending) {
          continue;
        }

        await putInStore(STORES.highlights, {
          ...serverH,
          _pending: false,
          _syncAction: null
        });
      }

      // Remove local highlights that don't exist on server (unless pending)
      for (const localH of localHighlights) {
        if (!serverIds.has(localH.id) && !localH._pending && !localH.id.startsWith('temp_')) {
          await deleteFromStore(STORES.highlights, localH.id);
        }
      }

      // Update last sync time
      await putInStore(STORES.metadata, {
        key: 'lastFullSync',
        value: Date.now()
      });

      window.dispatchEvent(new CustomEvent('highlights-full-synced'));

    } catch (err) {
      console.error('Full sync error:', err);
    }
  }

  // Clear all local data (for logout)
  async function clearAll() {
    const database = await initDB();

    const tx = database.transaction([STORES.highlights, STORES.syncQueue, STORES.metadata], 'readwrite');
    tx.objectStore(STORES.highlights).clear();
    tx.objectStore(STORES.syncQueue).clear();
    tx.objectStore(STORES.metadata).clear();
  }

  // Get pending sync count
  async function getPendingSyncCount() {
    const queue = await getAllFromStore(STORES.syncQueue);
    return queue.length;
  }

  // Check if there are pending changes
  async function hasPendingChanges() {
    const count = await getPendingSyncCount();
    return count > 0;
  }

  // ========== ONLINE/OFFLINE HANDLING ==========

  function setupOnlineListeners() {
    window.addEventListener('online', () => {
      isOnline = true;
      window.dispatchEvent(new CustomEvent('highlights-online'));
      // Sync when coming back online
      scheduleSync(500);
    });

    window.addEventListener('offline', () => {
      isOnline = false;
      window.dispatchEvent(new CustomEvent('highlights-offline'));
    });
  }

  // ========== INITIALIZATION ==========

  async function init() {
    await initDB();
    setupOnlineListeners();

    // Listen for auth changes
    window.addEventListener('highlights-auth-change', async (e) => {
      if (e.detail.user) {
        // User logged in - do full sync
        await fullSync();
      } else {
        // User logged out - clear local data
        await clearAll();
      }
    });

    // Initial sync if user is already logged in
    if (window.highlightsAuth?.isAuthenticated() && isOnline) {
      setTimeout(fullSync, 1000);
    }
  }

  // ========== PUBLIC API ==========

  window.highlightsStorage = {
    init,
    saveHighlight,
    getHighlights,
    getAllHighlights,
    updateHighlight,
    deleteHighlight,
    sync,
    fullSync,
    clearAll,
    isOnline: () => isOnline,
    hasPendingChanges,
    getPendingSyncCount,
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
