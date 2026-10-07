// Live E2E for the MCP OAuth flow (the way claude.ai / ChatGPT connect), against
// the real Firestore project, served locally from the built Vercel functions.
// Uses a throwaway anonymous account that is fully deleted at the end.
//   node scripts/e2e-oauth.mjs            (needs VITE_FIREBASE_API_KEY + a service account)
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const KEY = process.env.VITE_FIREBASE_API_KEY;
if (!KEY) { console.error('VITE_FIREBASE_API_KEY required'); process.exit(1); }
const oauth = (await import('../api/oauth.js')).default;
const mcp = (await import('../api/mcp.js')).default;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/.well-known/oauth-protected-resource')) { req.url = '/api/oauth?route=prm'; return oauth(req, res); }
  if (u.pathname.startsWith('/.well-known/oauth-authorization-server')) { req.url = '/api/oauth?route=as'; return oauth(req, res); }
  if (u.pathname.startsWith('/api/oauth/')) { req.url = `/api/oauth?route=${u.pathname.split('/').pop()}${u.search.replace('?', '&')}`; return oauth(req, res); }
  if (u.pathname === '/api/mcp') return mcp(req, res);
  res.statusCode = 404; res.end();
});
await new Promise((r) => server.listen(4310, r));
const BASE = 'http://localhost:4310';
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync(homedir() + '/.config/clearmind/service-account.json', 'utf8'))) }), undefined);
let failures = 0;
const check = (c, m) => { console.log(c ? `• PASS ${m}` : `✗ FAIL ${m}`); if (!c) failures++; };
const sign = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }).then((r) => r.json());
const uid = sign.localId;
console.log('• throwaway account', uid);
let clientId = null;
const refreshTokens = [];
try {
  const mcpCall = (token, body) => fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const r401 = await mcpCall(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  check(r401.status === 401 && /resource_metadata="http:\/\/localhost:4310\/\.well-known\/oauth-protected-resource"/.test(r401.headers.get('www-authenticate') ?? ''), 'unauthenticated MCP → 401 + WWW-Authenticate resource_metadata');
  const prm = await fetch(`${BASE}/.well-known/oauth-protected-resource`).then((r) => r.json());
  const as = await fetch(`${BASE}/.well-known/oauth-authorization-server`).then((r) => r.json());
  check(prm.authorization_servers?.[0] === BASE && as.registration_endpoint === `${BASE}/api/oauth/register`, 'discovery metadata (RFC 9728 + RFC 8414)');
  const reg = await fetch(`${BASE}/api/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }) });
  const client = await reg.json();
  clientId = client.client_id;
  check(reg.status === 201 && clientId?.startsWith('cmc_'), 'dynamic client registration');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = 'https://claude.ai/api/mcp/auth_callback';
  const info = await fetch(`${BASE}/api/oauth/client?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}`).then((r) => r.json());
  check(info.client_name === 'Claude' && info.redirect_host === 'claude.ai', 'consent page can show client name + redirect host');
  const bad = await fetch(`${BASE}/api/oauth/client?client_id=${clientId}&redirect_uri=${encodeURIComponent('https://evil.example/cb')}`);
  check(bad.status === 400, 'unregistered redirect_uri rejected');
  const ap = await fetch(`${BASE}/api/oauth/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: '', id_token: sign.idToken }) }).then((r) => r.json());
  const code = new URL(ap.redirect).searchParams.get('code');
  check(ap.redirect?.startsWith(redirect) && new URL(ap.redirect).searchParams.get('state') === 'xyz' && code, 'approve → redirect with code + state');
  const wrong = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: clientId, code_verifier: randomBytes(32).toString('base64url') }) });
  check(wrong.status === 400, 'wrong PKCE verifier rejected (and code burned)');
  // fresh code for the real exchange
  const ap2 = await fetch(`${BASE}/api/oauth/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 's', id_token: sign.idToken }) }).then((r) => r.json());
  const code2 = new URL(ap2.redirect).searchParams.get('code');
  const tok = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: code2, redirect_uri: redirect, client_id: clientId, code_verifier: verifier }) }).then((r) => r.json());
  refreshTokens.push(tok.refresh_token);
  check(tok.access_token?.startsWith(`cm_${uid}_`) && tok.token_type === 'Bearer' && tok.refresh_token, 'code + verifier → access + refresh token');
  const replay = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: code2, redirect_uri: redirect, client_id: clientId, code_verifier: verifier }) });
  check(replay.status === 400, 'authorization code cannot be replayed');
  const list = await mcpCall(tok.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list' }).then((r) => r.json());
  const names = (list.result?.tools ?? []).map((t) => t.name);
  check(names.includes('notes_create') && names.includes('search') && names.includes('fetch') && !names.includes('notes_delete'), `MCP with OAuth token lists ${names.length} tools (standard scopes, incl. search/fetch)`);
  const created = await mcpCall(tok.access_token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'notes_create', arguments: { title: 'From Claude', content: 'Hello [[World]]' } } }).then((r) => r.json());
  check(!created.result?.isError && created.result?.structuredContent?.written_by?.agent === 'Claude', 'tool call works and is attributed to "Claude"');
  const srch = await mcpCall(tok.access_token, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search', arguments: { query: 'hello' } } }).then((r) => r.json());
  check(srch.result?.structuredContent?.results?.[0]?.id?.startsWith('note:'), 'ChatGPT-style search returns note ids');
  const ref = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: clientId }) }).then((r) => r.json());
  refreshTokens.push(ref.refresh_token);
  const oldStill = await mcpCall(tok.access_token, { jsonrpc: '2.0', id: 5, method: 'tools/list' });
  const newOk = await mcpCall(ref.access_token, { jsonrpc: '2.0', id: 6, method: 'tools/list' });
  check(ref.access_token && oldStill.status === 401 && newOk.status === 200, 'refresh rotates tokens (old access revoked)');
  // Revoked in Settings → refresh must fail
  const hash = createHash('sha256').update(ref.access_token).digest('hex');
  await db.doc(`users/${uid}/agentTokens/${hash}`).set({ revoked: true }, { merge: true });
  const afterRevoke = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: ref.refresh_token, client_id: clientId }) });
  check(afterRevoke.status === 400, 'revoking in Settings ends the connection (refresh refused)');
  const keyUrl = await fetch(`${BASE}/api/mcp?key=${encodeURIComponent(tok.access_token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) });
  check(keyUrl.status === 401, 'revoked token in ?key= URL is rejected too');
} catch (e) { failures++; console.log('✗ FAIL', e.message); }
finally {
  for (const c of ['agentTokens', 'agentAudit', 'notes']) { const s = await db.collection(`users/${uid}/${c}`).get(); await Promise.all(s.docs.map((d) => d.ref.delete())); }
  await db.doc(`users/${uid}`).delete().catch(() => {});
  if (clientId) await db.doc(`oauthClients/${clientId}`).delete();
  for (const t of refreshTokens.filter(Boolean)) await db.doc(`oauthRefresh/${createHash('sha256').update(t).digest('hex')}`).delete().catch(() => {});
  const codes = await db.collection('oauthCodes').where('uid', '==', uid).get(); await Promise.all(codes.docs.map((d) => d.ref.delete()));
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: sign.idToken }) });
  console.log('• throwaway account, client, codes and tokens deleted');
  server.close();
  process.exit(failures ? 1 : 0);
}
