import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHash } from 'node:crypto';
import type { AgentToken, AgentAudit } from '../shared/types';
import { stampEdit } from '../shared/sync/fields';
import { authenticate, type AgentRepo, type FullState } from '../shared/agents/tools';
import { makeToken } from '../shared/agents/tokens';
import { createMcpServer } from './mcp';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const UID = 'McpUser0000000000000000';

class Repo implements AgentRepo {
  d = new Map<string, Map<string, any>>();
  tokens = new Map<string, AgentToken>();
  audits: AgentAudit[] = [];
  c(n: string) { let m = this.d.get(n); if (!m) { m = new Map(); this.d.set(n, m); } return m; }
  async loadState(): Promise<FullState> {
    const a = (n: string) => [...this.c(n).values()];
    return { tasks: a('tasks'), projects: a('projects'), labels: a('labels'), sections: a('sections'), comments: a('comments'), completions: a('completions'), filters: a('filters'), preferences: null };
  }
  async commit(_u: string, edits: any[], meta: any) { for (const e of edits) this.c(e.coll).set(e.id, stampEdit(this.c(e.coll).get(e.id), { ...e.edit, id: e.id }, meta).record); }
  async getToken(_u: string, h: string) { return this.tokens.get(h) ?? null; }
  async touchToken() {}
  async audit(_u: string, a: AgentAudit) { this.audits.push(a); }
  async recentActivity() { return [...this.c('activity').values()]; }
}

async function connect(scopes: AgentToken['scopes']) {
  const repo = new Repo();
  const token = makeToken(UID, 'M'.repeat(40));
  repo.tokens.set(sha(token), { id: 'x', name: 'Codex', scopes, createdAt: '', prefix: 'cm_' });
  const auth = await authenticate(repo, token, async (s) => sha(s), 'mcp');
  const server = createMcpServer(repo, auth);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, repo };
}

describe('MCP server (real protocol, SDK client)', () => {
  it('lists only the tools the token may use, with JSON schemas', async () => {
    const { client } = await connect(['tasks:read', 'tasks:write']);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('inbox_capture');
    expect(names).toContain('views_today');
    expect(names).not.toContain('tasks_delete');
    expect(names).not.toContain('projects_delete');
    expect(tools.find((t) => t.name === 'tasks_create')!.inputSchema).toMatchObject({ type: 'object', required: ['title'] });
  });

  it('creates and reads tasks end-to-end, attributing the agent', async () => {
    const { client, repo } = await connect(['tasks:read', 'tasks:write', 'projects:read', 'projects:write', 'productivity:read']);
    const created = await client.callTool({ name: 'tasks_create', arguments: { title: 'Prepare Odyssey docs', due_string: 'today', priority: 'p1' } });
    expect(created.isError).toBeFalsy();
    const today = await client.callTool({ name: 'views_today', arguments: {} });
    expect(JSON.stringify(today.structuredContent)).toContain('Prepare Odyssey docs');
    expect([...repo.c('tasks').values()][0]).toMatchObject({ source: 'mcp', agent: 'Codex', priority: 'High' });
    expect(repo.audits.map((a) => a.tool)).toEqual(['tasks_create', 'views_today']);
  });

  it('returns structured errors (not exceptions) for forbidden/invalid calls', async () => {
    const { client } = await connect(['tasks:read']);
    const r = await client.callTool({ name: 'tasks_create', arguments: { title: 'x' } });
    expect(r.isError).toBe(true);
    expect((r.content as any)[0].text).toContain('forbidden');
  });

  it('serves resources and prompts', async () => {
    const { client } = await connect(['tasks:read', 'projects:read', 'productivity:read']);
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('clearmind://today');
    const today = await client.readResource({ uri: 'clearmind://today' });
    expect(JSON.parse((today.contents[0] as any).text)).toHaveProperty('today');
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['plan_my_day', 'weekly_review', 'project_blockers']);
    const p = await client.getPrompt({ name: 'project_blockers', arguments: { project: 'RanaWallet' } });
    expect((p.messages[0].content as any).text).toContain('RanaWallet');
  });
});
