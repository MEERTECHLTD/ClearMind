import { describe, it, expect } from 'vitest';
import type { Project, Task, Label } from '../types';
import {
  parseQuickAdd, nextOccurrence, firstOccurrence, describeRecurrence, formatDueDate, addMonths,
  todayView, upcomingView, inboxTasks, searchTasks, orderedProjects, completeTask, uncompleteTask,
  deletionSet, isOverdue, priorityOf, completedTasks, toISODate,
} from './index';

// Tuesday 6 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 6, 10, 0, 0);
const iso = (y: number, m: number, d: number) => toISODate(new Date(y, m - 1, d));

const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: 't', completed: false, priority: 'None', ...over });
const project = (over: Partial<Project>): Project =>
  ({ id: 'p', title: 'P', description: '', status: 'In Progress', progress: 0, tags: [], ...over }) as Project;

describe('parseQuickAdd', () => {
  const ctx = {
    now: NOW,
    projects: [{ id: 'w', title: 'Work' }, { id: 'hp', title: 'Home Projects' }],
    labels: [{ id: 'e', name: 'email' }],
  };

  it('extracts date, time, priority, project and labels', () => {
    const r = parseQuickAdd('Submit report tomorrow at 5pm p1 #Work @email @urgent', ctx);
    expect(r.title).toBe('Submit report');
    expect(r.dueDate).toBe(iso(2026, 10, 7));
    expect(r.dueTime).toBe('17:00');
    expect(r.priority).toBe('High');
    expect(r.projectId).toBe('w');
    expect(r.labels).toEqual([{ id: 'e', name: 'email' }, { id: undefined, name: 'urgent' }]);
  });

  it('matches multi-word existing projects greedily and reports new ones by name', () => {
    expect(parseQuickAdd('Fix sink #Home Projects', ctx).projectId).toBe('hp');
    const r = parseQuickAdd('Plan trip #Travel', ctx);
    expect(r.projectId).toBeUndefined();
    expect(r.projectName).toBe('Travel');
    expect(r.title).toBe('Plan trip');
  });

  it('parses relative dates', () => {
    expect(parseQuickAdd('a today', ctx).dueDate).toBe(iso(2026, 10, 6));
    expect(parseQuickAdd('a friday', ctx).dueDate).toBe(iso(2026, 10, 9));
    expect(parseQuickAdd('a tuesday', ctx).dueDate).toBe(iso(2026, 10, 6)); // today is Tuesday
    expect(parseQuickAdd('a next monday', ctx).dueDate).toBe(iso(2026, 10, 12));
    expect(parseQuickAdd('a next week', ctx).dueDate).toBe(iso(2026, 10, 12));
    expect(parseQuickAdd('a in 3 days', ctx).dueDate).toBe(iso(2026, 10, 9));
    expect(parseQuickAdd('a this weekend', ctx).dueDate).toBe(iso(2026, 10, 10));
    expect(parseQuickAdd('a on Oct 20', ctx).dueDate).toBe(iso(2026, 10, 20));
    expect(parseQuickAdd('a 3rd march', ctx).dueDate).toBe(iso(2027, 3, 3)); // past → next year
    expect(parseQuickAdd('a 2026-12-25', ctx).dueDate).toBe(iso(2026, 12, 25));
  });

  it('parses times and anchors a lone time to today', () => {
    expect(parseQuickAdd('call 17:30', ctx)).toMatchObject({ title: 'call', dueTime: '17:30', dueDate: iso(2026, 10, 6) });
    expect(parseQuickAdd('call at 9am', ctx).dueTime).toBe('09:00');
    expect(parseQuickAdd('call 12am', ctx).dueTime).toBe('00:00');
    expect(parseQuickAdd('lunch noon', ctx).dueTime).toBe('12:00');
    expect(parseQuickAdd('meet at 5', ctx).dueTime).toBe('17:00');
  });

  it('parses recurrence and sets the first occurrence', () => {
    const d = parseQuickAdd('Standup every weekday at 9:30', ctx);
    expect(d.title).toBe('Standup');
    expect(d.recurrence).toMatchObject({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] });
    expect(d.dueTime).toBe('09:30');
    expect(d.dueDate).toBe(iso(2026, 10, 6));
    expect(parseQuickAdd('Gym every mon, wed and fri', ctx).recurrence).toMatchObject({ freq: 'weekly', interval: 1, weekdays: [1, 3, 5] });
    expect(parseQuickAdd('Gym every mon, wed and fri', ctx).dueDate).toBe(iso(2026, 10, 7));
    expect(parseQuickAdd('Water plants every 3 days', ctx).recurrence).toMatchObject({ freq: 'daily', interval: 3 });
    expect(parseQuickAdd('Rent monthly', ctx).recurrence).toMatchObject({ freq: 'monthly', interval: 1 });
    expect(parseQuickAdd('Review every other week', ctx).recurrence).toMatchObject({ freq: 'weekly', interval: 2 });
    expect(parseQuickAdd('Journal daily', ctx).title).toBe('Journal');
  });

  it('does not parse words embedded in other words, and honours ignore', () => {
    const r = parseQuickAdd('Update monthly-report template', ctx);
    expect(r.recurrence).toBeUndefined();
    expect(r.title).toBe('Update monthly-report template');
    expect(parseQuickAdd('Email tom about p5', ctx).priority).toBeUndefined();
    const ig = parseQuickAdd('Monday report', { ...ctx, ignore: ['monday'] });
    expect(ig.dueDate).toBeUndefined();
    expect(ig.title).toBe('Monday report');
  });

  it('reports token ranges against the original input', () => {
    const input = 'Buy milk tomorrow p2';
    const r = parseQuickAdd(input, ctx);
    for (const t of r.tokens) expect(input.slice(t.start, t.end)).toBe(t.text);
    expect(r.tokens.map((t) => t.type)).toEqual(['date', 'priority']);
  });
});

