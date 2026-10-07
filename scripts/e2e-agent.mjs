// Live end-to-end check of the agent stack against the real Firestore project,
// using a throwaway anonymous account (created and fully deleted by this script).
//   node scripts/e2e-agent.mjs            (needs ~/.config/clearmind/service-account.json + VITE_FIREBASE_API_KEY)
import { createHash, randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEY = process.env.VITE_FIREBASE_API_KEY;
if (!KEY) throw new Error('VITE_FIREBASE_API_KEY required');
const sa = JSON.parse(readFileSync(join(homedir(), '.config/clearmind/service-account.json'), 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa) }));
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const step = (m) => console.log('•', m);

const sign = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }).then((r) => r.json());
const uid = sign.localId;
step(`test account ${uid}`);
const token = `cm_${uid}_${[...randomBytes(40)].map((b) => B62[b % 62]).join('')}`;
const hash = createHash('sha256').update(token).digest('hex');
await db.doc(`users/${uid}/agentTokens/${hash}`).set({ name: 'E2E Claude', scopes: ['tasks:read', 'tasks:write', 'tasks:delete', 'projects:read', 'projects:write', 'productivity:read', 'bulk'], createdAt: new Date().toISOString(), prefix: token.slice(0, 7), rateLimit: 120, revoked: false });

let failures = 0;
const check = (cond, msg) => { if (cond) step(`PASS ${msg}`); else { failures++; console.log('✗ FAIL', msg); } };
try {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist-agent/clearmind-mcp.mjs'], env: { ...process.env, CLEARMIND_TOKEN: token } });
  const client = new Client({ name: 'e2e', version: '1' });
  await client.connect(transport);
  const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); if (r.isError) throw new Error(`${name}: ${r.content[0].text}`); return r.structuredContent; };

  const tools = await client.listTools();
  check(tools.tools.length >= 35, `local stdio MCP lists ${tools.tools.length} tools`);
  const t = await call('tasks_create', { title: 'E2E: Prepare Odyssey payment-history docs', due_string: 'tomorrow 9am', priority: 'p1', labels: ['docs'], idempotency_key: 'e2e-1' });
  check(t.due?.time === '09:00' && t.priority === 'p1', 'tasks_create with natural-language due');
  await call('tasks_create', { title: 'E2E: Prepare Odyssey payment-history docs', idempotency_key: 'e2e-1' });
  const doc = await db.doc(`users/${uid}/tasks/${t.id}`).get();
  const d = doc.data();
  check(doc.exists && d.source === 'mcp' && d.agent === 'E2E Claude' && d._serverAt && d._fc?.title, 'Firestore doc has source, agent, server timestamp and field clocks');
  const all = await db.collection(`users/${uid}/tasks`).get();
  check(all.size === 1, 'idempotent retry did not duplicate');
  await call('projects_create', { name: 'E2E RanaWallet', sections: ['Payments', 'Backlog'] });
  await call('tasks_move', { ids: [t.id], project: 'E2E RanaWallet', section: 'Payments' });
  const p = await call('projects_get', { project: 'E2E RanaWallet' });
  check(p.sections[0].tasks[0]?.id === t.id, 'move to project section');
  const c = await call('tasks_complete', { id: t.id });
  const comp = await db.collection(`users/${uid}/completions`).get();
  check(comp.size === 1 && comp.docs[0].data().source === 'mcp', 'completion event written for productivity');
  const prod = await call('productivity_summary');
  check(prod.momentum.totalCompleted === 1, 'productivity reads authoritative events');
  const acts = await db.collection(`users/${uid}/activity`).get();
  check(acts.docs.some((a) => a.data().action === 'completed' && a.data().agent === 'E2E Claude'), 'activity attributed to the agent');
  const audits = await db.collection(`users/${uid}/agentAudit`).get();
  check(audits.size >= 7, `audit log written (${audits.size} entries)`);
  await client.close();
  void c;
} catch (e) {
  failures++;
  console.log('✗ FAIL', e.message);
} finally {
  // Clean up everything for the throwaway account.
  for (const c of ['tasks', 'projects', 'labels', 'sections', 'completions', 'activity', 'agentTokens', 'agentAudit', 'comments']) {
    const s = await db.collection(`users/${uid}/${c}`).get();
    await Promise.all(s.docs.map((x) => x.ref.delete()));
  }
  await db.doc(`users/${uid}`).delete().catch(() => {});
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: sign.idToken }) });
  step('test account and data deleted');
}
process.exit(failures ? 1 : 0);
