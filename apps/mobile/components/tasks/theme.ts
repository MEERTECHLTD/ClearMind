import type { TaskPriority } from '@clearmind/shared';
import { isOverdue, parseISODate, diffDays } from '@clearmind/shared/tasks';
import type { Task } from '@clearmind/shared';

/** ClearMind priority palette (P1 → P4). */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  High: '#F43F5E',
  Medium: '#F59E0B',
  Low: '#3B82F6',
  None: '#6B7280',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  High: 'Priority 1',
  Medium: 'Priority 2',
  Low: 'Priority 3',
  None: 'Priority 4',
};

export const PRIORITY_SHORT: Record<TaskPriority, string> = { High: 'P1', Medium: 'P2', Low: 'P3', None: 'P4' };

export const PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low', 'None'];

export const C = {
  ink: '#e2e8f0',
  muted: '#9ca3af',
  faint: '#6b7280',
  accent: '#3B82F6',
  hairline: '#1f2937',
  surface: '#0F1219',
  surface2: '#1A1F2E',
  bg: '#05050A',
  danger: '#F87171',
  success: '#10B981',
  today: '#22C55E',
  tomorrow: '#F59E0B',
  week: '#A78BFA',
};

/** Colour for a due-date chip: overdue red, today green, tomorrow amber, this week violet. */
export function dueColor(t: Pick<Task, 'dueDate' | 'dueTime'> & { completed?: boolean }, now: Date = new Date()): string {
  if (isOverdue({ completed: false, ...t } as Task, now)) return C.danger;
  const d = parseISODate(t.dueDate);
  if (!d) return C.muted;
  const delta = diffDays(now, d);
  if (delta === 0) return C.today;
  if (delta === 1) return C.tomorrow;
  if (delta > 1 && delta < 7) return C.week;
  return C.muted;
}
