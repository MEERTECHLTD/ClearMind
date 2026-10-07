/**
 * ClearMind domain operations — the single implementation of every productivity
 * operation, used by mobile, web, MCP, REST API, CLI, widgets and notification
 * actions alike.
 *
 * Operations are PURE: given the current state and a context (who/where/when),
 * they return a list of field-level edits (create/update/tombstone). Each
 * platform's executor stamps those edits with field clocks (shared/sync/fields)
 * and persists them locally and/or to Firestore. Because every client runs the
 * same code, recurrence, completion events, activity history and idempotency
 * behave identically everywhere.
 */
import type {
  Task, Project, Label, Section, Comment, Completion, Activity, Preferences, SavedFilter, ChangeSource,
  TaskPriority, TaskRecurrence, TaskReminder,
} from '../types';
import {
  normalizeRecurrence, nextOccurrence, firstOccurrence, isOverdue, descendantIds, parseQuickAdd, LIST_COLORS,
  priorityOf, toISODate,
} from '../tasks';
import { dayInZone, nowInZone } from '../tasks/time';
import { TEMPLATES } from './templates';

export type Coll = 'tasks' | 'projects' | 'labels' | 'sections' | 'comments' | 'completions' | 'activity' | 'preferences' | 'filters' | 'notes';

export interface DomainState {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  sections: Section[];
  comments?: Comment[];
  completions?: Completion[];
  filters?: SavedFilter[];
  preferences?: Preferences | null;
}

export interface Ctx {
  now?: Date;
  source: ChangeSource;
  /** Name of the AI agent / API client performing the action (attributed in activity). */
  agent?: string | null;
  /** Explicit time zone (otherwise preferences.timezone, otherwise floating local). */
  timezone?: string | null;
}

/** One field-level change: `edit` holds only the fields to change (null clears). */
export interface Edit { coll: Coll; id: string; edit: Record<string, any> }

export interface OpResult<R = unknown> { edits: Edit[]; result: R }

export class DomainError extends Error {
  constructor(public code: 'not_found' | 'invalid' | 'conflict' | 'forbidden', message: string) { super(message); }
}

// ------------------------------------------------------------------ helpers

const iso = (ctx: Ctx) => (ctx.now ?? new Date()).toISOString();
const rand = () => Math.random().toString(36).slice(2, 10);
export const newId = (ctx?: Ctx) => `${(ctx?.now ?? new Date()).getTime().toString(36)}-${rand()}`;

/** Deterministic id from an idempotency key (FNV-1a, 2×32 bit). Same key → same record. */
export function idFromKey(key: string, prefix = 'k'): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `${prefix}${h1.toString(36)}${h2.toString(36)}`;
}

const tz = (state: DomainState, ctx: Ctx) => ctx.timezone ?? state.preferences?.timezone ?? null;
/** "Now" as wall-clock time in the user's zone (date math in their calendar). */
const localNow = (state: DomainState, ctx: Ctx) => nowInZone(tz(state, ctx), ctx.now ?? new Date());

function get<T extends { id: string; deleted?: boolean | null }>(list: T[] | undefined, id: string, what: string): T {
  const x = list?.find((i) => i.id === id && !i.deleted);
  if (!x) throw new DomainError('not_found', `${what} ${id} not found`);
  return x;
}
const live = <T extends { deleted?: boolean | null }>(list: T[] | undefined) => (list ?? []).filter((x) => !x.deleted);

function activity(state: DomainState, ctx: Ctx, a: Omit<Activity, 'id' | 'at' | 'source' | 'agent'>): Edit {
  const at = iso(ctx);
  return {
    coll: 'activity',
    id: newId(ctx),
    edit: { id: '', ...a, at, source: ctx.source, agent: ctx.agent ?? null },
  };
}
const fixId = (e: Edit): Edit => ({ ...e, edit: { ...e.edit, id: e.id } });

const PRIORITY_LEVEL: Record<TaskPriority, string> = { High: 'P1', Medium: 'P2', Low: 'P3', None: 'P4' };

// ------------------------------------------------------------------ validation

const MAX_TITLE = 500;
const MAX_TEXT = 20_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low', 'None'];

