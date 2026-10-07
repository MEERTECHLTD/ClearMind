/**
 * SyncEngine — the one synchronization engine used by every client with local
 * storage (Android/iOS via sqlite, web via IndexedDB). Agents/API/CLI write
 * straight to Firestore through the same field-level model.
 *
 *  Write path (optimistic, offline-first)
 *    apply(edits) → stampEdit on the CURRENT local record (field clocks)
 *                 → write locally + notify the UI immediately
 *                 → merge the change into a persistent OUTBOX (one entry per record)
 *                 → flush(): push outbox patches as Firestore merge-writes stamped
 *                   with a server timestamp; entries are removed only after the
 *                   server acknowledged them (retried with backoff otherwise).
 *
 *  Read path (realtime + incremental)
 *    one listener per collection on `_serverAt >= cursor` (delta sync — only
 *    changes since the last seen server timestamp are downloaded); each
 *    incoming doc is merged field-by-field with the local copy; if the local
 *    copy has unsent changes, the outbox patch is recomputed so it never
 *    overwrites a newer server value.
 *
 *  Full reconcile (rare): fetch everything once a day / on demand, merge
 *  field-by-field — catches records written by legacy clients.
 */
import { stampEdit, mergeRecord, type Rec } from './fields';

export interface OutboxEntry {
  key: string;     // `${coll}/${id}`
  coll: string;
  id: string;
  patch: Rec;
  attempts: number;
  lastError?: string | null;
  queuedAt: string;
}

export interface LocalAdapter {
  get(coll: string, id: string): Promise<Rec | undefined>;
  getAllIncludingDeleted(coll: string): Promise<Rec[]>;
  putMany(coll: string, records: Rec[]): Promise<void>;
  outboxAll(): Promise<OutboxEntry[]>;
  outboxPut(entries: OutboxEntry[]): Promise<void>;
  outboxDelete(keys: string[]): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

export interface RemoteAdapter {
  /** Merge-write patches (adds the server timestamp). */
  push(coll: string, patches: Rec[]): Promise<void>;
  /** Realtime delta listener. `sinceMs` null = everything. Docs carry `_serverMs`. */
  subscribe(coll: string, sinceMs: number | null, onDocs: (docs: Rec[]) => void, onError: (e: unknown) => void): () => void;
  fetchAll(coll: string): Promise<Rec[]>;
  isOnline?(): boolean;
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error';
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface EngineEdit { coll: string; id: string; edit: Record<string, any> }

export interface EngineOptions {
  clientId: string;
  collections: string[];
  /** Called after local data changed (own writes or inbound) — refresh UI stores. */
  onLocalChange: (coll: string, records: Rec[]) => void;
  /** Collections that are pushed but never pulled (e.g. none). */
  pushOnly?: string[];
  log?: (msg: string) => void;
  now?: () => Date;
}

const keyOf = (coll: string, id: string) => `${coll}/${id}`;

/** Merge two queued patches for the same record (later fields win, clocks merged). */
export function mergePatches(a: Rec, b: Rec): Rec {
  return { ...a, ...b, _fc: { ...(a._fc ?? {}), ...(b._fc ?? {}) } };
}

export class SyncEngine {
  private outbox = new Map<string, OutboxEntry>();
  private loaded = false;
  private unsubs: (() => void)[] = [];
  private flushing: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;
  private status: SyncStatus = { state: 'idle', pending: 0, lastSyncedAt: null, error: null };
  private statusListeners = new Set<(s: SyncStatus) => void>();
  private remote: RemoteAdapter | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private local: LocalAdapter, private opts: EngineOptions) {}

  // ---------------------------------------------------------------- status

  getStatus = () => this.status;
  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => { this.statusListeners.delete(cb); };
  }
  private setStatus(p: Partial<SyncStatus>) {
    this.status = { ...this.status, ...p, pending: this.outbox.size };
    this.statusListeners.forEach((l) => l(this.status));
  }

  /** Serialize all mutations of local state (prevents interleaved read-modify-write). */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async loadOutbox() {
    if (this.loaded) return;
    for (const e of await this.local.outboxAll()) this.outbox.set(e.key, e);
    this.loaded = true;
    this.setStatus({});
  }

  // ---------------------------------------------------------------- writes

