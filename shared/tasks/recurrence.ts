/**
 * Repeat rules for tasks. Completing a recurring task does not mark it done; it
 * rolls the due date forward to the next occurrence (Todoist-style).
 */
import type { TaskRecurrence } from '../types';
import { addDays, addMonths, parseISODate, toISODate, WEEKDAY_SHORT, WEEKDAY_LONG } from './dates';

const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Normalise a possibly-partial rule from storage (null fields, bad interval). */
export function normalizeRecurrence(r?: TaskRecurrence | null): TaskRecurrence | null {
  if (!r || !r.freq) return null;
  const interval = Math.max(1, Math.floor(Number(r.interval) || 1));
  const weekdays = r.freq === 'weekly' && Array.isArray(r.weekdays) && r.weekdays.length
    ? [...new Set(r.weekdays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
    : null;
  return { freq: r.freq, interval, weekdays };
}

/**
 * Next due date strictly AFTER `fromISO` (the current due date). For daily rules
 * the result is never in the past relative to `today` — a task that's been
 * overdue for a week and repeats daily moves to tomorrow, not to yesterday+1.
 */
export function nextOccurrence(rule: TaskRecurrence, fromISO: string, today: Date = new Date()): string {
  const r = normalizeRecurrence(rule)!;
  const from = parseISODate(fromISO) ?? today;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next: Date;

  const step = (d: Date): Date => {
    switch (r.freq) {
      case 'daily': return addDays(d, r.interval);
      case 'weekly':
        if (r.weekdays && r.weekdays.length) {
          // Next listed weekday after d (interval applies between whole weeks; for
          // interval>1 we jump once the week's list is exhausted).
          for (let i = 1; i <= 7; i++) {
            const c = addDays(d, i);
            if (r.weekdays.includes(c.getDay())) {
              const monIdx = (x: Date) => (x.getDay() + 6) % 7;
              const wrapped = monIdx(c) <= monIdx(d);
              return wrapped && r.interval > 1 ? addDays(c, 7 * (r.interval - 1)) : c;
            }
          }
        }
        return addDays(d, 7 * r.interval);
      case 'monthly': return addMonths(d, r.interval);
      case 'yearly': return addMonths(d, 12 * r.interval);
    }
  };

  next = step(from);
  // Catch up so the next occurrence is today or later (bounded loop).
  for (let guard = 0; next < todayStart && guard < 1000; guard++) next = step(next);
  return toISODate(next);
}

/** First due date for a fresh rule (today if it matches, else the next match). */
export function firstOccurrence(rule: TaskRecurrence, today: Date = new Date()): string {
  const r = normalizeRecurrence(rule)!;
  if (r.freq === 'weekly' && r.weekdays && r.weekdays.length) {
    for (let i = 0; i < 7; i++) {
      const c = addDays(today, i);
      if (r.weekdays.includes(c.getDay())) return toISODate(c);
    }
  }
  return toISODate(today);
}

/** 'Every day', 'Every 2 weeks', 'Every weekday', 'Every Mon, Wed'. */
export function describeRecurrence(rule?: TaskRecurrence | null): string {
  const r = normalizeRecurrence(rule);
  if (!r) return '';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  if (r.freq === 'weekly' && r.weekdays) {
    const days = r.weekdays;
    const prefix = r.interval > 1 ? `Every ${r.interval} weeks on ` : 'Every ';
    if (sameSet(days, WEEKDAYS_MON_FRI)) return r.interval > 1 ? `${prefix}weekdays` : 'Every weekday';
    if (sameSet(days, [0, 6])) return `${prefix}weekend`;
    if (days.length === 1) return `${prefix}${WEEKDAY_LONG[days[0]]}`;
    // Monday-first ordering reads naturally.
    const ordered = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return `${prefix}${ordered.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
  }
  return r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
}

export const RECURRENCE_PRESETS: { label: string; rule: TaskRecurrence }[] = [
  { label: 'Every day', rule: { freq: 'daily', interval: 1 } },
  { label: 'Every weekday', rule: { freq: 'weekly', interval: 1, weekdays: WEEKDAYS_MON_FRI } },
  { label: 'Every week', rule: { freq: 'weekly', interval: 1 } },
  { label: 'Every month', rule: { freq: 'monthly', interval: 1 } },
  { label: 'Every year', rule: { freq: 'yearly', interval: 1 } },
];