export function validateTaskFields(f: Partial<TaskInput>): void {
  if (f.title !== undefined && (typeof f.title !== 'string' || !f.title.trim() || f.title.length > MAX_TITLE)) throw new DomainError('invalid', `title must be 1–${MAX_TITLE} characters`);
  if (f.description != null && (typeof f.description !== 'string' || f.description.length > MAX_TEXT)) throw new DomainError('invalid', 'description too long');
  if (f.dueDate != null && !DATE_RE.test(f.dueDate)) throw new DomainError('invalid', 'dueDate must be YYYY-MM-DD');
  if (f.dueTime != null && !TIME_RE.test(f.dueTime)) throw new DomainError('invalid', 'dueTime must be HH:MM (24h)');
  if (f.dueTime != null && f.dueDate === null) throw new DomainError('invalid', 'dueTime requires a dueDate');
  if (f.priority != null && !PRIORITIES.includes(f.priority)) throw new DomainError('invalid', 'priority must be High|Medium|Low|None');
  if (f.duration != null && (!Number.isFinite(f.duration) || f.duration < 1 || f.duration > 24 * 60 * 14)) throw new DomainError('invalid', 'duration must be minutes (1–20160)');
  if (f.labelIds != null && (!Array.isArray(f.labelIds) || f.labelIds.length > 50)) throw new DomainError('invalid', 'labelIds must be an array (max 50)');
  if (f.reminders != null && (!Array.isArray(f.reminders) || f.reminders.length > 10)) throw new DomainError('invalid', 'max 10 reminders');
}

// ------------------------------------------------------------------ tasks

export interface TaskInput {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  timezone?: string | null;
  duration?: number | null;
  priority?: TaskPriority;
  projectId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  recurrence?: TaskRecurrence | null;
  reminders?: TaskReminder[] | null;
  assigneeId?: string | null;
  kind?: 'task' | 'note' | null;
  /** Retry-safe creation: the same key always maps to the same task. */
  idempotencyKey?: string | null;
}

function checkRefs(state: DomainState, f: Partial<TaskInput>) {
  if (f.projectId) get(state.projects, f.projectId, 'Project');
  if (f.sectionId) {
    const s = get(state.sections, f.sectionId, 'Section');
    if (f.projectId !== undefined && (f.projectId ?? null) !== s.projectId) throw new DomainError('invalid', 'section belongs to a different project');
  }
  if (f.parentId) get(state.tasks, f.parentId, 'Parent task');
  for (const l of f.labelIds ?? []) get(state.labels, l, 'Label');
}

export function createTask(state: DomainState, input: TaskInput, ctx: Ctx): OpResult<Task> {
  validateTaskFields(input);
  checkRefs(state, input);
  const id = input.idempotencyKey ? idFromKey(`task:${input.idempotencyKey}`) : newId(ctx);
  const existing = state.tasks.find((t) => t.id === id && !t.deleted);
  if (existing) return { edits: [], result: existing }; // idempotent retry
  const prefs = state.preferences;
  const parent = input.parentId ? state.tasks.find((t) => t.id === input.parentId) : undefined;
  const section = input.sectionId ? state.sections.find((s) => s.id === input.sectionId) : undefined;
  const rule = normalizeRecurrence(input.recurrence ?? null);
  const dueDate = input.dueDate || (rule ? firstOccurrence(rule, localNow(state, ctx)) : null);
  let reminders = input.reminders ?? null;
  if (!reminders && dueDate && input.dueTime && prefs?.autoReminders && prefs.defaultReminder != null) {
    reminders = [{ id: 'default', type: 'relative', minutesBefore: prefs.defaultReminder }];
  }
  const t: Task = {
    id,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    completed: false,
    priority: input.priority ?? prefs?.quickAddPriority ?? 'None',
    dueDate: dueDate ?? undefined,
    dueTime: (dueDate && input.dueTime) || undefined,
    timezone: input.timezone ?? null,
    duration: input.duration ?? null,
    projectId: input.projectId !== undefined ? input.projectId : section?.projectId ?? parent?.projectId ?? null,
    sectionId: input.sectionId ?? null,
    parentId: input.parentId ?? null,
    labelIds: input.labelIds ?? [],
    recurrence: rule,
    reminders,
    assigneeId: input.assigneeId ?? null,
    kind: input.kind ?? 'task',
    taskNumber: state.tasks.reduce((m, x) => Math.max(m, x.taskNumber || 0), 0) + 1,
    order: (ctx.now ?? new Date()).getTime(),
    createdAt: iso(ctx),
    completedAt: null,
    notified: false,
    source: ctx.source,
    agent: ctx.agent ?? null,
  };
  return {
    edits: [{ coll: 'tasks', id, edit: t }, fixId(activity(state, ctx, { entity: 'task', entityId: id, action: 'created', title: t.title, projectId: t.projectId ?? null }))],
    result: t,
  };
}

export type TaskPatch = Partial<Omit<TaskInput, 'idempotencyKey'>> & { completed?: never };

