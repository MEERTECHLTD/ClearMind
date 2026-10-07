/**
 * Mobile task commands — thin wrappers over the shared domain operations
 * (shared/domain): identical behaviour to web, MCP, API and CLI (completion
 * events, recurrence, activity attribution, idempotency).
 *
 * Each command updates the in-memory stores synchronously (optimistic UI),
 * then persists through the SyncEngine (sqlite + outbox + Firestore). The UI
 * never waits on the network. Reminders are reconciled separately by
 * services/reminders.ts whenever tasks change — from any device or agent.
 */
import { Platform } from 'react-native';
import type { Label, Project, Task, TaskPriority, TaskRecurrence, Section, Comment, Completion, Preferences, SavedFilter } from '@clearmind/shared';
import * as D from '@clearmind/shared/domain';
import { colorFor } from '@clearmind/shared/tasks';
import { getStore } from '../lib/collectionStore';
import { logWarn } from '../lib/logger';
import { STORES } from './db';
import { applyEdits } from './sync';

/** Tasks may carry device-local notification ids (never synced). */
export type MTask = Task & { reminderId?: string | null };

const snap = <T extends { id: string }>(coll: string) => getStore<T>(coll).getSnapshot().items;

export const domainState = (): D.DomainState => ({
  tasks: snap<Task>(STORES.TASKS),
  projects: snap<Project>(STORES.PROJECTS),
  labels: snap<Label>(STORES.LABELS),
  sections: snap<Section>(STORES.SECTIONS),
  comments: snap<Comment>(STORES.COMMENTS),
  completions: snap<Completion>(STORES.COMPLETIONS),
  filters: snap<SavedFilter>(STORES.FILTERS),
  preferences: (snap<Preferences>(STORES.PREFERENCES)[0] as Preferences | undefined) ?? null,
});

const source = (): D.Ctx['source'] => (Platform.OS === 'ios' ? 'ios' : 'android');
export const domainCtx = (over: Partial<D.Ctx> = {}): D.Ctx => ({ source: source(), timezone: domainState().preferences?.timezone ?? null, ...over });

function optimistic(s: D.DomainState, edits: D.Edit[]) {
  const next = D.applyEdits(s, edits);
  const byColl = new Map<string, Set<string>>();
  for (const e of edits) byColl.set(e.coll, (byColl.get(e.coll) ?? new Set()).add(e.id));
  for (const [coll, ids] of byColl) {
    if (coll === 'activity') continue;
    const list: { id: string }[] = coll === 'preferences' ? (next.preferences ? [next.preferences] : []) : ((next as any)[coll] ?? []);
    getStore(coll).applyExternal(list.filter((x) => ids.has(x.id)) as any);
  }
}

/** Run a domain operation: optimistic update + persist; returns result and an undo. */
export function run<R>(op: (s: D.DomainState, c: D.Ctx) => D.OpResult<R>, ctxOver: Partial<D.Ctx> = {}): { result: R; undo: () => void } {
  const s = domainState();
  const r = op(s, domainCtx(ctxOver));
  const inverse = D.invertEdits(s, r.edits);
  if (r.edits.length) {
    optimistic(s, r.edits);
    applyEdits(r.edits).catch((e) => logWarn(`write failed: ${String(e)}`));
  }
  return {
    result: r.result,
    undo: () => {
      if (!inverse.length) return;
      optimistic(domainState(), inverse);
      applyEdits(inverse).catch((e) => logWarn(`undo failed: ${String(e)}`));
    },
  };
}

// ---------------------------------------------------------------- tasks

export interface NewTaskInput {
  title: string;
  description?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: TaskPriority;
  projectId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  recurrence?: TaskRecurrence | null;
  duration?: number | null;
  reminders?: Task['reminders'];
  kind?: 'task' | 'note';
}

export async function createTask(input: NewTaskInput): Promise<MTask> {
  return run((s, c) => D.createTask(s, input, c)).result;
}

export async function updateTask(t: MTask, patch: Partial<MTask>): Promise<void> {
  const { id: _i, completed: _c, reminderId: _r, ...rest } = patch as any;
  run((s, c) => D.updateTask(s, t.id, rest, c));
}

/** Complete (or roll a recurring task forward) / reopen. */
export async function toggleTask(t: MTask, ctxOver: Partial<D.Ctx> = {}): Promise<{ completed: boolean; nextDueDate?: string; undo: () => void }> {
  if (t.completed) {
    const r = run((s, c) => D.reopenTask(s, t.id, c), ctxOver);
    return { completed: false, undo: r.undo };
  }
  const r = run((s, c) => D.completeTask(s, t.id, c), ctxOver);
  return { completed: !r.result.nextDueDate, nextDueDate: r.result.nextDueDate ?? undefined, undo: r.undo };
}

