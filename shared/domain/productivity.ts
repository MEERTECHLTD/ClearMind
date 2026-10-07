/**
 * Productivity engine — "Momentum".
 *
 * Every number here is derived from canonical, synced data: Completion events
 * (one per completed task occurrence, idempotent ids, retracted on reopen) and
 * the current task set. No mutable counters, so web, Android, iOS and agents
 * always compute the same result, and history can be recomputed at any time.
 *
 * Momentum score (our own system):
 *   + points per completion by priority   P1 4 · P2 3 · P3 2 · P4 1
 *   + 1 bonus when a dated task is completed on time (not overdue)
 *   + 5 for every day the daily goal is met, + 20 for every week the weekly goal is met
 *   + streak bonus: +1 per day of the current daily-goal streak (capped at 30)
 *   − 1 per task currently overdue by more than 3 days (capped at 25)
 * Levels: Getting started · Steady · Focused · Driven · Masterful · Legendary.
 */
import type { Completion, Task, Preferences } from '../types';
import { addDays, toISODate, parseISODate, isOverdue, priorityOf, diffDays } from '../tasks';
import { dayInZone, nowInZone } from '../tasks/time';

export const DEFAULT_DAILY_GOAL = 5;
export const DEFAULT_WEEKLY_GOAL = 25;

const POINTS = { High: 4, Medium: 3, Low: 2, None: 1 } as const;
export const LEVELS = [
  { name: 'Getting started', min: 0 },
  { name: 'Steady', min: 250 },
  { name: 'Focused', min: 1000 },
  { name: 'Driven', min: 2500 },
  { name: 'Masterful', min: 5000 },
  { name: 'Legendary', min: 10000 },
];

export interface ProductivityInput {
  completions: Completion[];
  tasks: Task[];
  preferences?: Preferences | null;
  now?: Date;
}

export type Interval = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | { from: string; to: string };

const live = (cs: Completion[]) => cs.filter((c) => !c.deleted);

/** Week start (0 Sun, 1 Mon, 6 Sat) for the user's preference. */
function weekStartDate(day: Date, weekStart: number): Date {
  const delta = (day.getDay() - weekStart + 7) % 7;
  return addDays(day, -delta);
}

/** Resolve a reporting interval to inclusive local-day bounds — the ONE interpretation used everywhere. */
export function resolveInterval(iv: Interval, prefs?: Preferences | null, now: Date = new Date()): { from: string; to: string; label: string } {
  const local = nowInZone(prefs?.timezone ?? null, now);
  const today = new Date(local.getFullYear(), local.getMonth(), local.getDate());
  const ws = prefs?.weekStart ?? 1;
  if (typeof iv === 'object') return { ...iv, label: `${iv.from} → ${iv.to}` };
  switch (iv) {
    case 'today': return { from: toISODate(today), to: toISODate(today), label: 'Today' };
    case 'yesterday': { const y = addDays(today, -1); return { from: toISODate(y), to: toISODate(y), label: 'Yesterday' }; }
    case 'this_week': { const s = weekStartDate(today, ws); return { from: toISODate(s), to: toISODate(addDays(s, 6)), label: 'This week' }; }
    case 'last_week': { const s = addDays(weekStartDate(today, ws), -7); return { from: toISODate(s), to: toISODate(addDays(s, 6)), label: 'Last week' }; }
    case 'this_month': { const s = new Date(today.getFullYear(), today.getMonth(), 1); const e = new Date(today.getFullYear(), today.getMonth() + 1, 0); return { from: toISODate(s), to: toISODate(e), label: 'This month' }; }
    case 'last_month': { const s = new Date(today.getFullYear(), today.getMonth() - 1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return { from: toISODate(s), to: toISODate(e), label: 'Last month' }; }
  }
}

/** Completions per local day. */
export function countsByDay(completions: Completion[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of live(completions)) m.set(c.day, (m.get(c.day) ?? 0) + 1);
  return m;
}

const isRestDay = (iso: string, prefs?: Preferences | null) => {
  const d = parseISODate(iso);
  return !!d && (prefs?.daysOff ?? []).includes(d.getDay());
};

/** Current and longest streak of days meeting the daily goal (days off are skipped, not broken). */
export function dailyStreak(completions: Completion[], prefs?: Preferences | null, now: Date = new Date()): { current: number; longest: number } {
  const goal = Math.max(1, prefs?.dailyGoal ?? DEFAULT_DAILY_GOAL);
  const byDay = countsByDay(completions);
  const today = dayInZone(now, prefs?.timezone ?? null);
  const met = (d: string) => (byDay.get(d) ?? 0) >= goal;
  // Current: count back from today (today only counts if already met).
  let current = 0;
  let cursor = parseISODate(today)!;
  if (!met(today)) cursor = addDays(cursor, -1);
  for (let guard = 0; guard < 3650; guard++) {
    const d = toISODate(cursor);
    if (met(d)) current++;
    else if (!isRestDay(d, prefs) && !prefs?.vacation) break;
    cursor = addDays(cursor, -1);
  }
  // Longest: scan all days with activity.
  const days = [...byDay.keys()].sort();
  let longest = 0, run = 0, prev: string | null = null;
  for (const d of days) {
    if (!met(d)) continue;
    if (prev) {
      let gapOk = true;
      for (let x = addDays(parseISODate(prev)!, 1); toISODate(x) < d; x = addDays(x, 1)) if (!isRestDay(toISODate(x), prefs)) { gapOk = false; break; }
      run = gapOk ? run + 1 : 1;
    } else run = 1;
    prev = d;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current) };
}

