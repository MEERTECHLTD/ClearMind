/**
 * Pure task state transitions. Each returns the full list of records that must
 * be written, so the caller persists exactly what changed (and nothing more).
 */
import type { Task } from '../types';
import { nextOccurrence, normalizeRecurrence } from './recurrence';
import { descendantIds } from './selectors';
import { todayISO } from './dates';

export interface CompleteResult {
  changed: Task[];
  /** Set when a recurring task rolled forward instead of completing. */
  nextDueDate?: string;
}

export function completeTask(task: Task, all: Task[], now: Date = new Date()): CompleteResult {
  const stamp = now.toISOString();
  const rule = normalizeRecurrence(task.recurrence);
  const byId = new Map(all.map((t) => [t.id, t]));
  const subs = descendantIds(all, task.id).map((id) => byId.get(id)!).filter(Boolean);

  const nextDueDate = rule ? nextOccurrence(rule, task.dueDate ?? todayISO(now), now) : null;
  if (rule && nextDueDate) {
    // Roll forward and reset the checklist for the next occurrence.
    return {
      nextDueDate,
      changed: [
        { ...task, dueDate: nextDueDate, completed: false, completedAt: null, notified: false },
        ...subs.filter((s) => s.completed).map((s) => ({ ...s, completed: false, completedAt: null })),
      ],
    };
  }
  return {
    changed: [
      { ...task, completed: true, completedAt: stamp },
      ...subs.filter((s) => !s.completed).map((s) => ({ ...s, completed: true, completedAt: stamp })),
    ],
  };
}

/** Restore a task; completed ancestors are reopened too so it's visible again. */
export function uncompleteTask(task: Task, all: Task[]): Task[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  const out: Task[] = [{ ...task, completed: false, completedAt: null }];
  const seen = new Set([task.id]);
  let parent = task.parentId ? byId.get(task.parentId) : undefined;
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    if (parent.completed) out.push({ ...parent, completed: false, completedAt: null });
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return out;
}

/** Ids to delete with a task (the task + every descendant). */
export function deletionSet(task: Task, all: Task[]): string[] {
  return [task.id, ...descendantIds(all, task.id)];
}
