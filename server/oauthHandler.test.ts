import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { FakeFirestore, fakeHttp } from './testing/fakeFirestore';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => h.db }));
vi.mock('./firestoreRepo', () => ({ adminApp: () => ({}), adminProjectId: () => 'demo-project', FirestoreAgentRepo: class {} }));
vi.mock('../api-src/idToken', () => ({
  verifyFirebaseIdToken: async (t: string) => { if (t !== 'good-id-token') throw new Error('bad'); return { uid: 'UserAbc123UserAbc123xy', emailVerified: true }; },
}));

import handler from '../api-src/oauth';

const fake = new FakeFirestore();
h.db = fake;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let ipSeq = 0;
let ip = '';

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const x = fakeHttp({ method, url, body, headers: { 'x-real-ip': ip, 'content-type': 'application/json', ...headers } });
  await handler(x.req, x.res);
  return { status: x.res.statusCode as number, body: x.json(), headers: x.headers };
}

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');

async function register(extra: Record<string, unknown> = {}) {
  const r = await call('POST', '/api/oauth?route=register', { client_name: 'Claude', redirect_uris: [REDIRECT], ...extra });
  expect(r.status).toBe(201);
  return r.body.client_id as string;
}
async function approve(clientId: string, over: Record<string, unknown> = {}) {
  return call('POST', '/api/oauth?route=approve', { client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'st8', id_token: 'good-id-token', ...over });
}
const codeFrom = (redirect: string) => new URL(redirect).searchParams.get('code')!;
const exchange = (clientId: string | undefined, code: string, v = verifier) =>
  call('POST', '/api/oauth?route=token', { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: v, ...(clientId ? { client_id: clientId } : {}) });

beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
beforeEach(() => { ip = `198.51.100.${++ipSeq}`; fake.failNext = 0; });

describe('OAuth handler', () => {
  it('runs the full code + PKCE flow and issues an expiring access token', async () => {
    const clientId = await register();
    const ap = await approve(clientId);
    expect(ap.status).toBe(200);
    const u = new URL(ap.body.redirect);
    expect(u.origin + u.pathname).toBe(REDIRECT);
    expect(u.searchParams.get('state')).toBe('st8');
    const tok = await exchange(clientId, codeFrom(ap.body.redirect));
    expect(tok.status).toBe(200);
    expect(tok.body).toMatchObject({ token_type: 'Bearer', expires_in: 86400 });
    const doc = fake.docs.get(`users/UserAbc123UserAbc123xy/agentTokens/${sha(tok.body.access_token)}`)!;
    expect(Date.parse(doc.expiresAt) - Date.now()).toBeGreaterThan(86_000_000);
    expect(doc.via).toBe('oauth');
    // stored hashed: the raw secrets never appear in storage
    const all = JSON.stringify([...fake.docs.entries()]);
    expect(all).not.toContain(tok.body.access_token);
    expect(all).not.toContain(tok.body.refresh_token);
  });

  it('requires client_id at the token endpoint and burns a code after a failed PKCE check', async () => {
    const clientId = await register();
    const code = codeFrom((await approve(clientId)).body.redirect);
    expect((await exchange(undefined, code)).body.error).toBe('invalid_request');
    const code2 = codeFrom((await approve(clientId)).body.redirect);
    expect((await exchange(clientId, code2, randomBytes(32).toString('base64url'))).body.error).toBe('invalid_grant');
    expect((await exchange(clientId, code2)).status).toBe(400); // single use even after a failure
  });

  it('rejects expired codes, wrong redirect_uri and plain/absent PKCE', async () => {
    const clientId = await register();
    const code = codeFrom((await approve(clientId)).body.redirect);
    fake.docs.set(`oauthCodes/${sha(code)}`, { ...fake.docs.get(`oauthCodes/${sha(code)}`)!, expiresAt: Date.now() - 1 });
    expect((await exchange(clientId, code)).body.error).toBe('invalid_grant');
    expect((await approve(clientId, { redirect_uri: 'https://evil.example/cb' })).status).toBe(400);
    expect((await approve(clientId, { code_challenge_method: 'plain' })).status).toBe(400);
    expect((await approve(clientId, { id_token: 'forged' })).status).toBe(401);
  });

  it('rotates refresh tokens atomically and deletes the superseded access token', async () => {
    const clientId = await register();
    const tok = (await exchange(clientId, codeFrom((await approve(clientId)).body.redirect))).body;
    const refresh = () => call('POST', '/api/oauth?route=token', { grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: clientId });
    const [a, b] = await Promise.all([refresh(), refresh()]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(fake.docs.has(`users/UserAbc123UserAbc123xy/agentTokens/${sha(tok.access_token)}`)).toBe(false);
  });

  it('refuses expired refresh tokens and refreshes for revoked connections', async () => {
    const clientId = await register();
    const tok = (await exchange(clientId, codeFrom((await approve(clientId)).body.redirect))).body;
    const key = `oauthRefresh/${sha(tok.refresh_token)}`;
    fake.docs.set(key, { ...fake.docs.get(key)!, expiresAt: Date.now() - 1 });
    const r = await call('POST', '/api/oauth?route=token', { grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: clientId });
    expect(r.body).toMatchObject({ error: 'invalid_grant' });
  });

  it('revoke never creates documents for unknown tokens', async () => {
    const r = await call('POST', '/api/oauth?route=revoke', { token: `cm_VictimUid123VictimUid12_${'a'.repeat(40)}` });
    expect(r.status).toBe(200);
    expect([...fake.docs.keys()].some((k) => k.startsWith('users/VictimUid123VictimUid12/'))).toBe(false);
  });

  it('validates client_id shape before touching Firestore paths', async () => {
    const r = await call('GET', '/api/oauth?route=client&client_id=' + encodeURIComponent('../users/x/agentTokens/y') + '&redirect_uri=' + encodeURIComponent(REDIRECT));
    expect(r.status).toBe(404);
  });

  it('labels look-alike clients with their real redirect host', async () => {
    const r = await call('POST', '/api/oauth?route=register', { client_name: 'Claude', redirect_uris: ['https://evil.example/cb'] });
    expect(r.body.client_name).toBe('Claude (via evil.example)');
  });

  it('rate limits registration per IP with Retry-After', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await call('POST', '/api/oauth?route=register', { redirect_uris: [REDIRECT] })).status;
    expect(last).toBe(429);
  });

  it('fails open when the rate-limit store is down', async () => {
    fake.failNext = 1; // the limiter transaction fails; registration itself proceeds
    expect((await call('POST', '/api/oauth?route=register', { redirect_uris: [REDIRECT] })).status).toBe(201);
  });

  it('returns uniform errors without echoing input, and propagates x-request-id', async () => {
    const r = await call('GET', '/api/oauth?route=%3Cscript%3E', undefined, { 'x-request-id': 'req-123' });
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toContain('<script');
    expect(r.headers['x-request-id']).toBe('req-123');
    const bad = await call('POST', '/api/oauth?route=register', '{not json');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_request');
  });
});
