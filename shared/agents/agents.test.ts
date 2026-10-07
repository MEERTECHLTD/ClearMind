import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { AgentAudit, AgentToken, Activity } from '../types';
import { stampEdit } from '../sync/fields';
import { authenticate, callTool, toolManifest, type AgentRepo, type FullState, type AuthContext } from './tools';
import { makeToken, parseToken, secretFromBytes } from './tokens';
import type { Edit } from '../domain';

const sha256 = async (s: string) => createHash('sha256').update(s).digest('hex');
const UID = 'UserAbc123UserAbc123xy';
const NOW = new Date(2026, 9, 7, 10, 0, 0);

/** In-memory Firestore-like repo (field-level patches, like the real adapters). */
class MemRepo implements AgentRepo {
  docs = new Map<string, Map<string, any>>();
  tokens = new Map<string, AgentToken>();
  audits: AgentAudit[] = [];
  commits = 0;
  private coll(c: string) { let m = this.docs.get(c); if (!m) { m = new Map(); this.docs.set(c, m); } return m; }
  all(c: string) { return [...this.coll(c).values()]; }
  async loadState(): Promise<FullState> {
    return {
      tasks: this.all('tasks'), projects: this.all('projects'), labels: this.all('labels'), sections: this.all('sections'),
      comments: this.all('comments'), completions: this.all('completions'), filters: this.all('filters'), preferences: this.coll('preferences').get('preferences') ?? null,
      notes: this.all('notes'),
    };
  }
  async commit(_uid: string, edits: Edit[], meta: { clientId: string; mutationId: string }) {
    this.commits++;
    for (const e of edits) {
      const c = this.coll(e.coll);
      const r = stampEdit(c.get(e.id), { ...e.edit, id: e.id }, { clientId: meta.clientId, mutationId: meta.mutationId });
      c.set(e.id, r.record);
    }
  }
  async getToken(_uid: string, hash: string) { return this.tokens.get(hash) ?? null; }
  async touchToken() {}
  async audit(_uid: string, a: AgentAudit) { this.audits.push(a); }
  async recentActivity(): Promise<Activity[]> { return this.all('activity').sort((a, b) => b.at.localeCompare(a.at)); }
}

let repo: MemRepo;
let full: AuthContext;
let readonly: AuthContext;

async function issue(name: string, scopes: AgentToken['scopes'], over: Partial<AgentToken> = {}) {
  const seed = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const token = makeToken(UID, secretFromBytes(new Uint8Array(40).map((_, i) => (i * 37 + seed) % 255)));
  const hash = await sha256(token);
  repo.tokens.set(hash, { id: hash, name, scopes, createdAt: NOW.toISOString(), prefix: token.slice(0, 7), rateLimit: 1000, ...over });
  return token;
}
const call = async (auth: AuthContext, name: string, args: any = {}) => callTool(repo, auth, name, args, { sha256, now: NOW });
const ok = async (auth: AuthContext, name: string, args: any = {}) => {
  const r = await call(auth, name, args);
  if (!r.ok) { const e = (r as { error: { code: string; message: string } }).error; throw new Error(`${name} failed: ${e.code} ${e.message}`); }
  return r.result as any;
};

beforeEach(async () => {
  repo = new MemRepo();
  full = await authenticate(repo, await issue('Claude Code', ['tasks:read', 'tasks:write', 'tasks:delete', 'projects:read', 'projects:write', 'projects:delete', 'productivity:read', 'bulk']), sha256, 'mcp');
  readonly = await authenticate(repo, await issue('Reader', ['tasks:read', 'projects:read', 'productivity:read']), sha256, 'api');
});