export function updateTask(state: DomainState, id: string, patch: TaskPatch, ctx: Ctx): OpResult<Task> {
  const cur = get(state.tasks, id, 'Task');
  validateTaskFields(patch);
  checkRefs(state, { ...patch, projectId: patch.projectId !== undefined ? patch.projectId : patch.sectionId ? cur.projectId ?? null : undefined });
  if (patch.parentId && (patch.parentId === id || descendantIds(state.tasks, id).includes(patch.parentId))) throw new DomainError('invalid', 'a task cannot be nested under itself');
  const edit: Record<string, any> = { ...patch };
  if (patch.recurrence !== undefined) edit.recurrence = normalizeRecurrence(patch.recurrence);
  if (patch.dueDate === null) { edit.dueTime = null; edit.recurrence = null; }
  if (patch.title !== undefined) edit.title = patch.title.trim();
  // Moving to another project drops a section that belongs to the old one.
  if (patch.projectId !== undefined && patch.sectionId === undefined && cur.sectionId) {
    const s = state.sections.find((x) => x.id === cur.sectionId);
    if (s && s.projectId !== patch.projectId) edit.sectionId = null;
  }
  if ((edit.dueDate !== undefined && edit.dueDate !== cur.dueDate) || (edit.dueTime !== undefined && edit.dueTime !== cur.dueTime)) edit.notified = false;
  const next = { ...cur, ...edit } as Task;
  const edits: Edit[] = [{ coll: 'tasks', id, edit }];
  const a = (action: string, details: Record<string, unknown>) =>
    edits.push(fixId(activity(state, ctx, { entity: 'task', entityId: id, action, title: next.title, projectId: next.projectId ?? null, details })));
  if (patch.priority !== undefined && priorityOf(cur) !== patch.priority) a('priority', { from: PRIORITY_LEVEL[priorityOf(cur)], to: PRIORITY_LEVEL[patch.priority ?? 'None'] });
  if (edit.dueDate !== undefined && edit.dueDate !== (cur.dueDate ?? null)) a('rescheduled', { from: cur.dueDate ?? null, to: edit.dueDate ?? null });
  if ((patch.projectId !== undefined && patch.projectId !== (cur.projectId ?? null)) || (patch.sectionId !== undefined && patch.sectionId !== (cur.sectionId ?? null))) {
    a('moved', { fromProject: cur.projectId ?? null, toProject: next.projectId ?? null, fromSection: cur.sectionId ?? null, toSection: next.sectionId ?? null });
  }
  if (patch.title !== undefined && edit.title !== cur.title) a('renamed', { from: cur.title, to: edit.title });
  return { edits, result: next };
}

/**
 * Complete a task. Recurring tasks roll forward (unless the rule ended) and
 * their checklist resets; one-off tasks complete together with their sub-tasks.
 * Each completed occurrence writes an idempotent Completion event.
 */
export function completeTask(state: DomainState, id: string, ctx: Ctx): OpResult<{ task: Task; nextDueDate: string | null }> {
  const t = get(state.tasks, id, 'Task');
  if (t.completed) return { edits: [], result: { task: t, nextDueDate: null } }; // idempotent
  const stamp = iso(ctx);
  const nowLocal = localNow(state, ctx);
  const day = dayInZone(ctx.now ?? new Date(), tz(state, ctx));
  const rule = normalizeRecurrence(t.recurrence);
  const subs = descendantIds(state.tasks, id).map((sid) => state.tasks.find((x) => x.id === sid)!).filter((x) => x && !x.deleted);
  const completion = (task: Task): Edit => {
    const occurrence = task.recurrence ? task.dueDate ?? day : 'once';
    const cid = `${task.id}@${occurrence}`;
    const c: Completion = {
      id: cid, taskId: task.id, title: task.title, projectId: task.projectId ?? null, priority: priorityOf(task), occurrence,
      completedAt: stamp, day, wasOverdue: isOverdue(task, nowLocal), source: ctx.source, deleted: false,
    };
    return { coll: 'completions', id: cid, edit: c };
  };
  const edits: Edit[] = [];
  let nextDueDate: string | null = null;
  if (rule) nextDueDate = nextOccurrence(rule, t.dueDate ?? toISODate(nowLocal), nowLocal);
  if (rule && nextDueDate) {
    edits.push(completion(t));
    edits.push({ coll: 'tasks', id, edit: { dueDate: nextDueDate, completed: false, completedAt: null, notified: false } });
    for (const s of subs) if (s.completed) edits.push({ coll: 'tasks', id: s.id, edit: { completed: false, completedAt: null } });
  } else {
    edits.push(completion(t));
    edits.push({ coll: 'tasks', id, edit: { completed: true, completedAt: stamp } });
    for (const s of subs) if (!s.completed) {
      edits.push(completion(s));
      edits.push({ coll: 'tasks', id: s.id, edit: { completed: true, completedAt: stamp } });
    }
  }
  edits.push(fixId(activity(state, ctx, { entity: 'task', entityId: id, action: 'completed', title: t.title, projectId: t.projectId ?? null, details: nextDueDate ? { next: nextDueDate } : null })));
  const task = { ...t, ...(edits.find((e) => e.coll === 'tasks' && e.id === id)!.edit) } as Task;
  return { edits, result: { task, nextDueDate } };
}

