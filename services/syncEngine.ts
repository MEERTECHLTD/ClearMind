/**
 * Web sync: the shared SyncEngine over IndexedDB + Firestore delta listeners.
 * Every dbService.put/delete (all views, including the legacy tools) goes
 * through it: field clocks, persistent outbox (offline-safe), realtime delta
 * subscriptions and a daily full reconcile.
 */
import { SyncEngine, type LocalAdapter, type OutboxEntry, type SyncStatus } from '@clearmind/shared/sync/engine';
import { firestoreRemote } from '@clearmind/shared/data/firestoreSync';
import type { Rec } from '@clearmind/shared/sync/fields';
import type { Edit } from '@clearmind/shared/domain';
import { dbService, SYNC_OUTBOX, SYNC_META, STORES, getSyncableStores, getFirestoreCollectionName, setSyncWriter } from './db';
import { auth, db, isFirebaseConfigured } from './firebase';
import { dispatchSyncEvent } from './syncService';
import { applyToStores } from '../components/tasks/store';

const CLIENT_KEY = 'cm.clientId';
function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) { id = `web-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem(CLIENT_KEY, id); }
    return id;
  } catch { return 'web-anon'; }
}

const local: LocalAdapter = {
  get: (coll, id) => dbService.get<Rec>(coll, id),
  getAllIncludingDeleted: (coll) => dbService.getAllIncludingDeleted<Rec>(coll),
  putMany: (coll, recs) => dbService.putBatchLocalOnly(coll, recs),
  outboxAll: () => dbService.allRaw<OutboxEntry>(SYNC_OUTBOX),
  outboxPut: (entries) => dbService.putBatchLocalOnly(SYNC_OUTBOX, entries.map((e) => ({ ...e, id: e.key }))),
  outboxDelete: (keys) => dbService.deleteKeys(SYNC_OUTBOX, keys),
  getMeta: async (key) => ((await dbService.get<{ key: string; value: string }>(SYNC_META, key))?.value ?? null),
  setMeta: (key, value) => dbService.putLocalOnly(SYNC_META, { key, value, id: key } as any),
};

// Coalesce UI refresh events (a burst of inbound docs → one event per store).
const pendingEvents = new Set<string>();
let eventTimer: number | null = null;
function notify(coll: string) {
  pendingEvents.add(coll);
  if (eventTimer) return;
  eventTimer = window.setTimeout(() => {
    eventTimer = null;
    const list = [...pendingEvents];
    pendingEvents.clear();
    list.forEach((c) => dispatchSyncEvent(c));
  }, 50);
}

export const engine = new SyncEngine(local, {
  clientId: clientId(),
  collections: getSyncableStores(),
  onLocalChange: (coll, records) => { applyToStores(coll, records); notify(coll); },
  log: (m) => console.warn('[sync]', m),
});

// All writes (every view) go through the engine.
setSyncWriter({
  put: async (store, item) => { await engine.apply([{ coll: store, id: item.id, edit: item }]); },
  remove: async (store, id) => { await engine.apply([{ coll: store, id, edit: { deleted: true } }]); },
});

/** Persist the edits of a domain operation (shared/domain) — optimistic + queued. */
export const applyEdits = (edits: Edit[]) => engine.apply(edits);

let started = false;
const RECONCILE_EVERY = 24 * 60 * 60 * 1000;

export async function startSync(): Promise<void> {
  if (!isFirebaseConfigured() || !auth?.currentUser) return;
  started = true;
  const remote = firestoreRemote(db, () => auth.currentUser?.uid ?? null, {
    isOnline: () => navigator.onLine,
    firestoreName: getFirestoreCollectionName,
  });
  await engine.start(remote);
  const last = await local.getMeta('lastReconcile');
  if (!last || Date.now() - new Date(last).getTime() > RECONCILE_EVERY) void engine.reconcileAll(remote);
}

export function stopSync() {
  started = false;
  engine.stop();
}

/** "Sync now": full field-level reconcile of every collection. */
export async function syncNow() {
  if (!started) await startSync();
  return engine.reconcileAll();
}

export const onSyncStatus = (cb: (s: SyncStatus) => void) => engine.onStatus(cb);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => engine.onOnline());
  // Flush before the tab goes away (best effort).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void engine.flush(); });
}

export { STORES };
