/**
 * Repeat rules — canonical, deterministic, shared by every client so Android,
 * iOS, web and agents always compute the same next occurrence.
 *
 * Completing a recurring task doesn't mark it done; it rolls the due date to
 * the next occurrence. Two anchors (Todoist's "every" vs "every!"):
 *   - 'scheduled' (default): next date after the CURRENT due date
 *     ("Pay rent every month on the 1st").
 *   - 'completion': next date counted from the day it was completed
 *     ("Service generator every 30 days after completion").
 */
import type { TaskRecurrence } from '../types';
import { addDays, addMonths, parseISODate, toISODate, WEEKDAY_SHORT, WEEKDAY_LONG } from './dates';

const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
const lastDayOfMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Normalise a possibly-partial rule from storage (null fields, bad interval). */
export function normalizeRecurrence(r?: TaskRecurrence | null): TaskRecurrence | null {
  if (!r || !r.freq) return null;
  const interval = Math.max(1, Math.floor(Number(r.interval) || 1));
  const weekdays = r.freq === 'weekly' && Array.isArray(r.weekdays) && r.weekdays.length
    ? [...new Set(r.weekdays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
    : null;
  const monthDay = r.freq === 'monthly' && r.monthDay && (r.monthDay === -1 || (r.monthDay >= 1 && r.monthDay <= 31)) ? r.monthDay : null;
  const nth = r.freq === 'monthly' && r.nthWeekday && r.nthWeekday.weekday >= 0 && r.nthWeekday.weekday <= 6
    && (r.nthWeekday.ordinal === -1 || (r.nthWeekday.ordinal >= 1 && r.nthWeekday.ordinal <= 5)) ? r.nthWeekday : null;
  return {
    freq: r.freq, interval, weekdays, monthDay, nthWeekday: nth,
    anchor: r.anchor === 'completion' ? 'completion' : 'scheduled',
    until: r.until && /^\d{4}-\d{2}-\d{2}$/.test(r.until) ? r.until : null,
  };
}

/** Day of month for the nth (or last) weekday in a month, or null if it doesn't exist. */
function nthWeekdayOf(y: number, m: number, weekday: number, ordinal: number): number | null {
  if (ordinal === -1) {
    const last = lastDayOfMonth(y, m);
    const lastDow = new Date(y, m, last).getDay();
    return last - ((lastDow - weekday + 7) % 7);
  }
  const firstDow = new Date(y, m, 1).getDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + 7 * (ordinal - 1);
  return day <= lastDayOfMonth(y, m) ? day : null;
}

/** The occurrence in month (y, m) for a monthly rule; null if it doesn't occur. */
function monthlyDate(r: TaskRecurrence, y: number, m: number, fallbackDay: number): Date | null {
  if (r.nthWeekday) {
    const d = nthWeekdayOf(y, m, r.nthWeekday.weekday, r.nthWeekday.ordinal);
    return d ? new Date(y, m, d) : null;
  }
  const want = r.monthDay ?? fallbackDay;
  const last = lastDayOfMonth(y, m);
  return new Date(y, m, want === -1 ? last : Math.min(want, last));
}

/** One step strictly after `d`. */
function step(r: TaskRecurrence, d: Date, originDay: number): Date {
  switch (r.freq) {
    case 'daily':
      return addDays(d, r.interval);
    case 'weekly':
      if (r.weekdays && r.weekdays.length) {
        const monIdx = (x: Date) => (x.getDay() + 6) % 7;
        for (let i = 1; i <= 7; i++) {
          const c = addDays(d, i);
          if (r.weekdays.includes(c.getDay())) {
            const wrapped = monIdx(c) <= monIdx(d);
            return wrapped && r.interval > 1 ? addDays(c, 7 * (r.interval - 1)) : c;
          }
        }
      }
      return addDays(d, 7 * r.interval);
    case 'monthly': {
      if (r.nthWeekday || r.monthDay) {
        // Walk forward month by month (interval) until the rule's date is after d.
        let y = d.getFullYear();
        let m = d.getMonth();
        for (let guard = 0; guard < 240; guard++) {
          const c = monthlyDate(r, y, m, originDay);
          if (c && c > d && (guard > 0 || true)) {
            // Respect the interval relative to the month of d.
            const monthsAhead = (y - d.getFullYear()) * 12 + (m - d.getMonth());
            if (monthsAhead === 0 || monthsAhead % r.interval === 0) return c;
          }
          m += 1;
          if (m > 11) { m = 0; y += 1; }
        }
        return addMonths(d, r.interval);
      }
      // Plain "every month": same day number (clamped), remembering the origin day.
      const t = addMonths(new Date(d.getFullYear(), d.getMonth(), 1), r.interval);
      return new Date(t.getFullYear(), t.getMonth(), Math.min(originDay, lastDayOfMonth(t.getFullYear(), t.getMonth())));
    }
    case 'yearly':
      return addMonths(d, 12 * r.interval);
  }
}

/**
 * Next due date for a recurring task being completed.
 *  - scheduled anchor: strictly after the current due date, caught up so it's
 *    today or later (an overdue daily task moves to today/tomorrow, not the past).
 *  - completion anchor: one interval after `today` (the completion day).
 * Returns null when the rule has ended (`until`).
 */
export function nextOccurrence(rule: TaskRecurrence, fromISO: string, today: Date = new Date()): string | null {
  const r = normalizeRecurrence(rule)!;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const from = r.anchor === 'completion' ? todayStart : (parseISODate(fromISO) ?? todayStart);
  const originDay = from.getDate();
  let next = step(r, from, originDay);
  if (r.anchor !== 'completion') {
    for (let guard = 0; next < todayStart && guard < 2000; guard++) next = step(r, next, originDay);
  }
  const iso = toISODate(next);
  if (r.until && iso > r.until) return null;
  return iso;
}

/** First due date for a fresh rule (today if it matches, else the next match). */
export function firstOccurrence(rule: TaskRecurrence, today: Date = new Date()): string {
  const r = normalizeRecurrence(rule)!;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (r.freq === 'weekly' && r.weekdays && r.weekdays.length) {
    for (let i = 0; i < 7; i++) {
      const c = addDays(t, i);
      if (r.weekdays.includes(c.getDay())) return toISODate(c);
    }
  }
  if (r.freq === 'monthly' && (r.monthDay || r.nthWeekday)) {
    for (let i = 0; i < 24; i++) {
      const y = t.getFullYear() + Math.floor((t.getMonth() + i) / 12);
      const m = (t.getMonth() + i) % 12;
      const c = monthlyDate(r, y, m, t.getDate());
      if (c && c >= t) return toISODate(c);
    }
  }
  return toISODate(t);
}

const ordinalSuffix = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

/** 'Every day', 'Every 2 weeks', 'Every weekday', 'Every Mon, Wed', 'Every month on the 1st', 'Every first Monday'. */
export function describeRecurrence(rule?: TaskRecurrence | null): string {
  const r = normalizeRecurrence(rule);
  if (!r) return '';
  const after = r.anchor === 'completion' ? ' after completion' : '';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  if (r.freq === 'weekly' && r.weekdays) {
    const days = r.weekdays;
    const prefix = r.interval > 1 ? `Every ${r.interval} weeks on ` : 'Every ';
    if (sameSet(days, WEEKDAYS_MON_FRI)) return (r.interval > 1 ? `${prefix}weekdays` : 'Every weekday') + after;
    if (sameSet(days, [0, 6])) return `${prefix}weekend${after}`;
    if (days.length === 1) return `${prefix}${WEEKDAY_LONG[days[0]]}${after}`;
    const ordered = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return `${prefix}${ordered.map((d) => WEEKDAY_SHORT[d]).join(', ')}${after}`;
  }
  const every = r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
  if (r.freq === 'monthly' && r.nthWeekday) {
    const ord = r.nthWeekday.ordinal === -1 ? 'last' : ORDINAL[r.nthWeekday.ordinal];
    return `${r.interval === 1 ? 'Every' : `Every ${r.interval} months on the`} ${ord} ${WEEKDAY_LONG[r.nthWeekday.weekday]}${after}`;
  }
  if (r.freq === 'monthly' && r.monthDay) {
    return `${every} on the ${r.monthDay === -1 ? 'last day' : `${r.monthDay}${ordinalSuffix(r.monthDay)}`}${after}`;
  }
  return every + after;
}

export const RECURRENCE_PRESETS: { label: string; rule: TaskRecurrence }[] = [
  { label: 'Every day', rule: { freq: 'daily', interval: 1 } },
  { label: 'Every weekday', rule: { freq: 'weekly', interval: 1, weekdays: WEEKDAYS_MON_FRI } },
  { label: 'Every week', rule: { freq: 'weekly', interval: 1 } },
  { label: 'Every 2 weeks', rule: { freq: 'weekly', interval: 2 } },
  { label: 'Every month', rule: { freq: 'monthly', interval: 1 } },
  { label: 'Every month on the last day', rule: { freq: 'monthly', interval: 1, monthDay: -1 } },
  { label: 'Every 3 months', rule: { freq: 'monthly', interval: 3 } },
  { label: 'Every year', rule: { freq: 'yearly', interval: 1 } },
];
