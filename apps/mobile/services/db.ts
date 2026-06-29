/**
 * Mobile local database — expo-sqlite, mirroring the web `services/db.ts`
 * surface 1:1 so the shared sync engine + ported syncService work unchanged.
 *
 * Storage model: ONE table per store (STORES.*), schema:
 *   id TEXT PRIMARY KEY, data TEXT (full domain object as JSON),
 *   updatedAt TEXT, deleted INTEGER, deletedAt TEXT
 * The full object lives in `data`; sync metadata is mirrored into real columns
 * for fast WHERE deleted=0 / timestamp queries. (See DECISIONS.md — sync contract.)
 *
 * Parity with web:
 *  - put() stamps updatedAt and fire-and-forget pushes to Firestore (not PROFILE)
 *  - delete() is a SOFT delete (tombstone {deleted,deletedAt,updatedAt}) + cloud push
 *  - putLocalOnly / putBatchLocalOnly do NOT push (used by sync reconciliation)
 *  - profile is never pushed to a generic collection (lives at users/{uid})
 */
import * as SQLite from 'expo-sqlite';
import {
  STORES,
  getFirestoreCollectionName,
} from '@clearmind/shared/data/collections';
import { firebaseService, isFirebaseConfigured } from './firebaseService';

const DB_FILE = 'clearmind.db';

// All local store/table names (trusted constants — safe as SQL identifiers).
const ALL_STORES: string[] = Object.values(STORES);

type Row = { data: string };

class DatabaseService {
  private dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

  private async _open(): Promise<SQLite.SQLiteDatabase> {
    const db = await SQLite.openDatabaseAsync(DB_FILE);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    // One table per store.
    const ddl = ALL_STORES.map(
      (s) =>
        `CREATE TABLE IF NOT EXISTS "${s}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updatedAt TEXT, deleted INTEGER DEFAULT 0, deletedAt TEXT);`
    ).join('\n');
    await db.execAsync(ddl);
    return db;
  }

  getDB(): Promise<SQLite.SQLiteDatabase> {
    if (!this.dbPromise) {
      // Don't cache a rejected open — otherwise one failure poisons the DB for
      // the whole session with no retry until app restart.
      this.dbPromise = this._open().catch((e) => {
        this.dbPromise = null;
        throw e;
      });
    }
    return this.dbPromise;
  }

  private async upsert(db: SQLite.SQLiteDatabase, storeName: string, obj: any): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO "${storeName}" (id, data, updatedAt, deleted, deletedAt) VALUES (?, ?, ?, ?, ?)`,
      [
        String(obj.id),
        JSON.stringify(obj),
        obj.updatedAt ?? null,
        obj.deleted ? 1 : 0,
        obj.deletedAt ?? null,
      ]
    );
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.getDB();
    const rows = await db.getAllAsync<Row>(`SELECT data FROM "${storeName}" WHERE deleted = 0`);
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  async get<T>(storeName: string, id: string): Promise<T | undefined> {
    const db = await this.getDB();
    const row = await db.getFirstAsync<Row>(`SELECT data FROM "${storeName}" WHERE id = ?`, [id]);
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  async getAllIncludingDeleted<T>(storeName: string): Promise<T[]> {
    const db = await this.getDB();
    const rows = await db.getAllAsync<Row>(`SELECT data FROM "${storeName}"`);
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  // Local-only write (no cloud push) — used by sync reconciliation.
  async putLocalOnly<T extends { id: string }>(storeName: string, item: T): Promise<void> {
    const db = await this.getDB();
    await this.upsert(db, storeName, item);
  }

  async putBatchLocalOnly<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
    if (items.length === 0) return;
    const db = await this.getDB();
    await db.withTransactionAsync(async () => {
      for (const item of items) await this.upsert(db, storeName, item);
    });
  }

  // Write + fire-and-forget cloud push (mirrors web put()).
  async put<T extends { id: string }>(storeName: string, item: T): Promise<void> {
    const db = await this.getDB();
    const itemWithTimestamp: any = { ...item, updatedAt: new Date().toISOString() };
    await this.upsert(db, storeName, itemWithTimestamp);
    if (isFirebaseConfigured() && storeName !== STORES.PROFILE) {
      try {
        await firebaseService.pushItemToCloud(getFirestoreCollectionName(storeName), itemWithTimestamp);
      } catch (e) {
        console.warn('Cloud sync failed:', e);
      }
    }
  }

  // Soft delete: write a tombstone and push it (so sync can't resurrect it).
  async delete(storeName: string, id: string): Promise<void> {
    const db = await this.getDB();
    const existing = await this.get<any>(storeName, id);
    const now = new Date().toISOString();
    const tombstone = { ...(existing ?? { id }), id, deleted: true, deletedAt: now, updatedAt: now };
    await this.upsert(db, storeName, tombstone);
    if (isFirebaseConfigured() && storeName !== STORES.PROFILE) {
      try {
        await firebaseService.pushItemToCloud(getFirestoreCollectionName(storeName), tombstone);
      } catch (e) {
        console.warn('Cloud soft-delete sync failed:', e);
      }
    }
  }

  // Hard delete — fully removes (used by cleanup).
  async hardDelete(storeName: string, id: string): Promise<void> {
    const db = await this.getDB();
    await db.runAsync(`DELETE FROM "${storeName}" WHERE id = ?`, [id]);
    if (isFirebaseConfigured() && storeName !== STORES.PROFILE) {
      try {
        await firebaseService.deleteItemFromCloud(getFirestoreCollectionName(storeName), id);
      } catch (e) {
        console.warn('Cloud delete failed:', e);
      }
    }
  }

  async cleanupDeletedItems(storeName: string): Promise<void> {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const all = await this.getAllIncludingDeleted<any>(storeName);
    const stale = all.filter((i) => i.deleted && i.deletedAt && new Date(i.deletedAt).getTime() < cutoff);
    for (const i of stale) await this.hardDelete(storeName, i.id);
  }
}

export const dbService = new DatabaseService();

// Re-export the canonical naming so callers can `from './db'` like the web app.
export {
  STORES,
  getFirestoreCollectionName,
  getLocalStoreName,
  getAllFirestoreCollections,
  getSyncableStores,
} from '@clearmind/shared/data/collections';
