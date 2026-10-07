/**
 * Read models shared by the apps and the agent layer: global search and
 * compact, agent-friendly task representations.
 */
import type { Task, Project, Label, Section, Comment } from '../types';
import { formatDueDate, describeRecurrence, priorityOf, isOverdue, compareTasks } from '../tasks';

export interface SearchIndex { tasks: Task[]; projects: Project[]; labels: Label[]; sections: Section[]; comments?: Comment[] }

/** Search across tasks (title, description, comments, labels, project, section), projects and labels. */
export function globalSearch(idx: SearchIndex, query: string, opts: { includeCompleted?: boolean; limit?: number } = {}) {
  const terms = query.toLowerCase().split(/\s+/).map((t) => t.replace(/^[#@%]/, '')).filter(Boolean);
  if (!terms.length) return { tasks: [] as Task[], projects: [] as Project[], labels: [] as Label[] };
  const projects = new Map(idx.projects.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const labels = new Map(idx.labels.filter((l) => !l.deleted).map((l) => [l.id, l]));
  const sections = new Map(idx.sections.filter((s) => !s.deleted).map((s) => [s.id, s]));
  const notes = new Map<string, string>();
  for (const c of idx.comments ?? []) if (!c.deleted && c.taskId) notes.set(c.taskId, `${notes.get(c.taskId) ?? ''} ${c.text}`);
  const hay = (t: Task) => [
    t.title, t.description ?? '', notes.get(t.id) ?? '',
    t.projectId ? projects.get(t.projectId)?.title ?? '' : 'inbox',
    t.sectionId ? sections.get(t.sectionId)?.name ?? '' : '',
    ...(t.labelIds ?? []).map((id) => labels.get(id)?.name ?? ''),
  ].join(' \u0000 ').toLowerCase();
  const tasks = idx.tasks
    .filter((t) => !t.deleted && (opts.includeCompleted || !t.completed))
    .filter((t) => { const h = hay(t); return terms.every((w) => h.includes(w)); })
    .sort((a, b) => Number(a.completed) - Number(b.completed) || compareTasks(a, b))
    .slice(0, opts.limit ?? 200);
  const pr = [...projects.values()].filter((p) => terms.every((w) => `${p.title} ${p.description ?? ''}`.toLowerCase().includes(w)));
  const lb = [...labels.values()].filter((l) => terms.every((w) => l.name.toLowerCase().includes(w)));
  return { tasks, projects: pr, labels: lb };
}

/** Compact, self-describing task representation for agents/API/CLI. */
export function describeTask(t: Task, ctx: { projects: Map<string, Project>; labels: Map<string, Label>; sections: Map<string, Section>; now?: Date }) {
  return {
    id: t.id,
    title: t.title,
    description: t.description || undefined,
    completed: !!t.completed,
    priority: ({ High: 'p1', Medium: 'p2', Low: 'p3', None: 'p4' } as const)[priorityOf(t)],
    due: t.dueDate ? { date: t.dueDate, time: t.dueTime || undefined, timezone: t.timezone || undefined, human: formatDueDate(t.dueDate, ctx.now) } : undefined,
    overdue: isOverdue(t, ctx.now) || undefined,
    recurrence: t.recurrence ? describeRecurrence(t.recurrence) : undefined,
    project: t.projectId ? ctx.projects.get(t.projectId)?.title ?? null : 'Inbox',
    projectId: t.projectId ?? null,
    section: t.sectionId ? ctx.sections.get(t.sectionId)?.name ?? null : undefined,
    sectionId: t.sectionId || undefined,
    parentId: t.parentId || undefined,
    labels: (t.labelIds ?? []).map((id) => ctx.labels.get(id)?.name).filter(Boolean),
    duration: t.duration || undefined,
    reminders: t.reminders?.length ? t.reminders : undefined,
    kind: t.kind && t.kind !== 'task' ? t.kind : undefined,
    createdAt: t.createdAt || undefined,
    completedAt: t.completedAt || undefined,
    source: t.source || undefined,
    agent: t.agent || undefined,
  };
}