export interface DaySummary { day: string; completed: number; goal: number; met: boolean; highPriority: number }

export function daySummary(input: ProductivityInput, day?: string): DaySummary & { remaining: number; overdue: number } {
  const prefs = input.preferences;
  const now = input.now ?? new Date();
  const d = day ?? dayInZone(now, prefs?.timezone ?? null);
  const cs = live(input.completions).filter((c) => c.day === d);
  const goal = prefs?.dailyGoal ?? DEFAULT_DAILY_GOAL;
  const localNow = nowInZone(prefs?.timezone ?? null, now);
  const open = input.tasks.filter((t) => !t.deleted && !t.completed);
  return {
    day: d,
    completed: cs.length,
    goal,
    met: cs.length >= goal,
    highPriority: cs.filter((c) => c.priority === 'High').length,
    remaining: open.filter((t) => t.dueDate && t.dueDate <= d).length,
    overdue: open.filter((t) => isOverdue(t, localNow)).length,
  };
}

export interface WeekSummary {
  from: string;
  to: string;
  days: DaySummary[];
  completed: number;
  goal: number;
  met: boolean;
  bestDay: DaySummary | null;
  previousWeek: number;
  changePct: number | null;
}

export function weekSummary(input: ProductivityInput, which: 'this_week' | 'last_week' = 'this_week'): WeekSummary {
  const prefs = input.preferences;
  const now = input.now ?? new Date();
  const { from, to } = resolveInterval(which, prefs, now);
  const prevRange = resolveInterval(which === 'this_week' ? 'last_week' : { from: toISODate(addDays(parseISODate(from)!, -7)), to: toISODate(addDays(parseISODate(from)!, -1)) }, prefs, now);
  const byDay = countsByDay(input.completions);
  const highByDay = new Map<string, number>();
  for (const c of live(input.completions)) if (c.priority === 'High') highByDay.set(c.day, (highByDay.get(c.day) ?? 0) + 1);
  const goalD = prefs?.dailyGoal ?? DEFAULT_DAILY_GOAL;
  const days: DaySummary[] = [];
  for (let x = parseISODate(from)!; toISODate(x) <= to; x = addDays(x, 1)) {
    const d = toISODate(x);
    const n = byDay.get(d) ?? 0;
    days.push({ day: d, completed: n, goal: goalD, met: n >= goalD, highPriority: highByDay.get(d) ?? 0 });
  }
  const completed = days.reduce((s, d) => s + d.completed, 0);
  let previousWeek = 0;
  for (const [d, n] of byDay) if (d >= prevRange.from && d <= prevRange.to) previousWeek += n;
  const goal = prefs?.weeklyGoal ?? DEFAULT_WEEKLY_GOAL;
  const best = days.reduce<DaySummary | null>((b, d) => (d.completed > (b?.completed ?? 0) ? d : b), null);
  return { from, to, days, completed, goal, met: completed >= goal, bestDay: best, previousWeek, changePct: previousWeek ? Math.round(((completed - previousWeek) / previousWeek) * 100) : null };
}

export function intervalSummary(input: ProductivityInput, iv: Interval) {
  const r = resolveInterval(iv, input.preferences, input.now);
  const cs = live(input.completions).filter((c) => c.day >= r.from && c.day <= r.to);
  const byProject = new Map<string | null, number>();
  for (const c of cs) byProject.set(c.projectId ?? null, (byProject.get(c.projectId ?? null) ?? 0) + 1);
  return {
    ...r,
    completed: cs.length,
    byPriority: { p1: cs.filter((c) => c.priority === 'High').length, p2: cs.filter((c) => c.priority === 'Medium').length, p3: cs.filter((c) => c.priority === 'Low').length, p4: cs.filter((c) => c.priority === 'None').length },
    onTime: cs.filter((c) => !c.wasOverdue).length,
    late: cs.filter((c) => c.wasOverdue).length,
    byProject: [...byProject.entries()].map(([projectId, completed]) => ({ projectId, completed })).sort((a, b) => b.completed - a.completed),
    bySource: Object.fromEntries([...new Set(cs.map((c) => c.source ?? 'unknown'))].map((s) => [s, cs.filter((c) => (c.source ?? 'unknown') === s).length])),
  };
}

