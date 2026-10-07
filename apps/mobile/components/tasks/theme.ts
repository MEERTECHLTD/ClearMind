import type { TaskPriority } from '@clearmind/shared';
import { T } from '../../lib/theme';
import { isOverdue, parseISODate, diffDays } from '@clearmind/shared/tasks';
import type { Task } from '@clearmind/shared';

/** ClearMind priority palette (P1 → P4). */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  High: '#F43F5E',
  Medium: '#F59E0B',
  Low: '#3B82F6',
  None: '#9CA3AF',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  High: 'Priority 1',
  Medium: 'Priority 2',
  Low: 'Priority 3',
  None: 'Priority 4',
};

export const PRIORITY_SHORT: Record<TaskPriority, string> = { High: 'P1', Medium: 'P2', Low: 'P3', None: 'P4' };

export const PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low', 'None'];

/** Theme-aware colours (read at render time; follow Light / Dark / System). */
export const C = {
  get ink() { return T.ink; },
  get muted() { return T.muted; },
  get faint() { return T.faint; },
  get accent() { return T.accent; },
  get hairline() { return T.line; },
  get surface() { return T.card; },
  get surface2() { return T.card2; },
  get bg() { return T.bg; },
  get danger() { return T.danger; },
  get success() { return T.success; },
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
