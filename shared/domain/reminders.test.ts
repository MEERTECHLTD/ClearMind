import { describe, it, expect } from 'vitest';
import type { Task } from '../types';
import { planNotifications, diffSchedule, applyQuietHours } from './reminders';
import { buildWidgetSnapshot } from './widgets';

const NOW = new Date(2026, 9, 7, 10, 0, 0); // Wed 7 Oct 2026 10:00 local
const t = (o: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: 'Task', completed: false, priority: 'None', ...o });

describe('notification planner', () => {
  it('schedules default reminders for timed tasks, explicit ones for any', () => {
    const plan = planNotifications({
      tasks: [
        t({ id: 'a', title: 'Call', dueDate: '2026-10-07', dueTime: '15:00' }),
        t({ id: 'b', title: 'Untimed', dueDate: '2026-10-08' }),
        t({ id: 'c', title: 'Explicit', dueDate: '2026-10-08', dueTime: '09:30', reminders: [{ id: 'r1', type: 'relative', minutesBefore: 30 }, { id: 'r2', type: 'absolute', at: '2026-10-07T18:00' }] }),
        t({ id: 'd', title: 'Done', dueDate: '2026-10-07', dueTime: '16:00', completed: true }),
      ],
      preferences: { id: 'preferences', dailyPlanAt: null },
      now: NOW,
    });
    expect(plan.map((p) => [p.taskId, new Date(p.at).getHours(), new Date(p.at).getMinutes()])).toEqual([
      ['a', 15, 0], ['c', 18, 0], ['c', 9, 0],
    ]);
    expect(plan[0]).toMatchObject({ url: 'clearmind://task/a', body: 'Due now · 15:00' });
  });

  it('is deterministic (same keys) and diffs cleanly when a task is rescheduled', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-10-07', dueTime: '15:00' })];
    const p1 = planNotifications({ tasks, now: NOW, preferences: { id: 'preferences', dailyPlanAt: null } });
    const p2 = planNotifications({ tasks, now: NOW, preferences: { id: 'preferences', dailyPlanAt: null } });
    expect(p1.map((x) => x.key)).toEqual(p2.map((x) => x.key));
    const moved = planNotifications({ tasks: [{ ...tasks[0], dueTime: '17:00' }], now: NOW, preferences: { id: 'preferences', dailyPlanAt: null } });
    const d = diffSchedule(moved, p1.map((x) => x.key));
    expect(d.toCancel).toEqual([p1[0].key]);
    expect(d.toSchedule).toHaveLength(1);
    expect(diffSchedule(moved, moved.map((x) => x.key))).toEqual({ toCancel: [], toSchedule: [] });
  });

  it('respects preference switches and quiet hours', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-10-07', dueTime: '23:30' })];
    expect(planNotifications({ tasks, now: NOW, preferences: { id: 'preferences', notifyReminders: false, dailyPlanAt: null } })).toHaveLength(0);
    expect(planNotifications({ tasks, now: NOW, preferences: { id: 'preferences', defaultReminder: null, dailyPlanAt: null } })).toHaveLength(0);
    const quiet = planNotifications({ tasks, now: NOW, preferences: { id: 'preferences', quietStart: '22:00', quietEnd: '07:00', dailyPlanAt: null } });
    expect(new Date(quiet[0].at).getDate()).toBe(8);
    expect(new Date(quiet[0].at).getHours()).toBe(7);
    expect(applyQuietHours(new Date(2026, 9, 7, 12, 0), { id: 'preferences', quietStart: '22:00', quietEnd: '07:00' }).getHours()).toBe(12);
  });

  it('plans a daily digest only when there is something to plan', () => {
    const plan = planNotifications({ tasks: [t({ dueDate: '2026-10-05' }), t({ dueDate: '2026-10-08' })], now: NOW, preferences: { id: 'preferences', dailyPlanAt: '08:00' } });
    const daily = plan.filter((p) => p.kind === 'daily');
    expect(daily).toHaveLength(1); // today's 08:00 already passed → tomorrow
    expect(daily[0]).toMatchObject({ key: 'daily:2026-10-08', body: '1 task today · 1 overdue' });
    expect(planNotifications({ tasks: [], now: NOW }).filter((p) => p.kind === 'daily')).toHaveLength(0);
  });

  it('caps the number of pending notifications', () => {
    const tasks = Array.from({ length: 100 }, (_, i) => t({ dueDate: '2026-10-09', dueTime: `${String(8 + (i % 12)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}` }));
    expect(planNotifications({ tasks, now: NOW, max: 60 })).toHaveLength(60);
  });
});

describe('widget snapshot', () => {
  it('summarises today, upcoming, inbox and productivity', () => {
    const s = buildWidgetSnapshot({
      tasks: [
        t({ id: 'o', title: 'Overdue', dueDate: '2026-10-05', priority: 'High' }),
        t({ id: 'n', title: 'Now', dueDate: '2026-10-07', dueTime: '14:00' }),
        t({ id: 'u', title: 'Later', dueDate: '2026-10-09' }),
        t({ id: 'i', title: 'Inbox thought', createdAt: '2026-10-07T08:00:00Z' }),
        t({ id: 'x', title: 'Note', kind: 'note' }),
      ],
      projects: [],
      completions: [{ id: 'c@once', taskId: 'c', title: 'c', priority: 'None', occurrence: 'once', completedAt: '2026-10-07T09:00:00Z', day: '2026-10-07' }],
      preferences: { id: 'preferences', dailyGoal: 3, theme: 'dark' },
      signedIn: true,
      now: NOW,
    });
    expect(s.today).toMatchObject({ total: 2, overdue: 1 });
    expect(s.today.tasks[0]).toMatchObject({ id: 'o', priority: 1, overdue: true });
    expect(s.today.tasks[1]).toMatchObject({ id: 'n', time: '2:00 PM' });
    expect(s.upcoming.days.map((d) => d.label)).toEqual(['Friday']);
    expect(s.inbox.tasks.map((x) => x.id)).toContain('i');
    expect(s.inbox.tasks.map((x) => x.id)).not.toContain('x');
    expect(s.productivity).toEqual({ completedToday: 1, dailyGoal: 3, streak: 0 });
    expect(s.theme).toBe('dark');
  });
});