/** Momentum score + level, recomputable from history. */
export function momentum(input: ProductivityInput) {
  const prefs = input.preferences;
  const now = input.now ?? new Date();
  const cs = live(input.completions);
  let points = 0;
  for (const c of cs) points += POINTS[c.priority ?? 'None'] + (c.wasOverdue ? 0 : 1);
  const byDay = countsByDay(cs);
  const goalD = prefs?.dailyGoal ?? DEFAULT_DAILY_GOAL;
  let daysMet = 0;
  for (const n of byDay.values()) if (n >= goalD) daysMet++;
  points += daysMet * 5;
  // Weekly goals met (by the user's week start).
  const goalW = prefs?.weeklyGoal ?? DEFAULT_WEEKLY_GOAL;
  const weeks = new Map<string, number>();
  for (const [d, n] of byDay) { const s = toISODate(weekStartDate(parseISODate(d)!, prefs?.weekStart ?? 1)); weeks.set(s, (weeks.get(s) ?? 0) + n); }
  let weeksMet = 0;
  for (const n of weeks.values()) if (n >= goalW) weeksMet++;
  points += weeksMet * 20;
  const streak = dailyStreak(cs, prefs, now);
  points += Math.min(streak.current, 30);
  const localNow = nowInZone(prefs?.timezone ?? null, now);
  const staleOverdue = input.tasks.filter((t) => !t.deleted && !t.completed && t.dueDate && isOverdue(t, localNow) && diffDays(parseISODate(t.dueDate)!, localNow) > 3).length;
  const penalty = Math.min(staleOverdue, 25);
  points = Math.max(0, points - penalty);
  const levelIdx = LEVELS.reduce((i, l, k) => (points >= l.min ? k : i), 0);
  const next = LEVELS[levelIdx + 1] ?? null;
  return {
    score: points,
    level: LEVELS[levelIdx].name,
    nextLevel: next?.name ?? null,
    toNextLevel: next ? next.min - points : 0,
    streak,
    daysGoalMet: daysMet,
    weeksGoalMet: weeksMet,
    overduePenalty: penalty,
    totalCompleted: cs.length,
  };
}

/** Completions per week for the last `weeks` weeks (oldest first) — trend charts. */
export function weeklyTrend(input: ProductivityInput, weeks = 8): { weekStart: string; completed: number }[] {
  const prefs = input.preferences;
  const now = nowInZone(prefs?.timezone ?? null, input.now ?? new Date());
  const start = weekStartDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()), prefs?.weekStart ?? 1);
  const byDay = countsByDay(input.completions);
  const out: { weekStart: string; completed: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const s = addDays(start, -7 * w);
    let n = 0;
    for (let i = 0; i < 7; i++) n += byDay.get(toISODate(addDays(s, i))) ?? 0;
    out.push({ weekStart: toISODate(s), completed: n });
  }
  return out;
}

/** Full productivity snapshot used by the Productivity screens, widgets and agents. */
export function productivitySummary(input: ProductivityInput) {
  return {
    today: daySummary(input),
    week: weekSummary(input, 'this_week'),
    momentum: momentum(input),
    trend: weeklyTrend(input, 8),
  };
}

/** Per-project execution tracker (project screen, Browse, agents). */
export function projectStats(projectIds: string[], input: ProductivityInput & { sections?: { id: string; name: string; projectId: string }[] }) {
  const prefs = input.preferences;
  const now = input.now ?? new Date();
  const localNow = nowInZone(prefs?.timezone ?? null, now);
  const today = toISODate(localNow);
  const week = resolveInterval('this_week', prefs, now);
  const ids = new Set(projectIds);
  const tasks = input.tasks.filter((t) => !t.deleted && t.projectId && ids.has(t.projectId));
  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const blockedSections = new Set((input.sections ?? []).filter((s) => /block|waiting|on hold/i.test(s.name)).map((s) => s.id));
  const cs = live(input.completions).filter((c) => c.projectId && ids.has(c.projectId));
  const total = tasks.length;
  return {
    total,
    open: open.length,
    completed: done.length,
    overdue: open.filter((t) => isOverdue(t, localNow)).length,
    dueToday: open.filter((t) => t.dueDate === today).length,
    dueThisWeek: open.filter((t) => t.dueDate && t.dueDate >= week.from && t.dueDate <= week.to).length,
    blocked: open.filter((t) => (t.sectionId && blockedSections.has(t.sectionId)) || /blocked|waiting/i.test(t.title)).length,
    highPriority: open.filter((t) => priorityOf(t) === 'High').length,
    progress: total ? Math.round((done.length / total) * 100) : 0,
    completedThisWeek: cs.filter((c) => c.day >= week.from && c.day <= week.to).length,
    trend: weeklyTrend({ ...input, completions: cs }, 6),
    recentlyCompleted: [...cs].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 5).map((c) => ({ taskId: c.taskId, title: c.title, completedAt: c.completedAt })),
    upcoming: open.filter((t) => t.dueDate && t.dueDate >= today).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1)).slice(0, 5).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
    priorityDistribution: { p1: open.filter((t) => priorityOf(t) === 'High').length, p2: open.filter((t) => priorityOf(t) === 'Medium').length, p3: open.filter((t) => priorityOf(t) === 'Low').length, p4: open.filter((t) => priorityOf(t) === 'None').length },
  };
}

export type ProjectStats = ReturnType<typeof projectStats>;
