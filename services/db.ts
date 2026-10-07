import { Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, MindMap, CalendarEvent, DailyMapperEntry, DailyMapperTemplate, Application, IrisConversation, LearningResource, LearningFolder } from '../types';

const DB_NAME = 'ClearMindDB';
const DB_VERSION = 11; // v11: sections, comments, completions, activity, preferences, filters + sync outbox/meta

// Store names + the canonical store->collection mapping are the single source of
// truth in @clearmind/shared, imported by both web and mobile. They are
// re-exported here so existing web imports (`from './db'` / `'../services/db'`)
// keep working with zero edits. (See DECISIONS.md.)
export {
  STORES,
  getFirestoreCollectionName,
  getLocalStoreName,
  getAllFirestoreCollections,
  getSyncableStores,
} from '@clearmind/shared/data/collections';

import {
  STORES,
  getFirestoreCollectionName,
} from '@clearmind/shared/data/collections';

export const SYNC_OUTBOX = '_outbox';
export const SYNC_META = '_meta';

/**
 * Writes go through the SyncEngine once it is registered (field clocks, outbox,
 * delta sync — see services/syncEngine.ts). Until then (e.g. before sign-in),
 * writes are local only and get reconciled when sync starts.
 */
type Writer = { put: (store: string, item: any) => Promise<void>; remove: (store: string, id: string) => Promise<void> };
let writer: Writer | null = null;
export const setSyncWriter = (w: Writer | null) => { writer = w; };

class DatabaseService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private _open(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, DB_VERSION);

          request.onerror = (event) => reject((event.target as any).error);

          request.onsuccess = (event) => {
              resolve((event.target as IDBOpenDBRequest).result);
          };

          request.onupgradeneeded = (event) => {
              const db = (event.target as IDBOpenDBRequest).result;

              // Helper to create store if not exists
              const createStore = (name: string, keyPath: string = 'id') => {
                if (!db.objectStoreNames.contains(name)) {
                  db.createObjectStore(name, { keyPath });
                }
              };

              createStore(STORES.PROJECTS);
              createStore(STORES.TASKS);
              createStore(STORES.NOTES);
              createStore(STORES.HABITS);
              createStore(STORES.GOALS);
              createStore(STORES.MILESTONES);
              createStore(STORES.LOGS);
              createStore(STORES.PROFILE);
              createStore(STORES.RANTS);
              createStore(STORES.MINDMAPS);
              createStore(STORES.EVENTS);
              createStore(STORES.DAILY_MAPPER);
              createStore(STORES.DAILY_MAPPER_TEMPLATES);
              createStore(STORES.APPLICATIONS);
              createStore(STORES.IRIS_CONVERSATIONS);
              createStore(STORES.LEARNING_RESOURCES);
              createStore(STORES.LEARNING_FOLDERS);
              createStore(STORES.LABELS);
              createStore(STORES.SECTIONS);
              createStore(STORES.COMMENTS);
              createStore(STORES.COMPLETIONS);
              createStore(STORES.ACTIVITY);
              createStore(STORES.PREFERENCES);
              createStore(STORES.FILTERS);
              // Local-only sync bookkeeping (never synced).
              createStore(SYNC_OUTBOX, 'key');
              createStore(SYNC_META, 'key');

              // No seed data - Clean slate for real users
          };
      });
  }

  getDB(): Promise<IDBDatabase> {
      if (!this.dbPromise) {
          this.dbPromise = this._open();
      }
      return this.dbPromise;
  }

  async getAll<T>(storeName: string): Promise<T[]> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly');
          const store = transaction.objectStore(storeName);
          const request = store.getAll();
          request.onsuccess = () => {
            // Filter out soft-deleted items
            const items = request.result.filter((item: any) => !item.deleted);
            resolve(items);
          };
          request.onerror = () => reject(request.error);
      });
  }

  async get<T>(storeName: string, id: string): Promise<T | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
  }

  // Use the centralized mapping for Firestore collection names
  private getFirestoreStoreName(storeName: string): string {
    return getFirestoreCollectionName(storeName);
  }

  // Put item to local IndexedDB only (no cloud sync) - used for batch sync operations
  async putLocalOnly<T extends { id: string }>(storeName: string, item: T): Promise<void> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.put(item);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
      });
  }

  // Batch put multiple items to local IndexedDB (no cloud sync) - optimized for sync
  async putBatchLocalOnly<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
      if (items.length === 0) return;
      
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          
          let completed = 0;
          let hasError = false;
          
          for (const item of items) {
              const request = store.put(item);
              request.onsuccess = () => {
                  completed++;
                  if (completed === items.length && !hasError) {
                      resolve();
                  }
              };
              request.onerror = () => {
                  if (!hasError) {
                      hasError = true;
                      reject(request.error);
                  }
              };
          }
          
          // Handle empty items case
          if (items.length === 0) resolve();
      });
  }

  /** Create/update a record. Routed through the SyncEngine (field-level sync). */
  async put<T extends { id: string }>(storeName: string, item: T): Promise<void> {
      if (writer && storeName !== STORES.PROFILE) return writer.put(storeName, item);
      return this.putLocalOnly(storeName, { ...item, updatedAt: new Date().toISOString() });
  }

  /** Soft delete (tombstone) so every client — including stale offline ones — sees the delete. */
  async delete(storeName: string, id: string): Promise<void> {
      if (writer && storeName !== STORES.PROFILE) return writer.remove(storeName, id);
      const existing = await this.get<any>(storeName, id);
      const now = new Date().toISOString();
      return this.putLocalOnly(storeName, { ...(existing ?? { id }), id, deleted: true, deletedAt: now, updatedAt: now });
  }

  // ---- sync bookkeeping (outbox + cursors) ----
  async allRaw<T>(storeName: string): Promise<T[]> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result as T[]);
          req.onerror = () => reject(req.error);
      });
  }
  async deleteKeys(storeName: string, keys: string[]): Promise<void> {
      if (!keys.length) return;
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const st = tx.objectStore(storeName);
          for (const k of keys) st.delete(k);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
      });
  }
  /** Remove every row from every store (account switch). */
  async wipeAll(): Promise<void> {
      const db = await this.getDB();
      const names = Array.from(db.objectStoreNames);
      return new Promise((resolve, reject) => {
          const tx = db.transaction(names, 'readwrite');
          for (const n of names) tx.objectStore(n).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
      });
  }

  // Hard delete - completely removes the item (use for cleanup)
  /**
   * Local-only removal of an old tombstone. Cloud tombstones are kept so a
   * long-offline device can never resurrect a deleted record.
   */
  async hardDelete(storeName: string, id: string): Promise<void> {
      return this.deleteKeys(storeName, [id]);
  }

  // Get all items including soft-deleted ones (for sync purposes)
  async getAllIncludingDeleted<T>(storeName: string): Promise<T[]> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly');
          const store = transaction.objectStore(storeName);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });
  }

  // Cleanup old soft-deleted items (older than 30 days)
  async cleanupDeletedItems(storeName: string): Promise<void> {
      const db = await this.getDB();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const allItems = await this.getAllIncludingDeleted<any>(storeName);
      const itemsToRemove = allItems.filter(item => 
        item.deleted && item.deletedAt && new Date(item.deletedAt) < thirtyDaysAgo
      );
      
      for (const item of itemsToRemove) {
        await this.hardDelete(storeName, item.id);
      }
  }
}

export const dbService = new DatabaseService();