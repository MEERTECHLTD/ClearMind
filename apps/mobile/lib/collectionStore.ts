/**
 * One in-memory store per local collection, shared by every screen.
 *
 * Before this, each useCollection() call kept its own copy of the rows and only
 * updated it for its own writes — so completing a task on Today left Inbox and
 * Upcoming stale until a remount. Now every consumer subscribes to the same
 * store: a write updates all screens instantly (optimistic), then persists via
 * dbService (local sqlite first, then a fire-and-forget cloud push). Inbound
 * cloud changes arrive on the syncBus and trigger a reload from sqlite.
 *
 * A failed local write reloads from sqlite (rolling back the optimistic change)
 * and rethrows so the caller can surface it.
 */
import { dbService } from '../services/db';
import { onDataChange } from '../services/sync';

type Listener = () => void;

export interface CollectionSnapshot<T> {
  items: T[];
  loaded: boolean;
  error: string | null;
}

export class CollectionStore<T extends { id: string }> {
  private snapshot: CollectionSnapshot<T> = { items: [], loaded: false, error: null };
  private listeners = new Set<Listener>();
  private inflight: Promise<void> | null = null;
  private generation = 0;

  constructor(readonly name: string) {}

  getSnapshot = (): CollectionSnapshot<T> => this.snapshot;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    if (!this.snapshot.loaded && !this.inflight) void this.load();
    return () => {
      this.listeners.delete(l);
    };
  };

  private set(next: Partial<CollectionSnapshot<T>>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((l) => l());
  }

  load(): Promise<void> {
    const gen = this.generation;
    const p: Promise<void> = this.read(gen).finally(() => {
      if (this.inflight === p) this.inflight = null;
    });
    this.inflight = p;
    return p;
  }

  private async read(gen: number): Promise<void> {
    try {
      const items = await dbService.getAll<T>(this.name);
      if (gen === this.generation) this.set({ items, loaded: true, error: null });
    } catch (e: any) {
      if (gen === this.generation) this.set({ loaded: true, error: e?.message ?? String(e) });
    }
  }

  private apply(upserts: T[], removedIds: string[] = []) {
    const removed = new Set(removedIds);
    const byId = new Map(upserts.map((u) => [u.id, u]));
    const next: T[] = [];
    for (const it of this.snapshot.items) {
      if (removed.has(it.id)) continue;
      const u = byId.get(it.id);
      next.push(u ?? it);
      byId.delete(it.id);
    }
    next.push(...byId.values());
    this.set({ items: next });
  }

  async putMany(items: T[]): Promise<void> {
    if (!items.length) return;
    this.apply(items);
    try {
      await Promise.all(items.map((i) => dbService.put(this.name, i)));
    } catch (e) {
      await this.load();
      throw e;
    }
  }

  put(item: T): Promise<void> {
    return this.putMany([item]);
  }

  async removeMany(ids: string[]): Promise<void> {
    if (!ids.length) return;
    this.apply([], ids);
    try {
      await Promise.all(ids.map((id) => dbService.delete(this.name, id)));
    } catch (e) {
      await this.load();
      throw e;
    }
  }

  remove(id: string): Promise<void> {
    return this.removeMany([id]);
  }

  /** Records written by the sync engine (own writes or inbound) — instant UI update. */
  applyExternal(records: T[]) {
    if (!this.snapshot.loaded) return;
    const live = records.filter((r: any) => !r.deleted);
    const gone = records.filter((r: any) => r.deleted).map((r) => r.id);
    this.apply(live, gone);
  }

  /** Device-local field update (no updatedAt stamp, no cloud push). */
  async patchLocal(id: string, fields: Partial<T>): Promise<void> {
    const cur = this.snapshot.items.find((x) => x.id === id);
    if (cur) this.apply([{ ...cur, ...fields }]);
    // Merge onto the persisted row so its sync timestamps stay untouched.
    const row = await dbService.get<T>(this.name, id);
    if (row) await dbService.putLocalOnly(this.name, { ...row, ...fields });
  }

  /** Drop cached rows (account switch). Subscribers reload on next access. */
  reset() {
    this.generation++;
    this.inflight = null;
    this.set({ items: [], loaded: false, error: null });
    if (this.listeners.size) void this.load();
  }
}

const stores = new Map<string, CollectionStore<any>>();
let busWired = false;

export function getStore<T extends { id: string }>(name: string): CollectionStore<T> {
  if (!busWired) {
    busWired = true;
    onDataChange((coll, records) => stores.get(coll)?.applyExternal(records as any));
  }
  let s = stores.get(name);
  if (!s) {
    s = new CollectionStore<T>(name);
    stores.set(name, s);
  }
  return s as CollectionStore<T>;
}

export function resetAllStores(): void {
  stores.forEach((s) => s.reset());
}
