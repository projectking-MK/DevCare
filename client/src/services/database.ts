/**
 * GuardianLink Local IndexedDB Storage Layer (Parent Device)
 * Stores local recordings, session history, and device metadata.
 * 
 * In strict compliance with architectural specifications:
 * - NO video blobs or recordings are ever sent to the server.
 * - All recordings and sessions persist locally on the parent device.
 */

export interface LocalRecording {
  id: string;
  sessionId: string;
  deviceId: string;
  deviceName: string;
  createdAt: string; // ISO string
  duration: number;  // seconds
  size: number;      // bytes
  mimeType: string;
  blob: Blob;
}

export interface LocalSessionHistory {
  id: string;
  deviceId: string;
  deviceName: string;
  startedAt: string;
  endedAt: string;
  duration: number; // seconds
  cameraUsed: boolean;
  microphoneUsed: boolean;
  status: 'Completed' | 'Stopped by Child' | 'Stopped by Parent' | 'Connection Lost';
}

export interface LocalDeviceMeta {
  deviceId: string;
  deviceName: string;
  pairedAt: string;
  lastConnectedAt?: string;
}

const DB_NAME = 'GuardianLinkDB';
const DB_VERSION = 1;

class GuardianDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this browser environment.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Recordings store
        if (!db.objectStoreNames.contains('recordings')) {
          const recStore = db.createObjectStore('recordings', { keyPath: 'id' });
          recStore.createIndex('createdAt', 'createdAt', { unique: false });
          recStore.createIndex('deviceId', 'deviceId', { unique: false });
          recStore.createIndex('sessionId', 'sessionId', { unique: false });
        }

        // 2. Devices store
        if (!db.objectStoreNames.contains('devices')) {
          db.createObjectStore('devices', { keyPath: 'deviceId' });
        }

        // 3. Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sesStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sesStore.createIndex('startedAt', 'startedAt', { unique: false });
          sesStore.createIndex('deviceId', 'deviceId', { unique: false });
        }

        // 4. Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open GuardianLink IndexedDB.'));
      };
    });

    return this.dbPromise;
  }

  // --- Recordings Operations ---

  async saveRecording(recording: LocalRecording): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recordings', 'readwrite');
      const store = tx.objectStore('recordings');
      const req = store.put(recording);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getRecording(id: string): Promise<LocalRecording | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recordings', 'readonly');
      const store = tx.objectStore('recordings');
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllRecordings(): Promise<LocalRecording[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recordings', 'readonly');
      const store = tx.objectStore('recordings');
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result as LocalRecording[]) || [];
        // Sort descending by creation date
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteRecording(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recordings', 'readwrite');
      const store = tx.objectStore('recordings');
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Session History Operations ---

  async saveSession(session: LocalSessionHistory): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      const req = store.put(session);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAllSessions(): Promise<LocalSessionHistory[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result as LocalSessionHistory[]) || [];
        results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // --- Device Metadata Cache Operations ---

  async saveDeviceMeta(device: LocalDeviceMeta): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('devices', 'readwrite');
      const store = tx.objectStore('devices');
      const req = store.put(device);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAllDeviceMetas(): Promise<LocalDeviceMeta[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('devices', 'readonly');
      const store = tx.objectStore('devices');
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as LocalDeviceMeta[]) || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Storage Quota Estimation ---

  async getStorageEstimate(): Promise<{ usedBytes: number; quotaBytes: number; percentage: number; isSupported: boolean }> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usedBytes = estimate.usage || 0;
        const quotaBytes = estimate.quota || 0;
        const percentage = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;
        return { usedBytes, quotaBytes, percentage, isSupported: true };
      } catch {
        // Fall back below
      }
    }
    return { usedBytes: 0, quotaBytes: 0, percentage: 0, isSupported: false };
  }
}

export const guardianDB = new GuardianDatabase();
