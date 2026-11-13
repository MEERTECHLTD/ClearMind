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
import type { Task, Project, Section, Comment, Completion, Activity, AgentScope, AgentToken, AgentAudit, ChangeSource, Preferences, SavedFilter, TaskPriority, Note } from '../types';
import * as NV from '../notes';
import * as D from '../domain';
import { todayView, upcomingView, inboxTasks, compareTasks, isOverdue, priorityFromLevel, toISODate, orderedProjects, projectTasks, parseQuickAdd } from '../tasks';
import { nowInZone, dayInZone } from '../tasks/time';
import { parseToken, DEFAULT_RATE_LIMIT, effectiveScopes } from './tokens';
import { validateArgs, ArgError } from './validate';
import { AgentError } from './errors';
import { projectNotesFolder, isProjectNote } from '../projects/notes';
import { LIFE_TOOLS, LIFE_COLLS, lifeSearch, LIFE_KIND_COLL, type LifeColl } from './lifeTools';
export { AgentError };

// ------------------------------------------------------------------ repository contract

export interface FullState extends D.DomainState {
  comments: Comment[];
  completions: Completion[];
  filters: SavedFilter[];
  preferences: Preferences | null;
  /** Notes vault (optional so older repos/tests keep working). */
  notes?: Note[];
  /** Other app areas (habits, goals, calendar…), loaded only for tools that need them. */
  life?: Partial<Record<LifeColl, any[]>>;
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
  /** Load extra collections (local store names) for tools that touch other app areas. */
  loadCollections?(uid: string, colls: string[]): Promise<Record<string, any[]>>;
}

export interface AuthContext { uid: string; token: AgentToken; tokenHash: string; source: ChangeSource }


// ------------------------------------------------------------------ auth + rate limit

export async function authenticate(repo: AgentRepo, token: string | undefined | null, sha256: (s: string) => Promise<string>, source: ChangeSource, now = Date.now()): Promise<AuthContext> {
  const parsed = token ? parseToken(token.trim()) : null;
  if (!parsed) throw new AgentError('unauthorized', 'Missing or malformed ClearMind token. Create one in Settings → Integrations.');
  const hash = await sha256(token!.trim());
  const t = await repo.getToken(parsed.uid, hash);
  if (!t) throw new AgentError('unauthorized', 'Unknown token.');
  if (t.revoked) throw new AgentError('unauthorized', 'This token was revoked.');
  if (t.expiresAt && !(Date.parse(t.expiresAt) > now)) throw new AgentError('unauthorized', 'This token has expired.');
  return { uid: parsed.uid, token: { ...t, scopes: effectiveScopes(t) }, tokenHash: hash, source };
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
  /** Callable but not listed (kept for older clients). */
  hidden?: boolean;
  /** Extra collections this tool reads (loaded on demand). */
  needs?: LifeColl[];
  /** Mutating tools write edits; read tools don't. */
  run: (x: { state: FullState; args: Args; ctx: D.Ctx; auth: AuthContext; repo: AgentRepo; now: Date; confirm: Confirm }) => Promise<{ result: unknown; edits?: D.Edit[]; summary?: string }>;
}

type Confirm = (tool: string, ids: string[], message: string, preview: unknown) => Promise<void>;

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


// ------------------------------------------------------------------ projects: plan + notes

const FILTER_SYNTAX = 'Terms: today, tomorrow, overdue, "no date", "this week", "next 7 days", recurring, p1–p4, #Project, ##Project (exact), /Section, @label, search: words, completed, subtask, assigned, "due before: YYYY-MM-DD", "created by: mcp". Operators: & | ! and parentheses.';
const ARR = (props: Record<string, any>, description: string) => ({ type: 'array', description, items: { type: 'object', properties: props } });
const PLAN_FIELDS = {
  status: { type: 'string', enum: ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] },
  priority: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
  category: { type: 'string', description: 'Energy, Green Energy, Finance, Health, IT, Education, Construction, Manufacturing, Retail, Marketing, Research, Government, Non-Profit, Startup, Personal, Other' },
  health: { type: 'string', enum: ['On Track', 'At Risk', 'Off Track'] },
  progress: { type: 'number', description: '0–100' },
  start_date: DATE, deadline: DATE, next_check_in: DATE,
  total_budget: N, budget_used: N,
  project_manager: S, team: { type: 'array', items: S }, stakeholders: { type: 'array', items: S }, tags: { type: 'array', items: S },
  plan_notes: { type: 'string', description: 'Free-text notes field on the project (separate from vault project notes)' },
  objectives: { type: 'array', items: S }, scope: S, out_of_scope: { type: 'array', items: S }, assumptions: { type: 'array', items: S }, constraints: { type: 'array', items: S },
  phases: ARR({ name: S, description: S, status: { type: 'string', enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'] }, startDate: DATE, endDate: DATE, progress: N, deliverables: { type: 'array', items: S } }, 'Implementation phases (replaces the list)'),
  risks: ARR({ title: S, description: S, severity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] }, likelihood: { type: 'string', enum: ['Low', 'Medium', 'High'] }, mitigation: S, status: { type: 'string', enum: ['Open', 'Mitigated', 'Closed'] } }, 'Risks (replaces the list)'),
  resources: ARR({ name: S, type: { type: 'string', enum: ['Budget', 'Personnel', 'Equipment', 'Software', 'Other'] }, allocated: N, used: N, unit: S }, 'Resources & budget lines (replaces the list)'),
  metrics: ARR({ name: S, target: N, current: N, unit: S, trend: { type: 'string', enum: ['Up', 'Down', 'Stable'] } }, 'KPIs (replaces the list)'),
  check_ins: ARR({ date: DATE, attendees: { type: 'array', items: S }, notes: S, blockers: { type: 'array', items: S }, nextSteps: { type: 'array', items: S }, mood: { type: 'string', enum: ['Positive', 'Neutral', 'Concerned'] } }, 'Team check-ins (replaces the list)'),
  milestones: ARR({ title: S, dueDate: DATE, completed: B }, 'Project milestones (replaces the list)'),
  add_phase: { type: 'object', description: 'Append one phase', properties: { name: S, description: S, status: S, startDate: DATE, endDate: DATE } },
  add_risk: { type: 'object', description: 'Append one risk', properties: { title: S, severity: S, likelihood: S, mitigation: S } },
  add_checkin: { type: 'object', description: 'Append one team check-in', properties: { date: DATE, notes: S, attendees: { type: 'array', items: S }, blockers: { type: 'array', items: S }, nextSteps: { type: 'array', items: S }, mood: S } },
  add_metric: { type: 'object', description: 'Append one KPI', properties: { name: S, target: N, current: N, unit: S } },
} as const;

