/**
 * ClearMind REST API (same tools as MCP):
 *   GET  /api/v1/tools              → tool manifest (filtered to the token's scopes)
 *   POST /api/v1/tools/<name>       → run a tool with a JSON body of arguments
 *   GET  /api/v1/me                 → token info (name, scopes)
 * Authorization: Bearer cm_…
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticate, callTool, toolManifest, AgentError } from '../shared/agents/tools';
import { FirestoreAgentRepo } from '../server/firestoreRepo';
import { sha256 } from '../server/mcp';
import { bearer, readJson, sendJson } from './http';

let repo: FirestoreAgentRepo | null = null;

const STATUS: Record<string, number> = { unauthorized: 401, forbidden: 403, rate_limited: 429, invalid: 400, not_found: 404, conflict: 409, confirm_required: 409, internal: 500 };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = (url.searchParams.get('path') ?? url.pathname.replace(/^\/api\/v1\/?/, '')).replace(/^\/+|\/+$/g, '');
    repo ??= new FirestoreAgentRepo();
    const source = req.headers['x-clearmind-client'] === 'cli' ? 'cli' : 'api';
    const auth = await authenticate(repo, bearer(req), sha256, source);
    if (req.method === 'GET' && (path === 'tools' || path === '')) {
      return sendJson(res, 200, { tools: toolManifest().filter((t) => t.scopes.every((s) => auth.token.scopes.includes(s))) });
    }
    if (req.method === 'GET' && path === 'me') return sendJson(res, 200, { name: auth.token.name, scopes: auth.token.scopes, rateLimit: auth.token.rateLimit ?? 60 });
    const m = /^tools\/([a-z_]+)$/.exec(path);
    if (req.method === 'POST' && m) {
      const args = (await readJson(req)) ?? {};
      const r = await callTool(repo, auth, m[1], args, { sha256 });
      return r.ok ? sendJson(res, 200, { ok: true, result: r.result }) : sendJson(res, STATUS[r.error!.code] ?? 400, { ok: false, error: r.error });
    }
    return sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Use GET /api/v1/tools or POST /api/v1/tools/<name>' } });
  } catch (e: any) {
    if (e instanceof AgentError) return sendJson(res, STATUS[e.code] ?? 400, { ok: false, error: { code: e.code, message: e.message } });
    return sendJson(res, 500, { ok: false, error: { code: 'internal', message: 'Internal error' } });
  }
}
