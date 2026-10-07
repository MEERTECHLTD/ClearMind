/**
 * ClearMind MCP server (transport-agnostic). Exposes the shared tool catalog
 * (shared/agents/tools) plus read-only resources and planning prompts.
 * Used by server/stdio.ts (local, Claude Code / Codex) and api/mcp.ts (hosted).
 */
import { createHash } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema,
  ListPromptsRequestSchema, GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { toolManifest, callTool, type AgentRepo, type AuthContext } from '../shared/agents/tools';

export const sha256 = async (s: string) => createHash('sha256').update(s).digest('hex');

const RESOURCES = [
  { uri: 'clearmind://today', name: 'Today', description: 'Overdue + due today', tool: 'views_today' },
  { uri: 'clearmind://inbox', name: 'Inbox', description: 'Unorganised captures', tool: 'inbox_list' },
  { uri: 'clearmind://upcoming', name: 'Upcoming (7 days)', description: 'Tasks by day', tool: 'views_upcoming' },
  { uri: 'clearmind://projects', name: 'Projects', description: 'Projects with progress', tool: 'projects_list' },
  { uri: 'clearmind://productivity', name: 'Productivity', description: 'Momentum, goals, streaks', tool: 'productivity_summary' },
];

const PROMPTS = [
  { name: 'plan_my_day', description: 'Build a realistic plan for today from overdue + today tasks and priorities.', text: 'Use views_today and views_overdue. Propose a focused plan for today: top 3 must-dos (prefer p1/p2 and overdue), what to reschedule (suggest concrete dates), and quick wins. Ask before making changes; when I agree, apply them with tasks_update / tasks_bulk_update.' },
  { name: 'weekly_review', description: 'Run a weekly review: inbox zero, overdue, project health, next week.', text: 'Run my weekly review: 1) inbox_list — propose a destination/date for each item; 2) views_overdue — propose reschedules; 3) projects_list + productivity_interval(this_week) — summarise progress and risks per project; 4) suggest next week’s top 3 priorities. Apply changes only after I confirm.' },
  { name: 'project_blockers', description: 'Explain what is blocking a project, from real data.', args: [{ name: 'project', description: 'Project name', required: true }], text: 'Call projects_get and productivity_project for project "{project}". Identify blockers (blocked/waiting sections, overdue p1/p2, stalled tasks), summarise progress, and recommend next actions.' },
];

export function createMcpServer(repo: AgentRepo, auth: AuthContext) {
  const server = new Server(
    { name: 'clearmind', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: 'ClearMind is the user’s task and project system (Inbox, Today, Upcoming, projects with sections, labels, priorities p1–p4, recurring tasks, productivity). Use inbox_capture for quick captures, tasks_create for structured tasks (due_string accepts natural language). Destructive bulk actions return a confirm_token — show the preview to the user before confirming.' },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolManifest()
      .filter((t) => t.scopes.every((s) => auth.token.scopes.includes(s)))
      .map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema as any })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const r = await callTool(repo, auth, req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>, { sha256 });
    if (r.ok) return { content: [{ type: 'text', text: JSON.stringify(r.result, null, 2) }], structuredContent: (r.result && typeof r.result === 'object' && !Array.isArray(r.result) ? r.result : { result: r.result }) as any };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(r.error, null, 2) }] };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES.map(({ tool: _t, ...r }) => ({ ...r, mimeType: 'application/json' })) }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const res = RESOURCES.find((r) => r.uri === req.params.uri);
    if (!res) throw new Error(`Unknown resource ${req.params.uri}`);
    const r = await callTool(repo, auth, res.tool, {}, { sha256 });
    return { contents: [{ uri: res.uri, mimeType: 'application/json', text: JSON.stringify(r.ok ? r.result : r.error, null, 2) }] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS.map((p) => ({ name: p.name, description: p.description, arguments: p.args })) }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const p = PROMPTS.find((x) => x.name === req.params.name);
    if (!p) throw new Error(`Unknown prompt ${req.params.name}`);
    const text = p.text.replace(/\{(\w+)\}/g, (_, k) => String(req.params.arguments?.[k] ?? ''));
    return { description: p.description, messages: [{ role: 'user', content: { type: 'text', text } }] };
  });

  return server;
}
