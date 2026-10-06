/**
 * Task / project / label commands for the Todoist-style task layer.
 *
 * All writes go through the shared collection stores (optimistic across every
 * screen, then sqlite + cloud). Callers must NOT await these for UI flow: the
 * cloud push inside dbService.put can wait on the network while offline. The
 * local sqlite write happens first, so data is safe on-device immediately.
 *
 * Ids are generated client-side once per create, so a retried/duplicated write
 * is an idempotent upsert of the same record — never a duplicate task.
 */
import type { Label, Project, Task, TaskPriority, TaskRecurrence } from '@clearmind/shared';
import {
  completeTask, uncompleteTask, deletionSet, LIST_COLORS, colorFor,
} from '@clearmind/shared/tasks';
import { getStore } from '../lib/collectionStore';
import { newId } from '../lib/id';
import { getFlag } from '../lib/flags';
import { logWarn } from '../lib/logger';
import { STORES } from './db';
import { scheduleReminder, cancelReminder, toDateTime } from './notifications';

/** Tasks carry the device-local notification id so we can cancel/reschedule it. */
export type MTask = Task & { reminderId?: string | null };

const tasks = () => getStore<MTask>(STORES.TASKS);
const projects = () => getStore<Project>(STORES.PROJECTS);
const labels = () => getStore<Label>(STORES.LABELS);

const nowISO = () => new Date().toISOString();

/** Persist without blocking the UI; local failures are logged (store rolls back). */
function persist(p: Promise<void>, what: string) {
  p.catch((e) => logWarn(`${what} failed: ${String(e)}`));
}

// ---------------------------------------------------------------- reminders

/** Only touch notifications when something that affects them changed. */
const reminderKey = (t: MTask) => `${t.completed}|${t.dueDate ?? ''}|${t.dueTime ?? ''}|${t.title}`;

/**
 * Reconcile the device notification for a task AFTER it was saved. Runs off the
 * UI path (the first call may show the OS permission prompt). The new id is
 * written local-only: notification ids are meaningless on other devices.
 */
async function syncReminder(t: MTask) {
  try {
    await cancelReminder(t.reminderId);
    let reminderId: string | null = null;
    if (getFlag('reminders') && !t.completed && t.dueDate) {
      const when = toDateTime(t.dueDate, t.dueTime);
      if (when) reminderId = await scheduleReminder('Task due', t.title, when);
    }
    const current = tasks().getSnapshot().items.find((x) => x.id === t.id);
    if (current && reminderKey(current) === reminderKey(t)) {
      await tasks().patchLocal(t.id, { reminderId });
    } else if (reminderId) {
      await cancelReminder(reminderId); // edited again meanwhile; that save reschedules
    }
  } catch (e) {
    logWarn(`reminder sync failed: ${String(e)}`);
  }
}

/** Optimistic save of every changed task, then reminder reconciliation. */
async function save(list: MTask[], what: string, previous?: Map<string, MTask>) {
  persist(tasks().putMany(list), what);
  for (const t of list) {
    const prev = previous?.get(t.id);
    if (!prev || reminderKey(prev) !== reminderKey(t)) void syncReminder(t);
  }
}

// ---------------------------------------------------------------- tasks

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

export async function createTask(input: NewTaskInput): Promise<MTask> {
  const all = tasks().getSnapshot().items;
  const t: MTask = {
    id: newId(),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    completed: false,
    priority: input.priority ?? 'None',
    dueDate: input.dueDate || undefined,
    dueTime: (input.dueDate && input.dueTime) || undefined,
    projectId: input.projectId ?? null,
    parentId: input.parentId ?? null,
    labelIds: input.labelIds?.length ? input.labelIds : [],
    recurrence: input.recurrence ?? null,
    taskNumber: all.reduce((m, x) => Math.max(m, x.taskNumber || 0), 0) + 1,
    order: Date.now(),
    createdAt: nowISO(),
    completedAt: null,
    notified: false,
  };
  await save([t], 'create task');
  return t;
}

export async function updateTask(t: MTask, patch: Partial<MTask>): Promise<void> {
  const next: MTask = { ...t, ...patch };
  if (!next.dueDate) {
    next.dueTime = undefined;
  }
  await save([next], 'update task', new Map([[t.id, t]]));
}

/** Complete (or roll a recurring task forward). Returns what happened for the toast. */
export async function toggleTask(t: MTask): Promise<{ completed: boolean; nextDueDate?: string; undo: () => void }> {
  const all = tasks().getSnapshot().items;
  const before = new Map(all.map((x) => [x.id, x]));
  if (t.completed) {
    const changed = uncompleteTask(t, all) as MTask[];
    await save(changed, 'restore task', before);
    return { completed: false, undo: () => void save(changed.map((c) => before.get(c.id)!).filter(Boolean), 'undo restore', new Map(changed.map((c) => [c.id, c]))) };
  }
  const { changed, nextDueDate } = completeTask(t, all);
  await save(changed as MTask[], 'complete task', before);
  const prior = changed.map((c) => before.get(c.id)!).filter(Boolean);
  return {
    completed: !nextDueDate,
    nextDueDate,
    undo: () => void save(prior, 'undo complete', new Map(changed.map((c) => [c.id, c as MTask]))),
  };
}

