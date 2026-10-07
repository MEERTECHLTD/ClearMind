/**
 * Notification planner — a PURE function from (tasks, preferences, now) to the
 * exact set of local notifications a device should have scheduled.
 *
 * Every device reconciles its OS schedule against this plan (cancel what's not
 * in the plan, schedule what's missing). Because keys are deterministic, a task
 * rescheduled from the web or by an AI agent cancels the stale reminder and
 * creates the new one on the next sync — never duplicates.
 *
 * Kinds:
 *   task      explicit reminders (relative "30 min before" / absolute) and, for
 *             timed tasks, the default reminder from Settings (if enabled)
 *   daily     the daily planning digest (today + overdue counts) at dailyPlanAt
 *   weekly    optional weekly productivity summary
 * Quiet hours shift notifications to the end of the quiet window.
 */
import type { Task, Preferences, Completion } from '../types';
import { isOverdue, toISODate, addDays, parseISODate } from '../tasks';
import { zonedToUtc, nowInZone, dayInZone } from '../tasks/time';

export interface PlannedNotification {
  /** Deterministic identifier — same plan ⇒ same key on every run. */
  key: string;
  kind: 'task' | 'daily' | 'weekly';
  at: string;           // ISO instant
  title: string;
  body: string;
  taskId?: string;
  /** Deep link opened when tapped. */
  url: string;
}

export interface PlanInput {
  tasks: Task[];
  preferences?: Preferences | null;
  completions?: Completion[];
  now?: Date;
  horizonDays?: number;
  /** iOS allows 64 pending local notifications; stay under it. */
  max?: number;
}

const hm = (s?: string | null) => (s && /^\d{1,2}:\d{2}$/.test(s) ? s.split(':').map(Number) as [number, number] : null);

/** Move an instant out of the quiet window (to its end), if configured. */
export function applyQuietHours(at: Date, prefs?: Preferences | null): Date {
  const qs = hm(prefs?.quietStart);
  const qe = hm(prefs?.quietEnd);
  if (!qs || !qe) return at;
  const tz = prefs?.timezone ?? null;
  const local = nowInZone(tz, at);
  const minutes = local.getHours() * 60 + local.getMinutes();
  const start = qs[0] * 60 + qs[1];
  const end = qe[0] * 60 + qe[1];
  const inQuiet = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  if (!inQuiet) return at;
  const day = dayInZone(at, tz);
  const endDay = start > end && minutes >= start ? toISODate(addDays(parseISODate(day)!, 1)) : day;
  return zonedToUtc(endDay, `${String(qe[0]).padStart(2, '0')}:${String(qe[1]).padStart(2, '0')}`, tz) ?? at;
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const prefs = input.preferences ?? null;
  const now = input.now ?? new Date();
  const horizon = new Date(now.getTime() + (input.horizonDays ?? 14) * 86_400_000);
  const max = input.max ?? 60;
  const out: PlannedNotification[] = [];
  const push = (n: PlannedNotification) => {
    const at = applyQuietHours(new Date(n.at), prefs);
    if (at.getTime() <= now.getTime() + 5000 || at > horizon) return;
    out.push({ ...n, at: at.toISOString() });
  };

  if (prefs?.notifyReminders !== false) {
    for (const t of input.tasks) {
      if (t.deleted || t.completed || !t.dueDate || t.kind === 'note') continue;
      const tz = t.timezone ?? prefs?.timezone ?? null;
      const due = zonedToUtc(t.dueDate, t.dueTime ?? '09:00', tz);
      if (!due) continue;
      const reminders = t.reminders?.length
        ? t.reminders
        : t.dueTime && prefs?.defaultReminder != null && prefs.defaultReminder >= 0
          ? [{ id: 'default', type: 'relative' as const, minutesBefore: prefs.defaultReminder }]
          : t.dueTime && prefs?.defaultReminder === undefined
            ? [{ id: 'default', type: 'relative' as const, minutesBefore: 0 }]
            : [];
      for (const r of reminders) {
        let at: Date | null = null;
        if (r.type === 'relative') at = new Date(due.getTime() - (r.minutesBefore ?? 0) * 60_000);
        else if (r.at) { const [d, time] = r.at.split('T'); at = zonedToUtc(d, time, tz); }
        if (!at) continue;
        const when = t.dueTime ? ` · ${t.dueTime}` : '';
        push({
          key: `task:${t.id}:${r.id}:${at.toISOString()}`,
          kind: 'task',
          at: at.toISOString(),
          title: t.title,
          body: r.type === 'relative' && r.minutesBefore ? `Due in ${r.minutesBefore >= 60 && r.minutesBefore % 60 === 0 ? `${r.minutesBefore / 60} h` : `${r.minutesBefore} min`}${when}` : `Due now${when}`,
          taskId: t.id,
          url: `clearmind://task/${t.id}`,
        });
      }
    }
  }

  // Daily planning digest (counts are computed for the day it fires).
  const daily = hm(prefs?.dailyPlanAt === undefined ? '08:00' : prefs.dailyPlanAt);
  if (daily && prefs?.notifyOverdue !== false) {
    const tz = prefs?.timezone ?? null;
    for (let i = 0; i < 2; i++) {
      const day = toISODate(addDays(parseISODate(dayInZone(now, tz))!, i));
      const at = zonedToUtc(day, `${String(daily[0]).padStart(2, '0')}:${String(daily[1]).padStart(2, '0')}`, tz)!;
      const open = input.tasks.filter((t) => !t.deleted && !t.completed && t.dueDate && t.kind !== 'note');
      const dueThatDay = open.filter((t) => t.dueDate === day).length;
      const overdue = open.filter((t) => t.dueDate! < day || (t.dueDate === day && isOverdue(t, at))).length;
      if (!dueThatDay && !overdue) continue;
      const parts = [dueThatDay ? `${dueThatDay} task${dueThatDay === 1 ? '' : 's'} today` : null, overdue ? `${overdue} overdue` : null].filter(Boolean);
      push({ key: `daily:${day}`, kind: 'daily', at: at.toISOString(), title: 'Plan your day', body: parts.join(' · '), url: 'clearmind://today' });
    }
  }

  // Weekly summary (Sunday 18:00, or the day before the configured week start).
  if (prefs?.weeklySummary) {
    const tz = prefs?.timezone ?? null;
    const local = nowInZone(tz, now);
    const endDow = ((prefs.weekStart ?? 1) + 6) % 7;
    const delta = (endDow - local.getDay() + 7) % 7;
    const day = toISODate(addDays(new Date(local.getFullYear(), local.getMonth(), local.getDate()), delta));
    const at = zonedToUtc(day, '18:00', tz)!;
    const from = toISODate(addDays(parseISODate(day)!, -6));
    const done = (input.completions ?? []).filter((c) => !c.deleted && c.day >= from && c.day <= day).length;
    push({ key: `weekly:${day}`, kind: 'weekly', at: at.toISOString(), title: 'Your week in review', body: `${done} task${done === 1 ? '' : 's'} completed so far this week`, url: 'clearmind://productivity' });
  }

  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, max);
}

/** Diff a desired plan against what's scheduled (by identifier). */
export function diffSchedule(planned: PlannedNotification[], scheduledKeys: string[]): { toCancel: string[]; toSchedule: PlannedNotification[] } {
  const want = new Set(planned.map((p) => p.key));
  const have = new Set(scheduledKeys);
  return {
    toCancel: scheduledKeys.filter((k) => !want.has(k)),
    toSchedule: planned.filter((p) => !have.has(p.key)),
  };
}
