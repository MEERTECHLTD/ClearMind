/**
 * useCollection — the single data-access pattern for every list view.
 *
 * Backed by a shared per-collection store (lib/collectionStore): every screen
 * reading the same collection sees the same rows, and create/update/remove are
 * applied optimistically to ALL of them before persisting through dbService
 * (local sqlite + fire-and-forget cloud push). Inbound cloud changes arrive via
 * the syncBus (useRealtimeSync) and reload the store from sqlite.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { getStore } from '../lib/collectionStore';

export function useCollection<T extends { id: string }>(store: string) {
  const s = getStore<T>(store);
  const snap = useSyncExternalStore(s.subscribe, s.getSnapshot);

  const create = useCallback((item: T) => s.put(item), [s]);
  const remove = useCallback((id: string) => s.remove(id), [s]);
  const reload = useCallback(() => s.load(), [s]);

  // update === create (INSERT OR REPLACE); kept distinct for call-site clarity.
  return { items: snap.items, loading: !snap.loaded, error: snap.error, create, update: create, remove, reload };
}
