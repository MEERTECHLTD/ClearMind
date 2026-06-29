/**
 * Applications domain helpers — the SINGLE SOURCE OF TRUTH for the option lists,
 * colours, reminder presets and deadline rules used by BOTH the web and mobile
 * Applications views. Platform-agnostic: colours are plain hex (web maps them to
 * inline styles / Tailwind, mobile passes them straight to icon `color` props),
 * and there are NO icon components here so the file is safe to import on either
 * platform. (See DECISIONS.md — shared core.)
 */
import type { Application } from './types';

export type AppType = Application['type'];
export type AppStatus = Application['status'];
export type AppPriority = Application['priority'];

export const APPLICATION_TYPES: { value: AppType; label: string }[] = [
  { value: 'job', label: 'Job' },
  { value: 'grant', label: 'Grant' },
  { value: 'scholarship', label: 'Scholarship' },
  { value: 'other', label: 'Other' },
];

export const APPLICATION_STATUSES: { value: AppStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'closed', label: 'Closed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

export const APPLICATION_PRIORITIES: { value: AppPriority; label: string }[] = [
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
];

// Hex colours (consumed by both platforms). Keep read-time fallbacks at call
// sites so a legacy/out-of-union value renders neutral instead of throwing.
export const TYPE_COLOR: Record<AppType, string> = {
  job: '#3B82F6',
  grant: '#10b981',
  scholarship: '#a855f7',
  other: '#9ca3af',
};

export const STATUS_COLOR: Record<AppStatus, string> = {
  draft: '#9ca3af',
  open: '#60a5fa',
  submitted: '#c084fc',
  closed: '#fbbf24',
  accepted: '#34d399',
  rejected: '#f87171',
};

export const STATUS_LABEL: Record<AppStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  submitted: 'Submitted',
  closed: 'Closed',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

// Pipeline/board column order (the "stages" reuse the existing status axis —
// no separate `stage` field, which would duplicate `status`).
export const STATUS_BOARD_ORDER: AppStatus[] = [
  'draft',
  'open',
  'submitted',
  'accepted',
  'rejected',
  'closed',
];

// Statuses where a deadline reminder no longer makes sense.
export const REMINDER_SKIP_STATUSES: AppStatus[] = ['submitted', 'closed', 'accepted', 'rejected'];

export const priorityValue = (p?: AppPriority): number =>
  p === 'High' ? 3 : p === 'Medium' ? 2 : p === 'Low' ? 1 : 0;

// ---- Progressive-disclosure rules (which detail fields a type surfaces) ----
export const showGrantFields = (type: AppType): boolean => type === 'grant' || type === 'scholarship';
export const showFunderField = (type: AppType): boolean => type === 'grant';

// ---- Deadline helpers ----
export const DEFAULT_REMINDER_LEAD_DAYS: number[] = [7, 3, 1];

// The single date that drives reminders + the "soon" highlight.
export const applicationDeadline = (
  app: Pick<Application, 'submissionDeadline' | 'closingDate'>
): string | undefined => app.submissionDeadline || app.closingDate;

export const isReminderEligible = (app: Application): boolean =>
  !REMINDER_SKIP_STATUSES.includes(app.status) && !!applicationDeadline(app);

const toDeadlineDate = (deadline: string): Date =>
  new Date(deadline.length === 10 ? `${deadline}T23:59:59` : deadline);

export const daysUntil = (deadline?: string): number | null => {
  if (!deadline) return null;
  const d = toDeadlineDate(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

export const isDeadlineSoon = (deadline?: string, withinDays = 7): boolean => {
  const n = daysUntil(deadline);
  return n !== null && n >= 0 && n <= withinDays;
};

// "due today", "in 3 days", "2 days ago" — null if no/invalid date.
export const relativeDeadline = (deadline?: string): string | null => {
  const n = daysUntil(deadline);
  if (n === null) return null;
  if (n === 0) return 'due today';
  if (n === 1) return 'in 1 day';
  if (n > 1) return `in ${n} days`;
  if (n === -1) return '1 day ago';
  return `${Math.abs(n)} days ago`;
};

// ---- Reminder lead-time presets (shared picker) ----
export const REMINDER_PRESETS: { key: string; label: string; days: number[] }[] = [
  { key: 'off', label: 'Off', days: [] },
  { key: '1', label: '1 day before', days: [1] },
  { key: '3-1', label: '3 & 1 days before', days: [3, 1] },
  { key: '7-3-1', label: '1 week · 3 days · 1 day', days: [7, 3, 1] },
  { key: '14-7-1', label: '2 weeks · 1 week · 1 day', days: [14, 7, 1] },
];

const DEFAULT_PRESET = REMINDER_PRESETS[3]; // 7-3-1

const sortedDesc = (a: number[]): number[] => [...a].sort((x, y) => y - x);

// Map a lead-day array onto a preset key (for the Select's current value).
export const reminderPresetKey = (days?: number[]): string => {
  const v = sortedDesc(days ?? DEFAULT_REMINDER_LEAD_DAYS);
  const match = REMINDER_PRESETS.find(
    (p) => p.days.length === v.length && sortedDesc(p.days).every((d, i) => d === v[i])
  );
  return match ? match.key : DEFAULT_PRESET.key;
};

export const reminderDaysForKey = (key: string): number[] =>
  (REMINDER_PRESETS.find((p) => p.key === key) ?? DEFAULT_PRESET).days.slice();
