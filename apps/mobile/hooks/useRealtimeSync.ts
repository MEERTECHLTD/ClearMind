/**
 * useRealtimeSync — mounted ONCE in (app)/_layout.tsx.
 *
 * Subscribes to every Firestore collection; on each snapshot it reconciles
 * cloud→local (handleRealtimeUpdate), pushes any newer local tombstones
 * (syncDeletedItems), then emits a throttled syncBus event so the affected
 * useCollection reloads. Holds the unsubscribe for unmount.
 */
import { useEffect, useRef } from 'react';
import { firebaseService, isFirebaseConfigured } from '../services/firebaseService';
import { dbService, getAllFirestoreCollections } from '../services/db';
import { handleRealtimeUpdate, syncDeletedItems } from '../services/syncService';
import { syncBus } from '../services/events';
import type { SyncableItem } from '@clearmind/shared/sync/merge';

const THROTTLE_MS = 1000;

export function useRealtimeSync(): void {
  const lastEmit = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const collections = getAllFirestoreCollections();

    const throttledEmit = (store: string) => {
      const now = Date.now();
      if (now - (lastEmit.current[store] ?? 0) >= THROTTLE_MS) {
        lastEmit.current[store] = now;
        syncBus.emit(store);
      }
    };

    let unsub: () => void = () => {};
    try {
      unsub = firebaseService.subscribeToAllCollections(collections, async (collection: string, items: any[]) => {
        try {
          const { localStoreName, updated } = await handleRealtimeUpdate(collection, items as SyncableItem[]);
          const localItems = await dbService.getAllIncludingDeleted<SyncableItem>(localStoreName);
          const pushed = await syncDeletedItems(collection, localItems, items as SyncableItem[]);
          if (updated > 0 || pushed > 0) throttledEmit(localStoreName);
          else throttledEmit(localStoreName); // also nudge so first load reflects cloud
        } catch (e) {
          console.warn('realtime reconcile failed for', collection, e);
        }
      });
    } catch (e) {
      console.warn('subscribeToAllCollections failed', e);
    }
    return () => {
      try { unsub(); } catch {}
    };
  }, []);
}
