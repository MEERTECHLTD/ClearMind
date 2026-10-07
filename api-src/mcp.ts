/**
 * Hosted ClearMind MCP endpoint (Streamable HTTP, stateless):
 *   POST https://clearmind.meertech.tech/api/mcp
 *   Authorization: Bearer cm_…
 * Each request authenticates the token, builds an MCP server bound to that
 * user/scopes and handles the JSON-RPC message. Same tools as the local server.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticate, AgentError } from '../shared/agents/tools';
import { FirestoreAgentRepo } from '../server/firestoreRepo';
import { createMcpServer, sha256 } from '../server/mcp';
import { bearer, readJson, sendJson } from './http';
import { originOf } from './oauth';

let repo: FirestoreAgentRepo | null = null;

/** Bearer header (OAuth connectors, Claude Code) or ?key=cm_… in the URL (clients without OAuth). */
function credential(req: IncomingMessage): string | null {
  const b = bearer(req);
  if (b) return b;
  try { return new URL(req.url ?? '/', 'http://x').searchParams.get('key'); } catch { return null; }
}

/** RFC 9728: tell OAuth-capable clients (claude.ai, ChatGPT) where to sign in. */
function unauthorized(req: IncomingMessage, res: ServerResponse, message: string, hadToken: boolean) {
  const origin = originOf(req);
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"${hadToken ? ', error="invalid_token"' : ''}`);
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate');
  return sendJson(res, 401, { jsonrpc: '2.0', error: { code: -32001, message }, id: null });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const token = credential(req);
  if (!token) return unauthorized(req, res, 'Sign in required. Connect with OAuth, or create a token in ClearMind → Settings → Integrations.', false);
  if (req.method === 'GET' || req.method === 'DELETE') {
    // Stateless server: no SSE stream / sessions to resume or close.
    return sendJson(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Use POST (stateless Streamable HTTP).' }, id: null });
  }
  try {
    repo ??= new FirestoreAgentRepo();
    const auth = await authenticate(repo, token, sha256, 'mcp');
    const body = await readJson(req);
    const server = createMcpServer(repo, auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req as any, res, body);
  } catch (e: any) {
    if (e instanceof AgentError && e.code === 'unauthorized') { if (!res.headersSent) unauthorized(req, res, e.message, true); return; }
    if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
}
