/**
 * Project plan model (pure, unit-tested), shared by web and mobile. The planner and the task
 * workspace are the SAME `Project` record in the same `projects` store: plan
 * fields (status, health, dates, team, phases, risks…) sit next to the
 * task-list fields (colour, parent, order, view, sections).
 */
import type { Project, ProjectCategory } from '../types';

export type Status = Project['status'];
export type Priority = NonNullable<Project['priority']>;
export type Health = NonNullable<Project['healthStatus']>;
export type BadgeTone = 'accent' | 'green' | 'amber' | 'red' | 'muted';

export const STATUSES: Status[] = ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
export const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low'];
export const HEALTHS: Health[] = ['On Track', 'At Risk', 'Off Track'];
export const CLOSED_STATUSES: Status[] = ['Completed', 'Cancelled'];

export const STATUS_TONE: Record<Status, BadgeTone> = {
  'Completed': 'green', 'On Hold': 'amber', 'Cancelled': 'red', 'Not Started': 'muted', 'Planning': 'accent', 'In Progress': 'accent',
};
export const PRIORITY_TONE: Record<Priority, BadgeTone> = { Critical: 'red', High: 'amber', Medium: 'accent', Low: 'muted' };
export const HEALTH_TONE: Record<Health, BadgeTone> = { 'On Track': 'green', 'At Risk': 'amber', 'Off Track': 'red' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDate = (dateStr?: string | null): string | null => {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return dateStr;
};

export const csvToList = (v: string): string[] => v.split(',').map((s) => s.trim()).filter(Boolean);
export const listToCsv = (v?: string[]): string => (v && v.length ? v.join(', ') : '');

/**
 * True when the project carries planning data beyond the task-list basics.
 * ('In Progress' alone doesn't count: it's the default status of a project
 * created from the task side.)
 */
export function hasPlan(p: Project): boolean {
  return !!(
    p.category || p.priority || p.healthStatus || p.deadline || p.startDate || p.projectManager || p.team?.length ||
    p.stakeholders?.length || p.reportingStructure || p.totalBudget || p.implementationPlan?.phases?.length ||
    p.risks?.length || p.projectMilestones?.length || p.teamCheckIns?.length || p.resources?.length ||
    p.performanceMetrics?.length || p.alignments?.length ||
    (p.status && p.status !== 'Not Started' && p.status !== 'Planning' && p.status !== 'In Progress')
  );
}

/** Live task progress for a project (open vs done top-level tasks). */
export interface TaskProgress { open: number; done: number }
export const taskPct = (t?: TaskProgress | null): number | null => (t && t.open + t.done ? Math.round((t.done / (t.open + t.done)) * 100) : null);

/** Open / done top-level task counts per project. */
export function taskProgressByProject(tasks: { projectId?: string | null; parentId?: string | null; completed?: boolean | null; deleted?: boolean | null }[]): Map<string, TaskProgress> {
  const m = new Map<string, TaskProgress>();
  for (const t of tasks) {
    if (!t.projectId || t.parentId || t.deleted) continue;
    const c = m.get(t.projectId) ?? { open: 0, done: 0 };
    if (t.completed) c.done++; else c.open++;
    m.set(t.projectId, c);
  }
  return m;
}

// ---------------------------------------------------------------- form

export interface PlanForm {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  category: ProjectCategory | '';
  progress: number;
  startDate?: string;
  deadline?: string;
  healthStatus: Health;
  projectManager: string;
  team: string;
  stakeholders: string;
  tags: string;
  reportingStructure: string;
  notes: string;
  /** Total budget (blank = none). Budget resources also add to it. */
  totalBudget: string;
}

export const emptyForm = (): PlanForm => ({
  title: '', description: '', status: 'Planning', priority: 'Medium', category: '',
  progress: 0, startDate: undefined, deadline: undefined, healthStatus: 'On Track',
  projectManager: '', team: '', stakeholders: '', tags: '', reportingStructure: '', notes: '', totalBudget: '',
});

export const formFromProject = (p: Project): PlanForm => ({
  title: p.title,
  description: p.description || '',
  status: p.status ?? 'Planning',
  priority: p.priority ?? 'Medium',
  category: p.category ?? '',
  progress: p.progress ?? 0,
  startDate: p.startDate,
  deadline: p.deadline,
  healthStatus: p.healthStatus ?? 'On Track',
  projectManager: p.projectManager ?? '',
  team: listToCsv(p.team),
  stakeholders: listToCsv(p.stakeholders),
  tags: listToCsv(p.tags),
  reportingStructure: p.reportingStructure ?? '',
  notes: p.notes ?? '',
  totalBudget: p.totalBudget ? String(p.totalBudget) : '',
});

/**
 * Apply the plan form onto a project. Editing spreads the existing record FIRST
 * so task-list fields (color, parent, order, view, sections) and the sub-entities
 * (phases/risks/resources/metrics/check-ins/alignments/milestones) survive.
 */
export function applyPlanForm(base: Project | null, f: PlanForm, id: string): Project {
  const now = new Date().toISOString();
  const budget = Number(f.totalBudget);
  const fields = {
    title: f.title.trim(),
    description: f.description.trim(),
    status: f.status,
    progress: Math.max(0, Math.min(100, Math.round(f.progress))),
    priority: f.priority,
    category: (f.category || undefined) as ProjectCategory | undefined,
    startDate: f.startDate || undefined,
    deadline: f.deadline || undefined,
    healthStatus: f.healthStatus,
    projectManager: f.projectManager.trim() || undefined,
    team: csvToList(f.team),
    stakeholders: csvToList(f.stakeholders),
    tags: csvToList(f.tags),
    reportingStructure: f.reportingStructure.trim() || undefined,
    notes: f.notes.trim() || undefined,
    totalBudget: f.totalBudget.trim() && Number.isFinite(budget) && budget > 0 ? budget : undefined,
  };
  if (base) return { ...base, ...fields, updatedAt: now };
  return { id, ...fields, projectMilestones: [], teamCheckIns: [], createdAt: now, updatedAt: now };
}

/**
 * The plan fields of a project as a field-level patch for the task layer's
 * updateProject (activity + field-level sync). Identity and task-list fields
 * (colour, parent, order, archive, favourite, view) are never touched.
 */
export function planPatch(p: Project): Partial<Project> {
  const rest: Record<string, unknown> = { ...(p as unknown as Record<string, unknown>) };
  for (const k of ['id', 'createdAt', 'color', 'parentId', 'order', 'archived', 'icon', 'favorite', 'view', 'deleted', 'source', '__wsId']) delete rest[k];
  return rest as Partial<Project>;
}
