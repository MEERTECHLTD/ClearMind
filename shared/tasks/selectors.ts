/**
 * Pure view selectors for the task layer (Inbox / Today / Upcoming / project /
 * label / search / completed). Screens stay thin; this logic is unit-tested.
 */
import type { Label, Project, Task, TaskPriority } from '../types';
import { addDays, parseISODate, startOfDay, toISODate } from './dates';

export const PRIORITY_RANK: Record<TaskPriority, number> = { High: 1, Medium: 2, Low: 3, None: 4 };

/** Tolerates legacy / null / unknown values (treated as P4). */
export const priorityOf = (t: Pick<Task, 'priority'>): TaskPriority =>
  t.priority && t.priority in PRIORITY_RANK ? t.priority : 'None';

export const priorityLevel = (p: TaskPriority): 1 | 2 | 3 | 4 => PRIORITY_RANK[p] as 1 | 2 | 3 | 4;
export const priorityFromLevel = (n: number): TaskPriority => (['High', 'Medium', 'Low', 'None'] as TaskPriority[])[n - 1] ?? 'None';

export const isSubtask = (t: Task) => !!t.parentId;
export const isOpen = (t: Task) => !t.completed;

export function isOverdue(t: Task, now: Date = new Date()): boolean {
  if (t.completed || !t.dueDate) return false;
  const today = toISODate(now);
  if (t.dueDate < today) return true;
  if (t.dueDate === today && t.dueTime) {
    const [h, m] = t.dueTime.split(':').map(Number);
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0);
    return due.getTime() < now.getTime();
  }
  return false;
}

/** Default ordering: date → time → priority → manual order → creation. */
export function compareTasks(a: Task, b: Task): number {
  const da = a.dueDate ?? '9999-99-99';
  const db = b.dueDate ?? '9999-99-99';
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.dueTime ?? '99:99';
  const tb = b.dueTime ?? '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  const pa = PRIORITY_RANK[priorityOf(a)];
  const pb = PRIORITY_RANK[priorityOf(b)];
  if (pa !== pb) return pa - pb;
  const oa = a.order ?? Number.MAX_SAFE_INTEGER;
  const ob = b.order ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return (a.createdAt ?? a.id).localeCompare(b.createdAt ?? b.id);
}

/** Manual-first ordering used inside a project / the Inbox. */
export function compareByOrder(a: Task, b: Task): number {
  const oa = a.order ?? Number.MAX_SAFE_INTEGER;
  const ob = b.order ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return compareTasks(a, b);
}

export type ProjectLookup = Map<string, Project>;

/** Tasks whose project no longer exists (deleted elsewhere) fall back to the Inbox. */
export function effectiveProjectId(t: Task, projects: ProjectLookup): string | null {
  return t.projectId && projects.has(t.projectId) ? t.projectId : null;
}

export function inboxTasks(tasks: Task[], projects: ProjectLookup): Task[] {
  return tasks.filter((t) => isOpen(t) && !isSubtask(t) && effectiveProjectId(t, projects) === null).sort(compareByOrder);
}

export function projectTasks(tasks: Task[], projectId: string): Task[] {
  return tasks.filter((t) => isOpen(t) && !isSubtask(t) && t.projectId === projectId).sort(compareByOrder);
}

export function labelTasks(tasks: Task[], labelId: string): Task[] {
  return tasks.filter((t) => isOpen(t) && (t.labelIds ?? []).includes(labelId)).sort(compareTasks);
}

/** Today view: overdue + due today (subtasks included — they're dated work). */
export function todayView(tasks: Task[], now: Date = new Date()): { overdue: Task[]; today: Task[] } {
  const today = toISODate(now);
  const open = tasks.filter((t) => isOpen(t) && t.dueDate);
  return {
    overdue: open.filter((t) => t.dueDate! < today).sort(compareTasks),
    today: open.filter((t) => t.dueDate === today).sort(compareTasks),
  };
}

export interface DayGroup { date: string; tasks: Task[] }

/** Upcoming: one group per day for `days` days from `from` (empty days included). */
export function upcomingView(tasks: Task[], from: Date, days: number): DayGroup[] {
  const start = startOfDay(from);
  const end = toISODate(addDays(start, days - 1));
  const startISO = toISODate(start);
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!isOpen(t) || !t.dueDate || t.dueDate < startISO || t.dueDate > end) continue;
    const arr = byDay.get(t.dueDate) ?? [];
    arr.push(t);
    byDay.set(t.dueDate, arr);
  }
  const out: DayGroup[] = [];
  for (let i = 0; i < days; i++) {
    const d = toISODate(addDays(start, i));
    out.push({ date: d, tasks: (byDay.get(d) ?? []).sort(compareTasks) });
  }
  return out;
}

export function subtasksOf(tasks: Task[], parentId: string): Task[] {
  return tasks.filter((t) => t.parentId === parentId).sort((a, b) => Number(a.completed) - Number(b.completed) || compareByOrder(a, b));
}

/** All descendant ids (subtasks of subtasks…), cycle-safe. */
export function descendantIds(tasks: Task[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const t of tasks) if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t.id]);
  const out: string[] = [];
  const seen = new Set([rootId]);
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** Completed tasks, most recently completed first. */
export function completedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.completed)
    .sort((a, b) => (b.completedAt ?? b.createdAt ?? '').localeCompare(a.completedAt ?? a.createdAt ?? ''));
}

/** Case-insensitive search across title, description, project name and label names. */
export function searchTasks(
  tasks: Task[], query: string, projects: ProjectLookup, labels: Map<string, Label>, includeCompleted = false,
): Task[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return tasks
    .filter((t) => includeCompleted || !t.completed)
    .filter((t) => {
      const hay = [
        t.title,
        t.description ?? '',
        t.projectId ? projects.get(t.projectId)?.title ?? '' : 'inbox',
        ...(t.labelIds ?? []).map((id) => labels.get(id)?.name ?? ''),
      ].join(' \u0000 ').toLowerCase();
      return terms.every((term) => hay.includes(term.replace(/^[#@%]/, '')));
    })
    .sort((a, b) => Number(a.completed) - Number(b.completed) || compareTasks(a, b));
}

/** Projects visible in lists: not archived, ordered, children after parents. */
export function orderedProjects(projects: Project[], includeArchived = false): { project: Project; depth: number }[] {
  const visible = projects.filter((p) => includeArchived || !p.archived);
  const ids = new Set(visible.map((p) => p.id));
  const byParent = new Map<string | null, Project[]>();
  for (const p of visible) {
    const parent = p.parentId && ids.has(p.parentId) && p.parentId !== p.id ? p.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), p]);
  }
  const sortFn = (a: Project, b: Project) =>
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title);
  const out: { project: Project; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const p of (byParent.get(parent) ?? []).sort(sortFn)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ project: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans from parent cycles (A→B→A) — surface them at top level.
  for (const p of visible) if (!seen.has(p.id)) out.push({ project: p, depth: 0 });
  return out;
}

/** Open (top-level + sub) task counts per project id; key null = Inbox. */
export function openCounts(tasks: Task[], projects: ProjectLookup): Map<string | null, number> {
  const m = new Map<string | null, number>();
  for (const t of tasks) {
    if (t.completed) continue;
    const k = effectiveProjectId(t, projects);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export const isValidISODate = (s?: string | null) => !!parseISODate(s);