/** Map plan arguments onto the Project record's fields (lists get ids and defaults). */
function planPatch(p: Project, a: Args, ctx: D.Ctx): Record<string, any> {
  const id = () => D.newId(ctx);
  const out: Record<string, any> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) out[k] = v; };
  set('status', a.status); set('priority', a.priority); set('category', a.category); set('healthStatus', a.health);
  if (a.progress !== undefined) out.progress = Math.max(0, Math.min(100, Math.round(Number(a.progress))));
  set('startDate', a.start_date); set('deadline', a.deadline); set('nextCheckInDate', a.next_check_in);
  set('totalBudget', a.total_budget); set('budgetUsed', a.budget_used); set('projectManager', a.project_manager);
  set('team', a.team); set('stakeholders', a.stakeholders); set('tags', a.tags); set('notes', a.plan_notes);
  const phase = (x: any, i: number) => ({ id: x.id ?? id(), name: String(x.name ?? `Phase ${i + 1}`), description: x.description, status: x.status ?? 'Not Started', startDate: x.startDate, endDate: x.endDate, progress: Number(x.progress ?? 0), deliverables: x.deliverables ?? [], order: x.order ?? i });
  const risk = (x: any) => ({ id: x.id ?? id(), title: String(x.title ?? 'Risk'), description: x.description, severity: x.severity ?? 'Medium', likelihood: x.likelihood ?? 'Medium', mitigation: x.mitigation, status: x.status ?? 'Open' });
  const res = (x: any) => ({ id: x.id ?? id(), name: String(x.name ?? 'Resource'), type: x.type ?? 'Other', allocated: Number(x.allocated ?? 0), used: Number(x.used ?? 0), unit: x.unit });
  const metric = (x: any) => ({ id: x.id ?? id(), name: String(x.name ?? 'Metric'), target: Number(x.target ?? 0), current: Number(x.current ?? 0), unit: x.unit ?? '', trend: x.trend });
  const checkin = (x: any) => ({ id: x.id ?? id(), date: x.date ?? toISODate(ctx.now ?? new Date()), attendees: x.attendees ?? [], notes: String(x.notes ?? ''), blockers: x.blockers, nextSteps: x.nextSteps, mood: x.mood });
  const plan = { ...(p.implementationPlan ?? { phases: [] }) } as NonNullable<Project['implementationPlan']>;
  let planChanged = false;
  if (a.phases) { plan.phases = a.phases.map(phase); planChanged = true; }
  if (a.add_phase) { plan.phases = [...(plan.phases ?? []), phase(a.add_phase, plan.phases?.length ?? 0)]; planChanged = true; }
  for (const [arg, key] of [['objectives', 'objectives'], ['scope', 'scope'], ['out_of_scope', 'outOfScope'], ['assumptions', 'assumptions'], ['constraints', 'constraints']] as const) if (a[arg] !== undefined) { (plan as any)[key] = a[arg]; planChanged = true; }
  if (planChanged) out.implementationPlan = plan;
  if (a.risks) out.risks = a.risks.map(risk);
  if (a.add_risk) out.risks = [...(out.risks ?? p.risks ?? []), risk(a.add_risk)];
  if (a.resources) out.resources = a.resources.map(res);
  if (a.metrics) out.performanceMetrics = a.metrics.map(metric);
  if (a.add_metric) out.performanceMetrics = [...(out.performanceMetrics ?? p.performanceMetrics ?? []), metric(a.add_metric)];
  if (a.check_ins) out.teamCheckIns = a.check_ins.map(checkin);
  if (a.add_checkin) out.teamCheckIns = [...(out.teamCheckIns ?? p.teamCheckIns ?? []), checkin(a.add_checkin)];
  if (a.milestones) out.projectMilestones = a.milestones.map((x: any) => ({ id: x.id ?? id(), title: String(x.title ?? ''), dueDate: x.dueDate, completed: !!x.completed }));
  if (Object.keys(out).length) out.updatedAt = (ctx.now ?? new Date()).toISOString();
  return out;
}

function projectPlan(p: Project) {
  const ip = p.implementationPlan;
  return {
    status: p.status ?? null, priority: p.priority ?? null, category: p.category ?? null, health: p.healthStatus ?? null, progress: p.progress ?? null,
    start_date: p.startDate ?? null, deadline: p.deadline ?? null, next_check_in: p.nextCheckInDate ?? null,
    budget: p.totalBudget != null ? { total: p.totalBudget, used: p.budgetUsed ?? 0 } : null,
    project_manager: p.projectManager ?? null, team: p.team ?? [], stakeholders: p.stakeholders ?? [], tags: p.tags ?? [], plan_notes: p.notes || null,
    objectives: ip?.objectives ?? [], scope: ip?.scope ?? null, out_of_scope: ip?.outOfScope ?? [], assumptions: ip?.assumptions ?? [], constraints: ip?.constraints ?? [],
    phases: ip?.phases ?? [], risks: p.risks ?? [], resources: p.resources ?? [], metrics: p.performanceMetrics ?? [], check_ins: p.teamCheckIns ?? [], milestones: p.projectMilestones ?? [], alignments: p.alignments ?? [],
  };
}