/** Delete a task and its subtasks. Returns an undo that restores them. */
export async function deleteTask(t: MTask): Promise<() => void> {
  const all = tasks().getSnapshot().items;
  const ids = new Set(deletionSet(t, all));
  const removed = all.filter((x) => ids.has(x.id));
  await Promise.all(removed.map((x) => cancelReminder(x.reminderId)));
  persist(tasks().removeMany([...ids]), 'delete task');
  return () => {
    // Explicitly clear the tombstone fields: the cloud doc is overwritten whole.
    const restored = removed.map((x) => ({ ...x, deleted: false, deletedAt: null, reminderId: null } as MTask));
    void save(restored, 'undo delete');
  };
}

export function duplicateTask(t: MTask): Promise<MTask> {
  return createTask({
    title: t.title, description: t.description, dueDate: t.dueDate, dueTime: t.dueTime, priority: t.priority,
    projectId: t.projectId, parentId: t.parentId, labelIds: t.labelIds ?? [], recurrence: t.recurrence,
  });
}

// ---------------------------------------------------------------- projects

export function createProject(input: { title: string; color?: string; parentId?: string | null }): Project {
  const all = projects().getSnapshot().items;
  const now = nowISO();
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
    createdAt: now,
  };
  persist(projects().put(p), 'create project');
  return p;
}

export function updateProject(p: Project, patch: Partial<Project>) {
  persist(projects().put({ ...p, ...patch }), 'update project');
}

/** Swap order with the visible sibling above/below. */
export function moveProject(list: Project[], id: string, dir: -1 | 1) {
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  // Normalise orders first so equal/missing orders can still swap.
  const ordered = list.map((p, k) => ({ ...p, order: k + 1 }));
  const a = ordered[i];
  const b = ordered[j];
  [a.order, b.order] = [b.order, a.order];
  persist(projects().putMany(ordered.filter((p, k) => p.order !== list[k].order || k === i || k === j)), 'reorder projects');
}

/** Project ids in the subtree rooted at `id` (inclusive). */
export function projectSubtree(all: Project[], id: string): string[] {
  const out = [id];
  const seen = new Set(out);
  for (let k = 0; k < out.length; k++) {
    for (const p of all) if (p.parentId === out[k] && !seen.has(p.id)) { seen.add(p.id); out.push(p.id); }
  }
  return out;
}

/** Delete a project, its sub-projects and every task in them. */
export async function deleteProject(id: string) {
  const ids = new Set(projectSubtree(projects().getSnapshot().items, id));
  const doomed = tasks().getSnapshot().items.filter((t) => t.projectId && ids.has(t.projectId));
  await Promise.all(doomed.map((t) => cancelReminder(t.reminderId)));
  persist(tasks().removeMany(doomed.map((t) => t.id)), 'delete project tasks');
  persist(projects().removeMany([...ids]), 'delete project');
}

export function projectColor(p: Pick<Project, 'id' | 'color'>) {
  return colorFor(p.id, p.color);
}

// ---------------------------------------------------------------- labels

export function createLabel(input: { name: string; color?: string }): Label {
  const all = labels().getSnapshot().items;
  const l: Label = {
    id: newId(),
    name: input.name.trim().replace(/^[@%]/, ''),
    color: input.color ?? LIST_COLORS[(all.length + 5) % LIST_COLORS.length].hex,
    order: all.length + 1,
  };
  persist(labels().put(l), 'create label');
  return l;
}

export function updateLabel(l: Label, patch: Partial<Label>) {
  persist(labels().put({ ...l, ...patch }), 'update label');
}

export function deleteLabel(id: string) {
  const affected = tasks().getSnapshot().items.filter((t) => (t.labelIds ?? []).includes(id));
  persist(tasks().putMany(affected.map((t) => ({ ...t, labelIds: (t.labelIds ?? []).filter((x) => x !== id) }))), 'unlink label');
  persist(labels().remove(id), 'delete label');
}

/** Resolve quick-add names to ids, creating projects/labels that don't exist yet. */
export function resolveNames(projectName: string | undefined, projectId: string | undefined, labelRefs: { id?: string; name: string }[]) {
  let pid = projectId ?? null;
  if (!pid && projectName) {
    const existing = projects().getSnapshot().items.find((p) => p.title.toLowerCase() === projectName.toLowerCase());
    pid = existing ? existing.id : createProject({ title: projectName }).id;
  }
  const allLabels = labels().getSnapshot().items;
  const labelIds = labelRefs.map((r) => {
    if (r.id) return r.id;
    const existing = allLabels.find((l) => l.name.toLowerCase() === r.name.toLowerCase());
    return existing ? existing.id : createLabel({ name: r.name }).id;
  });
  return { projectId: pid, labelIds: [...new Set(labelIds)] };
}
