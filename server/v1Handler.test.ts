import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { FakeFirestore, fakeHttp } from './testing/fakeFirestore';

const h = vi.hoisted(() => ({ db: null as any, tokens: new Map<string, any>(), adminThrows: false }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => h.db }));
vi.mock('./firestoreRepo', () => ({
  adminApp: () => { if (h.adminThrows) throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON: secret-detail'); return {}; },
  adminProjectId: () => 'demo-project',
  FirestoreAgentRepo: class {
    async getToken(_uid: string, hash: string) { return h.tokens.get(hash) ?? null; }
    async loadState() { return { tasks: [], projects: [], labels: [], sections: [], comments: [], completions: [], filters: [], preferences: null, notes: [] }; }
    async commit() {}
    async touchToken() {}
    async audit() {}
    async recentActivity() { return []; }
  },
}));
vi.mock('../api-src/idToken', () => ({
  verifyFirebaseIdToken: async (t: string) => { if (t !== 'good-id-token') throw new Error('bad'); return { uid: 'UserAbc123UserAbc123xy', emailVerified: true }; },
}));

import handler from '../api-src/v1';

const fake = new FakeFirestore();
h.db = fake;
let ipSeq = 0;
let ip = '';
const TOKEN = `cm_UserAbc123UserAbc123xy_${'A1b2C3d4'.repeat(5)}`;

async function call(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
  const x = fakeHttp({ method, url: `/api/v1?path=${encodeURIComponent(path)}`, body: opts.body, headers: { 'x-real-ip': ip, ...opts.headers } });
  await handler(x.req, x.res);
  return { status: x.res.statusCode as number, body: x.json(), headers: x.headers };
}

beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
beforeEach(() => {
  ip = `203.0.113.${++ipSeq}`;
  h.adminThrows = false;
  h.tokens.clear();
  h.tokens.set(createHash('sha256').update(TOKEN).digest('hex'), { id: 'x', name: 'Test', scopes: ['tasks:read'], createdAt: '2026-01-01', prefix: 'cm_', rateLimit: 1000 });
});
afterEach(() => { delete process.env.GEMINI_SERVER_API_KEY; vi.unstubAllGlobals(); });

describe('REST API handler', () => {
  it('serves liveness without auth or I/O and echoes a generated request id', async () => {
    const r = await call('GET', 'health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
    expect(r.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.body.requestId).toBe(r.headers['x-request-id']);
  });

  it('readiness reports 503 without leaking the failure detail', async () => {
    expect((await call('GET', 'ready')).status).toBe(200);
    h.adminThrows = true;
    const r = await call('GET', 'ready');
    expect(r.status).toBe(503);
    expect(r.body.checks).toEqual({ firebaseAdmin: 'fail', firestore: 'fail' });
    expect(JSON.stringify(r.body)).not.toContain('secret-detail');
  });

  it('uses a uniform error shape with requestId and rejects bad JSON with 400', async () => {
    const r = await call('GET', 'me', { headers: { 'x-request-id': 'abc-1' } });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ ok: false, error: { code: 'unauthorized' }, requestId: 'abc-1' });
    const bad = await call('POST', 'tools/inbox_list', { body: '{nope', headers: { authorization: `Bearer ${TOKEN}` } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_json');
  });

  it('ignores malformed inbound request ids', async () => {
    const r = await call('GET', 'health', { headers: { 'x-request-id': 'bad id\r\nx: y' } });
    expect(r.headers['x-request-id']).not.toContain(' ');
  });

  it('authenticates agent tokens and enforces scopes', async () => {
    const me = await call('GET', 'me', { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(me.status).toBe(200);
    const denied = await call('POST', 'tools/tasks_create', { body: { title: 'x' }, headers: { authorization: `Bearer ${TOKEN}` } });
    expect(denied.status).toBe(403);
  });

  it('answers 429 after repeated authentication failures from one IP', async () => {
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await call('GET', 'me', { headers: { authorization: `Bearer cm_UserAbc123UserAbc123xy_${'Z'.repeat(40)}` } })).status;
    expect(last).toBe(429);
    // even a valid token from that IP is short-circuited until the window ends
    const r = await call('GET', 'me', { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(r.status).toBe(429);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('CORS: reflects only allowlisted origins and never sends credentials', async () => {
    const ok = await call('OPTIONS', 'tools', { headers: { origin: 'https://clearmind.expo.app' } });
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe('https://clearmind.expo.app');
    const evil = await call('OPTIONS', 'tools', { headers: { origin: 'https://evil.example' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('AI proxy: needs a Firebase ID token, validates input, keeps the key server-side', async () => {
    expect((await call('POST', 'ai/generate', { body: { contents: [] } })).status).toBe(401);
    expect((await call('POST', 'ai/generate', { body: { contents: [] }, headers: { authorization: 'Bearer good-id-token' } })).status).toBe(400);
    const body = { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] };
    expect((await call('POST', 'ai/generate', { body, headers: { authorization: 'Bearer good-id-token' } })).body.error.code).toBe('ai_unavailable');
    process.env.GEMINI_SERVER_API_KEY = 'server-key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await call('POST', 'ai/generate', { body, headers: { authorization: 'Bearer good-id-token' } });
    expect(r.body).toEqual({ ok: true, result: { text: 'hello' } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('server-key');
    expect(JSON.stringify(r.body)).not.toContain('server-key');
  });
});
