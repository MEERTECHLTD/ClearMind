/**
 * Task / project / label commands for the web task layer. Same rules as the
 * mobile app (shared/tasks): completing cascades to sub-tasks, recurring tasks
 * roll forward, delete removes sub-tasks, and every destructive change returns
 * an undo. Writes are optimistic; the cloud push is never awaited by the UI.
 * Browser reminders come from services/notificationService (it watches
 * dueDate/dueTime + `notified`), so a reschedule resets `notified`.
 */
import type { Label, Project, Task, TaskPriority, TaskRecurrence } from '../../types';
import { completeTask, uncompleteTask, deletionSet, LIST_COLORS, colorFor } from '../../shared/tasks';
import { STORES } from '../../services/db';
import { getStore } from './store';

const tasks = () => getStore<Task>(STORES.TASKS);
const projects = () => getStore<Project>(STORES.PROJECTS);
const labels = () => getStore<Label>(STORES.LABELS);

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const nowISO = () => new Date().toISOString();

function persist(p: Promise<void>, what: string) {
  p.catch((e) => console.warn(`${what} failed:`, e));
}

const scheduleKey = (t: Task) => `${t.dueDate ?? ''}|${t.dueTime ?? ''}`;

function save(list: Task[], what: string, before?: Map<string, Task>) {
  const out = list.map((t) => {
    const prev = before?.get(t.id);
    // A new date/time should notify again.
    return prev && scheduleKey(prev) !== scheduleKey(t) ? { ...t, notified: false } : t;
  });
  persist(tasks().putMany(out), what);
}

// ------------------------------------------------------------------ tasks

export interface NewTaskInput {
  title: string;
  description?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: TaskPriority;
  projectId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  recurrence?: TaskRecurrence | null;
}

export function createTask(input: NewTaskInput): Task {
  const all = tasks().getSnapshot().items;
  const t: Task = {
    id: newId(),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    completed: false,
    priority: input.priority ?? 'None',
    dueDate: input.dueDate || undefined,
    dueTime: (input.dueDate && input.dueTime) || undefined,
    projectId: input.projectId ?? null,
    parentId: input.parentId ?? null,
    labelIds: input.labelIds ?? [],
    recurrence: input.recurrence ?? null,
    taskNumber: all.reduce((m, x) => Math.max(m, x.taskNumber || 0), 0) + 1,
    order: Date.now(),
    createdAt: nowISO(),
    completedAt: null,
    notified: false,
  };
  save([t], 'create task');
  return t;
}

export function updateTask(t: Task, patch: Partial<Task>) {
  const next: Task = { ...t, ...patch };
  if (!next.dueDate) { next.dueTime = undefined; next.recurrence = null; }
  save([next], 'update task', new Map([[t.id, t]]));
}

export function toggleTask(t: Task): { completed: boolean; nextDueDate?: string; undo: () => void } {
  const all = tasks().getSnapshot().items;
  const before = new Map(all.map((x) => [x.id, x]));
  const changed = t.completed ? uncompleteTask(t, all) : completeTask(t, all).changed;
  const nextDueDate = t.completed ? undefined : completeTask(t, all).nextDueDate;
  save(changed, t.completed ? 'restore task' : 'complete task', before);
  const prior = changed.map((c) => before.get(c.id)!).filter(Boolean);
  return {
    completed: !t.completed && !nextDueDate,
    nextDueDate,
    undo: () => save(prior, 'undo', new Map(changed.map((c) => [c.id, c]))),
  };
}

export function deleteTask(t: Task): () => void {
  const all = tasks().getSnapshot().items;
  const ids = new Set(deletionSet(t, all));
  const removed = all.filter((x) => ids.has(x.id));
  persist(tasks().removeMany([...ids]), 'delete task');
  // The cloud doc is overwritten whole, so clear the tombstone explicitly.
  return () => save(removed.map((x) => ({ ...x, deleted: false, deletedAt: null } as Task)), 'undo delete');
}

