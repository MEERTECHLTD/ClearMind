/**
 * useCollection — the single data-access pattern for every list view.
 *
 * CONTRACT (load-bearing): create/update/remove mutate the returned `items`
 * OPTIMISTICALLY and then call dbService (which persists locally + fire-and-forget
 * pushes to cloud). The syncBus listener ONLY reconciles INBOUND cloud changes.
 * Reason: a local dbService.put does NOT emit on the syncBus (only the Firestore
 * onSnapshot path does, via useRealtimeSync) — so without the optimistic update,
 * Firebase-off would show nothing until remount and Firebase-on would lag a full
 * round-trip. Every list view must go through this hook and not re-implement
 * load-on-event.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { dbService } from '../services/db';
import { syncBus } from '../services/events';

const upsert = <T extends { id: string }>(arr: T[], item: T): T[] => {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i === -1) return [...arr, item];
  const next = arr.slice();
  next[i] = item;
  return next;
};

export function useCollection<T extends { id: string }>(store: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const all = await dbService.getAll<T>(store);
    if (mounted.current) {
      setItems(all);
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    mounted.current = true;
    load();
    const unsub = syncBus.subscribe((changed) => {
      if (changed === store) load();
    });
    return () => {
      mounted.current = false;
      unsub();
    };
  }, [store, load]);

  const create = useCallback(
    async (item: T) => {
      setItems((prev) => upsert(prev, item));
      await dbService.put(store, item);
    },
    [store]
  );

  // update === create (INSERT OR REPLACE); kept distinct for call-site clarity.
  const update = create;

  const remove = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      await dbService.delete(store, id);
    },
    [store]
  );

  return { items, loading, create, update, remove, reload: load };
}
