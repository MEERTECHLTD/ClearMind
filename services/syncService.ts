/**
 * Centralized Sync Service
 * 
 * This service handles all sync operations between IndexedDB and Firestore.
 * It ensures consistent collection naming and provides optimized batch operations.
 */

import { firebaseService, isFirebaseConfigured } from './firebase';
import { 
  dbService, 
  STORES, 
  getFirestoreCollectionName, 
  getLocalStoreName, 
  getSyncableStores,
  getAllFirestoreCollections
} from './db';

// Local wrappers for the mapping functions
export function toFirestoreCollection(localStoreName: string): string {
  return getFirestoreCollectionName(localStoreName);
}

export function toLocalStore(firestoreCollection: string): string {
  return getLocalStoreName(firestoreCollection);
}

// All syncable stores (excludes PROFILE which is handled separately)
export const SYNCABLE_STORES = getSyncableStores();

// All Firestore collection names for real-time sync
export const FIRESTORE_COLLECTIONS = getAllFirestoreCollections();

/**
 * Interface for items that can be synced
 */
export interface SyncableItem {
  id: string;
  updatedAt?: string;
  lastEdited?: string;
  syncedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

/**
 * Get the effective timestamp for comparison
 */
function getItemTimestamp(item: SyncableItem): number {
  const ts = item.updatedAt || item.lastEdited || item.syncedAt || '1970-01-01T00:00:00.000Z';
  return new Date(ts).getTime();
}

/**
 * Merge local and cloud items using last-write-wins strategy
 */
export function mergeItems<T extends SyncableItem>(
  localItems: T[],
  cloudItems: T[]
): { merged: T[]; toUpdateLocal: T[]; toUpdateCloud: T[] } {
  const merged = new Map<string, T>();
  const toUpdateLocal: T[] = [];
  const toUpdateCloud: T[] = [];
  
  // Index local items
  const localMap = new Map(localItems.map(item => [item.id, item]));
  const cloudMap = new Map(cloudItems.map(item => [item.id, item]));
  
  // Process all items from both sources
  const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
  
  for (const id of allIds) {
    const localItem = localMap.get(id);
    const cloudItem = cloudMap.get(id);
    
    if (localItem && !cloudItem) {
      // Only exists locally - push to cloud
      merged.set(id, localItem);
      toUpdateCloud.push(localItem);
    } else if (!localItem && cloudItem) {
      // Only exists in cloud - pull to local
      merged.set(id, cloudItem);
      toUpdateLocal.push(cloudItem);
    } else if (localItem && cloudItem) {
      // Exists in both - newest wins
      const localTime = getItemTimestamp(localItem);
      const cloudTime = getItemTimestamp(cloudItem);
      
      if (localTime > cloudTime) {
        merged.set(id, localItem);
        toUpdateCloud.push(localItem);
      } else if (cloudTime > localTime) {
        merged.set(id, cloudItem);
        toUpdateLocal.push(cloudItem);
      } else {
        // Same timestamp - prefer cloud (or could use any consistent rule)
        merged.set(id, cloudItem);
      }
    }
  }
  
  return {
    merged: Array.from(merged.values()),
    toUpdateLocal,
    toUpdateCloud
  };
}

/**
 * Sync a single store between local and cloud
 * Uses incremental sync - only pushes/pulls what's needed
 */
export async function syncStore(localStoreName: string): Promise<{ 
  success: boolean; 
  itemsSynced: number;
  error?: string;
}> {
  if (!isFirebaseConfigured()) {
    return { success: false, itemsSynced: 0, error: 'Firebase not configured' };
  }
  
  try {
    const firestoreCollection = toFirestoreCollection(localStoreName);
    
    // Get all local items including deleted
    const localItems = await dbService.getAllIncludingDeleted<SyncableItem>(localStoreName);
    
    // Fetch cloud items
    const cloudItems = await firebaseService.fetchFromCloud<SyncableItem>(firestoreCollection);
    
    // Merge using last-write-wins
    const { toUpdateLocal, toUpdateCloud } = mergeItems(localItems, cloudItems);
    
    // Update local with items from cloud (batch operation, no cloud sync trigger)
    if (toUpdateLocal.length > 0) {
      await dbService.putBatchLocalOnly(localStoreName, toUpdateLocal);
    }
    
    // Push local changes to cloud (batch operation)
    if (toUpdateCloud.length > 0) {
      await firebaseService.syncToCloud(firestoreCollection, toUpdateCloud);
    }
    
    const itemsSynced = toUpdateLocal.length + toUpdateCloud.length;
    
    return { success: true, itemsSynced };
  } catch (error: any) {
    console.error(`Sync error for ${localStoreName}:`, error);
    return { success: false, itemsSynced: 0, error: error.message };
  }
}

/**
 * Sync all stores
 * Processes stores in parallel batches for performance
 */
export async function syncAllStores(
  onProgress?: (storeName: string, index: number, total: number) => void
): Promise<{ 
  success: boolean; 
  totalItemsSynced: number; 
  failedStores: string[];
  errors: Record<string, string>;
}> {
  const results: Record<string, { success: boolean; itemsSynced: number; error?: string }> = {};
  const failedStores: string[] = [];
  const errors: Record<string, string> = {};
  let totalItemsSynced = 0;
  
  // Process in parallel batches of 4
  const BATCH_SIZE = 4;
  
  for (let i = 0; i < SYNCABLE_STORES.length; i += BATCH_SIZE) {
    const batch = SYNCABLE_STORES.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (storeName, batchIndex) => {
        onProgress?.(storeName, i + batchIndex, SYNCABLE_STORES.length);
        const result = await syncStore(storeName);
        return { storeName, result };
      })
    );
    
