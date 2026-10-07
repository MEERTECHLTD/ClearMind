/**
 * Widget data — a compact, pure snapshot of what home-screen widgets show.
 * Built from the same synced data as the apps, so widgets agree with every
 * client. Stored on-device after each change; widget renderers read it.
 */
import type { Task, Project, Preferences, Completion } from '../types';
import { todayView, upcomingView, inboxTasks, formatTime, formatDueDate, priorityOf, isOverdue, toISODate, addDays } from '../tasks';
import { daySummary, dailyStreak } from './productivity';
import { nowInZone } from '../tasks/time';

export interface WidgetTask { id: string; title: string; priority: 1 | 2 | 3 | 4; time?: string; due?: string; overdue?: boolean; project?: string }

export interface WidgetSnapshot {
  generatedAt: string;
  signedIn: boolean;
  theme: 'light' | 'dark' | 'system';
  today: { tasks: WidgetTask[]; total: number; overdue: number };
  upcoming: { days: { date: string; label: string; tasks: WidgetTask[] }[] };
  inbox: { tasks: WidgetTask[]; total: number };
  productivity: { completedToday: number; dailyGoal: number; streak: number };
}

const P = { High: 1, Medium: 2, Low: 3, None: 4 } as const;

export function buildWidgetSnapshot(input: { tasks: Task[]; projects: Project[]; completions: Completion[]; preferences?: Preferences | null; signedIn: boolean; now?: Date; limit?: number }): WidgetSnapshot {
  const prefs = input.preferences ?? null;
  const now = nowInZone(prefs?.timezone ?? null, input.now ?? new Date());
  const limit = input.limit ?? 8;
  const open = input.tasks.filter((t) => !t.deleted && t.kind !== 'note');
  const projects = new Map(input.projects.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const w = (t: Task): WidgetTask => ({
    id: t.id, title: t.title, priority: P[priorityOf(t)],
    time: t.dueTime ? formatTime(t.dueTime) : undefined,
    due: t.dueDate ? formatDueDate(t.dueDate, now) : undefined,
    overdue: isOverdue(t, now) || undefined,
    project: t.projectId ? projects.get(t.projectId)?.title : undefined,
  });
  const tv = todayView(open, now);
  const todayList = [...tv.overdue, ...tv.today];
  const up = upcomingView(open, addDays(now, 1), 7).filter((g) => g.tasks.length).slice(0, 4);
  const inbox = inboxTasks(open, projects).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const day = daySummary({ completions: input.completions, tasks: input.tasks, preferences: prefs, now: input.now });
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    signedIn: input.signedIn,
    theme: prefs?.theme ?? 'system',
    today: { tasks: todayList.slice(0, limit).map(w), total: todayList.length, overdue: tv.overdue.length },
    upcoming: { days: up.map((g) => ({ date: g.date, label: g.date === toISODate(addDays(now, 1)) ? 'Tomorrow' : formatDueDate(g.date, now), tasks: g.tasks.slice(0, 4).map(w) })) },
    inbox: { tasks: inbox.slice(0, limit).map(w), total: inbox.length },
    productivity: { completedToday: day.completed, dailyGoal: day.goal, streak: dailyStreak(input.completions, prefs, input.now).current },
  };
}