describe('tokens & auth', () => {
  it('parses tokens and rejects malformed ones', () => {
    const t = makeToken(UID, 'A'.repeat(40));
    expect(parseToken(t)).toEqual({ uid: UID, secret: 'A'.repeat(40) });
    expect(parseToken('nope')).toBeNull();
    expect(parseToken(`cm_${UID}_short`)).toBeNull();
  });
  it('rejects unknown and revoked tokens', async () => {
    await expect(authenticate(repo, makeToken(UID, 'B'.repeat(40)), sha256, 'mcp')).rejects.toThrow(/Unknown token/);
    const t = await issue('Old', ['tasks:read'], { revoked: true });
    await expect(authenticate(repo, t, sha256, 'mcp')).rejects.toThrow(/revoked/);
    await expect(authenticate(repo, undefined, sha256, 'mcp')).rejects.toThrow(/Missing/);
  });
  it('enforces scopes and audits every call', async () => {
    const r = await call(readonly, 'tasks_create', { title: 'x' });
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    await ok(readonly, 'views_today');
    expect(repo.audits.map((a) => [a.tool, a.ok, a.agent])).toEqual([['tasks_create', false, 'Reader'], ['views_today', true, 'Reader']]);
  });
  it('rate-limits per token', async () => {
    const limited = await authenticate(repo, await issue('Spammy', ['tasks:read'], { rateLimit: 2 }), sha256, 'api');
    await ok(limited, 'views_today');
    await ok(limited, 'views_today');
    expect(await call(limited, 'views_today')).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
  });
  it('validates input', async () => {
    expect(await call(full, 'tasks_create', {})).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(await call(full, 'tasks_create', { title: 'x', due_date: 'tomorrow' })).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(await call(full, 'nope_tool')).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });
});

describe('example agent workflows', () => {
  it('"Create a task for tomorrow."', async () => {
    const t = await ok(full, 'tasks_create', { title: 'Prepare Odyssey payment-history endpoint documentation', due_string: 'tomorrow' });
    expect(t).toMatchObject({ due: { date: '2026-10-08', human: 'Tomorrow' }, source: 'mcp', agent: 'Claude Code', project: 'Inbox' });
    // Visible to every client through the same data (and attributed in activity).
    expect(repo.all('activity')[0]).toMatchObject({ action: 'created', source: 'mcp', agent: 'Claude Code' });
  });

  it('"Show me everything overdue."', async () => {
    await ok(full, 'tasks_create', { title: 'Old invoice', due_date: '2026-10-01' });
    await ok(full, 'tasks_create', { title: 'Future', due_date: '2026-10-20' });
    const r = await ok(full, 'views_overdue');
    expect(r.tasks.map((t: any) => t.title)).toEqual(['Old invoice']);
  });

  it('"Add this thought to my Inbox."', async () => {
    const n = await ok(full, 'inbox_capture', { text: 'Maybe offer annual billing for RanaWallet', kind: 'note' });
    expect(n).toMatchObject({ kind: 'note', project: 'Inbox' });
    expect((await ok(full, 'inbox_list')).items.map((i: any) => i.title)).toContain('Maybe offer annual billing for RanaWallet');
  });

  it('"Create a recurring task every Friday at 4 PM."', async () => {
    const t = await ok(full, 'tasks_create', { title: 'Weekly report', due_string: 'every Friday at 4pm' });
    expect(t).toMatchObject({ due: { date: '2026-10-09', time: '16:00' }, recurrence: 'Every Friday' });
    const done = await ok(full, 'tasks_complete', { id: t.id });
    expect(done.next_due).toBe('2026-10-16');
    expect(repo.all('completions')).toHaveLength(1);
  });

  it('"Move all incomplete tasks from Project A to Project B." (with confirmation over 25)', async () => {
    await ok(full, 'projects_create', { name: 'Project A' });
    await ok(full, 'projects_create', { name: 'Project B' });
    for (let i = 0; i < 30; i++) await ok(full, 'tasks_create', { title: `Task ${i}`, project: 'Project A', idempotency_key: `a${i}` });
    const first = await call(full, 'tasks_move', { query: '##Project A', project: 'Project B' });
    expect(first).toMatchObject({ ok: false, error: { code: 'confirm_required', data: { count: 30 } } });
    const token = (first as any).error.data.confirm_token;
    const moved = await ok(full, 'tasks_move', { query: '##Project A', project: 'Project B', confirm_token: token });
    expect(moved.affected).toBe(30);
    const b = (await ok(full, 'projects_list')).find((p: any) => p.name === 'Project B');
    expect(b.open).toBe(30);
  });

  it('"Move everything Flutterwave into a Payments section and make the production-key question P1."', async () => {
    await ok(full, 'projects_create', { name: 'RanaWallet' });
    await ok(full, 'tasks_create', { title: 'Flutterwave webhook retries', project: 'RanaWallet' });
    const key = await ok(full, 'tasks_create', { title: 'Ask Flutterwave about production keys', project: 'RanaWallet' });
    await ok(full, 'tasks_create', { title: 'Design onboarding', project: 'RanaWallet' });
    await ok(full, 'sections_create', { project: 'RanaWallet', name: 'Payments' });
    const found = await ok(full, 'search_global', { query: 'flutterwave' });
    await ok(full, 'tasks_move', { ids: found.tasks.map((t: any) => t.id), project: 'RanaWallet', section: 'Payments' });
    await ok(full, 'tasks_update', { id: key.id, priority: 'p1' });
    const p = await ok(full, 'projects_get', { project: 'RanaWallet' });
    expect(p.sections[0].name).toBe('Payments');
    expect(p.sections[0].tasks.map((t: any) => [t.title, t.priority]).sort()).toEqual([['Ask Flutterwave about production keys', 'p1'], ['Flutterwave webhook retries', 'p4']]);
    expect(p.no_section.map((t: any) => t.title)).toEqual(['Design onboarding']);
    expect(p.recent_activity.some((a: any) => a.action === 'priority' && a.agent === 'Claude Code')).toBe(true);
  });

  it('"What is blocking launch?" — project stats expose blockers', async () => {
    await ok(full, 'projects_create', { name: 'Launch', sections: ['Blocks the build', 'Backlog'] });
    await ok(full, 'tasks_create', { title: 'Fix signing', project: 'Launch', section: 'Blocks the build', priority: 'p1' });
    const p = await ok(full, 'projects_get', { project: 'Launch' });
    expect(p.stats.blocked).toBe(1);
    expect(p.sections[0].tasks[0].title).toBe('Fix signing');
  });
});