    for (const { storeName, result } of batchResults) {
      results[storeName] = result;
      if (result.success) {
        totalItemsSynced += result.itemsSynced;
      } else {
        failedStores.push(storeName);
        if (result.error) {
          errors[storeName] = result.error;
        }
      }
    }
  }
  
  return {
    success: failedStores.length === 0,
    totalItemsSynced,
    failedStores,
    errors
  };
}

/**
 * Handle incoming real-time sync update from Firestore
 * This is called when onSnapshot receives changes
 */
export async function handleRealtimeUpdate(
  firestoreCollection: string,
  cloudItems: SyncableItem[]
): Promise<{ updated: number; localStoreName: string }> {
  const localStoreName = toLocalStore(firestoreCollection);
  
  // Get all local items including deleted
  const localItems = await dbService.getAllIncludingDeleted<SyncableItem>(localStoreName);
  
  // Create maps for quick lookup
  const localMap = new Map(localItems.map(item => [item.id, item]));
  
  // Items to update locally
  const toUpdateLocal: SyncableItem[] = [];
  
  for (const cloudItem of cloudItems) {
    const localItem = localMap.get(cloudItem.id);
    
    if (!localItem) {
      // New item from cloud - add locally (unless deleted)
      if (!cloudItem.deleted) {
        toUpdateLocal.push(cloudItem);
      }
    } else {
      // Exists locally - compare timestamps
      const localTime = getItemTimestamp(localItem);
      const cloudTime = getItemTimestamp(cloudItem);
      
      if (cloudTime > localTime) {
        // Cloud is newer - update local
        toUpdateLocal.push(cloudItem);
      }
    }
  }
  
  // Batch update local items
  if (toUpdateLocal.length > 0) {
    await dbService.putBatchLocalOnly(localStoreName, toUpdateLocal);
  }
  
  return { updated: toUpdateLocal.length, localStoreName };
}

/**
 * Push local deleted items to cloud if they're newer
 */
export async function syncDeletedItems(
  firestoreCollection: string,
  localItems: SyncableItem[],
  cloudItems: SyncableItem[]
): Promise<number> {
  const cloudMap = new Map(cloudItems.map(item => [item.id, item]));
  const toSync: SyncableItem[] = [];
  
  for (const localItem of localItems) {
    if (localItem.deleted) {
      const cloudItem = cloudMap.get(localItem.id);
      const localTime = getItemTimestamp(localItem);
      const cloudTime = cloudItem ? getItemTimestamp(cloudItem) : 0;
      
      if (localTime > cloudTime) {
        toSync.push(localItem);
      }
    }
  }
  
  if (toSync.length > 0) {
    await firebaseService.syncToCloud(firestoreCollection, toSync);
  }
  
  return toSync.length;
}

/**
 * Dispatch sync event to notify views of data changes
 */
export function dispatchSyncEvent(localStoreName: string): void {
  window.dispatchEvent(new CustomEvent('clearmind-sync', { 
    detail: { store: localStoreName } 
  }));
}

/**
 * Dispatch sync events for all stores
 */
export function dispatchAllSyncEvents(): void {
  SYNCABLE_STORES.forEach(store => dispatchSyncEvent(store));
}

// Export for testing
export const __testing = {
  getItemTimestamp,
  mergeItems
};
