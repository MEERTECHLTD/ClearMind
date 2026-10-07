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

let repo: FirestoreAgentRepo | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET' || req.method === 'DELETE') {
    // Stateless server: no SSE stream / sessions to resume or close.
    return sendJson(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Use POST (stateless Streamable HTTP).' }, id: null });
  }
  try {
    repo ??= new FirestoreAgentRepo();
    const auth = await authenticate(repo, bearer(req), sha256, 'mcp');
    const body = await readJson(req);
    const server = createMcpServer(repo, auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req as any, res, body);
  } catch (e: any) {
    const status = e instanceof AgentError && e.code === 'unauthorized' ? 401 : 500;
    if (!res.headersSent) sendJson(res, status, { jsonrpc: '2.0', error: { code: status === 401 ? -32001 : -32603, message: status === 401 ? e.message : 'Internal error' }, id: null });
  }
}