/** Reopen a completed task (and completed ancestors); retracts its completion event. */
export function reopenTask(state: DomainState, id: string, ctx: Ctx): OpResult<Task> {
  const t = get(state.tasks, id, 'Task');
  if (!t.completed) return { edits: [], result: t };
  const edits: Edit[] = [];
  const byId = new Map(state.tasks.map((x) => [x.id, x]));
  const chain: Task[] = [t];
  let p = t.parentId ? byId.get(t.parentId) : undefined;
  const seen = new Set([t.id]);
  while (p && !seen.has(p.id)) { seen.add(p.id); if (p.completed) chain.push(p); p = p.parentId ? byId.get(p.parentId) : undefined; }
  for (const x of chain) {
    edits.push({ coll: 'tasks', id: x.id, edit: { completed: false, completedAt: null } });
    const cid = `${x.id}@once`;
    if ((state.completions ?? []).some((c) => c.id === cid && !c.deleted)) edits.push({ coll: 'completions', id: cid, edit: { deleted: true } });
  }
  edits.push(fixId(activity(state, ctx, { entity: 'task', entityId: id, action: 'reopened', title: t.title, projectId: t.projectId ?? null })));
  return { edits, result: { ...t, completed: false, completedAt: null } };
}

/** Tombstone a task and its sub-tasks (deletes sync; stale devices can't resurrect them). */
export function deleteTask(state: DomainState, id: string, ctx: Ctx): OpResult<{ ids: string[] }> {
  const t = get(state.tasks, id, 'Task');
  const ids = [id, ...descendantIds(state.tasks, id)];
  const edits: Edit[] = ids.map((x) => ({ coll: 'tasks' as Coll, id: x, edit: { deleted: true } }));
  for (const c of live(state.comments)) if (c.taskId && ids.includes(c.taskId)) edits.push({ coll: 'comments', id: c.id, edit: { deleted: true } });
  edits.push(fixId(activity(state, ctx, { entity: 'task', entityId: id, action: 'deleted', title: t.title, projectId: t.projectId ?? null, details: ids.length > 1 ? { subtasks: ids.length - 1 } : null })));
  return { edits, result: { ids } };
}

/** Undo a delete. */
export function restoreTasks(state: DomainState, ids: string[], ctx: Ctx): OpResult<{ ids: string[] }> {
  const edits: Edit[] = ids.map((x) => ({ coll: 'tasks' as Coll, id: x, edit: { deleted: false, deletedAt: null } }));
  const t = state.tasks.find((x) => x.id === ids[0]);
  if (t) edits.push(fixId(activity(state, ctx, { entity: 'task', entityId: t.id, action: 'restored', title: t.title, projectId: t.projectId ?? null })));
  return { edits, result: { ids } };
}

export function moveTasks(state: DomainState, ids: string[], to: { projectId?: string | null; sectionId?: string | null }, ctx: Ctx): OpResult<{ moved: number }> {
  if (to.projectId) get(state.projects, to.projectId, 'Project');
  let projectId = to.projectId;
  if (to.sectionId) {
    const s = get(state.sections, to.sectionId, 'Section');
    if (projectId !== undefined && projectId !== s.projectId) throw new DomainError('invalid', 'section belongs to a different project');
    projectId = s.projectId;
  }
  const edits: Edit[] = [];
  let moved = 0;
  for (const id of ids) {
    const r = updateTask(state, id, { projectId: projectId === undefined ? undefined : projectId, sectionId: to.sectionId === undefined ? (projectId !== undefined ? null : undefined) : to.sectionId }, ctx);
    if (r.edits.length) moved++;
    edits.push(...r.edits);
    // Sub-tasks follow their parent.
    for (const sid of descendantIds(state.tasks, id)) {
      if (projectId !== undefined) edits.push({ coll: 'tasks', id: sid, edit: { projectId, sectionId: null } });
    }
  }
  return { edits, result: { moved } };
}

export function bulkUpdate(state: DomainState, ids: string[], patch: TaskPatch, ctx: Ctx): OpResult<{ updated: number }> {
  const edits: Edit[] = [];
  for (const id of ids) edits.push(...updateTask(state, id, patch, ctx).edits);
  return { edits, result: { updated: ids.length } };
}

