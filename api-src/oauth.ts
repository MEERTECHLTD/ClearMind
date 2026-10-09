/**
 * OAuth 2.1 authorization server for remote MCP connectors (claude.ai, ChatGPT, …).
 *
 *   GET  /.well-known/oauth-protected-resource[/api/mcp]   → ?route=prm
 *   GET  /.well-known/oauth-authorization-server            → ?route=as
 *   POST /api/oauth/register    Dynamic Client Registration (public clients, PKCE)
 *   GET  /api/oauth/client      client name + redirect check for the consent page
 *   POST /api/oauth/approve     consent page → code (needs the user's Firebase ID token)
 *   POST /api/oauth/token       authorization_code / refresh_token → ClearMind agent token
 *   POST /api/oauth/revoke      revoke an access or refresh token
 *
 * The consent UI is the web app at /oauth/authorize. Storage (admin only —
 * Firestore rules deny clients): oauthClients/{id}, oauthCodes/{sha256(code)},
 * oauthRefresh/{sha256(refresh)}, rateLimits/{hash}; issued access tokens are
 * ordinary agent tokens in users/{uid}/agentTokens/{sha256(token)} (revocable in
 * Settings) with an expiresAt (OAUTH_ACCESS_TTL_MS); refresh tokens rotate.
 *
 * Abuse controls: register / approve / token / revoke are rate limited per client
 * IP (per-instance memory + Firestore counter, see server/rateLimit.ts).
 */
import type { ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { adminApp, adminProjectId } from '../server/firestoreRepo';
import { verifyFirebaseIdToken } from './idToken';
import { makeToken, secretFromBytes, tokenPrefix, parseToken, DEFAULT_RATE_LIMIT } from '../shared/agents/tokens';
import {
  validateRegistration, verifyPkce, redirectMatches, parseScopes, protectedResourceMetadata, authorizationServerMetadata,
  redirectWith, OAUTH_CODE_TTL_MS, OAUTH_ACCESS_TTL_MS, OAUTH_REFRESH_TTL_MS, CLIENT_ID_RE,
} from '../shared/agents/oauth';
import type { AgentScope } from '../shared/types';
import { readJson, readForm, sendJson, originOf, clientIp, corsPublic, withRequest, log, HttpError, type Req } from './http';
import { createLimiter, FirestoreLimitStore, LIMITS, type LimitRule } from '../server/rateLimit';

let db: Firestore | null = null;
const fdb = () => (db ??= getFirestore(adminApp()));
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const shaBytes = async (s: string) => new Uint8Array(createHash('sha256').update(s).digest());
const rand = (n: number) => secretFromBytes(randomBytes(n), n);
const limiter = createLimiter({
  global: new FirestoreLimitStore(fdb),
  onError: (e) => log('warn', 'rate limiter unavailable (fail open)', { fn: 'oauth', error: (e as Error)?.name ?? 'Error' }),
});

const oauthError = (res: ServerResponse, status: number, error: string, description: string) => sendJson(res, status, { error, error_description: description });

/** 429 + Retry-After when `rule` is exceeded for this client IP; returns true if the request was rejected. */
async function limited(req: Req, res: ServerResponse, rule: LimitRule): Promise<boolean> {
  const r = await limiter.check(rule, clientIp(req));
  if (r.ok) return false;
  res.setHeader('Retry-After', String(r.retryAfterSec));
  log('warn', 'rate limited', { fn: 'oauth', rule: rule.name });
  oauthError(res, 429, 'slow_down', 'Too many requests. Try again later.');
  return true;
}

/** A string parameter of bounded length, else ''. */
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : '');