describe('recurrence', () => {
  it('rolls dates forward', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1 }, iso(2026, 10, 6), NOW)).toBe(iso(2026, 10, 7));
    expect(nextOccurrence({ freq: 'weekly', interval: 1 }, iso(2026, 10, 6), NOW)).toBe(iso(2026, 10, 13));
    expect(nextOccurrence({ freq: 'monthly', interval: 1 }, iso(2026, 1, 31), new Date(2026, 0, 31))).toBe(iso(2026, 2, 28));
    expect(nextOccurrence({ freq: 'yearly', interval: 1 }, iso(2026, 10, 6), NOW)).toBe(iso(2027, 10, 6));
  });
  it('skips to listed weekdays', () => {
    const r = { freq: 'weekly' as const, interval: 1, weekdays: [1, 3, 5] };
    expect(nextOccurrence(r, iso(2026, 10, 7), new Date(2026, 9, 7))).toBe(iso(2026, 10, 9)); // Wed → Fri
    expect(nextOccurrence(r, iso(2026, 10, 9), new Date(2026, 9, 9))).toBe(iso(2026, 10, 12)); // Fri → Mon
  });
  it('catches up overdue tasks to today or later', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1 }, iso(2026, 9, 1), NOW)).toBe(iso(2026, 10, 6));
  });
  it('describes rules', () => {
    expect(describeRecurrence({ freq: 'daily', interval: 1 })).toBe('Every day');
    expect(describeRecurrence({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] })).toBe('Every weekday');
    expect(describeRecurrence({ freq: 'weekly', interval: 1, weekdays: [0, 1] })).toBe('Every Mon, Sun');
    expect(describeRecurrence({ freq: 'monthly', interval: 3 })).toBe('Every 3 months');
    expect(describeRecurrence(null)).toBe('');
  });
  it('first occurrence matches weekday rules', () => {
    expect(firstOccurrence({ freq: 'weekly', interval: 1, weekdays: [6] }, NOW)).toBe(iso(2026, 10, 10));
  });
});

describe('dates', () => {
  it('formats relative due dates', () => {
    expect(formatDueDate(iso(2026, 10, 6), NOW)).toBe('Today');
    expect(formatDueDate(iso(2026, 10, 7), NOW)).toBe('Tomorrow');
    expect(formatDueDate(iso(2026, 10, 5), NOW)).toBe('Yesterday');
    expect(formatDueDate(iso(2026, 10, 9), NOW)).toBe('Friday');
    expect(formatDueDate(iso(2026, 11, 20), NOW)).toBe('Nov 20');
    expect(formatDueDate(iso(2027, 1, 2), NOW)).toBe('Jan 2 2027');
  });
  it('clamps month addition', () => {
    expect(toISODate(addMonths(new Date(2024, 0, 31), 1))).toBe('2024-02-29');
  });
});

