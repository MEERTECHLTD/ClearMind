/**
 * "Across ClearMind" selection logic (pure, unit-tested) — the part of Today
 * that pulls in the rest of the app (what used to be the Dashboard): today's
 * schedule from the Calendar and Daily Mapper, habit check-ins, and the next 7
 * days of deadlines from Applications, Projects, Goals and Milestones.
 * Ported from apps/mobile/components/today/AcrossClearMind.tsx so both apps
 * pick exactly the same rows. Every row carries the hash route of the tool
 * that owns it.
 */
import type { Application, CalendarEvent, DailyMapperEntry, Goal, Habit, Milestone, Project } from '../types';
import { applicationDeadline, REMINDER_SKIP_STATUSES } from '../applications';
import { addDays, toISODate, parseISODate, WEEKDAY_SHORT } from '../tasks';

export type AcrossKind = 'event' | 'block' | 'application' | 'project' | 'goal' | 'milestone';

export interface AcrossRow {
  key: string;
  kind: AcrossKind;
  title: string;
  /** Sort key: start time (schedule) or ISO day (deadlines). */
  at: string;
  meta: string;
  /** Hash route (without '#') of the tool that owns this row. */
  hash: string;
  color?: string;
  urgent?: boolean;
}

export interface AcrossInput {
  events?: CalendarEvent[];
  blocks?: DailyMapperEntry[];
  habits?: Habit[];
  applications?: Application[];
  projects?: Project[];
  goals?: Goal[];
  milestones?: Milestone[];
}

export interface AcrossSummary {
  schedule: AcrossRow[];
  deadlines: AcrossRow[];
  habitsDone: number;
  habitsTotal: number;
  /** True when there is nothing to show (the panel hides). */
  empty: boolean;
}

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const alive = <T,>(xs: T[] = []) => xs.filter((x) => !(x as { deleted?: boolean }).deleted);

export function relDay(iso: string, today: string, tomorrow: string): string {
  if (iso < today) return 'overdue';
  if (iso === today) return 'today';
  if (iso === tomorrow) return 'tomorrow';
  const d = parseISODate(iso);
  return d ? WEEKDAY_SHORT[d.getDay()] : iso;
}

/** Today's calendar events and open Daily Mapper blocks, by start time. */
export function scheduleFor(today: string, events: CalendarEvent[] = [], blocks: DailyMapperEntry[] = []): AcrossRow[] {
  return [
    ...alive(events).filter((e) => e.date === today).map((e): AcrossRow => ({
      key: `e-${e.id}`, kind: 'event', at: e.startTime ?? '', title: e.title, color: e.color || undefined,
      meta: e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : 'All day', hash: 'calendar',
    })),
    ...alive(blocks).filter((b) => b.date === today && b.completed !== 'yes').map((b): AcrossRow => ({
      key: `b-${b.id}`, kind: 'block', at: b.startTime ?? '', title: b.task, color: b.color || undefined,
      meta: `${b.startTime}–${b.endTime}`, hash: 'dailymapper',
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

/** Deadlines in the next `horizonDays` days (open applications, active projects, unfinished goals/milestones). */
export function deadlinesFor(today: string, input: AcrossInput, horizonDays = 7): AcrossRow[] {
  const base = parseISODate(today) ?? new Date();
  const tomorrow = toISODate(addDays(base, 1));
  const horizon = toISODate(addDays(base, horizonDays));
  const within = (iso: string) => !!iso && iso <= horizon;
  const out: AcrossRow[] = [];

  for (const a of alive(input.applications)) {
    if (REMINDER_SKIP_STATUSES.includes(a.status)) continue;
    const d = day(applicationDeadline(a));
    if (within(d) && d >= today) out.push({ key: `a-${a.id}`, kind: 'application', at: d, title: a.name, meta: relDay(d, today, tomorrow), hash: 'applications', urgent: d <= tomorrow });
  }
  for (const p of alive(input.projects)) {
    const d = day(p.deadline);
    if (!p.archived && within(d) && p.status !== 'Completed' && p.status !== 'Cancelled') {
      out.push({ key: `p-${p.id}`, kind: 'project', at: d, title: p.title, color: p.color ?? undefined, meta: relDay(d, today, tomorrow), hash: `project/${p.id}?tab=plan`, urgent: d <= tomorrow });
    }
  }
  for (const g of alive(input.goals)) {
    const d = day(g.targetDate);
    if (within(d) && (g.progress ?? 0) < 100) out.push({ key: `g-${g.id}`, kind: 'goal', at: d, title: g.title, meta: relDay(d, today, tomorrow), hash: 'goals', urgent: d < today });
  }
  for (const m of alive(input.milestones)) {
    const d = day(m.date);
    if (within(d) && d >= today && !m.completed) out.push({ key: `m-${m.id}`, kind: 'milestone', at: d, title: m.title, meta: relDay(d, today, tomorrow), hash: 'milestones', urgent: d === today });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function acrossClearMind(today: string, input: AcrossInput, limits = { schedule: 4, deadlines: 5 }): AcrossSummary {
  const habits = alive(input.habits);
  const schedule = scheduleFor(today, input.events, input.blocks).slice(0, limits.schedule);
  const deadlines = deadlinesFor(today, input).slice(0, limits.deadlines);
  const habitsDone = habits.filter((h) => h.completedToday).length;
  return { schedule, deadlines, habitsDone, habitsTotal: habits.length, empty: !schedule.length && !deadlines.length && !habits.length };
}