async function mintAccessToken(uid: string, scopes: AgentScope[], clientId: string, clientName: string) {
  const token = makeToken(uid, rand(40));
  const hash = sha(token);
  const now = Date.now();
  await fdb().doc(`users/${uid}/agentTokens/${hash}`).set({
    id: hash, name: clientName, scopes, createdAt: new Date(now).toISOString(), prefix: tokenPrefix(token),
    rateLimit: DEFAULT_RATE_LIMIT, revoked: false, via: 'oauth', clientId, expiresAt: new Date(now + OAUTH_ACCESS_TTL_MS).toISOString(),
  });
  const refresh = `cmr_${rand(48)}`;
  await fdb().doc(`oauthRefresh/${sha(refresh)}`).set({
    uid, clientId, clientName, scopes, accessHash: hash, createdAt: new Date(now).toISOString(), expiresAt: now + OAUTH_REFRESH_TTL_MS,
  });
  return { access_token: token, token_type: 'Bearer', expires_in: Math.floor(OAUTH_ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: scopes.join(' ') };
}

async function getClient(clientId: string) {
  if (!CLIENT_ID_RE.test(clientId)) return null; // caller input never shapes a Firestore path
  const c = await fdb().doc(`oauthClients/${clientId}`).get();
  return c.exists ? c.data()! : null;
}

async function handle(req: Req, res: ServerResponse) {
  corsPublic(res, 'Content-Type, Authorization, MCP-Protocol-Version, X-Request-Id');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const url = new URL(req.url ?? '/', 'http://x');
  const route = url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/oauth\/?/, '');
  const origin = originOf(req);
  try {
    if (route === 'prm' && req.method === 'GET') return sendJson(res, 200, protectedResourceMetadata(origin));
    if (route === 'as' && req.method === 'GET') return sendJson(res, 200, authorizationServerMetadata(origin));

    if (route === 'register' && req.method === 'POST') {
      if (await limited(req, res, LIMITS.oauthRegister)) return;
      const v = validateRegistration(await readJson(req));
      if ('error' in v) return oauthError(res, 400, v.error, v.description);
      const clientId = `cmc_${rand(24)}`;
      const now = Math.floor(Date.now() / 1000);
      await fdb().doc(`oauthClients/${clientId}`).set({ ...v.client, createdAt: new Date().toISOString() });
      return sendJson(res, 201, {
        client_id: clientId, client_id_issued_at: now, ...v.client,
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
      });
    }

    if (route === 'client' && req.method === 'GET') {
      const redirect = url.searchParams.get('redirect_uri') ?? '';
      const data = await getClient(url.searchParams.get('client_id') ?? '');
      if (!data) return oauthError(res, 404, 'invalid_client', 'Unknown client');
      if (!redirectMatches(data.redirect_uris ?? [], redirect)) return oauthError(res, 400, 'invalid_request', 'redirect_uri does not match the registered client');
      const u = new URL(redirect);
      return sendJson(res, 200, { client_name: data.client_name, redirect_host: u.host || u.protocol.replace(/:$/, '') });
    }

    if (route === 'approve' && req.method === 'POST') {
      if (await limited(req, res, LIMITS.oauthApprove)) return;
      const b = await readJson(req);
      if (!b || typeof b !== 'object' || Array.isArray(b)) return oauthError(res, 400, 'invalid_request', 'JSON object body required');
      const clientId = str(b.client_id, 64);
      const redirectUri = str(b.redirect_uri, 2000);
      const state = str(b.state, 2048) || undefined;
      const client = await getClient(clientId);
      if (!client) return oauthError(res, 400, 'invalid_client', 'Unknown client');
      if (!redirectMatches(client.redirect_uris ?? [], redirectUri)) return oauthError(res, 400, 'invalid_request', 'redirect_uri mismatch');
      if (b.deny) return sendJson(res, 200, { redirect: redirectWith(redirectUri, { error: 'access_denied', state }) });
      if (b.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(String(b.code_challenge ?? ''))) return oauthError(res, 400, 'invalid_request', 'PKCE S256 code_challenge is required');
      let uid: string;
      try { uid = (await verifyFirebaseIdToken(str(b.id_token, 8192), adminProjectId())).uid; }
      catch { return oauthError(res, 401, 'login_required', 'Sign in to ClearMind again'); }
      const scopes = parseScopes(Array.isArray(b.scopes) ? b.scopes.filter((x: unknown) => typeof x === 'string').join(' ') : str(b.scope, 1000));
      const code = `cma_${rand(40)}`;
      await fdb().doc(`oauthCodes/${sha(code)}`).set({
        uid, clientId, clientName: client.client_name, redirectUri, codeChallenge: b.code_challenge,
        scopes, resource: str(b.resource, 500) || null, expiresAt: Date.now() + OAUTH_CODE_TTL_MS, used: false,
      });
      return sendJson(res, 200, { redirect: redirectWith(redirectUri, { code, state, iss: origin }) });
    }

    if (route === 'token' && req.method === 'POST') {
      if (await limited(req, res, LIMITS.oauthToken)) return;
      const f = await readForm(req);
      if (f.grant_type === 'authorization_code') {
        // RFC 6749 §4.1.3: a public client must identify itself.
        if (!f.client_id) return oauthError(res, 400, 'invalid_request', 'client_id is required');
        const ref = fdb().doc(`oauthCodes/${sha(String(f.code ?? ''))}`);
        // Single use: the first exchange flips `used` atomically, whatever happens next.
        const claim = await fdb().runTransaction(async (tx) => {
          const s = await tx.get(ref);
          if (!s.exists) return null;
          const d = s.data()!;
          tx.update(ref, { used: true });
          return d;
        });
        if (!claim || claim.used || claim.expiresAt < Date.now()) return oauthError(res, 400, 'invalid_grant', 'Authorization code is invalid or expired');
        if (f.client_id !== claim.clientId) return oauthError(res, 400, 'invalid_grant', 'client_id mismatch');
        if (f.redirect_uri && f.redirect_uri !== claim.redirectUri) return oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
        if (!(await verifyPkce(String(f.code_verifier ?? ''), claim.codeChallenge, shaBytes))) return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed');
        await ref.delete().catch(() => undefined);
        return sendJson(res, 200, await mintAccessToken(claim.uid, claim.scopes, claim.clientId, claim.clientName));
      }
      if (f.grant_type === 'refresh_token') {
        const ref = fdb().doc(`oauthRefresh/${sha(String(f.refresh_token ?? ''))}`);
        // Rotation is atomic: two concurrent refreshes with the same token can't both succeed.
        const d = await fdb().runTransaction(async (tx) => {
          const s = await tx.get(ref);
          if (!s.exists) return null;
          tx.delete(ref);
          return s.data()!;
        });
        if (!d) return oauthError(res, 400, 'invalid_grant', 'Refresh token is invalid');
        if (typeof d.expiresAt === 'number' && d.expiresAt < Date.now()) return oauthError(res, 400, 'invalid_grant', 'Refresh token expired');
        if (f.client_id && f.client_id !== d.clientId) return oauthError(res, 400, 'invalid_grant', 'client_id mismatch');
        const old = fdb().doc(`users/${d.uid}/agentTokens/${d.accessHash}`);
        const oldSnap = await old.get();
        // Revoked in Settings → the connection stays disconnected.
        if (!oldSnap.exists || oldSnap.data()?.revoked) return oauthError(res, 400, 'invalid_grant', 'Access was revoked');
        // The superseded access token is deleted (not just flagged) so daily rotations don't pile up in Settings.
        await old.delete();
        return sendJson(res, 200, await mintAccessToken(d.uid, d.scopes, d.clientId, d.clientName));
      }
      return oauthError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
    }

    if (route === 'revoke' && req.method === 'POST') {
      if (await limited(req, res, LIMITS.oauthToken)) return;
      const f = await readForm(req);
      const t = String(f.token ?? '');
      const parsed = parseToken(t);
      const revokedAt = new Date().toISOString();
      if (parsed) {
        const ref = fdb().doc(`users/${parsed.uid}/agentTokens/${sha(t)}`);
        const s = await ref.get().catch(() => null);
        if (s?.exists) await ref.set({ revoked: true, revokedAt }, { merge: true }).catch(() => undefined); // never create docs for unknown tokens
      } else if (t.startsWith('cmr_')) {
        const ref = fdb().doc(`oauthRefresh/${sha(t)}`);
        const s = await ref.get();
        if (s.exists) { const d = s.data()!; await fdb().doc(`users/${d.uid}/agentTokens/${d.accessHash}`).set({ revoked: true, revokedAt }, { merge: true }); await ref.delete(); }
      }
      res.statusCode = 200; return res.end(); // RFC 7009: always 200
    }

    return oauthError(res, 404, 'not_found', 'Unknown OAuth route');
  } catch (e: any) {
    if (e instanceof HttpError) return oauthError(res, e.status, 'invalid_request', e.message);
    log('error', 'oauth error', { fn: 'oauth', route, error: e?.name ?? 'Error', detail: String(e?.message ?? '').slice(0, 300) });
    return oauthError(res, 500, 'server_error', 'Internal error');
  }
}

export default withRequest('oauth', handle, () => ({ error: 'server_error', error_description: 'Internal error' }));