  /**
   * Apply domain edits locally (optimistic) and queue them for the cloud.
   * Returns the new full records.
   */
  apply(edits: EngineEdit[], mutationId?: string): Promise<Rec[]> {
    return this.serial(async () => {
      await this.loadOutbox();
      const now = (this.opts.now?.() ?? new Date()).toISOString();
      const byColl = new Map<string, Rec[]>();
      const queued: OutboxEntry[] = [];
      const out: Rec[] = [];
      // Several edits may target the same record within one operation.
      const working = new Map<string, Rec | undefined>();
      for (const e of edits) {
        const k = keyOf(e.coll, e.id);
        const current = working.has(k) ? working.get(k) : await this.local.get(e.coll, e.id);
        const s = stampEdit(current, { ...e.edit, id: e.id }, { clientId: this.opts.clientId, now, mutationId });
        working.set(k, s.record);
        if (!s.changed.length) { if (current) out.push(current); continue; }
        out.push(s.record);
        const list = byColl.get(e.coll) ?? [];
        const i = list.findIndex((r) => r.id === e.id);
        if (i >= 0) list[i] = s.record; else list.push(s.record);
        byColl.set(e.coll, list);
        const prev = this.outbox.get(k);
        const entry: OutboxEntry = {
          key: k, coll: e.coll, id: e.id,
          patch: prev ? mergePatches(prev.patch, s.patch) : s.patch,
          attempts: 0, lastError: null, queuedAt: prev?.queuedAt ?? now,
        };
        this.outbox.set(k, entry);
        const qi = queued.findIndex((q) => q.key === k);
        if (qi >= 0) queued[qi] = entry; else queued.push(entry);
      }
      for (const [coll, recs] of byColl) await this.local.putMany(coll, recs);
      if (queued.length) await this.local.outboxPut(queued);
      for (const [coll, recs] of byColl) this.opts.onLocalChange(coll, recs);
      this.setStatus({});
      if (queued.length) void this.flush();
      return out;
    });
  }