/**
 * Inbox capture: drop in a thought, a note or a task in seconds. Natural
 * language is parsed when enabled (dates, #project, @labels, p1…), otherwise
 * the text is kept verbatim. Unknown #projects/@labels are created.
 */
export function captureInbox(state: DomainState, text: string, ctx: Ctx, opts: { parse?: boolean; kind?: 'task' | 'note'; description?: string | null; idempotencyKey?: string | null } = {}): OpResult<Task> {
  const trimmed = text.trim();
  if (!trimmed) throw new DomainError('invalid', 'text is required');
  const prefs = state.preferences;
  const doParse = opts.parse ?? (prefs?.quickAddParse !== false);
  if (!doParse || opts.kind === 'note') {
    return createTask(state, { title: trimmed.slice(0, MAX_TITLE), description: opts.description ?? (trimmed.length > MAX_TITLE ? trimmed : null), projectId: null, kind: opts.kind ?? 'task', idempotencyKey: opts.idempotencyKey }, ctx);
  }
  const p = parseQuickAdd(trimmed, {
    now: localNow(state, ctx),
    projects: live(state.projects).filter((x) => !x.archived).map((x) => ({ id: x.id, title: x.title })),
    labels: live(state.labels),
    smartDates: prefs?.smartDates !== false,
    nextWeek: prefs?.nextWeek,
    weekend: prefs?.weekend,
  });
  const edits: Edit[] = [];
  let working = state;
  let projectId = p.projectId ?? null;
  if (!projectId && p.projectName) {
    const r = createProject(working, { title: p.projectName }, ctx);
    edits.push(...r.edits);
    projectId = r.result.id;
    working = { ...working, projects: [...working.projects, r.result] };
  }
  const labelIds: string[] = [];
  for (const l of p.labels) {
    if (l.id) { labelIds.push(l.id); continue; }
    const r = createLabel(working, { name: l.name }, ctx);
    edits.push(...r.edits);
    labelIds.push(r.result.id);
    working = { ...working, labels: [...working.labels, r.result] };
  }
  const reminders: TaskReminder[] = p.reminders.map((r, i) =>
    r.minutesBefore != null ? { id: `r${i}`, type: 'relative', minutesBefore: r.minutesBefore } : { id: `r${i}`, type: 'absolute', at: `${p.dueDate ?? toISODate(localNow(state, ctx))}T${r.time}` });
  const r = createTask(working, {
    title: p.title || trimmed,
    description: opts.description ?? null,
    dueDate: p.dueDate ?? null,
    dueTime: p.dueTime ?? null,
    priority: p.priority,
    projectId,
    labelIds,
    recurrence: p.recurrence ?? null,
    duration: p.duration ?? null,
    reminders: reminders.length ? reminders : null,
    kind: opts.kind ?? 'task',
    idempotencyKey: opts.idempotencyKey,
  }, ctx);
  return { edits: [...edits, ...r.edits], result: r.result };
}

// ------------------------------------------------------------------ comments

export function addComment(state: DomainState, input: { taskId?: string | null; projectId?: string | null; text: string; authorName?: string | null; idempotencyKey?: string | null }, ctx: Ctx): OpResult<Comment> {
  const text = input.text?.trim();
  if (!text || text.length > MAX_TEXT) throw new DomainError('invalid', 'comment text is required (max 20000 chars)');
  if (!input.taskId && !input.projectId) throw new DomainError('invalid', 'taskId or projectId is required');
  const task = input.taskId ? get(state.tasks, input.taskId, 'Task') : null;
  if (input.projectId) get(state.projects, input.projectId, 'Project');
  const id = input.idempotencyKey ? idFromKey(`comment:${input.idempotencyKey}`, 'c') : newId(ctx);
  const existing = (state.comments ?? []).find((c) => c.id === id && !c.deleted);
  if (existing) return { edits: [], result: existing };
  const c: Comment = { id, taskId: input.taskId ?? null, projectId: input.projectId ?? task?.projectId ?? null, text, createdAt: iso(ctx), authorName: input.authorName ?? null, source: ctx.source, agent: ctx.agent ?? null };
  return {
    edits: [{ coll: 'comments', id, edit: c }, fixId(activity(state, ctx, { entity: 'comment', entityId: input.taskId ?? input.projectId!, action: 'commented', title: task?.title ?? null, projectId: c.projectId ?? null, details: { text: text.slice(0, 140) } }))],
    result: c,
  };
}

export function deleteComment(state: DomainState, id: string): OpResult<{ id: string }> {
  get(state.comments, id, 'Comment');
  return { edits: [{ coll: 'comments', id, edit: { deleted: true } }], result: { id } };
}

// ------------------------------------------------------------------ projects

