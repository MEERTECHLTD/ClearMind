/**
 * Hosted ClearMind MCP endpoint (Streamable HTTP, stateless):
 *   POST https://clearmind.meertech.tech/api/mcp
 *   Authorization: Bearer cm_…
 * Each request authenticates the token, builds an MCP server bound to that
 * user/scopes and handles the JSON-RPC message. Same tools as the local server.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getFirestore } from 'firebase-admin/firestore';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticate, AgentError } from '../shared/agents/tools';
import { FirestoreAgentRepo, adminApp } from '../server/firestoreRepo';
import { createMcpServer, sha256 } from '../server/mcp';
import { createLimiter, FirestoreLimitStore, LIMITS } from '../server/rateLimit';
import { bearer, readJson, sendJson, originOf, clientIp, corsPublic, withRequest, log, HttpError, type Req } from './http';

let repo: FirestoreAgentRepo | null = null;
const limiter = createLimiter({
  global: new FirestoreLimitStore(() => getFirestore(adminApp())),
  onError: (e) => log('warn', 'rate limiter unavailable (fail open)', { fn: 'mcp', error: (e as Error)?.name ?? 'Error' }),
});

const rpcError = (code: number, message: string) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

/**
 * Bearer header (OAuth connectors, Claude Code) or ?key=cm_… in the URL (clients
 * without OAuth/headers). The query form is kept for compatibility; it is never
 * logged (access logs record the path only) — prefer the header.
 */
function credential(req: IncomingMessage): string | null {
  const b = bearer(req);
  if (b) return b;
  try { return new URL(req.url ?? '/', 'http://x').searchParams.get('key'); } catch { return null; }
}

/** RFC 9728: tell OAuth-capable clients (claude.ai, ChatGPT) where to sign in. */
function unauthorized(req: IncomingMessage, res: ServerResponse, message: string, hadToken: boolean) {
  const origin = originOf(req);
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"${hadToken ? ', error="invalid_token"' : ''}`);
  return sendJson(res, 401, rpcError(-32001, message));
}

function tooMany(res: ServerResponse, retryAfterSec: number) {
  res.setHeader('Retry-After', String(retryAfterSec));
  return sendJson(res, 429, rpcError(-32002, 'Too many failed authentication attempts. Try again later.'));
}

async function handle(req: Req, res: ServerResponse, { requestId }: { requestId: string }) {
  corsPublic(res, 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, X-Request-Id', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const token = credential(req);
  if (!token) return unauthorized(req, res, 'Sign in required. Connect with OAuth, or create a token in ClearMind → Settings → Integrations.', false);
  if (req.method === 'GET' || req.method === 'DELETE') {
    // Stateless server: no SSE stream / sessions to resume or close.
    return sendJson(res, 405, rpcError(-32000, 'Use POST (stateless Streamable HTTP).'));
  }
  const ip = clientIp(req);
  try {
    const pre = await limiter.blocked(LIMITS.authFailures, ip);
    if (!pre.ok) return tooMany(res, pre.retryAfterSec);
    repo ??= new FirestoreAgentRepo();
    const auth = await authenticate(repo, token, sha256, 'mcp');
    const body = await readJson(req);
    const server = createMcpServer(repo, auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req as any, res, body);
  } catch (e: any) {
    if (res.headersSent) return;
    if (e instanceof AgentError && e.code === 'unauthorized') {
      const r = await limiter.check(LIMITS.authFailures, ip);
      if (!r.ok) return tooMany(res, r.retryAfterSec);
      return unauthorized(req, res, e.message, true);
    }
    if (e instanceof HttpError) return sendJson(res, e.status, rpcError(e.status === 413 ? -32600 : -32700, e.message));
    log('error', 'mcp error', { fn: 'mcp', requestId, error: e?.name ?? 'Error', detail: String(e?.message ?? '').slice(0, 300) });
    sendJson(res, 500, rpcError(-32603, 'Internal error'));
  }
}

export default withRequest('mcp', handle, () => rpcError(-32603, 'Internal error'));