export function duplicateTask(t: Task): Task {
  return createTask({
    title: t.title, description: t.description, dueDate: t.dueDate, dueTime: t.dueTime, priority: t.priority,
    projectId: t.projectId, parentId: t.parentId, labelIds: t.labelIds ?? [], recurrence: t.recurrence,
  });
}

// ------------------------------------------------------------------ projects

export function createProject(input: { title: string; color?: string; parentId?: string | null }): Project {
  const all = projects().getSnapshot().items;
  const p: Project = {
    id: newId(),
    title: input.title.trim(),
    description: '',
    status: 'In Progress',
    progress: 0,
    tags: [],
    color: input.color ?? LIST_COLORS[all.length % LIST_COLORS.length].hex,
    parentId: input.parentId ?? null,
    order: all.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1,
    archived: false,
    createdAt: nowISO(),
  };
  persist(projects().putMany([p]), 'create project');
  return p;
}

export function updateProject(p: Project, patch: Partial<Project>) {
  persist(projects().putMany([{ ...p, ...patch }]), 'update project');
}

export function projectSubtree(all: Project[], id: string): string[] {
  const out = [id];
  const seen = new Set(out);
  for (let k = 0; k < out.length; k++) {
    for (const p of all) if (p.parentId === out[k] && !seen.has(p.id)) { seen.add(p.id); out.push(p.id); }
  }
  return out;
}

export function moveProject(siblings: Project[], id: string, dir: -1 | 1) {
  const i = siblings.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  const ordered = siblings.map((p, k) => ({ ...p, order: k + 1 }));
  [ordered[i].order, ordered[j].order] = [ordered[j].order, ordered[i].order];
  persist(projects().putMany(ordered), 'reorder projects');
}

export function deleteProject(id: string) {
  const ids = new Set(projectSubtree(projects().getSnapshot().items, id));
  const doomed = tasks().getSnapshot().items.filter((t) => t.projectId && ids.has(t.projectId));
  persist(tasks().removeMany(doomed.map((t) => t.id)), 'delete project tasks');
  persist(projects().removeMany([...ids]), 'delete project');
}

export const projectColor = (p: Pick<Project, 'id' | 'color'>) => colorFor(p.id, p.color);

// ------------------------------------------------------------------ labels

export function createLabel(input: { name: string; color?: string }): Label {
  const all = labels().getSnapshot().items;
  const l: Label = {
    id: newId(),
    name: input.name.trim().replace(/^[@%]/, '').replace(/\s+/g, '_'),
    color: input.color ?? LIST_COLORS[(all.length + 5) % LIST_COLORS.length].hex,
    order: all.length + 1,
  };
  persist(labels().putMany([l]), 'create label');
  return l;
}

export function updateLabel(l: Label, patch: Partial<Label>) {
  persist(labels().putMany([{ ...l, ...patch }]), 'update label');
}

export function deleteLabel(id: string) {
  const affected = tasks().getSnapshot().items.filter((t) => (t.labelIds ?? []).includes(id));
  persist(tasks().putMany(affected.map((t) => ({ ...t, labelIds: (t.labelIds ?? []).filter((x) => x !== id) }))), 'unlink label');
  persist(labels().removeMany([id]), 'delete label');
}

/** Quick-add names → ids, creating projects/labels that don't exist yet. */
export function resolveNames(projectName: string | undefined, projectId: string | undefined | null, refs: { id?: string; name: string }[]) {
  let pid = projectId ?? null;
  if (!pid && projectName) {
    const hit = projects().getSnapshot().items.find((p) => p.title.toLowerCase() === projectName.toLowerCase());
    pid = hit ? hit.id : createProject({ title: projectName }).id;
  }
  const existing = labels().getSnapshot().items;
  const labelIds = refs.map((r) => r.id ?? existing.find((l) => l.name.toLowerCase() === r.name.toLowerCase())?.id ?? createLabel({ name: r.name }).id);
  return { projectId: pid, labelIds: [...new Set(labelIds)] };
}
