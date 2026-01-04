import { Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, MindMap, CalendarEvent, DailyMapperEntry } from '../types';

const DB_NAME = 'ClearMindDB';
const DB_VERSION = 6; // Incremented version to add daily mapper store

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

  async put<T>(storeName: string, item: T): Promise<void> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.put(item);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
      });
  }

  async delete(storeName: string, id: string): Promise<void> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.delete(id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
      });
  }
}

export const dbService = new DatabaseService();