/**
 * ClearMind REST API (same tools as MCP):
 *   GET  /api/v1/tools              → tool manifest (filtered to the token's scopes)
 *   POST /api/v1/tools/<name>       → run a tool with a JSON body of arguments
 *   GET  /api/v1/me                 → token info (name, scopes)
 *   Authorization: Bearer cm_…
 *
 * Unauthenticated operational routes:
 *   GET  /api/v1/health             → liveness (no I/O, no user data)
 *   GET  /api/v1/ready              → readiness (Firebase Admin init + one Firestore read of _health/ready)
 *
 * Signed-in user routes (Firebase ID token, not an agent token):
 *   POST /api/v1/ai/generate        → one-shot generation on Claude (server/claude.ts)
 *   POST /api/v1/ai/agent           → ClearMind AI agent: Claude with the full tool catalog (CRUD on every area)
 *
 * Errors: { ok: false, error: { code, message }, requestId }; X-Request-Id on every response.
 */
import type { ServerResponse } from 'node:http';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticate, callTool, toolManifest, AgentError } from '../shared/agents/tools';
import { FirestoreAgentRepo, adminApp, adminProjectId } from '../server/firestoreRepo';
import { sha256 } from '../server/mcp';
import { createLimiter, FirestoreLimitStore, LIMITS } from '../server/rateLimit';
import { validateAiRequest, generateWithGemini, AiUpstreamError } from '../server/aiProxy';
import { generateText, runAgent, validateAgentMessages } from '../server/claude';
import { SCOPES } from '../shared/agents/tokens';
import type { AgentRepo, AuthContext } from '../shared/agents/tools';
import { verifyFirebaseIdToken } from './idToken';
import { bearer, readJson, sendJson, clientIp, corsAllowlist, withRequest, withTimeout, log, HttpError, type Req } from './http';

let repo: FirestoreAgentRepo | null = null;
const limiter = createLimiter({
  global: new FirestoreLimitStore(() => getFirestore(adminApp())),
  onError: (e) => log('warn', 'rate limiter unavailable (fail open)', { fn: 'v1', error: (e as Error)?.name ?? 'Error' }),
});

const STATUS: Record<string, number> = { unauthorized: 401, forbidden: 403, rate_limited: 429, invalid: 400, not_found: 404, conflict: 409, confirm_required: 409, internal: 500 };

function fail(res: ServerResponse, requestId: string, status: number, code: string, message: string, data?: unknown) {
  return sendJson(res, status, { ok: false, error: { code, message, ...(data !== undefined ? { data } : {}) }, requestId });
}