describe('safety', () => {
  it('bulk delete is always two-step and needs the bulk scope', async () => {
    const t = await ok(full, 'tasks_create', { title: 'Temp' });
    const first = await call(full, 'tasks_bulk_delete', { ids: [t.id] });
    expect(first).toMatchObject({ ok: false, error: { code: 'confirm_required' } });
    expect(repo.all('tasks')[0].deleted).toBeFalsy();
    await ok(full, 'tasks_bulk_delete', { ids: [t.id], confirm_token: (first as any).error.data.confirm_token });
    expect(repo.all('tasks')[0].deleted).toBe(true);
    // A wrong token never executes.
    const t2 = await ok(full, 'tasks_create', { title: 'Keep' });
    expect(await call(full, 'tasks_bulk_delete', { ids: [t2.id], confirm_token: 'deadbeefdeadbeef' })).toMatchObject({ ok: false, error: { code: 'confirm_required' } });
  });
  it('project deletion requires confirmation', async () => {
    await ok(full, 'projects_create', { name: 'Doomed' });
    const r = await call(full, 'projects_delete', { project: 'Doomed' });
    expect(r).toMatchObject({ ok: false, error: { code: 'confirm_required', data: { projects: 1, tasks: 0 } } });
    await ok(full, 'projects_delete', { project: 'Doomed', confirm_token: (r as any).error.data.confirm_token });
    expect(repo.all('projects')[0].deleted).toBe(true);
  });
  it('idempotency keys prevent duplicates on retries', async () => {
    await ok(full, 'tasks_create', { title: 'Once', idempotency_key: 'retry-1' });
    await ok(full, 'tasks_create', { title: 'Once', idempotency_key: 'retry-1' });
    await ok(full, 'inbox_capture', { text: 'Once more', idempotency_key: 'retry-2' });
    await ok(full, 'inbox_capture', { text: 'Once more', idempotency_key: 'retry-2' });
    expect(repo.all('tasks').filter((t) => !t.deleted)).toHaveLength(2);
  });
  it('a deleted task can be restored', async () => {
    const t = await ok(full, 'tasks_create', { title: 'Oops' });
    await ok(full, 'tasks_delete', { id: t.id });
    await ok(full, 'tasks_restore', { ids: [t.id] });
    expect(repo.all('tasks')[0].deleted).toBe(false);
  });
  it('exposes a complete manifest with JSON schemas', () => {
    const m = toolManifest();
    expect(m.length).toBeGreaterThan(30);
    for (const t of m) {
      expect(t.name).toMatch(/^[a-z_]{3,64}$/);
      expect(t.inputSchema.type).toBe('object');
      // search/fetch need tasks:read OR notes:read (checked inside the tool).
      if (!['search', 'fetch'].includes(t.name)) expect(t.scopes.length).toBeGreaterThan(0);
    }
  });
  it('productivity reads match what the apps compute', async () => {
    const t = await ok(full, 'tasks_create', { title: 'Done today', due_string: 'today' });
    await ok(full, 'tasks_complete', { id: t.id });
    const p = await ok(full, 'productivity_summary');
    expect(p.today.completed).toBe(1);
    const iv = await ok(full, 'productivity_interval', { interval: 'this_week' });
    expect(iv.bySource).toEqual({ mcp: 1 });
  });
});

