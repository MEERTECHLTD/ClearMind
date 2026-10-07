/**
 * Mobile sync: the shared SyncEngine over expo-sqlite + Firestore delta
 * listeners. Every dbService.put/delete (all screens) goes through it — field
 * clocks, a persistent outbox that survives restarts and offline periods,
 * realtime incremental downloads, and a daily full reconcile.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncEngine, type LocalAdapter, type OutboxEntry, type SyncStatus, type EngineOptions } from '@clearmind/shared/sync/engine';
import { firestoreRemote } from '@clearmind/shared/data/firestoreSync';
import type { Rec } from '@clearmind/shared/sync/fields';
import type { Edit } from '@clearmind/shared/domain';
import { dbService, getSyncableStores, getFirestoreCollectionName, setSyncWriter } from './db';
import { auth, db } from '../lib/firebase';
import { isFirebaseConfigured } from './firebaseService';
import { syncBus } from './events';
import { logWarn } from '../lib/logger';

let clientId = `${Platform.OS}-pending`;
const CLIENT_KEY = 'clearmind:clientId';
export async function loadClientId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(CLIENT_KEY);
    if (!id) { id = `${Platform.OS}-${Math.random().toString(36).slice(2, 10)}`; await AsyncStorage.setItem(CLIENT_KEY, id); }
    clientId = id;
  } catch { /* keep default */ }
  return clientId;
}

const local: LocalAdapter = {
  get: (coll, id) => dbService.get<Rec>(coll, id),
  getAllIncludingDeleted: (coll) => dbService.getAllIncludingDeleted<Rec>(coll),
  putMany: (coll, recs) => dbService.putBatchLocalOnly(coll, recs),
  outboxAll: () => dbService.outboxAll<OutboxEntry>(),
  outboxPut: (entries) => dbService.outboxPut(entries),
  outboxDelete: (keys) => dbService.outboxDelete(keys),
  getMeta: (k) => dbService.getMeta(k),
  setMeta: (k, v) => dbService.setMeta(k, v),
};

type Listener = (coll: string, records: Rec[]) => void;
const changeListeners = new Set<Listener>();
/** Subscribe to every local data change (own writes and inbound sync). */
export const onDataChange = (l: Listener) => { changeListeners.add(l); return () => { changeListeners.delete(l); }; };

let online = true;
export const setOnline = (v: boolean) => { const was = online; online = v; if (v && !was) engine.onOnline(); };

const options: EngineOptions = {
  get clientId() { return clientId; },
  collections: getSyncableStores(),
  onLocalChange: (coll, records) => {
    changeListeners.forEach((l) => { try { l(coll, records); } catch (e) { logWarn('data listener: ' + String(e)); } });
    syncBus.emit(coll);
  },
  log: (m) => logWarn('[sync] ' + m),
};
export const engine = new SyncEngine(local, options);

setSyncWriter({
  put: async (store, item) => { await engine.apply([{ coll: store, id: item.id, edit: item }]); },
  remove: async (store, id) => { await engine.apply([{ coll: store, id, edit: { deleted: true } }]); },
});

/** Persist the edits of a shared domain operation (optimistic + queued). */
export const applyEdits = (edits: Edit[]) => engine.apply(edits);

const RECONCILE_EVERY = 24 * 60 * 60 * 1000;
let remote: ReturnType<typeof firestoreRemote> | null = null;

export async function startSync(): Promise<void> {
  await loadClientId();
  if (!isFirebaseConfigured() || !auth?.currentUser) return;
  remote = firestoreRemote(db, () => auth.currentUser?.uid ?? null, { isOnline: () => online, firestoreName: getFirestoreCollectionName });
  await engine.start(remote);
  const last = await local.getMeta('lastReconcile');
  if (!last || Date.now() - new Date(last).getTime() > RECONCILE_EVERY) void engine.reconcileAll(remote);
}

export function stopSync() {
  engine.stop();
  remote = null;
}

export const isSyncRunning = () => remote !== null;

/**
 * Headless work (Android widgets) runs in a separate JS context and writes
 * straight to sqlite + the outbox, then sets this flag. The foreground app
 * absorbs those writes on resume: reload the outbox and re-broadcast the
 * touched collections so screens, notifications and widgets update.
 */
export const EXTERNAL_WRITES_KEY = 'clearmind:externalWrites';
export async function markExternalWrites(colls: string[]) {
  try {
    const prev = JSON.parse((await AsyncStorage.getItem(EXTERNAL_WRITES_KEY)) ?? '[]') as string[];
    await AsyncStorage.setItem(EXTERNAL_WRITES_KEY, JSON.stringify([...new Set([...prev, ...colls])]));
  } catch { /* best effort */ }
}
export async function absorbExternalWrites(): Promise<void> {
  let colls: string[] = [];
  try {
    colls = JSON.parse((await AsyncStorage.getItem(EXTERNAL_WRITES_KEY)) ?? '[]');
    if (!colls.length) return;
    await AsyncStorage.removeItem(EXTERNAL_WRITES_KEY);
  } catch { return; }
  await engine.reloadOutbox();
  for (const coll of colls) {
    const recs = await dbService.getAllIncludingDeleted<Rec>(coll);
    options.onLocalChange(coll, recs);
  }
}

/** Foreground / reconnect: push pending work, and do the daily reconcile if due. */
export async function resumeSync() {
  await absorbExternalWrites().catch((e) => logWarn('absorb external writes: ' + String(e)));
  void engine.flush();
  const last = await local.getMeta('lastReconcile');
  if (remote && (!last || Date.now() - new Date(last).getTime() > RECONCILE_EVERY)) void engine.reconcileAll(remote);
}

/** "Sync now": full field-level reconcile. */
export async function syncNow() {
  if (!remote) await startSync();
  return engine.reconcileAll();
}

export const onSyncStatus = (cb: (s: SyncStatus) => void) => engine.onStatus(cb);
export type { SyncStatus };