const version = () => (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev';

async function readiness(res: ServerResponse, requestId: string) {
  const checks: Record<string, 'ok' | 'fail'> = { firebaseAdmin: 'fail', firestore: 'fail' };
  try {
    adminApp();
    if (adminProjectId()) checks.firebaseAdmin = 'ok';
    await withTimeout(getFirestore(adminApp()).doc('_health/ready').get(), 3000, 'firestore readiness');
    checks.firestore = 'ok';
  } catch (e: any) {
    log('warn', 'readiness check failed', { fn: 'v1', requestId, error: e?.name ?? 'Error' }); // detail stays out of the response
  }
  const ready = Object.values(checks).every((v) => v === 'ok');
  return sendJson(res, ready ? 200 : 503, { status: ready ? 'ready' : 'unavailable', checks, version: version(), requestId });
}

async function aiGenerate(req: Req, res: ServerResponse, requestId: string) {
  let uid: string;
  try { uid = (await verifyFirebaseIdToken(bearer(req) ?? '', adminProjectId())).uid; }
  catch { return fail(res, requestId, 401, 'unauthorized', 'Sign in to ClearMind to use AI features.'); }
  for (const rule of [LIMITS.aiPerMinute, LIMITS.aiPerDay]) {
    const r = await limiter.check(rule, uid);
    if (!r.ok) { res.setHeader('Retry-After', String(r.retryAfterSec)); return fail(res, requestId, 429, 'rate_limited', 'AI limit reached. Try again later.'); }
  }
  const v = validateAiRequest(await readJson(req));
  if ('message' in v) return fail(res, requestId, 400, 'invalid', v.message);
  try {
    let text: string;
    try {
      text = await generateText(v.value, process.env.ANTHROPIC_API_KEY ?? '');
    } catch (e) {
      // Safety net only: if the Claude key is missing or rejected, keep AI features alive on the old provider.
      if (!(e instanceof AiUpstreamError) || e.code !== 'ai_unavailable' || !process.env.GEMINI_SERVER_API_KEY) throw e;
      log('error', 'claude unavailable, using fallback provider', { fn: 'v1', requestId });
      text = await generateWithGemini(v.value, process.env.GEMINI_SERVER_API_KEY);
    }
    return sendJson(res, 200, { ok: true, result: { text } });
  } catch (e) {
    if (e instanceof AiUpstreamError) { log('warn', 'ai upstream', { fn: 'v1', requestId, code: e.code, status: e.status }); return fail(res, requestId, e.status, e.code, e.message); }
    throw e;
  }
}

/** Every scope: the in-app assistant acts as the signed-in user (deletes of several items still need a confirm round-trip). */
const IN_APP_SCOPES = SCOPES.map((s) => s.scope);

async function aiAgent(req: Req, res: ServerResponse, requestId: string) {
  let uid: string;
  let name: string | null = null;
  try { const t = await verifyFirebaseIdToken(bearer(req) ?? '', adminProjectId()); uid = t.uid; name = (t as { name?: string }).name ?? null; }
  catch { return fail(res, requestId, 401, 'unauthorized', 'Sign in to ClearMind to use AI features.'); }
  for (const rule of [LIMITS.aiPerMinute, LIMITS.aiPerDay]) {
    const r = await limiter.check(rule, uid);
    if (!r.ok) { res.setHeader('Retry-After', String(r.retryAfterSec)); return fail(res, requestId, 429, 'rate_limited', 'AI limit reached. Try again later.'); }
  }
  const body = await readJson(req);
  const v = validateAgentMessages(body?.messages);
  if ('message' in v) return fail(res, requestId, 400, 'invalid', v.message);
  repo ??= new FirestoreAgentRepo();
  const base = repo;
  // The in-app session is not a stored token: never touch users/{uid}/agentTokens.
  const appRepo: AgentRepo = { loadState: (u) => base.loadState(u), commit: (u, e, m) => base.commit(u, e, m), getToken: async () => null, touchToken: async () => {}, audit: (u, a) => base.audit(u, a), recentActivity: (u, n) => base.recentActivity(u, n), loadCollections: (u, c) => base.loadCollections(u, c) };
  const auth: AuthContext = { uid, tokenHash: `inapp-${uid}`, source: 'ai', token: { id: 'in-app', name: 'ClearMind AI', scopes: IN_APP_SCOPES, createdAt: '', prefix: 'app', rateLimit: 240, scopeVersion: 2 } };
  const prefs = (await base.loadCollections(uid, ['preferences'])).preferences?.find((p: any) => p.id === 'preferences');
  try {
    const turn = await runAgent({ apiKey: process.env.ANTHROPIC_API_KEY ?? '', repo: appRepo, auth, messages: v.value, timezone: typeof body?.timezone === 'string' ? body.timezone : prefs?.timezone ?? null, userName: name, sha256 });
    return sendJson(res, 200, { ok: true, result: turn });
  } catch (e) {
    if (e instanceof AiUpstreamError) { log('warn', 'ai agent upstream', { fn: 'v1', requestId, code: e.code, status: e.status }); return fail(res, requestId, e.status, e.code, e.message); }
    throw e;
  }
}

async function handle(req: Req, res: ServerResponse, { requestId }: { requestId: string }) {
  corsAllowlist(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = (url.searchParams.get('path') ?? url.pathname.replace(/^\/api\/v1\/?/, '')).replace(/^\/+|\/+$/g, '');

    if (req.method === 'GET' && path === 'health') return sendJson(res, 200, { status: 'ok', version: version(), time: new Date().toISOString(), requestId });
    if (req.method === 'GET' && path === 'ready') return readiness(res, requestId);
    if (req.method === 'POST' && path === 'ai/generate') return aiGenerate(req, res, requestId);
    if (req.method === 'POST' && path === 'ai/agent') return aiAgent(req, res, requestId);

    // Repeated bad credentials from one IP → 429 without touching Firestore again.
    const ip = clientIp(req);
    const pre = await limiter.blocked(LIMITS.authFailures, ip);
    if (!pre.ok) { res.setHeader('Retry-After', String(pre.retryAfterSec)); return fail(res, requestId, 429, 'rate_limited', 'Too many failed authentication attempts. Try again later.'); }

    repo ??= new FirestoreAgentRepo();
    const source = req.headers['x-clearmind-client'] === 'cli' ? 'cli' : 'api';
    let auth;
    try { auth = await authenticate(repo, bearer(req), sha256, source); }
    catch (e) {
      if (e instanceof AgentError && e.code === 'unauthorized') {
        const r = await limiter.check(LIMITS.authFailures, ip);
        if (!r.ok) { res.setHeader('Retry-After', String(r.retryAfterSec)); return fail(res, requestId, 429, 'rate_limited', 'Too many failed authentication attempts. Try again later.'); }
      }
      throw e;
    }
    if (req.method === 'GET' && (path === 'tools' || path === '')) {
      return sendJson(res, 200, { tools: toolManifest().filter((t) => t.scopes.every((s) => auth.token.scopes.includes(s))) });
    }
    if (req.method === 'GET' && path === 'me') return sendJson(res, 200, { name: auth.token.name, scopes: auth.token.scopes, rateLimit: auth.token.rateLimit ?? 60, expiresAt: auth.token.expiresAt ?? null });
    const m = /^tools\/([a-z_]{1,64})$/.exec(path);
    if (req.method === 'POST' && m) {
      const args = (await readJson(req)) ?? {};
      const r = await callTool(repo, auth, m[1], args, { sha256 });
      if (r.ok) return sendJson(res, 200, { ok: true, result: r.result });
      if (r.error!.code === 'internal') log('error', 'tool internal error', { fn: 'v1', requestId, tool: m[1] });
      return fail(res, requestId, STATUS[r.error!.code] ?? 400, r.error!.code, r.error!.message, r.error!.data);
    }
    return fail(res, requestId, 404, 'not_found', 'Use GET /api/v1/tools or POST /api/v1/tools/<name>');
  } catch (e: any) {
    if (e instanceof AgentError) return fail(res, requestId, STATUS[e.code] ?? 400, e.code, e.message);
    if (e instanceof HttpError) return fail(res, requestId, e.status, e.code, e.message);
    log('error', 'v1 error', { fn: 'v1', requestId, error: e?.name ?? 'Error', detail: String(e?.message ?? '').slice(0, 300) });
    return fail(res, requestId, 500, 'internal', 'Internal error');
  }
}

export default withRequest('v1', handle, (requestId) => ({ ok: false, error: { code: 'internal', message: 'Internal error' }, requestId }));