describe('notes tools', () => {
  let writer: AuthContext;
  let reader: AuthContext;
  beforeEach(async () => {
    writer = await authenticate(repo, await issue('Vault Importer', ['notes:read', 'notes:write', 'notes:delete']), sha256, 'mcp');
    reader = await authenticate(repo, await issue('Note Reader', ['notes:read']), sha256, 'api');
  });

  it('creates, reads, searches and lists notes with folders, links and backlinks', async () => {
    const a = await ok(writer, 'notes_create', { title: 'Wallet architecture', folder: 'Projects/RanaWallet', content: '# Architecture #ranawallet\nUses [[Payments]] and [[Missing note]].', idempotency_key: 'imp-1' });
    expect(a).toMatchObject({ path: 'Projects/RanaWallet/Wallet architecture', tags: ['ranawallet'], existed: false, written_by: { agent: 'Vault Importer', source: 'mcp' } });
    // idempotent replay → same note, no duplicate
    expect((await ok(writer, 'notes_create', { title: 'Wallet architecture', folder: 'Projects/RanaWallet', idempotency_key: 'imp-1' })).existed).toBe(true);
    await ok(writer, 'notes_create', { title: 'Payments', folder: 'Projects/RanaWallet', content: 'Flutterwave keys. Back to [[Wallet architecture]].', properties: { status: 'draft' } });
    // duplicate title in same folder → conflict; skip mode returns existing
    expect((await call(writer, 'notes_create', { title: 'payments', folder: 'Projects/RanaWallet' })).ok).toBe(false);
    expect((await ok(writer, 'notes_create', { title: 'Payments', folder: 'Projects/RanaWallet', if_exists: 'skip' })).existed).toBe(true);

    const g = await ok(reader, 'notes_get', { note: 'Projects/RanaWallet/Payments' });
    expect(g.properties).toEqual({ status: 'draft' });
    expect(g.backlinks.map((b: any) => b.path)).toEqual(['Projects/RanaWallet/Wallet architecture']);
    const arch = await ok(reader, 'notes_get', { note: 'Wallet architecture' });
    expect(arch.outgoing_links.map((l: any) => [l.target, l.resolved])).toEqual([['Payments', true], ['Missing note', false]]);

    const list = await ok(reader, 'notes_list', { folder: 'Projects' });
    expect(list.total).toBe(2);
    expect(list.folders).toEqual([{ folder: 'Projects', notes: 2 }, { folder: 'Projects/RanaWallet', notes: 2 }]);
    expect((await ok(reader, 'notes_list', { folder: 'Projects', recursive: false })).total).toBe(0);
    expect((await ok(reader, 'notes_search', { query: 'flutterwave' })).results.map((h: any) => h.title)).toEqual(['Payments']);
    expect((await ok(reader, 'notes_list', { tag: 'ranawallet' })).notes.map((n: any) => n.title)).toEqual(['Wallet architecture']);
  });

  it('update: append, properties, rename rewrites links everywhere', async () => {
    await ok(writer, 'notes_create', { title: 'Payments', content: 'v1' });
    await ok(writer, 'notes_create', { title: 'Plan', content: 'See [[Payments#Keys|keys]] and ![[Payments]]' });
    const u = await ok(writer, 'notes_update', { note: 'Payments', append: '- added by agent', properties: { owner: 'Ameer' } });
    expect(u.links_updated).toBe(0);
    let p = await ok(reader, 'notes_get', { note: 'Payments' });
    expect(p.content).toBe('---\nowner: Ameer\n---\nv1\n- added by agent');
    const r = await ok(writer, 'notes_update', { note: 'Payments', title: 'Payments & keys', folder: 'Finance' });
    expect(r).toMatchObject({ path: 'Finance/Payments & keys', links_updated: 1 });
    const plan = await ok(reader, 'notes_get', { note: 'Plan' });
    expect(plan.content).toBe('See [[Payments & keys#Keys|keys]] and ![[Payments & keys]]');
    expect(plan.outgoing_links.every((l: any) => l.resolved)).toBe(true);
  });

  it('daily note, import (skip/update with confirm) and delete (confirm for many)', async () => {
    const d1 = await ok(writer, 'notes_daily', { date: '2026-10-07', append: '- 09:00 standup' });
    expect(d1).toMatchObject({ path: 'Daily/2026-10-07', kind: 'daily', created: true });
    const d2 = await ok(writer, 'notes_daily', { date: '2026-10-07', append: '- 14:00 review' });
    expect(d2.created).toBe(false);
    expect(d2.content).toBe('- 09:00 standup\n- 14:00 review');

    const items = [{ title: 'A', folder: 'Vault', content: 'Links [[B]]' }, { title: 'B', folder: 'Vault', content: 'b' }];
    const imp = await ok(writer, 'notes_import', { notes: items });
    expect(imp.created.map((x: any) => x.path)).toEqual(['Vault/A', 'Vault/B']);
    expect((await ok(writer, 'notes_import', { notes: items })).skipped).toEqual(['Vault/A', 'Vault/B']);
    const upd = await call(writer, 'notes_import', { notes: [{ title: 'B', folder: 'Vault', content: 'b2' }], if_exists: 'update' });
    expect(upd.ok).toBe(false);
    const tok = (upd as any).error.data.confirm_token;
    expect((await ok(writer, 'notes_import', { notes: [{ title: 'B', folder: 'Vault', content: 'b2' }], if_exists: 'update', confirm_token: tok })).updated.length).toBe(1);
    expect((await ok(reader, 'notes_get', { note: 'Vault/B' })).content).toBe('b2');
    expect((await ok(reader, 'notes_get', { note: 'Vault/A' })).outgoing_links[0].resolved).toBe(true);

    // single delete: immediate; many: two-step
    expect((await ok(writer, 'notes_delete', { notes: ['Vault/B'] })).deleted).toHaveLength(1);
    const many = await call(writer, 'notes_delete', { notes: ['Vault/A', 'Daily/2026-10-07'] });
    expect((many as any).error.code).toBe('confirm_required');
    await ok(writer, 'notes_delete', { notes: ['Vault/A', 'Daily/2026-10-07'], confirm_token: (many as any).error.data.confirm_token });
    expect((await ok(reader, 'notes_list', {})).total).toBe(0);
    expect(repo.all('notes').every((n) => n.deleted)).toBe(true); // tombstones, synced to devices
  });

  it('enforces note scopes', async () => {
    const r = await call(reader, 'notes_create', { title: 'x' });
    expect((r as any).error.code).toBe('forbidden');
    const r2 = await call(full, 'notes_list', {});
    expect((r2 as any).error.code).toBe('forbidden'); // task tokens don't get notes implicitly
    expect(toolManifest().filter((t) => t.name.startsWith('notes_')).map((t) => t.name)).toEqual(['notes_list', 'notes_get', 'notes_search', 'notes_create', 'notes_update', 'notes_daily', 'notes_import', 'notes_delete']);
  });
});