/** Delete a task and its sub-tasks. Returns an undo. */
export async function deleteTask(t: MTask): Promise<() => void> {
  return run((s, c) => D.deleteTask(s, t.id, c)).undo;
}

export function duplicateTask(t: MTask): Promise<MTask> {
  return createTask({
    title: t.title, description: t.description, dueDate: t.dueDate, dueTime: t.dueTime, priority: t.priority,
    projectId: t.projectId, sectionId: t.sectionId, parentId: t.parentId, labelIds: t.labelIds ?? [], recurrence: t.recurrence,
    duration: t.duration, reminders: t.reminders,
  });
}

export const moveTasks = (ids: string[], to: { projectId?: string | null; sectionId?: string | null }) => run((s, c) => D.moveTasks(s, ids, to, c));
export const bulkUpdate = (ids: string[], patch: D.TaskPatch) => run((s, c) => D.bulkUpdate(s, ids, patch, c));

// ---------------------------------------------------------------- projects & sections

export const createProject = (input: { title: string; color?: string; parentId?: string | null; icon?: string | null; view?: 'list' | 'board' | 'calendar'; description?: string | null }): Project =>
  run((s, c) => D.createProject(s, input, c)).result;

export function updateProject(p: Project, patch: Partial<Project>) {
  const { id: _id, ...rest } = patch as any;
  run((s, c) => D.updateProject(s, p.id, rest, c));
}

export const projectSubtree = (all: Project[], id: string) => D.projectSubtree(all, id);

export function moveProject(list: Project[], id: string, dir: -1 | 1) {
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const ids = list.map((p) => p.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  run((s) => D.reorderProjects(s, ids));
}

export async function deleteProject(id: string) {
  run((s, c) => D.deleteProject(s, id, c));
}

export const projectColor = (p: Pick<Project, 'id' | 'color'>) => colorFor(p.id, p.color);

export const createSection = (projectId: string, name: string) => run((s, c) => D.createSection(s, { projectId, name }, c)).result;
export const updateSection = (id: string, patch: Partial<Section>) => run((s) => D.updateSection(s, id, patch as any));
export const deleteSection = (id: string, deleteTasks = false) => run((s, c) => D.deleteSection(s, id, c, { deleteTasks }));
export const reorderSections = (projectId: string, ids: string[]) => run((s) => D.reorderSections(s, projectId, ids));

// ---------------------------------------------------------------- labels, comments, prefs, filters, templates

export const createLabel = (input: { name: string; color?: string }): Label => run((s, c) => D.createLabel(s, input, c)).result;
export const updateLabel = (l: Label, patch: Partial<Label>) => run((s) => D.updateLabel(s, l.id, patch as any));
export const deleteLabel = (id: string) => run((s) => D.deleteLabel(s, id));

export const addComment = (input: { taskId?: string | null; projectId?: string | null; text: string; authorName?: string | null }) => run((s, c) => D.addComment(s, input, c)).result;
export const deleteComment = (id: string) => run((s) => D.deleteComment(s, id));

export const savePreferences = (patch: Partial<Preferences>) => run((s) => D.savePreferences(s, patch));
export const saveFilter = (input: { id?: string; name: string; query: string; color?: string | null }) => run((s, c) => D.saveFilter(s, input, c)).result;
export const deleteFilter = (id: string) => run((s) => D.deleteFilter(s, id));
export const applyTemplate = (templateId: string, title?: string) => run((s, c) => D.applyTemplate(s, templateId, { title }, c)).result;
export const captureInbox = (text: string, opts: { kind?: 'task' | 'note'; parse?: boolean } = {}, ctxOver: Partial<D.Ctx> = {}) =>
  run((s, c) => D.captureInbox(s, text, c, opts), ctxOver).result;

/** Resolve quick-add names to ids, creating projects/labels that don't exist yet. */
export function resolveNames(projectName: string | undefined, projectId: string | undefined | null, labelRefs: { id?: string; name: string }[]) {
  let pid = projectId ?? null;
  if (!pid && projectName) {
    const existing = snap<Project>(STORES.PROJECTS).find((p) => !p.deleted && p.title.toLowerCase() === projectName.toLowerCase());
    pid = existing ? existing.id : createProject({ title: projectName }).id;
  }
  const labelIds = labelRefs.map((r) => r.id || createLabel({ name: r.name }).id);
  return { projectId: pid, labelIds: [...new Set(labelIds.filter(Boolean))] };
}