  /** Push the outbox. Safe to call any time; concurrent calls share one run. */
  flush(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      await this.loadOutbox();
      const remote = this.remote;
      if (!remote || !this.outbox.size) { this.setStatus({ state: 'idle' }); return; }
      if (remote.isOnline && !remote.isOnline()) { this.setStatus({ state: 'offline' }); return; }
      this.setStatus({ state: 'syncing' });
      const snapshot = [...this.outbox.values()];
      const byColl = new Map<string, OutboxEntry[]>();
      for (const e of snapshot) byColl.set(e.coll, [...(byColl.get(e.coll) ?? []), e]);
      let failed: unknown = null;
      for (const [coll, entries] of byColl) {
        try {
          await remote.push(coll, entries.map((e) => e.patch));
          // Remove only entries unchanged since we read them (a newer edit may have merged in).
          const done = entries.filter((e) => this.outbox.get(e.key) === e).map((e) => e.key);
          for (const k of done) this.outbox.delete(k);
          await this.local.outboxDelete(done);
        } catch (err) {
          failed = err;
          for (const e of entries) {
            const cur = this.outbox.get(e.key);
            if (cur) this.outbox.set(e.key, { ...cur, attempts: cur.attempts + 1, lastError: String((err as any)?.message ?? err) });
          }
          await this.local.outboxPut(entries.map((e) => this.outbox.get(e.key)!).filter(Boolean));
        }
      }
      if (failed) {
        const msg = String((failed as any)?.message ?? failed);
        const offline = /offline|network|unavailable|failed to fetch|timeout/i.test(msg);
        this.setStatus({ state: offline ? 'offline' : 'error', error: offline ? null : msg });
        this.scheduleRetry();
      } else {
        this.backoff = 1000;
        this.setStatus({ state: 'idle', error: null, lastSyncedAt: new Date().toISOString() });
      }
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60_000);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.flush(); }, delay);
  }

  /** Call when connectivity returns. */
  onOnline() {
    this.backoff = 1000;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    void this.flush();
  }

  // ---------------------------------------------------------------- reads

  /** Merge inbound remote docs into local state. */
  ingest(coll: string, docs: Rec[]): Promise<void> {
    return this.serial(async () => {
      await this.loadOutbox();
      const changed: Rec[] = [];
      const outboxPut: OutboxEntry[] = [];
      const outboxDel: string[] = [];
      let maxMs = 0;
      for (const raw of docs) {
        const { _serverMs, _serverAt, syncedAt, ...remote } = raw as any;
        if (typeof _serverMs === 'number') maxMs = Math.max(maxMs, _serverMs);
        if (!remote.id) continue;
        const k = keyOf(coll, remote.id);
        const local = await this.local.get(coll, remote.id);
        const m = mergeRecord(local, remote);
        if (m.localChanged || !local) changed.push(m.merged);
        const pending = this.outbox.get(k);
        if (pending || (m.remoteChanged && local)) {
          if (m.remotePatch) {
            const entry: OutboxEntry = { key: k, coll, id: remote.id, patch: m.remotePatch, attempts: pending?.attempts ?? 0, queuedAt: pending?.queuedAt ?? new Date().toISOString() };
            this.outbox.set(k, entry);
            outboxPut.push(entry);
          } else if (pending) {
            this.outbox.delete(k);
            outboxDel.push(k);
          }
        }
      }
      if (changed.length) await this.local.putMany(coll, changed);
      if (outboxPut.length) await this.local.outboxPut(outboxPut);
      if (outboxDel.length) await this.local.outboxDelete(outboxDel);
      if (maxMs) {
        const prev = Number(await this.local.getMeta(`cursor:${coll}`) ?? 0);
        if (maxMs > prev) await this.local.setMeta(`cursor:${coll}`, String(maxMs));
      }
      if (changed.length) this.opts.onLocalChange(coll, changed);
      this.setStatus({ lastSyncedAt: new Date().toISOString() });
      if (outboxPut.length) void this.flush();
    });
  }

  /** Start realtime delta sync for all collections. */
  async start(remote: RemoteAdapter): Promise<void> {
    this.stop();
    this.remote = remote;
    await this.loadOutbox();
    for (const coll of this.opts.collections) {
      if (this.opts.pushOnly?.includes(coll)) continue;
      const cursor = await this.local.getMeta(`cursor:${coll}`);
      const since = cursor ? Number(cursor) : null;
      this.unsubs.push(remote.subscribe(coll, since, (docs) => { void this.ingest(coll, docs); }, (e) => {
        this.opts.log?.(`listener ${coll}: ${String(e)}`);
        this.setStatus({ state: 'error', error: String((e as any)?.message ?? e) });
      }));
    }
    void this.flush();
  }

  stop() {
    this.unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
    this.unsubs = [];
    this.remote = null;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  /**
   * Full field-level reconcile of every collection (fetch all, merge both ways).
   * Used once a day and by "Sync now" — catches writes from legacy clients that
   * don't carry server timestamps.
   */
  async reconcileAll(remote: RemoteAdapter | null = this.remote): Promise<{ pulled: number; pushed: number; failed: string[] }> {
    if (!remote) return { pulled: 0, pushed: 0, failed: [] };
    let pulled = 0, pushed = 0;
    const failed: string[] = [];
    for (const coll of this.opts.collections) {
      try {
        const cloud = await remote.fetchAll(coll);
        const cloudIds = new Set(cloud.map((d) => d.id));
        await this.ingest(coll, cloud);
        pulled += cloud.length;
        // Local-only records (created offline before the outbox existed) → push.
        const locals = await this.local.getAllIncludingDeleted(coll);
        const missing = locals.filter((r) => !cloudIds.has(r.id));
        if (missing.length) {
          await this.serial(async () => {
            const entries = missing.map((r) => {
              const { _dirty, reminderId, ...rest } = r as any;
              const e: OutboxEntry = { key: keyOf(coll, r.id), coll, id: r.id, patch: rest, attempts: 0, queuedAt: new Date().toISOString() };
              this.outbox.set(e.key, this.outbox.has(e.key) ? { ...e, patch: mergePatches(rest, this.outbox.get(e.key)!.patch) } : e);
              return this.outbox.get(e.key)!;
            });
            await this.local.outboxPut(entries);
          });
          pushed += missing.length;
        }
      } catch (e) {
        failed.push(coll);
        this.opts.log?.(`reconcile ${coll}: ${String(e)}`);
      }
    }
    await this.flush();
    await this.local.setMeta('lastReconcile', new Date().toISOString());
    return { pulled, pushed, failed };
  }

  pendingCount() { return this.outbox.size; }
}
