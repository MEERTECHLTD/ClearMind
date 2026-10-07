/**
 * ClearMind agent tool catalog + dispatcher — the ONE implementation behind the
 * MCP server (local stdio and hosted HTTP), the REST API and the CLI.
 *
 * Every tool runs the shared domain operations against fresh, authoritative
 * state from the repository (Firestore), so agents and apps can never diverge.
 *
 * Security model
 *  - authenticate(): `cm_<uid>_<secret>` token → sha256 → users/{uid}/agentTokens/{hash};
 *    must exist and not be revoked.
 *  - Scopes per tool (tasks:read, tasks:write, tasks:delete, projects:*, productivity:read, bulk).
 *  - Rate limit per token (requests/minute).
 *  - Input validation (JSON-schema-ish checks + domain validation).
 *  - Destructive bulk operations are two-step: the first call returns a preview
 *    and a short-lived confirm_token bound to the exact item set; only a second
 *    call with that token executes. Hard caps on bulk size.
 *  - Every call is audited (users/{uid}/agentAudit) and every change carries
 *    source + agent name in activity history.
 */
import type { Task, Project, Section, Comment, Completion, Activity, AgentScope, AgentToken, AgentAudit, ChangeSource, Preferences, SavedFilter, TaskPriority } from '../types';
import * as D from '../domain';
import { todayView, upcomingView, inboxTasks, compareTasks, isOverdue, priorityFromLevel, toISODate, orderedProjects, projectTasks, parseQuickAdd } from '../tasks';
import { nowInZone } from '../tasks/time';
import { parseToken, DEFAULT_RATE_LIMIT } from './tokens';

// ------------------------------------------------------------------ repository contract

export interface FullState extends D.DomainState {
  comments: Comment[];
  completions: Completion[];
  filters: SavedFilter[];
  preferences: Preferences | null;
}

export interface AgentRepo {
  /** Fresh, authoritative state for the user. */
  loadState(uid: string): Promise<FullState>;
  /** Persist domain edits (field-level, server-timestamped) atomically where possible. */
  commit(uid: string, edits: D.Edit[], meta: { clientId: string; mutationId: string }): Promise<void>;
  getToken(uid: string, hash: string): Promise<AgentToken | null>;
  touchToken(uid: string, hash: string, at: string): Promise<void>;
  audit(uid: string, entry: AgentAudit): Promise<void>;
  recentActivity(uid: string, limit: number): Promise<Activity[]>;
}

export interface AuthContext { uid: string; token: AgentToken; tokenHash: string; source: ChangeSource }

export class AgentError extends Error {
  constructor(public code: 'unauthorized' | 'forbidden' | 'rate_limited' | 'invalid' | 'not_found' | 'conflict' | 'confirm_required', message: string, public data?: unknown) { super(message); }
}

// ------------------------------------------------------------------ auth + rate limit

export async function authenticate(repo: AgentRepo, token: string | undefined | null, sha256: (s: string) => Promise<string>, source: ChangeSource): Promise<AuthContext> {
  const parsed = token ? parseToken(token.trim()) : null;
  if (!parsed) throw new AgentError('unauthorized', 'Missing or malformed ClearMind token. Create one in Settings → Integrations.');
  const hash = await sha256(token!.trim());
  const t = await repo.getToken(parsed.uid, hash);
  if (!t) throw new AgentError('unauthorized', 'Unknown token.');
  if (t.revoked) throw new AgentError('unauthorized', 'This token was revoked.');
  return { uid: parsed.uid, token: t, tokenHash: hash, source };
}

const windows = new Map<string, number[]>();
export function rateLimit(auth: AuthContext, now = Date.now()) {
  const limit = auth.token.rateLimit ?? DEFAULT_RATE_LIMIT;
  const w = (windows.get(auth.tokenHash) ?? []).filter((t) => now - t < 60_000);
  if (w.length >= limit) throw new AgentError('rate_limited', `Rate limit exceeded (${limit}/min). Try again shortly.`);
  w.push(now);
  windows.set(auth.tokenHash, w);
}

// ------------------------------------------------------------------ helpers

type Args = Record<string, any>;
type Json = Record<string, unknown>;

interface ToolDef {
  name: string;
  title: string;
  description: string;
  scopes: AgentScope[];
  input: { type: 'object'; properties: Record<string, any>; required?: string[]; additionalProperties?: boolean };
  /** Mutating tools write edits; read tools don't. */
  run: (x: { state: FullState; args: Args; ctx: D.Ctx; auth: AuthContext; repo: AgentRepo; now: Date }) => Promise<{ result: unknown; edits?: D.Edit[]; summary?: string }>;
}

const S = { type: 'string' } as const;
const N = { type: 'number' } as const;
const B = { type: 'boolean' } as const;
const PRIORITY = { type: 'string', enum: ['p1', 'p2', 'p3', 'p4'], description: 'p1 = highest' };
const DATE = { type: 'string', description: 'YYYY-MM-DD (user local date)' };
const TIME = { type: 'string', description: 'HH:MM 24h (user local time)' };
const RECURRENCE = {
  type: 'object',
  description: 'Repeat rule. Prefer `due_string` (e.g. "every friday at 4pm", "every month on the 1st", "every 30 days after completion") for natural language.',
  properties: {
    freq: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] }, interval: N,
    weekdays: { type: 'array', items: N, description: '0=Sun … 6=Sat' }, monthDay: { type: 'number', description: '1–31, or -1 for the last day' },
    nthWeekday: { type: 'object', properties: { weekday: N, ordinal: { type: 'number', description: '1–5 or -1 for last' } } },
    anchor: { type: 'string', enum: ['scheduled', 'completion'] }, until: DATE,
  },
};
const toPriority = (p?: string): TaskPriority | undefined => (p ? priorityFromLevel(Number(String(p).replace(/\D/g, '')) || 4) : undefined);

