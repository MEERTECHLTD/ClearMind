import { Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, MindMap, CalendarEvent, DailyMapperEntry, Application, IrisConversation } from '../types';
import { firebaseService, isFirebaseConfigured } from './firebase';

const DB_NAME = 'ClearMindDB';
const DB_VERSION = 7; // Incremented version to add applications and iris_conversations stores

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
  APPLICATIONS: 'applications',
  IRIS_CONVERSATIONS: 'iris_conversations',
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
              createStore(STORES.APPLICATIONS);
              createStore(STORES.IRIS_CONVERSATIONS);

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
          request.onsuccess = () => resolve(request.result);
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

  // Map store names to Firestore collection names
  private getFirestoreStoreName(storeName: string): string {
    const mapping: Record<string, string> = {
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
      [STORES.MINDMAPS]: 'mindmaps',
      [STORES.APPLICATIONS]: 'applications',
      [STORES.IRIS_CONVERSATIONS]: 'iris_conversations'
    };
    return mapping[storeName] || storeName;
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
}

export const dbService = new DatabaseService();