export interface ProjectInput { title: string; color?: string | null; parentId?: string | null; icon?: string | null; favorite?: boolean; view?: 'list' | 'board' | 'calendar'; description?: string | null; idempotencyKey?: string | null }

export function createProject(state: DomainState, input: ProjectInput, ctx: Ctx): OpResult<Project> {
  const title = input.title?.trim();
  if (!title || title.length > 120) throw new DomainError('invalid', 'project name must be 1–120 characters');
  if (input.parentId) get(state.projects, input.parentId, 'Parent project');
  const id = input.idempotencyKey ? idFromKey(`project:${input.idempotencyKey}`, 'p') : newId(ctx);
  const existing = state.projects.find((p) => p.id === id && !p.deleted);
  if (existing) return { edits: [], result: existing };
  const all = live(state.projects);
  const p: Project = {
    id, title, description: input.description ?? '', status: 'In Progress', progress: 0, tags: [],
    color: input.color ?? LIST_COLORS[all.length % LIST_COLORS.length].hex,
    parentId: input.parentId ?? null,
    order: all.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1,
    archived: false, icon: input.icon ?? null, favorite: input.favorite ?? false, view: input.view ?? 'list',
    createdAt: iso(ctx), source: ctx.source,
  };
  return { edits: [{ coll: 'projects', id, edit: p }, fixId(activity(state, ctx, { entity: 'project', entityId: id, action: 'created', title, projectId: id }))], result: p };
}

export function updateProject(state: DomainState, id: string, patch: Partial<Pick<Project, 'title' | 'color' | 'parentId' | 'icon' | 'favorite' | 'view' | 'description' | 'archived' | 'order'>>, ctx: Ctx): OpResult<Project> {
  const cur = get(state.projects, id, 'Project');
  if (patch.title !== undefined && (!patch.title.trim() || patch.title.length > 120)) throw new DomainError('invalid', 'project name must be 1–120 characters');
  if (patch.parentId) {
    if (patch.parentId === id || projectSubtree(state.projects, id).includes(patch.parentId)) throw new DomainError('invalid', 'a project cannot be nested under itself');
    get(state.projects, patch.parentId, 'Parent project');
  }
  const edits: Edit[] = [{ coll: 'projects', id, edit: { ...patch, ...(patch.title ? { title: patch.title.trim() } : {}) } }];
  if (patch.archived !== undefined && patch.archived !== !!cur.archived) edits.push(fixId(activity(state, ctx, { entity: 'project', entityId: id, action: patch.archived ? 'archived' : 'unarchived', title: cur.title, projectId: id })));
  if (patch.title !== undefined && patch.title.trim() !== cur.title) edits.push(fixId(activity(state, ctx, { entity: 'project', entityId: id, action: 'renamed', title: patch.title.trim(), projectId: id, details: { from: cur.title } })));
  return { edits, result: { ...cur, ...patch } as Project };
}

export function projectSubtree(projects: Project[], id: string): string[] {
  const out = [id];
  const seen = new Set(out);
  for (let k = 0; k < out.length; k++) for (const p of projects) if (!p.deleted && p.parentId === out[k] && !seen.has(p.id)) { seen.add(p.id); out.push(p.id); }
  return out;
}

/** Delete a project with its sub-projects, sections and tasks (tombstones). */
export function deleteProject(state: DomainState, id: string, ctx: Ctx): OpResult<{ projects: number; tasks: number }> {
  const p = get(state.projects, id, 'Project');
  const ids = new Set(projectSubtree(state.projects, id));
  const edits: Edit[] = [];
  for (const pid of ids) edits.push({ coll: 'projects', id: pid, edit: { deleted: true } });
  const tasks = live(state.tasks).filter((t) => t.projectId && ids.has(t.projectId));
  for (const t of tasks) edits.push({ coll: 'tasks', id: t.id, edit: { deleted: true } });
  for (const s of live(state.sections)) if (ids.has(s.projectId)) edits.push({ coll: 'sections', id: s.id, edit: { deleted: true } });
  edits.push(fixId(activity(state, ctx, { entity: 'project', entityId: id, action: 'deleted', title: p.title, projectId: id, details: { tasks: tasks.length, subprojects: ids.size - 1 } })));
  return { edits, result: { projects: ids.size, tasks: tasks.length } };
}

export function reorderProjects(state: DomainState, orderedIds: string[]): OpResult<null> {
  return { edits: orderedIds.map((id, i) => ({ coll: 'projects' as Coll, id, edit: { order: i + 1 } })), result: null };
}

// ------------------------------------------------------------------ sections