describe('selectors', () => {
  const projects = new Map([['w', project({ id: 'w', title: 'Work' })]]);
  const labels = new Map<string, Label>([['e', { id: 'e', name: 'errand', color: '#fff' }]]);

  it('splits Today into overdue and today, ignoring completed', () => {
    const tasks = [
      task({ id: 'a', dueDate: iso(2026, 10, 1) }),
      task({ id: 'b', dueDate: iso(2026, 10, 6), priority: 'Low' }),
      task({ id: 'c', dueDate: iso(2026, 10, 6), priority: 'High' }),
      task({ id: 'd', dueDate: iso(2026, 10, 6), completed: true }),
      task({ id: 'e', dueDate: iso(2026, 10, 7) }),
    ];
    const v = todayView(tasks, NOW);
    expect(v.overdue.map((t) => t.id)).toEqual(['a']);
    expect(v.today.map((t) => t.id)).toEqual(['c', 'b']);
  });

  it('groups upcoming days including empty ones', () => {
    const g = upcomingView([task({ id: 'x', dueDate: iso(2026, 10, 8) })], NOW, 3);
    expect(g.map((d) => [d.date, d.tasks.length])).toEqual([[iso(2026, 10, 6), 0], [iso(2026, 10, 7), 0], [iso(2026, 10, 8), 1]]);
  });

  it('inbox holds unassigned and orphaned top-level tasks', () => {
    const tasks = [
      task({ id: 'a' }),
      task({ id: 'b', projectId: 'w' }),
      task({ id: 'c', projectId: 'gone' }),
      task({ id: 'd', parentId: 'a' }),
    ];
    expect(inboxTasks(tasks, projects).map((t) => t.id).sort()).toEqual(['a', 'c']);
  });

  it('searches title, description, project and labels', () => {
    const tasks = [
      task({ id: 'a', title: 'Buy milk' }),
      task({ id: 'b', title: 'x', description: 'remember MILK' }),
      task({ id: 'c', title: 'y', projectId: 'w' }),
      task({ id: 'd', title: 'z', labelIds: ['e'] }),
      task({ id: 'e', title: 'milk done', completed: true }),
    ];
    expect(searchTasks(tasks, 'milk', projects, labels).map((t) => t.id)).toEqual(['a', 'b']);
    expect(searchTasks(tasks, 'work', projects, labels).map((t) => t.id)).toEqual(['c']);
    expect(searchTasks(tasks, '@errand', projects, labels).map((t) => t.id)).toEqual(['d']);
    expect(searchTasks(tasks, 'milk', projects, labels, true).map((t) => t.id)).toEqual(['a', 'b', 'e']);
  });

  it('orders nested projects and survives parent cycles', () => {
    const ps = [
      project({ id: 'a', title: 'A', order: 2 }),
      project({ id: 'b', title: 'B', order: 1 }),
      project({ id: 'c', title: 'C', parentId: 'a' }),
      project({ id: 'x', title: 'X', parentId: 'y' }),
      project({ id: 'y', title: 'Y', parentId: 'x' }),
      project({ id: 'z', title: 'Z', archived: true }),
    ];
    const out = orderedProjects(ps).map((p) => `${p.project.id}${p.depth}`);
    expect(out.slice(0, 3)).toEqual(['b0', 'a0', 'c1']);
    expect(out).toHaveLength(5);
    expect(out).not.toContain('z0');
  });

  it('treats legacy priorities safely and computes overdue with time', () => {
    expect(priorityOf({ priority: undefined as any })).toBe('None');
    expect(isOverdue(task({ dueDate: iso(2026, 10, 6), dueTime: '09:00' }), NOW)).toBe(true);
    expect(isOverdue(task({ dueDate: iso(2026, 10, 6), dueTime: '11:00' }), NOW)).toBe(false);
    expect(isOverdue(task({ dueDate: iso(2026, 10, 6) }), NOW)).toBe(false);
  });
});

describe('mutations', () => {
  it('completes a task with its subtasks', () => {
    const p = task({ id: 'p' });
    const s1 = task({ id: 's1', parentId: 'p' });
    const s2 = task({ id: 's2', parentId: 's1' });
    const r = completeTask(p, [p, s1, s2], NOW);
    expect(r.nextDueDate).toBeUndefined();
    expect(r.changed.map((t) => [t.id, t.completed])).toEqual([['p', true], ['s1', true], ['s2', true]]);
    expect(r.changed[0].completedAt).toBe(NOW.toISOString());
  });

  it('rolls a recurring task forward and resets its checklist', () => {
    const p = task({ id: 'p', dueDate: iso(2026, 10, 6), recurrence: { freq: 'daily', interval: 1 } });
    const s = task({ id: 's', parentId: 'p', completed: true });
    const r = completeTask(p, [p, s], NOW);
    expect(r.nextDueDate).toBe(iso(2026, 10, 7));
    expect(r.changed[0]).toMatchObject({ completed: false, dueDate: iso(2026, 10, 7) });
    expect(r.changed[1]).toMatchObject({ id: 's', completed: false });
  });

  it('restoring a subtask reopens completed ancestors', () => {
    const p = task({ id: 'p', completed: true });
    const s = task({ id: 's', parentId: 'p', completed: true });
    expect(uncompleteTask(s, [p, s]).map((t) => t.id)).toEqual(['s', 'p']);
  });

  it('deletes descendants with the task', () => {
    const p = task({ id: 'p' });
    expect(deletionSet(p, [p, task({ id: 'a', parentId: 'p' }), task({ id: 'b', parentId: 'a' })]).sort()).toEqual(['a', 'b', 'p']);
  });

  it('lists completed tasks newest first', () => {
    const a = task({ id: 'a', completed: true, completedAt: '2026-10-01T00:00:00Z' });
    const b = task({ id: 'b', completed: true, completedAt: '2026-10-05T00:00:00Z' });
    expect(completedTasks([a, b, task({ id: 'c' })]).map((t) => t.id)).toEqual(['b', 'a']);
  });
});
