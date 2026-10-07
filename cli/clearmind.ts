#!/usr/bin/env node
/**
 * clearmind — command-line access to your ClearMind workspace (same tools as MCP).
 *
 *   clearmind login <token>                 save a token (Settings → Integrations)
 *   clearmind today | upcoming | overdue | inbox
 *   clearmind add "Call Ahmed tomorrow 9am p1 #MeerTech"    (Inbox capture, NL parsing)
 *   clearmind note "Idea: annual billing"
 *   clearmind done <task-id>
 *   clearmind search <words…>
 *   clearmind projects | project <name>
 *   clearmind stats
 *   clearmind tools                          list every tool
 *   clearmind call <tool> '{"json":"args"}'  run any tool
 *
 * Talks to the hosted API (CLEARMIND_API, default https://clearmind.meertech.tech/api).
 * Set CLEARMIND_LOCAL=1 to run against Firestore directly with a local service
 * account (~/.config/clearmind/service-account.json).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HELP = `clearmind — your ClearMind workspace from the terminal

  clearmind login <token>          save a token (ClearMind → Settings → Integrations)
  clearmind today                  overdue + today
  clearmind upcoming [days]        next days
  clearmind overdue | inbox
  clearmind add "<text>"           capture to Inbox (natural language: tomorrow 9am p1 #Project @label)
  clearmind note "<text>"          capture a note
  clearmind done <task-id>         complete (recurring tasks roll forward)
  clearmind search <words…>
  clearmind projects | project <name>
  clearmind stats                  Momentum, goals, streak
  clearmind tools                  list every tool
  clearmind call <tool> '<json>'   run any tool

Env: CLEARMIND_TOKEN, CLEARMIND_API (default https://clearmind.meertech.tech/api),
     CLEARMIND_LOCAL=1 to use Firestore directly with a local service account.`;

const CONFIG_DIR = join(homedir(), '.config', 'clearmind');
const CONFIG = join(CONFIG_DIR, 'config.json');
const API = (process.env.CLEARMIND_API ?? 'https://clearmind.meertech.tech/api').replace(/\/$/, '');

function token(): string {
  const t = process.env.CLEARMIND_TOKEN ?? (existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')).token : null);
  if (!t) fail('No token. Create one in ClearMind → Settings → Integrations, then run: clearmind login <token>');
  return t;
}

function fail(msg: string): never {
  process.stderr.write(`clearmind: ${msg}\n`);
  process.exit(1);
}

async function call(tool: string, args: Record<string, unknown> = {}): Promise<any> {
  if (process.env.CLEARMIND_LOCAL === '1') {
    const { FirestoreAgentRepo } = await import('../server/firestoreRepo');
    const { authenticate, callTool } = await import('../shared/agents/tools');
    const { sha256 } = await import('../server/mcp');
    const repo = new FirestoreAgentRepo();
    const auth = await authenticate(repo, token(), sha256, 'cli');
    const r = await callTool(repo, auth, tool, args, { sha256 });
    if (!r.ok) throw Object.assign(new Error(r.error!.message), { data: r.error });
    return r.result;
  }
  const res = await fetch(`${API}/v1/tools/${tool}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', 'X-ClearMind-Client': 'cli' },
    body: JSON.stringify(args),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw Object.assign(new Error(body?.error?.message ?? `HTTP ${res.status}`), { data: body?.error });
  return body.result;
}

const P = { p1: '\x1b[31m', p2: '\x1b[33m', p3: '\x1b[34m', p4: '\x1b[2m' } as Record<string, string>;
const R = '\x1b[0m';
const line = (t: any) => `${P[t.priority] ?? ''}●${R} ${t.title}${t.due ? `  \x1b[2m${t.due.human}${t.due.time ? ' ' + t.due.time : ''}${R}` : ''}${t.project && t.project !== 'Inbox' ? `  \x1b[36m#${t.project}${R}` : ''}  \x1b[2m${t.id}${R}`;
const print = (title: string, tasks: any[]) => { console.log(`\x1b[1m${title}\x1b[0m (${tasks.length})`); for (const t of tasks) console.log('  ' + line(t)); };

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const text = rest.join(' ');
  switch (cmd) {
    case 'login': {
      if (!rest[0]) fail('usage: clearmind login <token>');
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(CONFIG, JSON.stringify({ token: rest[0] }, null, 2), { mode: 0o600 });
      process.env.CLEARMIND_TOKEN = rest[0];
      const r = await fetch(`${API}/v1/me`, { headers: { Authorization: `Bearer ${rest[0]}` } }).then((x) => x.json()).catch(() => null);
      console.log(r?.name ? `Logged in as agent "${r.name}" (${r.scopes.join(', ')})` : 'Token saved.');
      return;
    }
    case 'today': { const r = await call('views_today'); print('Overdue', r.overdue); print('Today', r.today); console.log(`\nCompleted today: ${r.completed_today}/${r.daily_goal}`); return; }
    case 'upcoming': { const r = await call('views_upcoming', { days: Number(rest[0]) || 7 }); for (const d of r.days) print(d.date, d.tasks); return; }
    case 'overdue': { const r = await call('views_overdue'); print('Overdue', r.tasks); return; }
    case 'inbox': { const r = await call('inbox_list'); print('Inbox', r.items); return; }
    case 'add': { if (!text) fail('usage: clearmind add "<task text>"'); const t = await call('inbox_capture', { text, idempotency_key: `cli-${Date.now()}` }); console.log('Added:', line(t)); return; }
    case 'note': { if (!text) fail('usage: clearmind note "<text>"'); const t = await call('inbox_capture', { text, kind: 'note', parse: false }); console.log('Noted:', t.title); return; }
    case 'done': { if (!rest[0]) fail('usage: clearmind done <task-id>'); const r = await call('tasks_complete', { id: rest[0] }); console.log(r.next_due ? `Done — next: ${r.next_due}` : 'Done ✓'); return; }
    case 'search': { const r = await call('search_global', { query: text }); print(`Results for "${text}"`, r.tasks); return; }
    case 'projects': { const r = await call('projects_list'); for (const p of r) console.log(`${'  '.repeat(p.depth)}#${p.name}  \x1b[2m${p.open} open · ${p.progress}%${p.overdue ? ` · ${p.overdue} overdue` : ''}${R}`); return; }
    case 'project': { const r = await call('projects_get', { project: text }); console.log(`\x1b[1m#${r.name}\x1b[0m  ${r.stats.progress}% · ${r.stats.open} open · ${r.stats.overdue} overdue · ${r.stats.blocked} blocked`); print('(no section)', r.no_section); for (const s of r.sections) print(s.name, s.tasks); return; }
    case 'stats': { const r = await call('productivity_summary'); console.log(`Momentum ${r.momentum.score} (${r.momentum.level}) · today ${r.today.completed}/${r.today.goal} · week ${r.week.completed}/${r.week.goal} · streak ${r.momentum.streak.current}d`); return; }
    case 'tools': {
      const res = await fetch(`${API}/v1/tools`, { headers: { Authorization: `Bearer ${token()}` } });
      const body: any = await res.json();
      for (const t of body.tools ?? []) console.log(`${t.name.padEnd(24)} ${t.title}`);
      return;
    }
    case 'call': {
      const [tool, json] = rest;
      if (!tool) fail("usage: clearmind call <tool> '{\"arg\":1}'");
      console.log(JSON.stringify(await call(tool, json ? JSON.parse(json) : {}), null, 2));
      return;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  if (e?.data?.code === 'confirm_required') {
    process.stderr.write(`${e.message}\nconfirm_token: ${e.data.data?.confirm_token}\n`);
    process.exit(2);
  }
  fail(e?.message ?? String(e));
});