export function createSection(state: DomainState, input: { projectId: string; name: string; idempotencyKey?: string | null }, ctx: Ctx): OpResult<Section> {
  get(state.projects, input.projectId, 'Project');
  const name = input.name?.trim();
  if (!name || name.length > 120) throw new DomainError('invalid', 'section name must be 1–120 characters');
  const id = input.idempotencyKey ? idFromKey(`section:${input.idempotencyKey}`, 's') : newId(ctx);
  const existing = state.sections.find((s) => s.id === id && !s.deleted);
  if (existing) return { edits: [], result: existing };
  const siblings = live(state.sections).filter((s) => s.projectId === input.projectId);
  const s: Section = { id, projectId: input.projectId, name, order: siblings.reduce((m, x) => Math.max(m, x.order), 0) + 1, collapsed: false, archived: false };
  return { edits: [{ coll: 'sections', id, edit: s }, fixId(activity(state, ctx, { entity: 'section', entityId: id, action: 'created', title: name, projectId: input.projectId }))], result: s };
}

export function updateSection(state: DomainState, id: string, patch: Partial<Pick<Section, 'name' | 'collapsed' | 'archived' | 'order'>>): OpResult<Section> {
  const cur = get(state.sections, id, 'Section');
  if (patch.name !== undefined && !patch.name.trim()) throw new DomainError('invalid', 'section name is required');
  return { edits: [{ coll: 'sections', id, edit: { ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) } }], result: { ...cur, ...patch } };
}

/** Delete a section; its tasks move to the project's "no section" area (or are deleted). */
export function deleteSection(state: DomainState, id: string, ctx: Ctx, opts: { deleteTasks?: boolean } = {}): OpResult<{ tasks: number }> {
  const s = get(state.sections, id, 'Section');
  const tasks = live(state.tasks).filter((t) => t.sectionId === id);
  const edits: Edit[] = [{ coll: 'sections', id, edit: { deleted: true } }];
  for (const t of tasks) edits.push({ coll: 'tasks', id: t.id, edit: opts.deleteTasks ? { deleted: true } : { sectionId: null } });
  edits.push(fixId(activity(state, ctx, { entity: 'section', entityId: id, action: 'deleted', title: s.name, projectId: s.projectId, details: { tasks: tasks.length } })));
  return { edits, result: { tasks: tasks.length } };
}

export function reorderSections(state: DomainState, projectId: string, orderedIds: string[]): OpResult<null> {
  const valid = new Set(live(state.sections).filter((s) => s.projectId === projectId).map((s) => s.id));
  for (const id of orderedIds) if (!valid.has(id)) throw new DomainError('invalid', `section ${id} is not in project ${projectId}`);
  return { edits: orderedIds.map((id, i) => ({ coll: 'sections' as Coll, id, edit: { order: i + 1 } })), result: null };
}

// ------------------------------------------------------------------ labels

export function createLabel(state: DomainState, input: { name: string; color?: string | null }, ctx: Ctx): OpResult<Label> {
  const name = input.name?.trim().replace(/^[@%]/, '').replace(/\s+/g, '_');
  if (!name || name.length > 60) throw new DomainError('invalid', 'label name must be 1–60 characters');
  const dupe = live(state.labels).find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (dupe) return { edits: [], result: dupe };
  const all = live(state.labels);
  const id = idFromKey(`label:${name.toLowerCase()}`, 'l'); // same name on two devices → same label
  const l: Label = { id, name, color: input.color ?? LIST_COLORS[(all.length + 5) % LIST_COLORS.length].hex, order: all.length + 1 };
  return { edits: [{ coll: 'labels', id, edit: l }], result: l };
}

export function updateLabel(state: DomainState, id: string, patch: Partial<Pick<Label, 'name' | 'color' | 'favorite' | 'order'>>): OpResult<Label> {
  const cur = get(state.labels, id, 'Label');
  const edit: Record<string, any> = { ...patch };
  if (patch.name !== undefined) {
    edit.name = patch.name.trim().replace(/^[@%]/, '').replace(/\s+/g, '_');
    if (!edit.name) throw new DomainError('invalid', 'label name is required');
    if (live(state.labels).some((l) => l.id !== id && l.name.toLowerCase() === edit.name.toLowerCase())) throw new DomainError('conflict', 'a label with that name already exists');
  }
  return { edits: [{ coll: 'labels', id, edit }], result: { ...cur, ...edit } };
}

export function deleteLabel(state: DomainState, id: string): OpResult<{ tasks: number }> {
  get(state.labels, id, 'Label');
  const affected = live(state.tasks).filter((t) => (t.labelIds ?? []).includes(id));
  return {
    edits: [
      { coll: 'labels', id, edit: { deleted: true } },
      ...affected.map((t) => ({ coll: 'tasks' as Coll, id: t.id, edit: { labelIds: (t.labelIds ?? []).filter((x) => x !== id) } })),
    ],
    result: { tasks: affected.length },
  };
}

