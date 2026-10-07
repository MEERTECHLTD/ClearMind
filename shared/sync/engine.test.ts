import { describe, it, expect } from 'vitest';
import { SyncEngine, type LocalAdapter, type RemoteAdapter, type OutboxEntry } from './engine';
import { stampEdit, type Rec } from './fields';
import { createTask, completeTask, updateTask, deleteTask, applyEdits, type DomainState } from '../domain/ops';

// ------------------------------------------------------------------ test doubles

/** Firestore-like server: merge-writes (deep for maps), monotonic server timestamps, delta listeners. */
class MemoryServer {
  docs = new Map<string, Map<string, Rec>>();
  private clock = 1000;
  private listeners: { coll: string; since: number | null; cb: (d: Rec[]) => void }[] = [];
  writes = 0;
  failNext = 0;

  write(coll: string, patches: Rec[]) {
    if (this.failNext > 0) { this.failNext--; throw new Error('network error: unavailable'); }
    const c = this.docs.get(coll) ?? new Map();
    this.docs.set(coll, c);
    const changed: Rec[] = [];
    for (const p of patches) {
      const cur = c.get(p.id) ?? {};
      const next: Rec = { ...cur, ...p, _fc: { ...(cur._fc ?? {}), ...(p._fc ?? {}) }, _serverMs: ++this.clock };
      c.set(p.id, next);
      changed.push(next);
      this.writes++;
    }
    for (const l of this.listeners) if (l.coll === coll) l.cb(changed.map((d) => ({ ...d })));
  }
  all(coll: string) { return [...(this.docs.get(coll)?.values() ?? [])].map((d) => ({ ...d })); }
  get(coll: string, id: string) { return this.docs.get(coll)?.get(id); }
  subscribe(coll: string, since: number | null, cb: (d: Rec[]) => void) {
    const l = { coll, since, cb };
    this.listeners.push(l);
    const initial = this.all(coll).filter((d) => since == null || d._serverMs >= since);
    if (initial.length) cb(initial);
    return () => { this.listeners = this.listeners.filter((x) => x !== l); };
  }
}

class MemoryRemote implements RemoteAdapter {
  online = true;
  constructor(private server: MemoryServer) {}
  isOnline() { return this.online; }
  async push(coll: string, patches: Rec[]) { if (!this.online) throw new Error('offline'); this.server.write(coll, patches); }
  subscribe(coll: string, since: number | null, onDocs: (d: Rec[]) => void, _onError?: (e: unknown) => void) {
    return this.server.subscribe(coll, since, (d) => { if (this.online) onDocs(d); });
  }
  async fetchAll(coll: string) { if (!this.online) throw new Error('offline'); return this.server.all(coll); }
}

class MemoryLocal implements LocalAdapter {
  data = new Map<string, Map<string, Rec>>();
  out = new Map<string, OutboxEntry>();
  meta = new Map<string, string>();
  async get(coll: string, id: string) { const r = this.data.get(coll)?.get(id); return r ? { ...r } : undefined; }
  async getAllIncludingDeleted(coll: string) { return [...(this.data.get(coll)?.values() ?? [])]; }
  async putMany(coll: string, recs: Rec[]) { const c = this.data.get(coll) ?? new Map(); this.data.set(coll, c); for (const r of recs) c.set(r.id, { ...r }); }
  async outboxAll() { return [...this.out.values()]; }
  async outboxPut(e: OutboxEntry[]) { for (const x of e) this.out.set(x.key, x); }
  async outboxDelete(k: string[]) { for (const x of k) this.out.delete(x); }
  async getMeta(k: string) { return this.meta.get(k) ?? null; }
  async setMeta(k: string, v: string) { this.meta.set(k, v); }
}

const COLLS = ['tasks', 'completions', 'activity'];
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 10; i++) await tick(); }

function client(name: string, server: MemoryServer, t0: number) {
  const local = new MemoryLocal();
  const remote = new MemoryRemote(server);
  let t = t0;
  const engine = new SyncEngine(local, { clientId: name, collections: COLLS, onLocalChange: () => {}, now: () => new Date(t += 1000) });
  const state = async (): Promise<DomainState> => ({
    tasks: (await local.getAllIncludingDeleted('tasks')) as any, projects: [], labels: [], sections: [],
    completions: (await local.getAllIncludingDeleted('completions')) as any,
  });
  return { name, local, remote, engine, state, task: (id: string) => local.data.get('tasks')?.get(id) };
}

