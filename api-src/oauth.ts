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
 * oauthRefresh/{sha256(refresh)}; issued access tokens are ordinary agent
 * tokens in users/{uid}/agentTokens/{sha256(token)} (revocable in Settings).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { adminApp, adminProjectId } from '../server/firestoreRepo';
import { verifyFirebaseIdToken } from './idToken';
import { makeToken, secretFromBytes, tokenPrefix, parseToken, DEFAULT_RATE_LIMIT } from '../shared/agents/tokens';
import {
  validateRegistration, verifyPkce, redirectMatches, parseScopes, protectedResourceMetadata, authorizationServerMetadata,
  redirectWith, OAUTH_CODE_TTL_MS,
} from '../shared/agents/oauth';
import type { AgentScope } from '../shared/types';
import { readJson, sendJson, originOf } from './http';

let db: Firestore | null = null;
const fdb = () => (db ??= getFirestore(adminApp()));
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const shaBytes = async (s: string) => new Uint8Array(createHash('sha256').update(s).digest());
const rand = (n: number) => secretFromBytes(randomBytes(n), n);

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
}

const oauthError = (res: ServerResponse, status: number, error: string, description: string) => sendJson(res, status, { error, error_description: description });

/** Token endpoints accept form-encoded (spec) or JSON bodies. */
async function readForm(req: IncomingMessage & { body?: unknown }): Promise<Record<string, string>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, string>;
  const raw = typeof req.body === 'string' ? req.body : await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject);
  });
  const type = String(req.headers['content-type'] ?? '');
  if (type.includes('application/json')) { try { return JSON.parse(raw || '{}'); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}

async function mintAccessToken(uid: string, scopes: AgentScope[], clientId: string, clientName: string) {
  const token = makeToken(uid, rand(40));
  const hash = sha(token);
  await fdb().doc(`users/${uid}/agentTokens/${hash}`).set({
    id: hash, name: clientName, scopes, createdAt: new Date().toISOString(), prefix: tokenPrefix(token),
    rateLimit: DEFAULT_RATE_LIMIT, revoked: false, via: 'oauth', clientId,
  });
  const refresh = `cmr_${rand(48)}`;
  await fdb().doc(`oauthRefresh/${sha(refresh)}`).set({ uid, clientId, clientName, scopes, accessHash: hash, createdAt: new Date().toISOString() });
  return { access_token: token, token_type: 'Bearer', refresh_token: refresh, scope: scopes.join(' ') };
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const url = new URL(req.url ?? '/', 'http://x');
  const route = url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/oauth\/?/, '');
  const origin = originOf(req);
  try {
    if (route === 'prm' && req.method === 'GET') return sendJson(res, 200, protectedResourceMetadata(origin));
    if (route === 'as' && req.method === 'GET') return sendJson(res, 200, authorizationServerMetadata(origin));

    if (route === 'register' && req.method === 'POST') {
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
      const clientId = url.searchParams.get('client_id') ?? '';
      const redirect = url.searchParams.get('redirect_uri') ?? '';
      const c = clientId ? await fdb().doc(`oauthClients/${clientId}`).get() : null;
      if (!c?.exists) return oauthError(res, 404, 'invalid_client', 'Unknown client');
      const data = c.data()!;
      if (!redirectMatches(data.redirect_uris ?? [], redirect)) return oauthError(res, 400, 'invalid_request', 'redirect_uri does not match the registered client');
      return sendJson(res, 200, { client_name: data.client_name, redirect_host: new URL(redirect).host });
    }

    if (route === 'approve' && req.method === 'POST') {
      const b = await readJson(req);
      const c = await fdb().doc(`oauthClients/${String(b?.client_id ?? '')}`).get();
      if (!c.exists) return oauthError(res, 400, 'invalid_client', 'Unknown client');
      const client = c.data()!;
      if (!redirectMatches(client.redirect_uris ?? [], String(b.redirect_uri ?? ''))) return oauthError(res, 400, 'invalid_request', 'redirect_uri mismatch');
      if (b.deny) return sendJson(res, 200, { redirect: redirectWith(b.redirect_uri, { error: 'access_denied', state: b.state }) });
      if (b.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(String(b.code_challenge ?? ''))) return oauthError(res, 400, 'invalid_request', 'PKCE S256 code_challenge is required');
      let uid: string;
      try { uid = (await verifyFirebaseIdToken(String(b.id_token ?? ''), adminProjectId())).uid; }
      catch { return oauthError(res, 401, 'login_required', 'Sign in to ClearMind again'); }
      const scopes = parseScopes(Array.isArray(b.scopes) ? b.scopes.join(' ') : b.scope);
      const code = `cma_${rand(40)}`;
      await fdb().doc(`oauthCodes/${sha(code)}`).set({
        uid, clientId: b.client_id, clientName: client.client_name, redirectUri: b.redirect_uri, codeChallenge: b.code_challenge,
        scopes, resource: b.resource ?? null, expiresAt: Date.now() + OAUTH_CODE_TTL_MS, used: false,
      });
      return sendJson(res, 200, { redirect: redirectWith(b.redirect_uri, { code, state: b.state, iss: origin }) });
    }

    if (route === 'token' && req.method === 'POST') {
      const f = await readForm(req);
      if (f.grant_type === 'authorization_code') {
        const ref = fdb().doc(`oauthCodes/${sha(String(f.code ?? ''))}`);
        const claim = await fdb().runTransaction(async (tx) => {
          const s = await tx.get(ref);
          if (!s.exists) return null;
          const d = s.data()!;
          tx.update(ref, { used: true });
          return d;
        });
        if (!claim || claim.used || claim.expiresAt < Date.now()) return oauthError(res, 400, 'invalid_grant', 'Authorization code is invalid or expired');
        if (f.client_id && f.client_id !== claim.clientId) return oauthError(res, 400, 'invalid_grant', 'client_id mismatch');
        if (f.redirect_uri && f.redirect_uri !== claim.redirectUri) return oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
        if (!(await verifyPkce(String(f.code_verifier ?? ''), claim.codeChallenge, shaBytes))) return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed');
        await ref.delete().catch(() => undefined);
        return sendJson(res, 200, await mintAccessToken(claim.uid, claim.scopes, claim.clientId, claim.clientName));
      }
      if (f.grant_type === 'refresh_token') {
        const ref = fdb().doc(`oauthRefresh/${sha(String(f.refresh_token ?? ''))}`);
        const s = await ref.get();
        if (!s.exists) return oauthError(res, 400, 'invalid_grant', 'Refresh token is invalid');
        const d = s.data()!;
        if (f.client_id && f.client_id !== d.clientId) return oauthError(res, 400, 'invalid_grant', 'client_id mismatch');
        const old = fdb().doc(`users/${d.uid}/agentTokens/${d.accessHash}`);
        const oldSnap = await old.get();
        // Revoked in Settings → the connection stays disconnected.
        if (!oldSnap.exists || oldSnap.data()?.revoked) { await ref.delete(); return oauthError(res, 400, 'invalid_grant', 'Access was revoked'); }
        await old.set({ revoked: true, revokedAt: new Date().toISOString() }, { merge: true });
        await ref.delete();
        return sendJson(res, 200, await mintAccessToken(d.uid, d.scopes, d.clientId, d.clientName));
      }
      return oauthError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
    }

    if (route === 'revoke' && req.method === 'POST') {
      const f = await readForm(req);
      const t = String(f.token ?? '');
      const parsed = parseToken(t);
      if (parsed) await fdb().doc(`users/${parsed.uid}/agentTokens/${sha(t)}`).set({ revoked: true, revokedAt: new Date().toISOString() }, { merge: true }).catch(() => undefined);
      else if (t.startsWith('cmr_')) {
        const ref = fdb().doc(`oauthRefresh/${sha(t)}`);
        const s = await ref.get();
        if (s.exists) { const d = s.data()!; await fdb().doc(`users/${d.uid}/agentTokens/${d.accessHash}`).set({ revoked: true, revokedAt: new Date().toISOString() }, { merge: true }); await ref.delete(); }
      }
      res.statusCode = 200; return res.end(); // RFC 7009: always 200
    }

    return oauthError(res, 404, 'not_found', `Unknown OAuth route "${route}"`);
  } catch (e: any) {
    console.error('oauth error', route, e?.message);
    return oauthError(res, 500, 'server_error', 'Internal error');
  }
}