describe('search & fetch (ChatGPT connector contract)', () => {
  it('searches tasks and notes the token can read, and fetches full text', async () => {
    const both = await authenticate(repo, await issue('ChatGPT', ['tasks:read', 'tasks:write', 'notes:read', 'notes:write']), sha256, 'mcp');
    await ok(both, 'tasks_create', { title: 'Rotate Flutterwave keys', description: 'Before launch', due_string: 'tomorrow' });
    await ok(both, 'notes_create', { title: 'Payments', content: 'Flutterwave keys live in the vault.' });
    const r = await ok(both, 'search', { query: 'flutterwave' });
    expect(r.results.map((x: any) => x.id.split(':')[0]).sort()).toEqual(['note', 'task']);
    const note = await ok(both, 'fetch', { id: r.results.find((x: any) => x.id.startsWith('note:')).id });
    expect(note).toMatchObject({ title: 'Payments', text: 'Flutterwave keys live in the vault.' });
    expect(note.url).toMatch(/#notes\//);
    const task = await ok(both, 'fetch', { id: r.results.find((x: any) => x.id.startsWith('task:')).id });
    expect(task.text).toContain('Before launch');
    // a tasks-only token never sees notes
    const tasksOnly = await ok(readonly, 'search', { query: 'flutterwave' });
    expect(tasksOnly.results.every((x: any) => !x.id.startsWith('note:'))).toBe(true);
    expect((await call(readonly, 'fetch', { id: note.id })) .ok).toBe(false);
  });
});