const NOW = new Date(2026, 9, 7, 10);

describe('SyncEngine — multi-client', () => {
  it('propagates a create from one client to another in realtime', async () => {
    const server = new MemoryServer();
    const a = client('android', server, Date.now());
    const w = client('web', server, Date.now());
    await a.engine.start(a.remote);
    await w.engine.start(w.remote);
    const r = createTask(await a.state(), { title: 'Prepare Odyssey docs' }, { source: 'android', now: NOW });
    await a.engine.apply(r.edits);
    await settle();
    expect(server.get('tasks', r.result.id)?.title).toBe('Prepare Odyssey docs');
    expect(w.task(r.result.id)?.title).toBe('Prepare Odyssey docs');
    expect(a.engine.pendingCount()).toBe(0);
  });

  it('queues offline changes and sends them on reconnect', async () => {
    const server = new MemoryServer();
    const a = client('android', server, Date.now());
    a.remote.online = false;
    await a.engine.start(a.remote);
    const r = createTask(await a.state(), { title: 'Offline task' }, { source: 'android', now: NOW });
    await a.engine.apply(r.edits);
    await settle();
    expect(a.engine.pendingCount()).toBeGreaterThan(0);
    expect(a.engine.getStatus().state).toBe('offline');
    expect(server.get('tasks', r.result.id)).toBeUndefined();
    a.remote.online = true;
    a.engine.onOnline();
    await settle();
    expect(server.get('tasks', r.result.id)?.title).toBe('Offline task');
    expect(a.engine.pendingCount()).toBe(0);
  });

  it('keeps both concurrent edits to different fields (complete on mobile, description on web)', async () => {
    const server = new MemoryServer();
    const a = client('android', server, Date.now());
    const w = client('web', server, Date.now() + 500);
    await a.engine.start(a.remote);
    await w.engine.start(w.remote);
    const r = createTask(await a.state(), { title: 'Ship v2' }, { source: 'android', now: NOW });
    await a.engine.apply(r.edits);
    await settle();
    a.remote.online = false;
    w.remote.online = false;
    await a.engine.apply(completeTask(await a.state(), r.result.id, { source: 'android', now: NOW }).edits);
    await w.engine.apply(updateTask(await w.state(), r.result.id, { description: 'Release notes in Notion' }, { source: 'web', now: NOW }).edits);
    a.remote.online = true; w.remote.online = true;
    a.engine.onOnline(); w.engine.onOnline();
    await settle();
    await a.engine.reconcileAll(); await w.engine.reconcileAll();
    await settle();
    for (const rec of [server.get('tasks', r.result.id), a.task(r.result.id), w.task(r.result.id)]) {
      expect(rec?.completed).toBe(true);
      expect(rec?.description).toBe('Release notes in Notion');
    }
    // Exactly one completion event, everywhere.
    expect(server.all('completions').filter((c) => !c.deleted)).toHaveLength(1);
  });

  it('a stale offline device cannot resurrect a deleted task', async () => {
    const server = new MemoryServer();
    const a = client('android', server, Date.now());
    const w = client('web', server, Date.now());
    await a.engine.start(a.remote);
    await w.engine.start(w.remote);
    const r = createTask(await w.state(), { title: 'Temp' }, { source: 'web', now: NOW });
    await w.engine.apply(r.edits);
    await settle();
    a.remote.online = false;
    await w.engine.apply(deleteTask(await w.state(), r.result.id, { source: 'web', now: NOW }).edits);
    await settle();
    // Android edits the title while offline (it hasn't seen the delete).
    await a.engine.apply(updateTask(await a.state(), r.result.id, { title: 'Temp (edited)' }, { source: 'android', now: NOW }).edits);
    a.remote.online = true;
    a.engine.onOnline();
    await settle();
    await a.engine.reconcileAll();
    await settle();
    expect(server.get('tasks', r.result.id)?.deleted).toBe(true);
    expect(a.task(r.result.id)?.deleted).toBe(true);
  });

  it('retries failed pushes without duplicating records', async () => {
    const server = new MemoryServer();
    const a = client('android', server, Date.now());
    await a.engine.start(a.remote);
    server.failNext = 1;
    const r = createTask(await a.state(), { title: 'Retry me', idempotencyKey: 'abc' }, { source: 'android', now: NOW });
    await a.engine.apply(r.edits);
    await settle();
    expect(a.engine.pendingCount()).toBeGreaterThan(0);
    await a.engine.flush();
    await settle();
    expect(server.all('tasks')).toHaveLength(1);
    // Re-applying the same idempotent create is a no-op.
    const again = createTask(await a.state(), { title: 'Retry me', idempotencyKey: 'abc' }, { source: 'android', now: NOW });
    expect(again.edits).toHaveLength(0);
  });

  it('agent writes straight to the server reach every client; client completions reach the agent', async () => {
    const server = new MemoryServer();
    const a = client('android', server, Date.now());
    const w = client('web', server, Date.now());
    await a.engine.start(a.remote);
    await w.engine.start(w.remote);
    // An MCP agent: reads authoritative server state, runs the domain op, writes field patches.
    const serverState = (): DomainState => ({ tasks: server.all('tasks') as any, projects: [], labels: [], sections: [], completions: server.all('completions') as any });
    const op = createTask(serverState(), { title: 'Launch checklist', idempotencyKey: 'mcp-1' }, { source: 'mcp', agent: 'Claude Code', now: NOW });
    for (const e of op.edits) server.write(e.coll, [stampEdit(server.get(e.coll, e.id) as any, { ...e.edit, id: e.id }, { clientId: 'mcp' }).patch]);
    await settle();
    expect(a.task(op.result.id)?.agent).toBe('Claude Code');
    expect(w.task(op.result.id)?.title).toBe('Launch checklist');
    await a.engine.apply(completeTask(await a.state(), op.result.id, { source: 'android', now: NOW }).edits);
    await settle();
    expect(serverState().tasks[0].completed).toBe(true);
  });

  it('delta sync: a restarted client only downloads changes after its cursor', async () => {
    const server = new MemoryServer();
    const a = client('android', server, Date.now());
    await a.engine.start(a.remote);
    let s: DomainState = await a.state();
    for (const title of ['one', 'two', 'three']) { const r = createTask(s, { title }, { source: 'android', now: NOW }); s = applyEdits(s, r.edits); await a.engine.apply(r.edits); }
    await settle();
    a.engine.stop();
    const cursor = Number(await a.local.getMeta('cursor:tasks'));
    expect(cursor).toBeGreaterThan(0);
    const seen: number[] = [];
    const counting: RemoteAdapter = { ...a.remote, push: a.remote.push.bind(a.remote), fetchAll: a.remote.fetchAll.bind(a.remote),
      subscribe: (coll, since, cb, err) => a.remote.subscribe(coll, since, (d) => { if (coll === 'tasks') seen.push(d.length); cb(d); }, err) };
    await a.engine.start(counting);
    await settle();
    // Only the doc(s) at the cursor boundary are re-sent, not the whole collection.
    expect(seen.reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(1);
  });

  it('a widget writing from another JS context is absorbed: the app reloads the outbox and pushes it', async () => {
    const server = new MemoryServer();
    const app = client('android', server, Date.now());
    await app.engine.start(app.remote);
    const r = createTask(await app.state(), { title: 'From widget' }, { source: 'android', now: NOW });
    await app.engine.apply(r.edits);
    await settle();
    // Headless widget context: same storage, its own engine, offline (no session).
    const widget = new SyncEngine(app.local, { clientId: 'android', collections: COLLS, onLocalChange: () => {} });
    await widget.apply(completeTask(await app.state(), r.result.id, { source: 'widget', now: NOW }).edits);
    expect(server.get('tasks', r.result.id)?.completed).toBeFalsy();
    await app.engine.reloadOutbox();
    expect(app.engine.pendingCount()).toBeGreaterThan(0);
    await app.engine.flush();
    expect(server.get('tasks', r.result.id)?.completed).toBe(true);
    expect(app.engine.pendingCount()).toBe(0);
  });
});
