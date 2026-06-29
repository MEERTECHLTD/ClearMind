/**
 * useRealtimeSync — mounted ONCE in (app)/_layout.tsx.
 *
 * Subscribes to every Firestore collection; on each snapshot it reconciles
 * cloud→local (handleRealtimeUpdate), pushes any newer local tombstones
 * (syncDeletedItems), then emits a throttled syncBus event so the affected
 * useCollection reloads.
 *
 * Keyed on the authed uid: firebaseService.subscribeToCollectionRaw no-ops while
 * auth.currentUser is null, so we (re)subscribe when uid goes null→value. With []
 * deps a pre-auth mount (deep link / notification tap into an (app) route) would
 * leave every subscription a permanent no-op for the whole session.
 */
import { useEffect, useRef } from 'react';
import { firebaseService, isFirebaseConfigured } from '../services/firebaseService';
import { dbService, getAllFirestoreCollections } from '../services/db';
import { handleRealtimeUpdate, syncDeletedItems } from '../services/syncService';
import { syncBus } from '../services/events';
import { useAuth } from './useAuth';
import type { SyncableItem } from '@clearmind/shared/sync/merge';

const THROTTLE_MS = 1000;

export function useRealtimeSync(): void {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const lastEmit = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!uid || !isFirebaseConfigured()) return;
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
          const { localStoreName } = await handleRealtimeUpdate(collection, items as SyncableItem[]);
          const localItems = await dbService.getAllIncludingDeleted<SyncableItem>(localStoreName);
          await syncDeletedItems(collection, localItems, items as SyncableItem[]);
          throttledEmit(localStoreName);
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
  }, [uid]);
}