export const projectFolder = projectNotesFolder;
const projectNotes = (index: NV.VaultIndex, p: Project): Note[] => index.notes.filter((n) => isProjectNote(n, p));

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
    description: 'Update a task: title, description, due, priority, project, section, labels, recurrence, reminders ([] clears), duration — and completed=true to complete it (recurring tasks roll forward; next_due is returned) or completed=false to reopen. Only the fields you pass change.',
    input: { type: 'object', properties: { id: S, ...TASK_FIELDS, completed: { type: 'boolean', description: 'true = complete (idempotent), false = reopen' } }, required: ['id'] },
    run: async ({ state, args, ctx, now }) => {
      getTask(state, args.id);
      const edits: D.Edit[] = [];
      const { completed, ...rest } = args;
      const f = taskFields(state, rest, ctx, edits, now);
      let working: D.DomainState = D.applyEdits(state, edits);
      let task: Task = getTask(working as FullState, args.id);
      if (Object.keys(f).length) { const r = D.updateTask(working, args.id, f as D.TaskPatch, ctx); edits.push(...r.edits); working = D.applyEdits(working, r.edits); task = r.result; }
      let nextDue: string | null | undefined;
      if (completed === true) { const r = D.completeTask(working, args.id, ctx); edits.push(...r.edits); working = D.applyEdits(working, r.edits); task = r.result.task; nextDue = r.result.nextDueDate; }
      if (completed === false) { const r = D.reopenTask(working, args.id, ctx); edits.push(...r.edits); working = D.applyEdits(working, r.edits); task = r.result; }
      const out: any = describe(working as FullState, now)(task);
      if (nextDue !== undefined) out.next_due = nextDue;
      return { result: out, edits, summary: `${completed === true ? 'completed' : completed === false ? 'reopened' : 'updated'} "${task.title}"` };
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
    name: 'tasks_bulk_update', title: 'Bulk update, move or complete tasks', scopes: ['tasks:write'],
    description: 'Apply one change to many tasks selected by ids or a filter query (e.g. "##Project A", "overdue & p1"): move (project/section; sub-tasks follow), priority, due, labels, or complete=true. More than 25 tasks needs the bulk scope and a confirm_token round-trip (the first call previews).',
    input: { type: 'object', properties: { ids: { type: 'array', items: S }, query: S, project: S, section: S, priority: PRIORITY, due_date: DATE, due_string: S, labels: { type: 'array', items: S }, complete: B, confirm_token: S } },
    run: async (x) => bulk(x, 'tasks_bulk_update', (state, ids, ctx, now, edits) => {
      const { complete, project, section, ...rest } = x.args;
      let s: D.DomainState = state;
      if (project !== undefined || section !== undefined) {
        const proj = resolveProject(state, project);
        const sec = resolveSection(state, proj?.id ?? undefined, section);
        const r = D.moveTasks(s, ids, { projectId: proj === undefined ? undefined : proj?.id ?? null, sectionId: sec === undefined ? undefined : sec?.id ?? null }, ctx);
        edits.push(...r.edits); s = D.applyEdits(s, r.edits);
      }
      const f = taskFields(state, rest, ctx, edits, now);
      s = D.applyEdits(s, edits.filter((e) => e.coll === 'labels'));
      if (Object.keys(f).length) { const r = D.bulkUpdate(s, ids, f as D.TaskPatch, ctx); edits.push(...r.edits); s = D.applyEdits(s, r.edits); }
      if (complete) for (const id of ids) { const r = D.completeTask(s, id, ctx); edits.push(...r.edits); s = D.applyEdits(s, r.edits); }
      return { edits: [], result: { completed: complete ? ids.length : 0 } };
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
    name: 'tasks_view', title: 'Task views: today, upcoming, overdue, inbox', scopes: ['tasks:read'],
    description: "Ready-made task views in the user's time zone: today (overdue + due today, with completed-today vs daily goal), upcoming (by day for the next `days`, default 7), overdue (oldest first) or inbox (unorganised captures, newest first).",
    input: { type: 'object', properties: { view: { type: 'string', enum: ['today', 'upcoming', 'overdue', 'inbox'] }, days: N, limit: N }, required: ['view'] },
    run: async ({ state, args, now }) => {
      const local = nowInZone(state.preferences?.timezone ?? null, now);
      const d = describe(state, local);
      if (args.view === 'upcoming') {
        const groups = upcomingView(live(state.tasks), local, Math.min(args.days ?? 7, 60)).filter((g) => g.tasks.length);
        return { result: { view: 'upcoming', days: groups.map((g) => ({ date: g.date, tasks: g.tasks.map(d) })) } };
      }
      if (args.view === 'overdue') {
        const ts = live(state.tasks).filter((t) => isOverdue(t, local)).sort(compareTasks);
        return { result: { view: 'overdue', count: ts.length, tasks: ts.map(d) } };
      }
      if (args.view === 'inbox') {
        const items = inboxTasks(live(state.tasks), lookups(state).projects).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, args.limit ?? 100);
        return { result: { view: 'inbox', count: items.length, items: items.map(d) } };
      }
      const v = todayView(live(state.tasks), local);
      const day = D.daySummary({ completions: state.completions, tasks: state.tasks, preferences: state.preferences, now });
      return { result: { view: 'today', date: toISODate(local), overdue: v.overdue.map(d), today: v.today.map(d), completed_today: day.completed, daily_goal: day.goal } };
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
    description: 'A project workspace: sections with their open tasks, tracker statistics (progress, overdue, blocked, due this week, trend), the plan (status, health, category, phases, risks, budget/resources, KPIs, team check-ins, objectives), its project notes and recent activity. Use this to summarise a project or find blockers.',
    input: { type: 'object', properties: { project: { type: 'string', description: 'Name or id' }, include_completed: B } },
    run: async ({ state, args, repo, auth, now }) => {
      const p = resolveProject(state, args.project);
      if (!p) throw new AgentError('invalid', 'Pass a project name or id.');
      const d = describe(state, now);
      const secs = live(state.sections).filter((s) => s.projectId === p.id).sort((a, b) => a.order - b.order);
      const open = projectTasks(live(state.tasks), p.id);
      const stats = D.projectStats([p.id], { tasks: state.tasks, completions: state.completions, preferences: state.preferences, sections: state.sections, now });
      const acts = (await repo.recentActivity(auth.uid, 300)).filter((a) => a.projectId === p.id).slice(0, 20);
      const notesIndex = NV.buildIndex(state.notes ?? []);
      const pn = projectNotes(notesIndex, p).map((n) => NV.describeNote(notesIndex, n));
      return { result: {
        id: p.id, name: p.title, description: p.description || undefined, view: p.view ?? 'list', stats,
        plan: projectPlan(p), notes: { folder: projectFolder(p), count: pn.length, items: pn },
        no_section: open.filter((t) => !t.sectionId).map(d),
        sections: secs.map((s) => ({ id: s.id, name: s.name, tasks: open.filter((t) => t.sectionId === s.id).map(d) })),
        completed: args.include_completed ? live(state.tasks).filter((t) => t.projectId === p.id && t.completed).map(d) : undefined,
        recent_activity: acts.map((a) => ({ at: a.at, action: a.action, title: a.title, source: a.source, agent: a.agent, details: a.details })),
      } };
    },
  },
  {
    name: 'projects_create', title: 'Create project', scopes: ['projects:write'],
    description: 'Create a project (optionally nested, with sections, or from a template id — see workspace_overview) and, optionally, its plan fields (status, category, priority, deadline, phases, risks…).',
    input: { type: 'object', properties: { name: S, parent: S, color: S, view: { type: 'string', enum: ['list', 'board'] }, sections: { type: 'array', items: S }, template: S, description: S, ...PLAN_FIELDS, idempotency_key: S }, required: ['name'] },
    run: async ({ state, args, ctx }) => {
      const parent = args.parent ? resolveProject(state, args.parent) : null;
      let r: D.OpResult<Project>;
      if (args.template) r = D.applyTemplate(state, args.template, { title: args.name, parentId: parent?.id ?? null }, ctx);
      else r = D.createProject(state, { title: args.name, parentId: parent?.id ?? null, color: args.color, view: args.view, idempotencyKey: args.idempotency_key ?? null }, ctx);
      const edits = [...r.edits];
      let s = D.applyEdits(state, edits);
      for (const name of args.sections ?? []) { const sr = D.createSection(s, { projectId: r.result.id, name }, ctx); edits.push(...sr.edits); s = D.applyEdits(s, sr.edits); }
      const plan = planPatch(r.result, args, ctx);
      if (args.description !== undefined) plan.description = args.description;
      if (Object.keys(plan).length) edits.push(...D.updateProject(s, r.result.id, plan, ctx).edits);
      return { result: { id: r.result.id, name: r.result.title }, edits, summary: `created project "${r.result.title}"` };
    },
  },
  {
    name: 'projects_update', title: 'Update project', scopes: ['projects:write'],
    description: 'Edit a project: rename, recolour, re-parent, favourite, archive, view, description — and its plan: status, priority, category, health, progress, dates, budget, team, stakeholders, manager, objectives/scope, and the phases, risks, resources, metrics, check-ins and alignments lists (a list you pass replaces the old one; items without id get one). add_phase / add_risk / add_checkin / add_metric append a single item.',
    input: { type: 'object', properties: { project: S, name: S, color: S, parent: S, favorite: B, archived: B, view: { type: 'string', enum: ['list', 'board', 'calendar'] }, description: S, ...PLAN_FIELDS }, required: ['project'] },
    run: async ({ state, args, ctx }) => {
      const p = resolveProject(state, args.project)!;
      const patch: any = planPatch(p, args, ctx);
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
  // ---------------- productivity & activity
  {
    name: 'productivity', title: 'Productivity', scopes: ['productivity:read'],
    description: "Productivity stats. No arguments: momentum score and level, today vs daily goal, this week by day vs weekly goal, streaks, 8-week trend. interval (today, yesterday, this_week, last_week, this_month, last_month) or from/to: completed tasks with breakdowns by priority, project, on-time vs late and source. project: execution tracker for that project and its sub-projects (progress, overdue, blocked, trend, recently completed, upcoming).",
    input: { type: 'object', properties: { interval: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month'] }, from: DATE, to: DATE, project: S } },
    run: async ({ state, args, auth, now }) => {
      if (args.project) {
        if (!auth.token.scopes.includes('projects:read')) throw new AgentError('forbidden', 'This token is missing scope: projects:read.');
        const p = resolveProject(state, args.project)!;
        return { result: { project: p.title, ...D.projectStats(D.projectSubtree(state.projects, p.id), { tasks: state.tasks, completions: state.completions, preferences: state.preferences, sections: state.sections, now }) } };
      }
      if (args.interval || (args.from && args.to)) {
        const iv: D.Interval = args.from && args.to ? { from: args.from, to: args.to } : args.interval;
        const r = D.intervalSummary({ completions: state.completions, tasks: state.tasks, preferences: state.preferences, now }, iv);
        const names = new Map(state.projects.map((p) => [p.id, p.title]));
        return { result: { ...r, byProject: r.byProject.map((x) => ({ ...x, project: x.projectId ? names.get(x.projectId) ?? null : 'Inbox' })) } };
      }
      return { result: D.productivitySummary({ completions: state.completions, tasks: state.tasks, preferences: state.preferences, now }) };
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
    name: 'workspace_overview', title: 'Workspace overview (start here)', scopes: ['tasks:read'],
    description: "One call to orient yourself: the user's settings (time zone, week start, goals), labels with open counts, saved filters plus the filter query syntax, project templates, and how many items exist in every area (tasks, projects, notes, habits, goals, milestones, events, time blocks, journal, applications, learning, mind maps). Then use the area's own tools.",
    input: { type: 'object', properties: {} },
    needs: LIFE_COLLS,
    run: async ({ state, auth }) => {
      const p = D.resolvePreferences(state.preferences);
      const n = (xs?: any[]) => (xs ?? []).filter((x) => !x.deleted).length;
      const canLife = auth.token.scopes.includes('life:read');
      const L = state.life ?? {};
      return { result: {
        preferences: { timezone: p.timezone ?? 'device default', weekStart: p.weekStart, dailyGoal: p.dailyGoal, weeklyGoal: p.weeklyGoal, daysOff: p.daysOff, nextWeek: p.nextWeek, weekend: p.weekend },
        labels: live(state.labels).map((l) => ({ id: l.id, name: l.name, color: l.color, open: live(state.tasks).filter((t) => !t.completed && (t.labelIds ?? []).includes(l.id)).length })),
        filters: live(state.filters).map((f) => ({ id: f.id, name: f.name, query: f.query })),
        filter_syntax: FILTER_SYNTAX,
        project_templates: D.TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, sections: t.sections.map((x) => x.name) })),
        counts: {
          open_tasks: live(state.tasks).filter((t) => !t.completed).length, projects: n(state.projects), notes: n(state.notes),
          ...(canLife ? { habits: n(L.habits), goals: n(L.goals), milestones: n(L.milestones), calendar_events: n(L.events), time_blocks: n(L.dailymapper), journal_logs: n(L.logs), rants: n(L.rants), applications: n(L.applications), learning: n(L.learningresources), mindmaps: n(L.mindmaps), ai_chats: n(L.iris_conversations) } : {}),
        },
      } };
    },
  },
  // ---------------------------------------------------------------- notes (vault)
  {
    name: 'notes_list', title: 'List notes', scopes: ['notes:read'],
    description: 'List or search notes in the vault. Filters: folder (includes sub-folders unless recursive=false), project (that project\'s notes), tag, kind, bookmarked. query = ranked full-text search returning matching lines, with Obsidian-style operators: words (AND), "exact phrase", -exclude, OR, tag:#x, path:folder, file:name, line:, content:, task:, task-todo:, task-done:, [property:value]. Also returns the folder tree.',
    input: { type: 'object', properties: { folder: S, project: { type: 'string', description: 'Only this project\'s notes (name or id)' }, recursive: B, tag: S, kind: { type: 'string', enum: ['note', 'daily', 'template', 'canvas'] }, bookmarked: B, query: S, include_content: B, limit: { type: 'number', description: 'Default 50, max 200' } } },
    run: async ({ state, args }) => {
      const index = NV.buildIndex(state.notes ?? []);
      let list = [...index.notes];
      if (args.project) { const p = resolveProject(state, args.project); if (!p) throw new AgentError('invalid', 'Pass a project name or id.'); const ids = new Set(projectNotes(index, p).map((n) => n.id)); list = list.filter((n) => ids.has(n.id)); }
      if (args.folder !== undefined && args.folder !== null) {
        const f = NV.normPath(String(args.folder));
        list = list.filter((n) => { const nf = NV.normPath(n.folder ?? ''); return args.recursive === false ? nf === f : nf === f || nf.startsWith(f + '/'); });
      }
      if (args.tag) { const t = String(args.tag).replace(/^#/, '').toLowerCase(); list = list.filter((n) => (index.tagsOf.get(n.id) ?? []).some((x) => x === t || x.startsWith(t + '/'))); }
      if (args.kind) list = list.filter((n) => (n.kind ?? 'note') === args.kind);
      if (args.bookmarked !== undefined) list = list.filter((n) => !!n.bookmarked === !!args.bookmarked);
      const limit = Math.min(200, Math.max(1, Number(args.limit) || 50));
      if (args.query) {
        // Ranked full-text search with matching lines (search operators apply).
        const keep = new Set(list.map((n) => n.id));
        const hits = NV.searchVault(index, String(args.query), 1000).filter((h) => keep.has(h.note.id));
        return { result: { total: hits.length, notes: hits.slice(0, limit).map((h) => ({ ...NV.describeNote(index, h.note, { content: !!args.include_content }), matches: h.matches })), folders: NV.folderSummary(index) } };
      }
      list.sort((a, b) => (b.lastEdited ?? '').localeCompare(a.lastEdited ?? ''));
      return { result: { total: list.length, notes: list.slice(0, limit).map((n) => NV.describeNote(index, n, { content: !!args.include_content })), folders: NV.folderSummary(index) } };
    },
  },
  {
    name: 'notes_get', title: 'Get note', scopes: ['notes:read'],
    description: 'Read one note by id, vault path ("Folder/Title"), title or alias: full markdown content, frontmatter properties, headings, outgoing [[links]] (resolved or not) and backlinks with context.',
    input: { type: 'object', properties: { note: { type: 'string', description: 'Note id, path, title or alias' } }, required: ['note'] },
    run: async ({ state, args }) => {
      const index = NV.buildIndex(state.notes ?? []);
      return { result: NV.noteDetail(index, noteRef(() => NV.requireNote(index, args.note))) };
    },
  },
  {
    name: 'notes_create', title: 'Create note', scopes: ['notes:write'],
    description: 'Create a markdown note in the vault. Use [[Other note]] links and #tags in content; folders are created implicitly ("Projects/RanaWallet"). Titles must be unique per folder. Pass idempotency_key to make retries safe; if_exists="skip" returns the existing note instead of failing.',
    input: { type: 'object', properties: { title: S, folder: S, project: { type: 'string', description: 'Attach to a project (name or id): files the note in that project\'s notes folder' }, content: { type: 'string', description: 'Markdown body (may include YAML frontmatter)' }, properties: { type: 'object', description: 'Frontmatter properties to set, e.g. {"status":"draft","tags":["idea"]}' }, kind: { type: 'string', enum: ['note', 'template', 'canvas'] }, bookmarked: B, if_exists: { type: 'string', enum: ['error', 'skip'] }, idempotency_key: S }, required: ['title'] },
    run: async ({ state, args, ctx }) => {
      const notes = state.notes ?? [];
      if (args.project) {
        const p = resolveProject(state, args.project);
        if (!p) throw new AgentError('invalid', 'Pass a project name or id.');
        if (!args.folder) args.folder = projectFolder(p);
        args.properties = { ...(args.properties ?? {}), project: p.title };
      }
      if (args.if_exists === 'skip') {
        const index = NV.buildIndex(notes);
        const folder = args.folder ? String(args.folder).replace(/^\/+|\/+$/g, '') : '';
        const hit = index.notes.find((n) => NV.normPath(NV.notePath(n)) === NV.normPath(folder ? `${folder}/${args.title}` : String(args.title)));
        if (hit) return { result: { ...NV.describeNote(index, hit), existed: true }, summary: `note "${hit.title}" already existed` };
      }
      const r = noteRef(() => NV.createNoteOp(notes, { title: args.title, folder: args.folder, content: args.content, properties: args.properties, kind: args.kind, bookmarked: args.bookmarked, idempotencyKey: args.idempotency_key }, noteCtx(ctx)));
      const index = NV.buildIndex([...notes.filter((n) => n.id !== r.note.id), r.note]);
      return { result: { ...NV.describeNote(index, r.note), existed: r.existed }, edits: r.edits as D.Edit[], summary: r.existed ? `note "${r.note.title}" (idempotent replay)` : `created note "${NV.notePath(r.note)}"` };
    },
  },
  {
    name: 'notes_update', title: 'Update note', scopes: ['notes:write'],
    description: 'Edit a note: replace content, append or prepend text, merge frontmatter properties (null removes a key), bookmark, or rename/move it (title/folder) — renames rewrite [[links]] in every other note automatically.',
    input: { type: 'object', properties: { note: { type: 'string', description: 'Note id, path, title or alias' }, content: S, append: S, prepend: S, title: S, folder: { type: 'string', description: 'Destination folder ("" = vault root)' }, properties: { type: 'object' }, bookmarked: B }, required: ['note'] },
    run: async ({ state, args, ctx }) => {
      const r = noteRef(() => NV.updateNoteOp(state.notes ?? [], args.note, { content: args.content, append: args.append, prepend: args.prepend, title: args.title, folder: args.folder, properties: args.properties, bookmarked: args.bookmarked }, noteCtx(ctx)));
      const index = NV.buildIndex((state.notes ?? []).map((n) => (n.id === r.note.id ? r.note : n)));
      return { result: { ...NV.describeNote(index, r.note), links_updated: r.linksUpdated }, edits: r.edits as D.Edit[], summary: `updated note "${NV.notePath(r.note)}"${r.linksUpdated ? ` (+${r.linksUpdated} link rewrites)` : ''}` };
    },
  },
  {
    name: 'notes_daily', title: 'Daily note', scopes: ['notes:write'],
    description: "Get (or create) the daily note for a date (default today, user time zone) in the Daily folder, optionally appending text — e.g. a log line or a meeting summary.",
    input: { type: 'object', properties: { date: DATE, append: S }, },
    run: async ({ state, args, ctx, now }) => {
      const tz = state.preferences?.timezone ?? null;
      const day = args.date ? String(args.date) : dayInZone(now, tz);
      const [y, m, d] = day.split('-').map(Number);
      if (!y || !m || !d) throw new AgentError('invalid', 'date must be YYYY-MM-DD');
      const r = noteRef(() => NV.dailyNoteOp(state.notes ?? [], new Date(y, m - 1, d, 12), { append: args.append ?? null }, noteCtx(ctx)));
      const index = NV.buildIndex([...(state.notes ?? []).filter((n) => n.id !== r.note.id), r.note]);
      return { result: { ...NV.noteDetail(index, r.note), created: r.created }, edits: r.edits as D.Edit[], summary: `${r.created ? 'created' : 'updated'} daily note ${day}` };
    },
  },
  {
    name: 'notes_import', title: 'Import notes', scopes: ['notes:write'],
    description: 'Create many notes at once (max 200 per call) — e.g. importing an Obsidian vault folder. Items: {title, folder?, content?, properties?}. Existing notes (same folder + title): if_exists="skip" (default) leaves them, "update" overwrites their content (two-step: returns a confirm_token first), "error" fails.',
    input: { type: 'object', properties: { notes: { type: 'array', items: { type: 'object', properties: { title: S, folder: S, content: S, properties: { type: 'object' } }, required: ['title'] } }, if_exists: { type: 'string', enum: ['skip', 'update', 'error'] }, confirm_token: S }, required: ['notes'] },
    run: async ({ state, args, ctx, auth, now }) => {
      const items = Array.isArray(args.notes) ? args.notes : [];
      if (!items.length) throw new AgentError('invalid', 'notes must be a non-empty array');
      if (items.length > BULK_MAX) throw new AgentError('invalid', `At most ${BULK_MAX} notes per call — split the import into batches.`);
      const mode = (args.if_exists ?? 'skip') as NV.IfExists;
      const plan = noteRef(() => NV.importNotesOp(state.notes ?? [], items, mode, noteCtx(ctx)));
      if (plan.updated.length) {
        const sha = sha256Ref.fn!;
        const ids = plan.updated.map((n) => n.id);
        const want = [await confirmToken(sha, auth.uid, 'notes_import', ids, now.getTime()), await confirmToken(sha, auth.uid, 'notes_import', ids, now.getTime(), 1)];
        if (!args.confirm_token || !want.includes(args.confirm_token)) {
          throw new AgentError('confirm_required', `This import overwrites ${plan.updated.length} existing note(s). Call again with confirm_token to proceed.`, { confirm_token: want[0], overwrite: plan.updated.map((n) => NV.notePath(n)).slice(0, 20), create: plan.created.length, skip: plan.skipped.length });
        }
      }
      return {
        result: { created: plan.created.map((n) => ({ id: n.id, path: NV.notePath(n) })), updated: plan.updated.map((n) => ({ id: n.id, path: NV.notePath(n) })), skipped: plan.skipped },
        edits: plan.edits as D.Edit[],
        summary: `imported notes: ${plan.created.length} created, ${plan.updated.length} updated, ${plan.skipped.length} skipped`,
      };
    },
  },
  {
    name: 'notes_delete', title: 'Delete notes', scopes: ['notes:delete'],
    description: 'Delete notes by id/path/title (moved to trash on every device). Deleting more than one note is two-step: the first call returns a preview and confirm_token.',
    input: { type: 'object', properties: { notes: { type: 'array', items: S, description: 'Note ids, paths or titles' }, confirm_token: S }, required: ['notes'] },
    run: async ({ state, args, ctx, auth, now }) => {
      const refs = (Array.isArray(args.notes) ? args.notes : [args.notes]).map(String);
      if (!refs.length) throw new AgentError('invalid', 'notes must list at least one note');
      if (refs.length > BULK_MAX) throw new AgentError('invalid', `At most ${BULK_MAX} notes per call.`);
      const r = noteRef(() => NV.deleteNotesOp(state.notes ?? [], refs, noteCtx(ctx)));
      if (r.deleted.length > 1) {
        const sha = sha256Ref.fn!;
        const ids = r.deleted.map((n) => n.id);
        const want = [await confirmToken(sha, auth.uid, 'notes_delete', ids, now.getTime()), await confirmToken(sha, auth.uid, 'notes_delete', ids, now.getTime(), 1)];
        if (!args.confirm_token || !want.includes(args.confirm_token)) {
          throw new AgentError('confirm_required', `This deletes ${ids.length} notes. Call again with confirm_token to proceed.`, { confirm_token: want[0], notes: r.deleted.map((n) => NV.notePath(n)).slice(0, 20) });
        }
      }
      return { result: { deleted: r.deleted.map((n) => ({ id: n.id, path: NV.notePath(n) })) }, edits: r.edits as D.Edit[], summary: `deleted ${r.deleted.length} note(s)` };
    },
  },

  // ---------------------------------------------------------------- ChatGPT connector contract
  // ChatGPT's connectors (deep research / company knowledge) require exactly
  // `search` and `fetch` with these shapes; Claude and other clients can use them too.
  {
    name: 'search', title: 'Search ClearMind', scopes: [], needs: LIFE_COLLS,
    description: 'Search everything in ClearMind at once: tasks (incl. completed), projects, notes, habits, goals, milestones, calendar events, time blocks, journal, applications, learning vault and mind maps. Returns ids to pass to `fetch` for the full item.',
    input: { type: 'object', properties: { query: { type: 'string', description: 'What to look for' } }, required: ['query'] },
    run: async ({ state, args, auth, now }) => {
      const canTasks = auth.token.scopes.includes('tasks:read');
      const canNotes = auth.token.scopes.includes('notes:read');
      if (!canTasks && !canNotes && !auth.token.scopes.includes('life:read')) throw new AgentError('forbidden', 'This token can read nothing searchable.');
      const q = String(args.query ?? '').trim();
      const results: { id: string; title: string; url: string; text?: string }[] = [];
      const origin = 'https://clearmind.meertech.tech';
      if (canNotes) {
        const index = NV.buildIndex(state.notes ?? []);
        for (const h of NV.searchVault(index, q, 15)) results.push({ id: `note:${h.note.id}`, title: NV.notePath(h.note), url: `${origin}/#notes/${h.note.id}`, text: h.matches[0]?.text ?? NV.excerpt(h.note, 160) });
      }
      if (canTasks) {
        const r = D.globalSearch(state, q, { includeCompleted: true, limit: 15 });
        const d = describe(state, now);
        for (const t of r.tasks) { const x: any = d(t); results.push({ id: `task:${t.id}`, title: t.title, url: `${origin}/#today?task=${t.id}`, text: [x.due?.human, x.project, t.completed ? 'completed' : null].filter(Boolean).join(' · ') }); }
        for (const p of r.projects) results.push({ id: `project:${p.id}`, title: `Project: ${p.title}`, url: `${origin}/#project/${p.id}` });
      }
      if (auth.token.scopes.includes('life:read') && state.life) {
        for (const h of lifeSearch(state.life, q, 20)) results.push({ id: h.id, title: `${h.kind[0].toUpperCase()}${h.kind.slice(1)}: ${h.title}`, url: origin, text: h.text || undefined });
      }
      return { result: { results } };
    },
  },
  {
    name: 'fetch', title: 'Fetch ClearMind item', scopes: [], needs: LIFE_COLLS,
    description: 'Get the full content of a search result by id (note:…, task:…, project:…, habit:…, goal:…, event:…, application:…, learning:…, log:…, rant:…, mindmap:…, block:…).',
    input: { type: 'object', properties: { id: { type: 'string', description: 'An id returned by search' } }, required: ['id'] },
    run: async ({ state, args, auth, now }) => {
      const [kind, ...rest] = String(args.id ?? '').split(':');
      const id = rest.join(':');
      const origin = 'https://clearmind.meertech.tech';
      const need = (scope: AgentScope) => { if (!auth.token.scopes.includes(scope)) throw new AgentError('forbidden', `This token is missing scope: ${scope}.`); };
      if (kind === 'note') {
        need('notes:read');
        const index = NV.buildIndex(state.notes ?? []);
        const n = noteRef(() => NV.requireNote(index, id));
        const d = NV.noteDetail(index, n);
        return { result: { id: args.id, title: d.path, text: n.content, url: `${origin}/#notes/${n.id}`, metadata: { tags: d.tags, updated_at: d.updated_at, backlinks: d.backlinks.map((b) => b.path) } } };
      }
      if (kind === 'task') {
        need('tasks:read');
        const t = getTask(state, id);
        const x: any = describe(state, now)(t);
        const comments = (state.comments ?? []).filter((c) => c.taskId === t.id && !c.deleted).map((c) => `- ${c.text}`);
        const text = [t.title, t.description ? `\n${t.description}` : '', x.due ? `\nDue: ${x.due.human}${x.due.time ? ' ' + x.due.time : ''}` : '', `\nProject: ${x.project}`, `\nPriority: ${x.priority}`, t.completed ? '\nCompleted' : '', comments.length ? `\n\nComments:\n${comments.join('\n')}` : ''].join('');
        return { result: { id: args.id, title: t.title, text, url: `${origin}/#today?task=${t.id}`, metadata: x } };
      }
      if (kind === 'project') {
        need('projects:read');
        const p = resolveProject(state, id)!;
        const tasks = live(state.tasks).filter((t) => t.projectId === p.id && !t.completed);
        return { result: { id: args.id, title: p.title, text: `${p.title}\n\nOpen tasks:\n${tasks.map((t) => `- ${t.title}`).join('\n') || '(none)'}`, url: `${origin}/#project/${p.id}`, metadata: { open: tasks.length } } };
      }
      const lc = LIFE_KIND_COLL[kind];
      if (lc) {
        need('life:read');
        const r = (state.life?.[lc] ?? []).find((x: any) => x.id === id && !x.deleted);
        if (!r) throw new AgentError('not_found', `${kind} ${id} not found.`);
        const title = String(r.title ?? r.name ?? r.task ?? String(r.content ?? '').slice(0, 60));
        return { result: { id: args.id, title, text: JSON.stringify(r, null, 2), url: origin, metadata: { kind } } };
      }
      throw new AgentError('invalid', 'Unknown id — use an id returned by search.');
    },
  },
  // ---------------- legacy (callable, not listed: merged into search / notes_list)
  {
    name: 'search_global', title: 'Search', scopes: ['tasks:read'], hidden: true,
    description: 'Full-text search across task titles, descriptions, comments/notes, project and section names and labels; also returns matching projects and labels.',
    input: { type: 'object', properties: { query: S, include_completed: B, limit: N }, required: ['query'] },
    run: async ({ state, args, now }) => {
      const r = D.globalSearch(state, String(args.query), { includeCompleted: !!args.include_completed, limit: args.limit ?? 50 });
      return { result: { tasks: r.tasks.map(describe(state, now)), projects: r.projects.map((p) => ({ id: p.id, name: p.title })), labels: r.labels.map((l) => ({ id: l.id, name: l.name })) } };
    },
  },
  {
    name: 'notes_search', title: 'Search notes', scopes: ['notes:read'], hidden: true,
    description: 'Full-text search across notes with Obsidian-style operators: words (AND), "exact phrase", -exclude, OR, tag:#x, path:folder, file:name, line:, content:, task:, task-todo:, task-done:, [property:value]. Returns matching lines.',
    input: { type: 'object', properties: { query: S, limit: N }, required: ['query'] },
    run: async ({ state, args }) => {
      const index = NV.buildIndex(state.notes ?? []);
      const hits = NV.searchVault(index, String(args.query), Math.min(200, Number(args.limit) || 30));
      return { result: { total: hits.length, results: hits.map((h) => ({ ...NV.describeNote(index, h.note), matches: h.matches })) } };
    },
  },
  // ---------------- every other area (habits, goals, calendar, daily map, journal, applications, learning, mind maps, AI chats)
  ...LIFE_TOOLS.map((t): ToolDef => ({
    name: t.name, title: t.title, description: t.description, scopes: t.scopes, input: t.input, needs: t.needs,
    run: ({ state, args, ctx, now, confirm }) => t.run({ life: state.life ?? {}, args, now, timezone: ctx.timezone ?? null, confirm }),
  })),
];

/**
 * Former tool names, merged into broader tools. Not listed (the catalog stays
 * lean) but still callable, so existing scripts and connected agents keep working.
 */
export const TOOL_ALIASES: Record<string, { to: string; map: (a: Args) => Args }> = {
  views_today: { to: 'tasks_view', map: (a) => ({ ...a, view: 'today' }) },
  views_upcoming: { to: 'tasks_view', map: (a) => ({ ...a, view: 'upcoming' }) },
  views_overdue: { to: 'tasks_view', map: (a) => ({ ...a, view: 'overdue' }) },
  inbox_list: { to: 'tasks_view', map: (a) => ({ ...a, view: 'inbox' }) },
  tasks_complete: { to: 'tasks_update', map: (a) => ({ id: a.id, completed: true }) },
  tasks_reopen: { to: 'tasks_update', map: (a) => ({ id: a.id, completed: false }) },
  reminders_set: { to: 'tasks_update', map: (a) => ({ id: a.task_id, reminders: a.reminders }) },
  tasks_move: { to: 'tasks_bulk_update', map: (a) => a },
  tasks_bulk_complete: { to: 'tasks_bulk_update', map: (a) => ({ ...a, complete: true }) },
  productivity_summary: { to: 'productivity', map: () => ({}) },
  productivity_interval: { to: 'productivity', map: (a) => ({ interval: a.from && a.to ? undefined : a.interval ?? 'this_week', from: a.from, to: a.to }) },
  productivity_project: { to: 'productivity', map: (a) => ({ project: a.project }) },
  labels_list: { to: 'workspace_overview', map: () => ({}) },
  filters_list: { to: 'workspace_overview', map: () => ({}) },
  templates_list: { to: 'workspace_overview', map: () => ({}) },
  preferences_get: { to: 'workspace_overview', map: () => ({}) },
};

/** Run a pure note op, translating its errors to agent errors. */
function noteRef<T>(fn: () => T): T {
  try { return fn(); } catch (e) {
    if (e instanceof NV.NoteOpError) throw new AgentError(e.code, e.message);
    throw e;
  }
}
const noteCtx = (ctx: D.Ctx): NV.NoteCtx => ({ now: ctx.now, source: ctx.source, agent: ctx.agent ?? null });


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
export interface ToolResult { ok: boolean; result?: unknown; summary?: string; error?: { code: string; message: string; data?: unknown } }

export async function callTool(repo: AgentRepo, auth: AuthContext, name: string, args: Args, opts: CallOptions): Promise<ToolResult> {
  sha256Ref.fn = opts.sha256;
  const now = opts.now ?? new Date();
  const called = name; // audited under the name the client used
  const alias = TOOL_ALIASES[name];
  if (alias && args && typeof args === 'object' && !Array.isArray(args)) { args = alias.map(args); name = alias.to; }
  const tool = toolByName(name);
  const audit = (ok: boolean, summary: string | null, error: string | null) => repo.audit(auth.uid, {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: now.toISOString(), tokenId: auth.tokenHash.slice(0, 12),
    agent: auth.token.name, tool: called, ok, summary, error, source: auth.source,
  }).catch(() => undefined);
  try {
    if (!tool) throw new AgentError('not_found', `Unknown tool ${name}.`);
    const missing = tool.scopes.filter((s) => !auth.token.scopes.includes(s));
    if (missing.length) throw new AgentError('forbidden', `This token is missing scope(s): ${missing.join(', ')}.`);
    rateLimit(auth, now.getTime());
    if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new AgentError('invalid', 'Arguments must be an object.');
    let clean: Args;
    try { clean = validateArgs(tool.input, args); } catch (e) { if (e instanceof ArgError) throw new AgentError('invalid', e.message); throw e; }
    for (const r of tool.input.required ?? []) if (clean[r] === undefined || clean[r] === null || clean[r] === '') throw new AgentError('invalid', `Missing required argument: ${r}.`);
    const state = await repo.loadState(auth.uid);
    if (tool.needs?.length) {
      if (!repo.loadCollections) throw new AgentError('invalid', 'This server cannot reach that part of ClearMind.');
      state.life = (await repo.loadCollections(auth.uid, tool.needs)) as FullState['life'];
    }
    const ctx: D.Ctx = { source: auth.source, agent: auth.token.name, timezone: state.preferences?.timezone ?? null, now };
    const confirm: Confirm = async (toolName, ids, message, preview) => {
      const want = [await confirmToken(opts.sha256, auth.uid, toolName, ids, now.getTime()), await confirmToken(opts.sha256, auth.uid, toolName, ids, now.getTime(), 1)];
      if (!clean.confirm_token || !want.includes(clean.confirm_token)) throw new AgentError('confirm_required', message, { confirm_token: want[0], count: ids.length, preview });
    };
    const out = await tool.run({ state, args: clean, ctx, auth, repo, now, confirm });
    if (out.edits?.length) {
      await repo.commit(auth.uid, out.edits, { clientId: opts.clientId ?? `${auth.source}-${auth.tokenHash.slice(0, 8)}`, mutationId: `${auth.source}:${auth.tokenHash.slice(0, 8)}:${now.getTime()}` });
    }
    // "Last used" only needs minute-level accuracy; one write per 10 min, not per call (Firestore write quota).
    const lastUsed = auth.token.lastUsedAt ? Date.parse(auth.token.lastUsedAt) : 0;
    if (!(now.getTime() - lastUsed < 10 * 60_000)) void repo.touchToken(auth.uid, auth.tokenHash, now.toISOString()).catch(() => undefined);
    await audit(true, out.summary ?? null, null);
    return { ok: true, result: out.result, ...(out.summary ? { summary: out.summary } : {}) };
  } catch (e: any) {
    const code = e instanceof AgentError ? e.code : e instanceof D.DomainError ? (e.code === 'not_found' ? 'not_found' : 'invalid') : 'internal';
    const message = code === 'internal' ? 'Internal error' : e.message;
    await audit(false, null, `${code}: ${message}`);
    return { ok: false, error: { code, message, data: e instanceof AgentError ? e.data : undefined } };
  }
}

/** Tool list for MCP tools/list and the REST API index. */
export const toolManifest = () => TOOLS.filter((t) => !t.hidden).map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.input, scopes: t.scopes }));
