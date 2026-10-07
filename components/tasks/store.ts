/**
 * Shared in-memory collection stores for the web task layer (one per IndexedDB
 * store). Every component reading tasks/projects/labels subscribes to the same
 * store, so a change made anywhere (task row, sidebar counts, detail modal)
 * shows everywhere at once. Writes are optimistic, then persisted with
 * dbService (IndexedDB first, then a cloud push we never block the UI on).
 * Inbound cloud changes arrive as `clearmind-sync` window events.
 */
import { useSyncExternalStore } from 'react';
import { dbService } from '../../services/db';

type Listener = () => void;
export interface Snapshot<T> { items: T[]; loaded: boolean; error: string | null }

class CollectionStore<T extends { id: string }> {
  private snap: Snapshot<T> = { items: [], loaded: false, error: null };
  private listeners = new Set<Listener>();
  private inflight: Promise<void> | null = null;

  constructor(readonly name: string) {}

  getSnapshot = () => this.snap;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    if (!this.snap.loaded && !this.inflight) void this.load();
    return () => { this.listeners.delete(l); };
  };

  private set(next: Partial<Snapshot<T>>) {
    this.snap = { ...this.snap, ...next };
    this.listeners.forEach((l) => l());
  }

  load(): Promise<void> {
    const p: Promise<void> = dbService.getAll<T>(this.name)
      .then((items) => this.set({ items, loaded: true, error: null }))
      .catch((e) => this.set({ loaded: true, error: e?.message ?? String(e) }))
      .finally(() => { if (this.inflight === p) this.inflight = null; });
    this.inflight = p;
    return p;
  }

  private apply(upserts: T[], removed: string[] = []) {
    const gone = new Set(removed);
    const byId = new Map(upserts.map((u) => [u.id, u]));
    const next: T[] = [];
    for (const it of this.snap.items) {
      if (gone.has(it.id)) continue;
      next.push(byId.get(it.id) ?? it);
      byId.delete(it.id);
    }
    next.push(...byId.values());
    this.set({ items: next });
  }

  /** Optimistic write; a failed local write reloads (rolls back) and rethrows. */
  async putMany(items: T[]) {
    if (!items.length) return;
    this.apply(items);
    try { await Promise.all(items.map((i) => dbService.put(this.name, i))); }
    catch (e) { await this.load(); throw e; }
  }

  async removeMany(ids: string[]) {
    if (!ids.length) return;
    this.apply([], ids);
    try { await Promise.all(ids.map((id) => dbService.delete(this.name, id))); }
    catch (e) { await this.load(); throw e; }
  }
}

const stores = new Map<string, CollectionStore<any>>();
let wired = false;

export function getStore<T extends { id: string }>(name: string): CollectionStore<T> {
  if (!wired && typeof window !== 'undefined') {
    wired = true;
    window.addEventListener('clearmind-sync', ((e: CustomEvent) => {
      const changed = e.detail?.store as string | undefined;
      if (changed) void stores.get(changed)?.load();
      else stores.forEach((s) => void s.load());
    }) as EventListener);
  }
  let s = stores.get(name);
  if (!s) { s = new CollectionStore<T>(name); stores.set(name, s); }
  return s as CollectionStore<T>;
}

export function useStore<T extends { id: string }>(name: string): Snapshot<T> {
  const s = getStore<T>(name);
  return useSyncExternalStore(s.subscribe, s.getSnapshot);
}
