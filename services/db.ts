import { Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, MindMap, CalendarEvent, DailyMapperEntry, DailyMapperTemplate, Application, IrisConversation, LearningResource, LearningFolder } from '../types';
import { firebaseService, isFirebaseConfigured } from './firebase';

const DB_NAME = 'ClearMindDB';
const DB_VERSION = 9; // Incremented version to add daily mapper templates store

export const STORES = {
  PROJECTS: 'projects',
  TASKS: 'tasks',
  NOTES: 'notes',
  HABITS: 'habits',
  GOALS: 'goals',
  MILESTONES: 'milestones',
  LOGS: 'logs',
  PROFILE: 'profile',
  RANTS: 'rants',
  MINDMAPS: 'mindmaps',
  EVENTS: 'events',
  DAILY_MAPPER: 'dailymapper',
  DAILY_MAPPER_TEMPLATES: 'dailymappertemplates',
  APPLICATIONS: 'applications',
  IRIS_CONVERSATIONS: 'iris_conversations',
  LEARNING_RESOURCES: 'learningresources',
  LEARNING_FOLDERS: 'learningfolders',
};

// Canonical mapping: IndexedDB store name -> Firestore collection name
// This is the SINGLE SOURCE OF TRUTH for all sync operations
const STORE_TO_FIRESTORE: Record<string, string> = {
  [STORES.TASKS]: 'tasks',
  [STORES.PROJECTS]: 'projects',
  [STORES.NOTES]: 'notes',
  [STORES.HABITS]: 'habits',
  [STORES.GOALS]: 'goals',
  [STORES.MILESTONES]: 'milestones',
  [STORES.LOGS]: 'dailyLogs',
  [STORES.RANTS]: 'rants',
  [STORES.EVENTS]: 'events',
  [STORES.DAILY_MAPPER]: 'timeblocks',
  [STORES.DAILY_MAPPER_TEMPLATES]: 'timeblocktemplates',
  [STORES.MINDMAPS]: 'mindmaps',
  [STORES.APPLICATIONS]: 'applications',
  [STORES.IRIS_CONVERSATIONS]: 'iris_conversations',
  [STORES.LEARNING_RESOURCES]: 'learningResources',
  [STORES.LEARNING_FOLDERS]: 'learningFolders'
};

// Reverse mapping: Firestore collection name -> IndexedDB store name
const FIRESTORE_TO_STORE: Record<string, string> = Object.entries(STORE_TO_FIRESTORE)
  .reduce((acc, [local, firestore]) => {
    acc[firestore] = local;
    return acc;
  }, {} as Record<string, string>);

// Export mappings for use by other services
export const getFirestoreCollectionName = (localStoreName: string): string => {
  return STORE_TO_FIRESTORE[localStoreName] || localStoreName;
};

export const getLocalStoreName = (firestoreCollection: string): string => {
  return FIRESTORE_TO_STORE[firestoreCollection] || firestoreCollection;
};

// Get all Firestore collection names (for real-time sync)
export const getAllFirestoreCollections = (): string[] => {
  return Object.values(STORE_TO_FIRESTORE);
};

// Get all syncable stores (excludes profile)
export const getSyncableStores = (): string[] => {
  return Object.keys(STORE_TO_FIRESTORE);
};

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

  async put<T extends { id: string }>(storeName: string, item: T): Promise<void> {
      const db = await this.getDB();
      
      // Add timestamp for sync
      const itemWithTimestamp = {
        ...item,
        updatedAt: new Date().toISOString()
      };
      
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.put(itemWithTimestamp);
          request.onsuccess = async () => {
            // Auto-sync to cloud if Firebase is configured and user is authenticated
            if (isFirebaseConfigured() && storeName !== STORES.PROFILE) {
              try {
                const firestoreStore = this.getFirestoreStoreName(storeName);
                await firebaseService.pushItemToCloud(firestoreStore, itemWithTimestamp);
              } catch (e) {
                // Silently fail cloud sync - local is still saved
                console.warn('Cloud sync failed:', e);
              }
            }
            resolve();
          };
          request.onerror = () => reject(request.error);
      });
  }

  async delete(storeName: string, id: string): Promise<void> {
      const db = await this.getDB();
      
      // Use soft-delete: mark as deleted instead of removing
      // This prevents sync from restoring deleted items
      const deletedItem = {
        id,
        deleted: true,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          // First get the existing item to preserve some data for sync
          const getRequest = store.get(id);
          getRequest.onsuccess = async () => {
            const existingItem = getRequest.result;
            const softDeletedItem = existingItem 
              ? { ...existingItem, ...deletedItem }
              : deletedItem;
            
            const putRequest = store.put(softDeletedItem);
            putRequest.onsuccess = async () => {
              // Also sync soft-delete to cloud if Firebase is configured
              if (isFirebaseConfigured() && storeName !== STORES.PROFILE) {
                try {
                  const firestoreStore = this.getFirestoreStoreName(storeName);
                  await firebaseService.pushItemToCloud(firestoreStore, softDeletedItem);
                } catch (e) {
                  console.warn('Cloud soft-delete sync failed:', e);
                }
              }
              resolve();
            };
            putRequest.onerror = () => reject(putRequest.error);
          };
          getRequest.onerror = () => reject(getRequest.error);
      });
  }

  // Hard delete - completely removes the item (use for cleanup)
  async hardDelete(storeName: string, id: string): Promise<void> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.delete(id);
          request.onsuccess = async () => {
            // Also delete from cloud if Firebase is configured
            if (isFirebaseConfigured() && storeName !== STORES.PROFILE) {
              try {
                const firestoreStore = this.getFirestoreStoreName(storeName);
                await firebaseService.deleteItemFromCloud(firestoreStore, id);
              } catch (e) {
                console.warn('Cloud delete failed:', e);
              }
            }
            resolve();
          };
          request.onerror = () => reject(request.error);
      });
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