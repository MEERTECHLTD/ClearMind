/**
 * Project plan model (pure, unit-tested): plan fields on the shared Project
 * record, the plan form, and how it merges onto a project without touching its
 * task-list fields. UI lives in plan.tsx.
 */
import type { Project, ProjectCategory } from '@clearmind/shared';

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
export const formatDate = (dateStr?: string): string | null => {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return dateStr;
};

export const csvToList = (v: string): string[] => v.split(',').map((s) => s.trim()).filter(Boolean);
export const listToCsv = (v?: string[]): string => (v && v.length ? v.join(', ') : '');

/** True when the project carries any planning data beyond the task-list basics. */
export function hasPlan(p: Project): boolean {
  return !!(
    p.category || p.priority || p.healthStatus || p.deadline || p.startDate || p.projectManager || p.team?.length ||
    p.stakeholders?.length || p.reportingStructure || p.totalBudget || p.implementationPlan?.phases?.length ||
    p.risks?.length || p.projectMilestones?.length || p.teamCheckIns?.length || (p.status && p.status !== 'Not Started' && p.status !== 'Planning')
  );
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
}

export const emptyForm = (): PlanForm => ({
  title: '', description: '', status: 'Planning', priority: 'Medium', category: '',
  progress: 0, startDate: undefined, deadline: undefined, healthStatus: 'On Track',
  projectManager: '', team: '', stakeholders: '', tags: '', reportingStructure: '', notes: '',
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
});

/**
 * Apply the plan form onto a project. Editing spreads the existing record FIRST
 * so task-list fields (color, parent, order, view, sections) and the deferred
 * sub-entities (phases/risks/resources/metrics/check-ins/alignments/milestones)
 * survive the edit.
 */
export function applyPlanForm(base: Project | null, f: PlanForm, id: string): Project {
  const now = new Date().toISOString();
  const fields = {
    title: f.title.trim(),
    description: f.description.trim(),
    status: f.status,
    progress: Math.round(f.progress),
    priority: f.priority,
    category: (f.category || undefined) as ProjectCategory | undefined,
    startDate: f.startDate,
    deadline: f.deadline,
    healthStatus: f.healthStatus,
    projectManager: f.projectManager.trim() || undefined,
    team: csvToList(f.team),
    stakeholders: csvToList(f.stakeholders),
    tags: csvToList(f.tags),
    reportingStructure: f.reportingStructure.trim() || undefined,
    notes: f.notes.trim() || undefined,
  };
  if (base) return { ...base, ...fields, updatedAt: now };
  return { id, ...fields, projectMilestones: [], teamCheckIns: [], createdAt: now, updatedAt: now };
}

