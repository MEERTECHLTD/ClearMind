/**
 * Mobile sync service — port of web services/syncService.ts.
 *
 * Same logic, two swaps: imports the mobile sqlite dbService + firebaseService,
 * and dispatchSyncEvent() emits on the DeviceEventEmitter syncBus instead of a
 * window CustomEvent. The last-write-wins merge engine is reused verbatim from
 * @clearmind/shared/sync/merge.
 */
import { firebaseService, isFirebaseConfigured } from './firebaseService';
import {
  dbService,
  getFirestoreCollectionName,
  getLocalStoreName,
  getSyncableStores,
  getAllFirestoreCollections,
} from './db';
import { getItemTimestamp, mergeItems, type SyncableItem } from '@clearmind/shared/sync/merge';
import { syncBus } from './events';

export const toFirestoreCollection = (s: string) => getFirestoreCollectionName(s);
export const toLocalStore = (c: string) => getLocalStoreName(c);

export const SYNCABLE_STORES = getSyncableStores();
export const FIRESTORE_COLLECTIONS = getAllFirestoreCollections();

export type { SyncableItem } from '@clearmind/shared/sync/merge';
export { mergeItems } from '@clearmind/shared/sync/merge';

/** Full bidirectional sync of one store (manual "Sync now"). */
export async function syncStore(localStoreName: string): Promise<{ success: boolean; itemsSynced: number; error?: string }> {
  if (!isFirebaseConfigured()) return { success: false, itemsSynced: 0, error: 'Firebase not configured' };
  try {
    const collection = toFirestoreCollection(localStoreName);
    const localItems = await dbService.getAllIncludingDeleted<SyncableItem>(localStoreName);
    const cloudItems = await firebaseService.fetchFromCloud<SyncableItem>(collection);
    const { toUpdateLocal, toUpdateCloud } = mergeItems(localItems, cloudItems);
    if (toUpdateLocal.length > 0) await dbService.putBatchLocalOnly(localStoreName, toUpdateLocal);
    if (toUpdateCloud.length > 0) await firebaseService.syncToCloud(collection, toUpdateCloud);
    return { success: true, itemsSynced: toUpdateLocal.length + toUpdateCloud.length };
  } catch (error: any) {
    return { success: false, itemsSynced: 0, error: error?.message ?? String(error) };
  }
}

/** Sync every store (parallel batches of 4). */
export async function syncAllStores(
  onProgress?: (storeName: string, index: number, total: number) => void
): Promise<{ success: boolean; totalItemsSynced: number; failedStores: string[]; errors: Record<string, string> }> {
  const failedStores: string[] = [];
  const errors: Record<string, string> = {};
  let totalItemsSynced = 0;
  const BATCH = 4;
  for (let i = 0; i < SYNCABLE_STORES.length; i += BATCH) {
    const batch = SYNCABLE_STORES.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (storeName, j) => {
        onProgress?.(storeName, i + j, SYNCABLE_STORES.length);
        return { storeName, result: await syncStore(storeName) };
      })
    );
    for (const { storeName, result } of results) {
      if (result.success) totalItemsSynced += result.itemsSynced;
      else {
        failedStores.push(storeName);
        if (result.error) errors[storeName] = result.error;
      }
    }
  }
  return { success: failedStores.length === 0, totalItemsSynced, failedStores, errors };
}

/** Reconcile an inbound Firestore snapshot into the local store (cloud→local, LWW). */
export async function handleRealtimeUpdate(
  firestoreCollection: string,
  cloudItems: SyncableItem[]
): Promise<{ updated: number; localStoreName: string }> {
  const localStoreName = toLocalStore(firestoreCollection);
  const localItems = await dbService.getAllIncludingDeleted<SyncableItem>(localStoreName);
  const localMap = new Map(localItems.map((i) => [i.id, i]));
  const toUpdateLocal: SyncableItem[] = [];
  for (const cloudItem of cloudItems) {
    const localItem = localMap.get(cloudItem.id);
    if (!localItem) {
      if (!cloudItem.deleted) toUpdateLocal.push(cloudItem);
    } else if (getItemTimestamp(cloudItem) > getItemTimestamp(localItem)) {
      toUpdateLocal.push(cloudItem);
    }
  }
  if (toUpdateLocal.length > 0) await dbService.putBatchLocalOnly(localStoreName, toUpdateLocal);
  return { updated: toUpdateLocal.length, localStoreName };
}

/** Push local tombstones to cloud when they're newer (local→cloud deletes). */
export async function syncDeletedItems(
  firestoreCollection: string,
  localItems: SyncableItem[],
  cloudItems: SyncableItem[]
): Promise<number> {
  const cloudMap = new Map(cloudItems.map((i) => [i.id, i]));
  const toSync: SyncableItem[] = [];
  for (const localItem of localItems) {
    if (localItem.deleted) {
      const cloudItem = cloudMap.get(localItem.id);
      const cloudTime = cloudItem ? getItemTimestamp(cloudItem) : 0;
      if (getItemTimestamp(localItem) > cloudTime) toSync.push(localItem);
    }
  }
  if (toSync.length > 0) await firebaseService.syncToCloud(firestoreCollection, toSync);
  return toSync.length;
}

/** Notify views a store changed. */
export function dispatchSyncEvent(localStoreName: string): void {
  syncBus.emit(localStoreName);
}
