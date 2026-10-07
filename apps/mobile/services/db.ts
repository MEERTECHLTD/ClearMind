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
const DB_FILE = 'clearmind.db';

/**
 * Writes go through the SyncEngine once registered (services/sync.ts): field
 * clocks, persistent outbox, delta sync. Before that, writes are local only.
 */
type Writer = { put: (store: string, item: any) => Promise<void>; remove: (store: string, id: string) => Promise<void> };
let writer: Writer | null = null;
export const setSyncWriter = (w: Writer | null) => { writer = w; };

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
    // Local-only sync bookkeeping.
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS "_outbox" (key TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
       CREATE TABLE IF NOT EXISTS "_meta" (key TEXT PRIMARY KEY NOT NULL, value TEXT);`
    );
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

  /** Create/update a record — routed through the SyncEngine (field-level sync). */
  async put<T extends { id: string }>(storeName: string, item: T): Promise<void> {
    if (writer && storeName !== STORES.PROFILE) return writer.put(storeName, item);
    const db = await this.getDB();
    await this.upsert(db, storeName, { ...item, updatedAt: new Date().toISOString() });
  }

  /** Soft delete (tombstone) — synced so no client can resurrect it. */
  async delete(storeName: string, id: string): Promise<void> {
    if (writer && storeName !== STORES.PROFILE) return writer.remove(storeName, id);
    const db = await this.getDB();
    const existing = await this.get<any>(storeName, id);
    const now = new Date().toISOString();
    await this.upsert(db, storeName, { ...(existing ?? { id }), id, deleted: true, deletedAt: now, updatedAt: now });
  }

  /** Local-only removal of an old tombstone (cloud tombstones are kept). */
  async hardDelete(storeName: string, id: string): Promise<void> {
    const db = await this.getDB();
    await db.runAsync(`DELETE FROM "${storeName}" WHERE id = ?`, [id]);
  }

  // ---- sync bookkeeping ----
  async outboxAll<T>(): Promise<T[]> {
    const db = await this.getDB();
    const rows = await db.getAllAsync<Row>(`SELECT data FROM "_outbox"`);
    return rows.map((r) => JSON.parse(r.data) as T);
  }
  async outboxPut(entries: { key: string }[]): Promise<void> {
    if (!entries.length) return;
    const db = await this.getDB();
    await db.withTransactionAsync(async () => {
      for (const e of entries) await db.runAsync(`INSERT OR REPLACE INTO "_outbox" (key, data) VALUES (?, ?)`, [e.key, JSON.stringify(e)]);
    });
  }
  async outboxDelete(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const db = await this.getDB();
    await db.withTransactionAsync(async () => {
      for (const k of keys) await db.runAsync(`DELETE FROM "_outbox" WHERE key = ?`, [k]);
    });
  }
  async getMeta(key: string): Promise<string | null> {
    const db = await this.getDB();
    const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM "_meta" WHERE key = ?`, [key]);
    return row?.value ?? null;
  }
  async setMeta(key: string, value: string): Promise<void> {
    const db = await this.getDB();
    await db.runAsync(`INSERT OR REPLACE INTO "_meta" (key, value) VALUES (?, ?)`, [key, value]);
  }

  /** Remove every local row (all stores + sync bookkeeping). Used when a different account signs in. */
  async wipeAll(): Promise<void> {
    const db = await this.getDB();
    await db.withTransactionAsync(async () => {
      for (const s of [...ALL_STORES, '_outbox', '_meta']) await db.runAsync(`DELETE FROM "${s}"`);
    });
  }

  async cleanupDeletedItems(storeName: string): Promise<void> {
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
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
