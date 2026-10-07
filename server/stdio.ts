#!/usr/bin/env node
/**
 * Local ClearMind MCP server (stdio) for Claude Code, Codex and other MCP clients.
 *
 *   CLEARMIND_TOKEN=cm_…  (create in ClearMind → Settings → Integrations)
 *   Service account: ~/.config/clearmind/service-account.json
 *     (or CLEARMIND_SERVICE_ACCOUNT=/path, or FIREBASE_SERVICE_ACCOUNT=<json|base64>)
 *
 * Writes land in the same Firestore data as the apps — they appear on web and
 * mobile within seconds.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { authenticate } from '../shared/agents/tools';
import { FirestoreAgentRepo } from './firestoreRepo';
import { createMcpServer, sha256 } from './mcp';

async function main() {
  const repo = new FirestoreAgentRepo();
  const auth = await authenticate(repo, process.env.CLEARMIND_TOKEN, sha256, 'mcp');
  const server = createMcpServer(repo, auth);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`ClearMind MCP ready (agent: ${auth.token.name}, scopes: ${auth.token.scopes.join(', ')})\n`);
}

main().catch((e) => {
  process.stderr.write(`ClearMind MCP failed to start: ${e?.message ?? e}\n`);
  process.exit(1);
});
