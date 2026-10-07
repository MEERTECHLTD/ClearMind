/**
 * Web task commands — thin wrappers over the shared domain operations
 * (shared/domain): the exact same logic mobile, MCP, API and CLI use, so
 * completions, recurrence, activity history and idempotency are identical
 * everywhere. Edits are applied optimistically through the SyncEngine
 * (IndexedDB + outbox + Firestore); the UI never waits for the network.
 */
import type { Label, Project, Task, TaskPriority, TaskRecurrence, Preferences, Section, Comment, Completion } from '../../types';
import * as D from '../../shared/domain';
import { colorFor } from '../../shared/tasks';
import { STORES } from '../../services/db';
import { applyEdits } from '../../services/syncEngine';
import { getStore, applyToStores } from './store';

export const state = (): D.DomainState => ({
  tasks: getStore<Task>(STORES.TASKS).getSnapshot().items,
  projects: getStore<Project>(STORES.PROJECTS).getSnapshot().items,
  labels: getStore<Label>(STORES.LABELS).getSnapshot().items,
  sections: getStore<Section>(STORES.SECTIONS).getSnapshot().items,
  comments: getStore<Comment>(STORES.COMMENTS).getSnapshot().items,
  completions: getStore<Completion>(STORES.COMPLETIONS).getSnapshot().items,
  preferences: (getStore<Preferences>(STORES.PREFERENCES).getSnapshot().items[0] as Preferences | undefined) ?? null,
});

export const ctx = (): D.Ctx => ({ source: 'web', timezone: state().preferences?.timezone ?? null });

/** Reflect edits in the in-memory stores immediately (the engine persists them right after). */
function optimistic(s: D.DomainState, edits: D.Edit[]) {
  const next = D.applyEdits(s, edits);
  const byColl = new Map<string, Set<string>>();
  for (const e of edits) byColl.set(e.coll, (byColl.get(e.coll) ?? new Set()).add(e.id));
  for (const [coll, ids] of byColl) {
    if (coll === 'activity') continue;
    const list: { id: string }[] = coll === 'preferences' ? (next.preferences ? [next.preferences] : []) : ((next as any)[coll] ?? []);
    applyToStores(coll, list.filter((x) => ids.has(x.id)));
  }
}

/** Run a domain operation: persist its edits and return its result + an undo. */
export function run<R>(op: (s: D.DomainState, c: D.Ctx) => D.OpResult<R>): { result: R; undo: () => void } {
  const s = state();
  const r = op(s, ctx());
  const inverse = D.invertEdits(s, r.edits);
  optimistic(s, r.edits);
  if (r.edits.length) void applyEdits(r.edits).catch((e) => console.warn('write failed', e));
  return { result: r.result, undo: () => { if (inverse.length) void applyEdits(inverse); } };
}

// ------------------------------------------------------------------ tasks

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
}

export const createTask = (input: NewTaskInput): Task => run((s, c) => D.createTask(s, input, c)).result;

export function updateTask(t: Task, patch: Partial<Task>) {
  const { id: _id, completed: _c, ...rest } = patch as any;
  run((s, c) => D.updateTask(s, t.id, rest, c));
}

export function toggleTask(t: Task): { completed: boolean; nextDueDate?: string; undo: () => void } {
  if (t.completed) {
    const r = run((s, c) => D.reopenTask(s, t.id, c));
    return { completed: false, undo: r.undo };
  }
  const r = run((s, c) => D.completeTask(s, t.id, c));
  return { completed: !r.result.nextDueDate, nextDueDate: r.result.nextDueDate ?? undefined, undo: r.undo };
}

export const deleteTask = (t: Task): (() => void) => run((s, c) => D.deleteTask(s, t.id, c)).undo;

export const duplicateTask = (t: Task): Task => createTask({
  title: t.title, description: t.description, dueDate: t.dueDate, dueTime: t.dueTime, priority: t.priority,
  projectId: t.projectId, sectionId: t.sectionId, parentId: t.parentId, labelIds: t.labelIds ?? [], recurrence: t.recurrence,
  duration: t.duration, reminders: t.reminders,
});

export const moveTasks = (ids: string[], to: { projectId?: string | null; sectionId?: string | null }) => run((s, c) => D.moveTasks(s, ids, to, c));

// ------------------------------------------------------------------ projects & sections

export const createProject = (input: { title: string; color?: string; parentId?: string | null; icon?: string | null; view?: 'list' | 'board' }): Project =>
  run((s, c) => D.createProject(s, input, c)).result;

export function updateProject(p: Project, patch: Partial<Project>) {
  const { id: _id, ...rest } = patch as any;
  run((s, c) => D.updateProject(s, p.id, rest, c));
}

export const projectSubtree = (all: Project[], id: string) => D.projectSubtree(all, id);

export function moveProject(siblings: Project[], id: string, dir: -1 | 1) {
  const i = siblings.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  const ids = siblings.map((p) => p.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  run((s) => D.reorderProjects(s, ids));
}

export const deleteProject = (id: string) => run((s, c) => D.deleteProject(s, id, c));
export const projectColor = (p: Pick<Project, 'id' | 'color'>) => colorFor(p.id, p.color);

export const createSection = (projectId: string, name: string) => run((s, c) => D.createSection(s, { projectId, name }, c)).result;
export const updateSection = (id: string, patch: Partial<Section>) => run((s) => D.updateSection(s, id, patch as any));
export const deleteSection = (id: string, deleteTasks = false) => run((s, c) => D.deleteSection(s, id, c, { deleteTasks }));
export const reorderSections = (projectId: string, ids: string[]) => run((s) => D.reorderSections(s, projectId, ids));

// ------------------------------------------------------------------ labels, comments, prefs

export const createLabel = (input: { name: string; color?: string }): Label => run((s, c) => D.createLabel(s, input, c)).result;
export const updateLabel = (l: Label, patch: Partial<Label>) => run((s) => D.updateLabel(s, l.id, patch as any));
export const deleteLabel = (id: string) => run((s) => D.deleteLabel(s, id));

export const addComment = (input: { taskId?: string | null; projectId?: string | null; text: string; authorName?: string | null }) => run((s, c) => D.addComment(s, input, c)).result;
export const deleteComment = (id: string) => run((s) => D.deleteComment(s, id));

export const savePreferences = (patch: Partial<Preferences>) => run((s) => D.savePreferences(s, patch));
export const applyTemplate = (templateId: string, title?: string) => run((s, c) => D.applyTemplate(s, templateId, { title }, c)).result;
export const saveFilter = (input: { id?: string; name: string; query: string; color?: string | null }) => run((s, c) => D.saveFilter(s, input, c)).result;
export const deleteFilter = (id: string) => run((s) => D.deleteFilter(s, id));

/** Quick-add names → ids, creating projects/labels that don't exist yet. */
export function resolveNames(projectName: string | undefined, projectId: string | undefined | null, refs: { id?: string; name: string }[]) {
  let pid = projectId ?? null;
  if (!pid && projectName) {
    const hit = state().projects.find((p) => !p.deleted && p.title.toLowerCase() === projectName.toLowerCase());
    pid = hit ? hit.id : createProject({ title: projectName }).id;
  }
  const labelIds = refs.map((r) => r.id ?? createLabel({ name: r.name }).id);
  return { projectId: pid, labelIds: [...new Set(labelIds)] };
}