function lookups(s: FullState) {
  return {
    projects: new Map(s.projects.filter((p) => !p.deleted).map((p) => [p.id, p])),
    labels: new Map(s.labels.filter((l) => !l.deleted).map((l) => [l.id, l])),
    sections: new Map(s.sections.filter((x) => !x.deleted).map((x) => [x.id, x])),
  };
}
const live = <T extends { deleted?: boolean | null }>(xs: T[]) => xs.filter((x) => !x.deleted);

function resolveProject(s: FullState, ref?: string | null): Project | null | undefined {
  if (ref === undefined) return undefined;
  if (ref === null || ref === '' || /^inbox$/i.test(ref)) return null;
  const ps = live(s.projects);
  const p = ps.find((x) => x.id === ref) ?? ps.find((x) => x.title.toLowerCase() === ref.replace(/^#/, '').toLowerCase());
  if (!p) throw new AgentError('not_found', `Project "${ref}" not found. Use projects_list to see names.`);
  return p;
}
function resolveSection(s: FullState, projectId: string | null | undefined, ref?: string | null): Section | null | undefined {
  if (ref === undefined) return undefined;
  if (ref === null || ref === '') return null;
  const sec = live(s.sections).find((x) => x.id === ref) ?? live(s.sections).find((x) => x.name.toLowerCase() === ref.replace(/^\//, '').toLowerCase() && (!projectId || x.projectId === projectId));
  if (!sec) throw new AgentError('not_found', `Section "${ref}" not found${projectId ? ' in that project' : ''}.`);
  return sec;
}
function resolveLabels(s: FullState, names: string[] | undefined, ctx: D.Ctx, edits: D.Edit[]): string[] | undefined {
  if (!names) return undefined;
  let state: D.DomainState = s;
  const ids: string[] = [];
  for (const n of names) {
    const clean = n.replace(/^[@%]/, '');
    const hit = live(state.labels).find((l) => l.id === n || l.name.toLowerCase() === clean.toLowerCase());
    if (hit) { ids.push(hit.id); continue; }
    const r = D.createLabel(state, { name: clean }, ctx);
    edits.push(...r.edits);
    state = D.applyEdits(state, r.edits);
    ids.push(r.result.id);
  }
  return ids;
}
function getTask(s: FullState, id: string): Task {
  const t = s.tasks.find((x) => x.id === id && !x.deleted);
  if (!t) throw new AgentError('not_found', `Task ${id} not found.`);
  return t;
}
const describe = (s: FullState, now: Date) => {
  const lk = lookups(s);
  return (t: Task) => D.describeTask(t, { ...lk, now });
};

/** Confirm tokens bind a destructive request to its exact target set (valid ~5–10 min). */
async function confirmToken(sha256: (s: string) => Promise<string>, uid: string, tool: string, ids: string[], now: number, offset = 0) {
  const windowId = Math.floor(now / 300_000) - offset;
  return (await sha256(`${uid}|${tool}|${[...ids].sort().join(',')}|${windowId}`)).slice(0, 16);
}

const BULK_MAX = 200;
const BULK_CONFIRM_OVER = 25;

// Task input fields shared by create/update.
const TASK_FIELDS = {
  title: S,
  description: S,
  due_date: { ...DATE, description: 'YYYY-MM-DD, or null to clear' },
  due_time: TIME,
  due_string: { type: 'string', description: 'Natural-language schedule, e.g. "tomorrow 9am", "every Friday at 4pm", "every month on the 1st". Overrides due_date/due_time/recurrence.' },
  timezone: { type: 'string', description: 'IANA zone for the due time, e.g. Africa/Lagos (default: user setting)' },
  duration_minutes: N,
  priority: PRIORITY,
  project: { type: 'string', description: 'Project name or id ("Inbox" for none)' },
  section: { type: 'string', description: 'Section name or id within the project' },
  parent_id: { type: 'string', description: 'Make this a sub-task of another task' },
  labels: { type: 'array', items: S, description: 'Label names (created if missing)' },
  recurrence: RECURRENCE,
  reminders: { type: 'array', description: 'Reminders: { minutes_before } or { at: "YYYY-MM-DDTHH:MM" }', items: { type: 'object', properties: { minutes_before: N, at: S } } },
} as const;

function taskFields(state: FullState, a: Args, ctx: D.Ctx, edits: D.Edit[], now: Date): Partial<D.TaskInput> {
  const out: Partial<D.TaskInput> = {};
  if (a.title !== undefined) out.title = String(a.title);
  if (a.description !== undefined) out.description = a.description === null ? null : String(a.description);
  if (a.due_date !== undefined) out.dueDate = a.due_date;
  if (a.due_time !== undefined) out.dueTime = a.due_time;
  if (a.timezone !== undefined) out.timezone = a.timezone;
  if (a.duration_minutes !== undefined) out.duration = a.duration_minutes;
  if (a.priority !== undefined) out.priority = toPriority(a.priority);
  if (a.recurrence !== undefined) out.recurrence = a.recurrence;
  if (a.due_string) {
    const parsed = parseDue(state, String(a.due_string), now);
    if (!parsed.dueDate && !parsed.recurrence) throw new AgentError('invalid', `Couldn't understand due_string "${a.due_string}".`);
    out.dueDate = parsed.dueDate ?? null;
    out.dueTime = parsed.dueTime ?? null;
    out.recurrence = parsed.recurrence ?? null;
  }
  const proj = resolveProject(state, a.project);
  if (proj !== undefined) out.projectId = proj?.id ?? null;
  const sec = resolveSection(state, proj?.id ?? undefined, a.section);
  if (sec !== undefined) { out.sectionId = sec?.id ?? null; if (sec && proj === undefined) out.projectId = sec.projectId; }
  if (a.parent_id !== undefined) out.parentId = a.parent_id;
  const labels = resolveLabels(state, a.labels, ctx, edits);
  if (labels) out.labelIds = labels;
  if (Array.isArray(a.reminders)) {
    out.reminders = a.reminders.map((r: any, i: number) => (r.at ? { id: `a${i}`, type: 'absolute' as const, at: String(r.at) } : { id: `a${i}`, type: 'relative' as const, minutesBefore: Number(r.minutes_before ?? 0) }));
  }
  return out;
}

function parseDue(state: FullState, text: string, now: Date) {
  const prefs = state.preferences;
  const r = parseQuickAdd(`x ${text}`, { now: nowInZone(prefs?.timezone ?? null, now), smartDates: true, nextWeek: prefs?.nextWeek, weekend: prefs?.weekend });
  return r;
}

// ------------------------------------------------------------------ the catalog

export const TOOLS: ToolDef[] = [
  // ---------------- capture & tasks
  {
    name: 'inbox_capture', title: 'Capture to Inbox', scopes: ['tasks:write'],
    description: 'Quickly add a thought, note or task to the Inbox without deciding where it belongs. Natural language is parsed (dates, "every …", p1–p4, #Project, @label, !30m reminders) unless parse=false. Use kind="note" for non-actionable notes.',
    input: { type: 'object', properties: { text: S, kind: { type: 'string', enum: ['task', 'note'] }, parse: B, description: S, idempotency_key: { type: 'string', description: 'Retry-safe: same key never creates a duplicate' } }, required: ['text'] },
    run: async ({ state, args, ctx, now }) => {
      const r = D.captureInbox(state, String(args.text), ctx, { kind: args.kind, parse: args.parse, description: args.description ?? null, idempotencyKey: args.idempotency_key ?? null });
      return { result: describe(D.applyEdits(state, r.edits) as FullState, now)(r.result), edits: r.edits, summary: `captured "${r.result.title}"` };
    },
  },
  {
    name: 'inbox_list', title: 'List Inbox', scopes: ['tasks:read'],
    description: 'List open items in the Inbox (tasks and notes not yet organised into a project), newest first.',
    input: { type: 'object', properties: { limit: N } },
    run: async ({ state, args, now }) => {
      const lk = lookups(state);
      const items = inboxTasks(live(state.tasks), lk.projects).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, args.limit ?? 100);
      return { result: { count: items.length, items: items.map(describe(state, now)) } };
    },
  },
  {
    name: 'tasks_create', title: 'Create task', scopes: ['tasks:write'],
    description: 'Create a task with structured fields. Use due_string for natural-language dates/recurrence ("every Friday at 4pm"). Unknown labels are created. Pass idempotency_key to make retries safe.',
    input: { type: 'object', properties: { ...TASK_FIELDS, idempotency_key: S }, required: ['title'] },
    run: async ({ state, args, ctx, now }) => {
      const edits: D.Edit[] = [];
      const f = taskFields(state, args, ctx, edits, now);
      const working = D.applyEdits(state, edits) as FullState;
      const r = D.createTask(working, { ...(f as D.TaskInput), title: String(args.title), idempotencyKey: args.idempotency_key ?? null }, ctx);
      edits.push(...r.edits);
      return { result: describe(D.applyEdits(state, edits) as FullState, now)(r.result), edits, summary: `created "${r.result.title}"` };
    },
  },
  {
    name: 'tasks_get', title: 'Get task', scopes: ['tasks:read'],
    description: 'Get one task with its sub-tasks and comments.',
    input: { type: 'object', properties: { id: S }, required: ['id'] },
    run: async ({ state, args, now }) => {
      const t = getTask(state, args.id);
      const d = describe(state, now);
      return { result: { ...d(t), subtasks: state.tasks.filter((x) => x.parentId === t.id && !x.deleted).map(d), comments: live(state.comments).filter((c) => c.taskId === t.id).map((c) => ({ id: c.id, text: c.text, createdAt: c.createdAt, source: c.source, agent: c.agent })) } };
    },
  },
  {
    name: 'tasks_list', title: 'List tasks', scopes: ['tasks:read'],
    description: 'List tasks, optionally filtered by project, section, label, priority or a filter query (e.g. "p1 & #Work & !@waiting", "overdue | today", "no date"). Open tasks only unless include_completed.',
    input: { type: 'object', properties: { project: S, section: S, label: S, priority: PRIORITY, query: { type: 'string', description: 'Filter query language' }, include_completed: B, limit: N } },
    run: async ({ state, args, now }) => {
      let ts = live(state.tasks).filter((t) => args.include_completed || !t.completed);
      if (args.project !== undefined) { const p = resolveProject(state, args.project); ts = ts.filter((t) => (t.projectId ?? null) === (p?.id ?? null)); }
      if (args.section) { const sec = resolveSection(state, undefined, args.section)!; ts = ts.filter((t) => t.sectionId === sec.id); }
      if (args.label) { const l = live(state.labels).find((x) => x.name.toLowerCase() === String(args.label).replace(/^@/, '').toLowerCase()); ts = l ? ts.filter((t) => (t.labelIds ?? []).includes(l.id)) : []; }
      if (args.priority) ts = ts.filter((t) => (t.priority ?? 'None') === toPriority(args.priority));
      if (args.query) {
        try { ts = D.runFilter(ts, args.query, { projects: state.projects, labels: state.labels, sections: state.sections, now, weekStart: state.preferences?.weekStart }); }
        catch (e) { throw new AgentError('invalid', `Bad filter query: ${(e as Error).message}`); }
      }
      ts.sort(compareTasks);
      const limit = Math.min(args.limit ?? 200, 500);
      return { result: { count: ts.length, tasks: ts.slice(0, limit).map(describe(state, now)), truncated: ts.length > limit } };
    },
  },
  {
    name: 'tasks_update', title: 'Update task', scopes: ['tasks:write'],
    description: 'Update fields of a task (title, description, due, priority, project, section, labels, recurrence, reminders, duration). Only the fields you pass change.',
    input: { type: 'object', properties: { id: S, ...TASK_FIELDS }, required: ['id'] },
    run: async ({ state, args, ctx, now }) => {
      getTask(state, args.id);
      const edits: D.Edit[] = [];
      const f = taskFields(state, args, ctx, edits, now);
      const r = D.updateTask(D.applyEdits(state, edits), args.id, f as D.TaskPatch, ctx);
      edits.push(...r.edits);
      return { result: describe(D.applyEdits(state, edits) as FullState, now)(r.result), edits, summary: `updated "${r.result.title}"` };
    },
  },
  {
    name: 'tasks_complete', title: 'Complete task', scopes: ['tasks:write'],
    description: 'Complete a task. Recurring tasks roll forward to their next occurrence (returned as next_due). Idempotent.',
    input: { type: 'object', properties: { id: S }, required: ['id'] },
    run: async ({ state, args, ctx, now }) => {
      const r = D.completeTask(state, args.id, ctx);
      return { result: { task: describe(D.applyEdits(state, r.edits) as FullState, now)(r.result.task), next_due: r.result.nextDueDate }, edits: r.edits, summary: `completed "${r.result.task.title}"` };
    },
  },
  {
    name: 'tasks_reopen', title: 'Reopen task', scopes: ['tasks:write'],
    description: 'Reopen a completed task (and completed parents).',
    input: { type: 'object', properties: { id: S }, required: ['id'] },
    run: async ({ state, args, ctx, now }) => {
      const r = D.reopenTask(state, args.id, ctx);
      return { result: describe(state, now)(r.result), edits: r.edits, summary: `reopened "${r.result.title}"` };
    },
  },
  {
    name: 'tasks_delete', title: 'Delete task', scopes: ['tasks:delete'],
    description: 'Delete one task and its sub-tasks. Restorable with tasks_restore.',
    input: { type: 'object', properties: { id: S }, required: ['id'] },
    run: async ({ state, args, ctx }) => {
      const t = getTask(state, args.id);
      const r = D.deleteTask(state, args.id, ctx);
      return { result: { deleted: r.result.ids }, edits: r.edits, summary: `deleted "${t.title}"` };
    },
  },
  {
    name: 'tasks_restore', title: 'Restore deleted tasks', scopes: ['tasks:write'],
    description: 'Undo a delete by restoring tasks by id.',
    input: { type: 'object', properties: { ids: { type: 'array', items: S } }, required: ['ids'] },
    run: async ({ state, args, ctx }) => {
      const ids: string[] = (args.ids ?? []).filter((id: string) => state.tasks.some((t) => t.id === id && t.deleted));
      const r = D.restoreTasks(state, ids, ctx);
      return { result: { restored: ids }, edits: r.edits, summary: `restored ${ids.length}` };
    },
  },
  {
    name: 'tasks_move', title: 'Move tasks', scopes: ['tasks:write'],
    description: 'Move tasks to a project and/or section (sub-tasks follow). Select tasks by ids or by a filter query (e.g. "##Project A" for every open task in Project A). Moving more than 25 tasks requires the bulk scope and a confirmation round-trip.',
    input: { type: 'object', properties: { ids: { type: 'array', items: S }, query: { type: 'string', description: 'Filter query selecting the tasks to move' }, project: S, section: S, confirm_token: S } },
    run: async (x) => bulk(x, 'tasks_move', (state, ids, ctx) => {
      const proj = resolveProject(state, x.args.project);
      const sec = resolveSection(state, proj?.id ?? undefined, x.args.section);
      return D.moveTasks(state, ids, { projectId: proj === undefined ? undefined : proj?.id ?? null, sectionId: sec === undefined ? undefined : sec?.id ?? null }, ctx);
    }),
  },
  {
    name: 'tasks_bulk_update', title: 'Bulk update tasks', scopes: ['tasks:write', 'bulk'],
    description: 'Apply the same change (priority, due, labels, project/section) to many tasks — select by ids or a filter query. Previews and returns a confirm_token when more than 25 tasks are affected; call again with it to apply.',
    input: { type: 'object', properties: { ids: { type: 'array', items: S }, query: S, priority: PRIORITY, due_date: DATE, due_string: S, labels: { type: 'array', items: S }, project: S, section: S, confirm_token: S } },
    run: async (x) => bulk(x, 'tasks_bulk_update', (state, ids, ctx, now, edits) => {
      const f = taskFields(state, x.args, ctx, edits, now);
      return D.bulkUpdate(D.applyEdits(state, edits), ids, f as D.TaskPatch, ctx);
    }),
  },
  {
    name: 'tasks_bulk_complete', title: 'Bulk complete tasks', scopes: ['tasks:write', 'bulk'],
    description: 'Complete many tasks (by ids or filter query). Over 25 requires confirmation.',
    input: { type: 'object', properties: { ids: { type: 'array', items: S }, query: S, confirm_token: S } },
    run: async (x) => bulk(x, 'tasks_bulk_complete', (state, ids, ctx) => {
      let s: D.DomainState = state;
      const edits: D.Edit[] = [];
      for (const id of ids) { const r = D.completeTask(s, id, ctx); edits.push(...r.edits); s = D.applyEdits(s, r.edits); }
      return { edits, result: { completed: ids.length } };
    }),
  },
  {
    name: 'tasks_bulk_delete', title: 'Bulk delete tasks', scopes: ['tasks:delete', 'bulk'],
    description: 'Delete many tasks (by ids or filter query). ALWAYS two-step: the first call returns a preview and confirm_token; deletion happens only when called again with that token.',
    input: { type: 'object', properties: { ids: { type: 'array', items: S }, query: S, confirm_token: S } },
    run: async (x) => bulk(x, 'tasks_bulk_delete', (state, ids, ctx) => {
      let s: D.DomainState = state;
      const edits: D.Edit[] = [];
      for (const id of ids) { if (!s.tasks.find((t) => t.id === id && !t.deleted)) continue; const r = D.deleteTask(s, id, ctx); edits.push(...r.edits); s = D.applyEdits(s, r.edits); }
      return { edits, result: { deleted: ids.length } };
    }, { alwaysConfirm: true }),
  },
  {
    name: 'search_global', title: 'Search', scopes: ['tasks:read'],
    description: 'Full-text search across task titles, descriptions, comments/notes, project and section names and labels; also returns matching projects and labels.',
    input: { type: 'object', properties: { query: S, include_completed: B, limit: N }, required: ['query'] },
    run: async ({ state, args, now }) => {
      const r = D.globalSearch(state, String(args.query), { includeCompleted: !!args.include_completed, limit: args.limit ?? 50 });
      return { result: { tasks: r.tasks.map(describe(state, now)), projects: r.projects.map((p) => ({ id: p.id, name: p.title })), labels: r.labels.map((l) => ({ id: l.id, name: l.name })) } };
    },
  },
  // ---------------- views
  {
    name: 'views_today', title: "Today's tasks", scopes: ['tasks:read'],
    description: "Today's plan: overdue tasks and tasks due today (in the user's time zone), plus completed-today count.",
    input: { type: 'object', properties: {} },
    run: async ({ state, now }) => {
      const local = nowInZone(state.preferences?.timezone ?? null, now);
      const v = todayView(live(state.tasks), local);
      const d = describe(state, local);
      const day = D.daySummary({ completions: state.completions, tasks: state.tasks, preferences: state.preferences, now });
      return { result: { date: toISODate(local), overdue: v.overdue.map(d), today: v.today.map(d), completed_today: day.completed, daily_goal: day.goal } };
    },
  },
  {
    name: 'views_upcoming', title: 'Upcoming', scopes: ['tasks:read'],
    description: 'Tasks grouped by day for the next N days (default 7).',
    input: { type: 'object', properties: { days: N } },
    run: async ({ state, args, now }) => {
      const local = nowInZone(state.preferences?.timezone ?? null, now);
      const d = describe(state, local);
      const groups = upcomingView(live(state.tasks), local, Math.min(args.days ?? 7, 60)).filter((g) => g.tasks.length);
      return { result: { days: groups.map((g) => ({ date: g.date, tasks: g.tasks.map(d) })) } };
    },
  },
  {
    name: 'views_overdue', title: 'Overdue', scopes: ['tasks:read'],
    description: 'Every open overdue task, oldest first.',
    input: { type: 'object', properties: {} },
    run: async ({ state, now }) => {
      const local = nowInZone(state.preferences?.timezone ?? null, now);
      const ts = live(state.tasks).filter((t) => isOverdue(t, local)).sort(compareTasks);
      return { result: { count: ts.length, tasks: ts.map(describe(state, local)) } };
    },
  },
  // ---------------- projects, sections, labels
  {
    name: 'projects_list', title: 'List projects', scopes: ['projects:read'],
    description: 'All projects (nested order) with open task counts and progress.',
    input: { type: 'object', properties: { include_archived: B } },
    run: async ({ state, args }) => {
      const list = orderedProjects(live(state.projects), !!args.include_archived);
      return { result: list.map(({ project: p, depth }) => {
        const st = D.projectStats([p.id], { tasks: state.tasks, completions: state.completions, preferences: state.preferences, sections: state.sections });
        return { id: p.id, name: p.title, parent_id: p.parentId ?? null, depth, color: p.color, favorite: !!p.favorite, archived: !!p.archived, open: st.open, overdue: st.overdue, progress: st.progress };
      }) };
    },
  },
  {
    name: 'projects_get', title: 'Get project', scopes: ['projects:read', 'tasks:read'],
    description: 'A project workspace: sections with their open tasks, tracker statistics (progress, overdue, blocked, due this week, trend) and recent activity. Use this to summarise a project or find blockers.',
    input: { type: 'object', properties: { project: { type: 'string', description: 'Name or id' }, include_completed: B } },
    run: async ({ state, args, repo, auth, now }) => {
      const p = resolveProject(state, args.project);
      if (!p) throw new AgentError('invalid', 'Pass a project name or id.');
      const d = describe(state, now);
      const secs = live(state.sections).filter((s) => s.projectId === p.id).sort((a, b) => a.order - b.order);
      const open = projectTasks(live(state.tasks), p.id);
      const stats = D.projectStats([p.id], { tasks: state.tasks, completions: state.completions, preferences: state.preferences, sections: state.sections, now });
      const acts = (await repo.recentActivity(auth.uid, 300)).filter((a) => a.projectId === p.id).slice(0, 20);
      return { result: {
        id: p.id, name: p.title, description: p.description || undefined, view: p.view ?? 'list', stats,
        no_section: open.filter((t) => !t.sectionId).map(d),
        sections: secs.map((s) => ({ id: s.id, name: s.name, tasks: open.filter((t) => t.sectionId === s.id).map(d) })),
        completed: args.include_completed ? live(state.tasks).filter((t) => t.projectId === p.id && t.completed).map(d) : undefined,
        recent_activity: acts.map((a) => ({ at: a.at, action: a.action, title: a.title, source: a.source, agent: a.agent, details: a.details })),
      } };
    },
  },
  {
    name: 'projects_create', title: 'Create project', scopes: ['projects:write'],
    description: 'Create a project (optionally nested, with sections, or from a template id: software-release, product-launch, kanban, weekly-review, personal).',
    input: { type: 'object', properties: { name: S, parent: S, color: S, view: { type: 'string', enum: ['list', 'board'] }, sections: { type: 'array', items: S }, template: S, idempotency_key: S }, required: ['name'] },
    run: async ({ state, args, ctx }) => {
      const parent = args.parent ? resolveProject(state, args.parent) : null;
      let r: D.OpResult<Project>;
      if (args.template) r = D.applyTemplate(state, args.template, { title: args.name, parentId: parent?.id ?? null }, ctx);
      else r = D.createProject(state, { title: args.name, parentId: parent?.id ?? null, color: args.color, view: args.view, idempotencyKey: args.idempotency_key ?? null }, ctx);
      const edits = [...r.edits];
      let s = D.applyEdits(state, edits);
      for (const name of args.sections ?? []) { const sr = D.createSection(s, { projectId: r.result.id, name }, ctx); edits.push(...sr.edits); s = D.applyEdits(s, sr.edits); }
      return { result: { id: r.result.id, name: r.result.title }, edits, summary: `created project "${r.result.title}"` };
    },
  },
  {
    name: 'projects_update', title: 'Update project', scopes: ['projects:write'],
    description: 'Rename, recolour, re-parent, favourite, archive/unarchive a project or change its view.',
    input: { type: 'object', properties: { project: S, name: S, color: S, parent: S, favorite: B, archived: B, view: { type: 'string', enum: ['list', 'board', 'calendar'] }, description: S }, required: ['project'] },
    run: async ({ state, args, ctx }) => {
      const p = resolveProject(state, args.project)!;
      const patch: any = {};
      if (args.name !== undefined) patch.title = args.name;
      for (const k of ['color', 'favorite', 'archived', 'view', 'description']) if (args[k] !== undefined) patch[k] = args[k];
      if (args.parent !== undefined) patch.parentId = args.parent ? resolveProject(state, args.parent)?.id ?? null : null;
      const r = D.updateProject(state, p.id, patch, ctx);
      return { result: { id: p.id, name: r.result.title, archived: !!r.result.archived }, edits: r.edits, summary: `updated project "${p.title}"` };
    },
  },
  {
    name: 'projects_delete', title: 'Delete project', scopes: ['projects:delete'],
    description: 'Delete a project with its sub-projects, sections and tasks. Two-step: returns a preview + confirm_token first.',
    input: { type: 'object', properties: { project: S, confirm_token: S }, required: ['project'] },
    run: async ({ state, args, ctx, auth, now }) => {
      const p = resolveProject(state, args.project)!;
      const ids = D.projectSubtree(state.projects, p.id);
      const tasks = live(state.tasks).filter((t) => t.projectId && ids.includes(t.projectId));
      const sha = sha256Ref.fn!;
      const want = [await confirmToken(sha, auth.uid, 'projects_delete', ids, now.getTime()), await confirmToken(sha, auth.uid, 'projects_delete', ids, now.getTime(), 1)];
      if (!args.confirm_token || !want.includes(args.confirm_token)) {
        throw new AgentError('confirm_required', `Deleting "${p.title}" removes ${ids.length} project(s) and ${tasks.length} task(s). Call again with confirm_token to proceed.`, { confirm_token: want[0], projects: ids.length, tasks: tasks.length, sample: tasks.slice(0, 10).map((t) => t.title) });
      }
      const r = D.deleteProject(state, p.id, ctx);
      return { result: r.result, edits: r.edits, summary: `deleted project "${p.title}"` };
    },
  },
  {
    name: 'sections_list', title: 'List sections', scopes: ['projects:read'],
    description: 'Sections of a project in order, with open task counts.',
    input: { type: 'object', properties: { project: S }, required: ['project'] },
    run: async ({ state, args }) => {
      const p = resolveProject(state, args.project)!;
      const secs = live(state.sections).filter((s) => s.projectId === p.id).sort((a, b) => a.order - b.order);
      return { result: secs.map((s) => ({ id: s.id, name: s.name, open: live(state.tasks).filter((t) => t.sectionId === s.id && !t.completed).length })) };
    },
  },
  {
    name: 'sections_create', title: 'Create section', scopes: ['projects:write'],
    description: 'Create a section in a project (e.g. "Payments", "Blocks the build", "Waiting").',
    input: { type: 'object', properties: { project: S, name: S, idempotency_key: S }, required: ['project', 'name'] },
    run: async ({ state, args, ctx }) => {
      const p = resolveProject(state, args.project)!;
      const r = D.createSection(state, { projectId: p.id, name: args.name, idempotencyKey: args.idempotency_key ?? null }, ctx);
      return { result: { id: r.result.id, name: r.result.name, project: p.title }, edits: r.edits, summary: `created section "${r.result.name}"` };
    },
  },
  {
    name: 'sections_update', title: 'Update section', scopes: ['projects:write'],
    description: 'Rename a section, or move it to a new position (0-based) within its project.',
    input: { type: 'object', properties: { section: S, project: S, name: S, position: N }, required: ['section'] },
    run: async ({ state, args }) => {
      const proj = args.project ? resolveProject(state, args.project) : undefined;
      const sec = resolveSection(state, proj?.id ?? undefined, args.section)!;
      const edits: D.Edit[] = [];
      if (args.name) edits.push(...D.updateSection(state, sec.id, { name: args.name }).edits);
      if (typeof args.position === 'number') {
        const ids = live(state.sections).filter((s) => s.projectId === sec.projectId).sort((a, b) => a.order - b.order).map((s) => s.id).filter((id) => id !== sec.id);
        ids.splice(Math.max(0, Math.min(args.position, ids.length)), 0, sec.id);
        edits.push(...D.reorderSections(state, sec.projectId, ids).edits);
      }
      return { result: { id: sec.id, name: args.name ?? sec.name }, edits, summary: `updated section "${sec.name}"` };
    },
  },
  {
    name: 'labels_list', title: 'List labels', scopes: ['tasks:read'],
    description: 'All labels with open task counts.',
    input: { type: 'object', properties: {} },
    run: async ({ state }) => ({ result: live(state.labels).map((l) => ({ id: l.id, name: l.name, color: l.color, open: live(state.tasks).filter((t) => !t.completed && (t.labelIds ?? []).includes(l.id)).length })) }),
  },
  {
    name: 'labels_create', title: 'Create label', scopes: ['tasks:write'],
    description: 'Create a label (idempotent by name).',
    input: { type: 'object', properties: { name: S, color: S }, required: ['name'] },
    run: async ({ state, args, ctx }) => {
      const r = D.createLabel(state, { name: args.name, color: args.color }, ctx);
      return { result: { id: r.result.id, name: r.result.name }, edits: r.edits, summary: `label "${r.result.name}"` };
    },
  },
  {
    name: 'comments_create', title: 'Add comment / note', scopes: ['tasks:write'],
    description: 'Add a comment or note to a task (or a project).',
    input: { type: 'object', properties: { task_id: S, project: S, text: S, idempotency_key: S }, required: ['text'] },
    run: async ({ state, args, ctx, auth }) => {
      const proj = args.project ? resolveProject(state, args.project) : null;
      const r = D.addComment(state, { taskId: args.task_id ?? null, projectId: proj?.id ?? null, text: args.text, authorName: auth.token.name, idempotencyKey: args.idempotency_key ?? null }, ctx);
      return { result: { id: r.result.id }, edits: r.edits, summary: 'added comment' };
    },
  },
  {
    name: 'comments_list', title: 'List comments', scopes: ['tasks:read'],
    description: 'Comments/notes on a task or project.',
    input: { type: 'object', properties: { task_id: S, project: S } },
    run: async ({ state, args }) => {
      const proj = args.project ? resolveProject(state, args.project) : null;
      const cs = live(state.comments).filter((c) => (args.task_id ? c.taskId === args.task_id : proj ? c.projectId === proj.id && !c.taskId : false));
      return { result: cs.map((c) => ({ id: c.id, text: c.text, createdAt: c.createdAt, source: c.source, agent: c.agent })) };
    },
  },
  {
    name: 'reminders_set', title: 'Set reminders', scopes: ['tasks:write'],
    description: 'Replace a task’s reminders. Each: { minutes_before } relative to the due time, or { at: "YYYY-MM-DDTHH:MM" }. Pass [] to clear. Devices re-plan notifications automatically.',
    input: { type: 'object', properties: { task_id: S, reminders: { type: 'array', items: { type: 'object', properties: { minutes_before: N, at: S } } } }, required: ['task_id', 'reminders'] },
    run: async ({ state, args, ctx, now }) => {
      const edits: D.Edit[] = [];
      const f = taskFields(state, { reminders: args.reminders }, ctx, edits, now);
      const r = D.updateTask(state, args.task_id, { reminders: f.reminders ?? [] } as any, ctx);
      return { result: { task_id: args.task_id, reminders: r.result.reminders }, edits: r.edits, summary: 'set reminders' };
    },
  },
  // ---------------- productivity & activity
  {
    name: 'productivity_summary', title: 'Productivity summary', scopes: ['productivity:read'],
    description: "Momentum score and level, today's progress vs daily goal, this week by day vs weekly goal, streaks and the 8-week trend.",
    input: { type: 'object', properties: {} },
    run: async ({ state, now }) => ({ result: D.productivitySummary({ completions: state.completions, tasks: state.tasks, preferences: state.preferences, now }) }),
  },
  {
    name: 'productivity_interval', title: 'Productivity for a period', scopes: ['productivity:read'],
    description: 'Completed tasks for today, yesterday, this_week, last_week, this_month, last_month or a custom from/to range — with breakdowns by priority, project, on-time vs late, and source (mobile/web/agent).',
    input: { type: 'object', properties: { interval: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month'] }, from: DATE, to: DATE } },
    run: async ({ state, args, now }) => {
      const iv: D.Interval = args.from && args.to ? { from: args.from, to: args.to } : (args.interval ?? 'this_week');
      const r = D.intervalSummary({ completions: state.completions, tasks: state.tasks, preferences: state.preferences, now }, iv);
      const names = new Map(state.projects.map((p) => [p.id, p.title]));
      return { result: { ...r, byProject: r.byProject.map((x) => ({ ...x, project: x.projectId ? names.get(x.projectId) ?? null : 'Inbox' })) } };
    },
  },
  {
    name: 'productivity_project', title: 'Project productivity', scopes: ['productivity:read', 'projects:read'],
    description: 'Execution tracker for a project (and its sub-projects): progress, completed this week, overdue, blocked, priority distribution, trend, recently completed and upcoming.',
    input: { type: 'object', properties: { project: S }, required: ['project'] },
    run: async ({ state, args, now }) => {
      const p = resolveProject(state, args.project)!;
      return { result: { project: p.title, ...D.projectStats(D.projectSubtree(state.projects, p.id), { tasks: state.tasks, completions: state.completions, preferences: state.preferences, sections: state.sections, now }) } };
    },
  },
  {
    name: 'activity_list', title: 'Recent activity', scopes: ['tasks:read'],
    description: 'Recent changes with where they came from (android/ios/web/mcp/api/cli) and which agent made them. Optionally filter by project or source.',
    input: { type: 'object', properties: { project: S, source: S, limit: N } },
    run: async ({ state, args, repo, auth }) => {
      const p = args.project ? resolveProject(state, args.project) : null;
      const acts = (await repo.recentActivity(auth.uid, 500)).filter((a) => (!p || a.projectId === p.id) && (!args.source || a.source === args.source)).slice(0, Math.min(args.limit ?? 50, 200));
      return { result: acts.map((a) => ({ at: a.at, entity: a.entity, action: a.action, title: a.title, source: a.source, agent: a.agent, details: a.details })) };
    },
  },
  // ---------------- filters & templates & prefs
  {
    name: 'filters_list', title: 'Saved filters', scopes: ['tasks:read'],
    description: 'Saved filters/views and the filter query syntax.',
    input: { type: 'object', properties: {} },
    run: async ({ state }) => ({ result: { filters: live(state.filters).map((f) => ({ id: f.id, name: f.name, query: f.query })), syntax: 'Terms: today, tomorrow, overdue, "no date", "this week", "next 7 days", recurring, p1–p4, #Project, ##Project (exact), /Section, @label, search: words, completed, subtask, assigned, "due before: YYYY-MM-DD", "created by: mcp". Operators: & | ! and parentheses.' } }),
  },
  {
    name: 'filters_save', title: 'Save filter', scopes: ['tasks:write'],
    description: 'Save a reusable filter (appears on mobile and web).',
    input: { type: 'object', properties: { name: S, query: S }, required: ['name', 'query'] },
    run: async ({ state, args, ctx, now }) => {
      try { D.compileFilter(args.query, { projects: state.projects, labels: state.labels, sections: state.sections, now }); } catch (e) { throw new AgentError('invalid', `Bad filter query: ${(e as Error).message}`); }
      const r = D.saveFilter(state, { name: args.name, query: args.query }, ctx);
      return { result: { id: r.result.id, name: r.result.name }, edits: r.edits, summary: `saved filter "${args.name}"` };
    },
  },
  {
    name: 'templates_list', title: 'Project templates', scopes: ['projects:read'],
    description: 'Available project templates (use projects_create with template=<id>).',
    input: { type: 'object', properties: {} },
    run: async () => ({ result: D.TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, sections: t.sections.map((s) => s.name) })) }),
  },
  {
    name: 'preferences_get', title: 'User preferences', scopes: ['tasks:read'],
    description: 'Time zone, week start, daily/weekly goals and other settings that affect dates and productivity.',
    input: { type: 'object', properties: {} },
    run: async ({ state }) => {
      const p = D.resolvePreferences(state.preferences);
      return { result: { timezone: p.timezone ?? 'device default', weekStart: p.weekStart, dailyGoal: p.dailyGoal, weeklyGoal: p.weeklyGoal, daysOff: p.daysOff, nextWeek: p.nextWeek, weekend: p.weekend } };
    },
  },
];

// Bulk helper: resolves ids/query, enforces caps, scopes and confirmation.
async function bulk(
  x: Parameters<ToolDef['run']>[0],
  tool: string,
  op: (state: FullState, ids: string[], ctx: D.Ctx, now: Date, edits: D.Edit[]) => D.OpResult<unknown>,
  opts: { alwaysConfirm?: boolean } = {},
) {
  const { state, args, auth, now, ctx } = x;
  let ids: string[] = Array.isArray(args.ids) ? args.ids.map(String) : [];
  if (!ids.length && args.query) {
    try { ids = D.runFilter(live(state.tasks), args.query, { projects: state.projects, labels: state.labels, sections: state.sections, now }).map((t) => t.id); }
    catch (e) { throw new AgentError('invalid', `Bad filter query: ${(e as Error).message}`); }
  }
  ids = [...new Set(ids)].filter((id) => state.tasks.some((t) => t.id === id && !t.deleted));
  if (!ids.length) return { result: { affected: 0 }, summary: `${tool}: nothing matched` };
  if (ids.length > BULK_MAX) throw new AgentError('invalid', `At most ${BULK_MAX} tasks per call (matched ${ids.length}). Narrow the selection.`);
  const needsBulk = ids.length > BULK_CONFIRM_OVER || opts.alwaysConfirm;
  if (needsBulk && !auth.token.scopes.includes('bulk') && ids.length > 1) throw new AgentError('forbidden', `This token lacks the "bulk" scope needed to change ${ids.length} tasks at once.`);
  if (needsBulk && (ids.length > 1 || opts.alwaysConfirm)) {
    const sha = sha256Ref.fn!;
    const want = [await confirmToken(sha, auth.uid, tool, ids, now.getTime()), await confirmToken(sha, auth.uid, tool, ids, now.getTime(), 1)];
    if (!args.confirm_token || !want.includes(args.confirm_token)) {
      const sample = ids.slice(0, 10).map((id) => state.tasks.find((t) => t.id === id)!.title);
      throw new AgentError('confirm_required', `${tool} would affect ${ids.length} task(s). Review the sample, then call again with confirm_token to proceed.`, { confirm_token: want[0], count: ids.length, sample });
    }
  }
  const edits: D.Edit[] = [];
  const r = op(state, ids, ctx, now, edits);
  return { result: { affected: ids.length, ...(r.result as object) }, edits: [...edits, ...r.edits], summary: `${tool}: ${ids.length} task(s)` };
}

// The hash function is injected by the runtime (Node crypto / WebCrypto).
const sha256Ref: { fn: ((s: string) => Promise<string>) | null } = { fn: null };

export interface CallOptions { sha256: (s: string) => Promise<string>; now?: Date; clientId?: string }

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);

/** Execute one tool call end-to-end: scope check, rate limit, run, commit, audit. */
export interface ToolResult { ok: boolean; result?: unknown; error?: { code: string; message: string; data?: unknown } }

export async function callTool(repo: AgentRepo, auth: AuthContext, name: string, args: Args, opts: CallOptions): Promise<ToolResult> {
  sha256Ref.fn = opts.sha256;
  const now = opts.now ?? new Date();
  const tool = toolByName(name);
  const audit = (ok: boolean, summary: string | null, error: string | null) => repo.audit(auth.uid, {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: now.toISOString(), tokenId: auth.tokenHash.slice(0, 12),
    agent: auth.token.name, tool: name, ok, summary, error, source: auth.source,
  }).catch(() => undefined);
  try {
    if (!tool) throw new AgentError('not_found', `Unknown tool ${name}.`);
    const missing = tool.scopes.filter((s) => !auth.token.scopes.includes(s));
    if (missing.length) throw new AgentError('forbidden', `This token is missing scope(s): ${missing.join(', ')}.`);
    rateLimit(auth, now.getTime());
    if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new AgentError('invalid', 'Arguments must be an object.');
    for (const r of tool.input.required ?? []) if (args[r] === undefined || args[r] === '') throw new AgentError('invalid', `Missing required argument: ${r}.`);
    const state = await repo.loadState(auth.uid);
    const ctx: D.Ctx = { source: auth.source, agent: auth.token.name, timezone: state.preferences?.timezone ?? null, now };
    const out = await tool.run({ state, args, ctx, auth, repo, now });
    if (out.edits?.length) {
      await repo.commit(auth.uid, out.edits, { clientId: opts.clientId ?? `${auth.source}-${auth.tokenHash.slice(0, 8)}`, mutationId: `${auth.source}:${auth.tokenHash.slice(0, 8)}:${now.getTime()}` });
    }
    void repo.touchToken(auth.uid, auth.tokenHash, now.toISOString()).catch(() => undefined);
    await audit(true, out.summary ?? null, null);
    return { ok: true, result: out.result };
  } catch (e: any) {
    const code = e instanceof AgentError ? e.code : e instanceof D.DomainError ? (e.code === 'not_found' ? 'not_found' : 'invalid') : 'internal';
    const message = code === 'internal' ? 'Internal error' : e.message;
    await audit(false, null, `${code}: ${message}`);
    return { ok: false, error: { code, message, data: e instanceof AgentError ? e.data : undefined } };
  }
}

/** Tool list for MCP tools/list and the REST API index. */
export const toolManifest = () => TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.input, scopes: t.scopes }));
