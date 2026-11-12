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

const RESOURCES: { uri: string; name: string; description: string; tool: string; args?: Record<string, unknown> }[] = [
  { uri: 'clearmind://overview', name: 'Overview', description: 'Settings, labels, filters and counts for every area', tool: 'workspace_overview' },
  { uri: 'clearmind://today', name: 'Today', description: 'Overdue + due today', tool: 'tasks_view', args: { view: 'today' } },
  { uri: 'clearmind://inbox', name: 'Inbox', description: 'Unorganised captures', tool: 'tasks_view', args: { view: 'inbox' } },
  { uri: 'clearmind://upcoming', name: 'Upcoming (7 days)', description: 'Tasks by day', tool: 'tasks_view', args: { view: 'upcoming' } },
  { uri: 'clearmind://projects', name: 'Projects', description: 'Projects with progress', tool: 'projects_list' },
  { uri: 'clearmind://productivity', name: 'Productivity', description: 'Momentum, goals, streaks', tool: 'productivity' },
  { uri: 'clearmind://habits', name: 'Habits', description: 'Habits with today\'s status and streaks', tool: 'habits_list' },
  { uri: 'clearmind://calendar', name: 'Calendar (14 days)', description: 'Upcoming events', tool: 'calendar_list' },
  { uri: 'clearmind://daily-map', name: 'Daily map', description: 'Today\'s time blocks', tool: 'daily_map_list' },
];

const PROMPTS = [
  { name: 'plan_my_day', description: 'Build a realistic plan for today from tasks, calendar, habits and the daily map.', text: 'Use tasks_view (today), calendar_list (today only), habits_list and daily_map_list. Propose a focused plan for today: top 3 must-dos (prefer p1/p2 and overdue), time blocks around my events, habits to fit in, and what to reschedule (concrete dates). Ask before changing anything; when I agree, apply it with tasks_update / tasks_bulk_update / daily_map_save.' },
  { name: 'weekly_review', description: 'Weekly review across tasks, projects, goals, habits, applications and journal.', text: 'Run my weekly review: 1) tasks_view inbox — propose a destination/date for each item; 2) tasks_view overdue — propose reschedules; 3) projects_list + productivity(interval=this_week) — progress and risks per project; 4) goals_list and habits_list — progress and streaks; 5) applications_list(deadline_within_days=14); 6) journal_list for this week — themes in my mood; 7) suggest next week’s top 3 priorities. Apply changes only after I confirm.' },
  { name: 'project_blockers', description: 'Explain what is blocking a project, from real data.', args: [{ name: 'project', description: 'Project name', required: true }], text: 'Call projects_get and productivity(project="{project}"). Identify blockers (blocked/waiting sections, overdue p1/p2, stalled tasks, open high risks, phases marked Blocked), use the project notes for context, summarise progress, and recommend next actions.' },
];

const INSTRUCTIONS = `ClearMind is the user's whole productivity system, and every part of it is available here:
- Tasks (Inbox, Today, Upcoming, projects with sections, labels, p1–p4, recurring): inbox_capture for quick captures, tasks_create / tasks_update (completed=true completes), tasks_view, tasks_list with filter queries, tasks_bulk_update.
- Projects with plans (status, phases, risks, budget, KPIs, check-ins) and project notes: projects_get / projects_update; notes_create with project=… files a note under that project.
- Notes vault (markdown, [[links]], daily notes): notes_*.
- Habits (habits_check to tick one off), goals, milestones, calendar, daily map (time blocks, repeating blocks), journal (daily log + rants), applications (jobs/grants/scholarships), learning vault, mind maps (build from an outline), AI chat history: <area>_list / <area>_save / <area>_delete.
- Start with workspace_overview to orient; use search + fetch to find anything across every area.
Times and dates are in the user's time zone. Any delete of more than one item, and bulk changes over 25 tasks, return a confirm_token first — show the preview to the user before confirming.`;

export function createMcpServer(repo: AgentRepo, auth: AuthContext) {
  const server = new Server(
    { name: 'clearmind', version: '2.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: INSTRUCTIONS },
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

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES.map(({ tool: _t, args: _a, ...r }) => ({ ...r, mimeType: 'application/json' })) }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const res = RESOURCES.find((r) => r.uri === req.params.uri);
    if (!res) throw new Error(`Unknown resource ${req.params.uri}`);
    const r = await callTool(repo, auth, res.tool, { ...(res.args ?? {}) }, { sha256 });
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