// ------------------------------------------------------------------ filters, preferences, templates

export function saveFilter(state: DomainState, input: { id?: string; name: string; query: string; color?: string | null; favorite?: boolean }, ctx: Ctx): OpResult<SavedFilter> {
  if (!input.name?.trim() || !input.query?.trim()) throw new DomainError('invalid', 'name and query are required');
  const id = input.id ?? newId(ctx);
  const f: SavedFilter = { id, name: input.name.trim(), query: input.query.trim(), color: input.color ?? null, favorite: input.favorite ?? false, order: (state.filters?.length ?? 0) + 1 };
  return { edits: [{ coll: 'filters', id, edit: input.id ? { name: f.name, query: f.query, color: f.color, favorite: f.favorite } : f }], result: f };
}

export function deleteFilter(_state: DomainState, id: string): OpResult<null> {
  return { edits: [{ coll: 'filters', id, edit: { deleted: true } }], result: null };
}

export function savePreferences(state: DomainState, patch: Partial<Preferences>): OpResult<Preferences> {
  const { id: _id, ...rest } = patch as any;
  const cur = state.preferences ?? ({ id: 'preferences' } as Preferences);
  const edit = state.preferences ? rest : { id: 'preferences', ...rest };
  return { edits: [{ coll: 'preferences', id: 'preferences', edit }], result: { ...cur, ...rest } };
}

/** Create a project from a template (sections + starter tasks). */
export function applyTemplate(state: DomainState, templateId: string, input: { title?: string; parentId?: string | null }, ctx: Ctx): OpResult<Project> {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) throw new DomainError('not_found', `template ${templateId} not found`);
  const pr = createProject(state, { title: input.title?.trim() || tpl.name, color: tpl.color, icon: tpl.icon, parentId: input.parentId ?? null, view: tpl.view }, ctx);
  const edits = [...pr.edits];
  let working: DomainState = { ...state, projects: [...state.projects, pr.result] };
  for (const sec of tpl.sections) {
    const sr = createSection(working, { projectId: pr.result.id, name: sec.name }, ctx);
    edits.push(...sr.edits.filter((e) => e.coll !== 'activity'));
    working = { ...working, sections: [...working.sections, sr.result] };
    for (const t of sec.tasks) {
      const tr = createTask(working, { title: t.title, priority: t.priority, description: t.description ?? null, projectId: pr.result.id, sectionId: sr.result.id }, ctx);
      edits.push(...tr.edits.filter((e) => e.coll !== 'activity'));
      working = { ...working, tasks: [...working.tasks, tr.result] };
    }
  }
  return { edits, result: pr.result };
}

// ------------------------------------------------------------------ undo

/**
 * The inverse of a set of edits against the state they were applied to: field
 * values are restored for existing records, created records are tombstoned.
 * (Activity entries are not undone — history keeps what happened.)
 */
export function invertEdits(state: DomainState, edits: Edit[]): Edit[] {
  const lists: Record<string, { id: string }[] | undefined> = {
    tasks: state.tasks, projects: state.projects, labels: state.labels, sections: state.sections,
    comments: state.comments, completions: state.completions, filters: state.filters,
    preferences: state.preferences ? [state.preferences] : [],
  };
  const out: Edit[] = [];
  for (const e of edits) {
    if (e.coll === 'activity') continue;
    const cur = lists[e.coll]?.find((x) => x.id === e.id) as Record<string, any> | undefined;
    if (!cur || cur.deleted) { out.push({ coll: e.coll, id: e.id, edit: { deleted: true } }); continue; }
    const inv: Record<string, any> = {};
    for (const k of Object.keys(e.edit)) if (k !== 'id') inv[k] = cur[k] === undefined ? null : cur[k];
    out.push({ coll: e.coll, id: e.id, edit: inv });
  }
  return out.reverse();
}

/** Apply edits to an in-memory state (used by tests, agents and optimistic UIs). */
export function applyEdits(state: DomainState, edits: Edit[]): DomainState {
  const next: any = { ...state };
  for (const e of edits) {
    if (e.coll === 'preferences') { next.preferences = { ...(next.preferences ?? { id: 'preferences' }), ...e.edit }; continue; }
    if (e.coll === 'activity') continue;
    const list: any[] = [...(next[e.coll] ?? [])];
    const i = list.findIndex((x) => x.id === e.id);
    if (i >= 0) list[i] = { ...list[i], ...e.edit, id: e.id };
    else list.push({ ...e.edit, id: e.id });
    next[e.coll] = list;
  }
  return next;
}
