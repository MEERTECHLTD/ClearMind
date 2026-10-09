import { describe, it, expect } from 'vitest';
import type { Application, CalendarEvent, DailyMapperEntry, Goal, Habit, Milestone, Project } from '../shared/types';
import { acrossClearMind, deadlinesFor, scheduleFor, relDay } from './acrossClearMind';

const TODAY = '2026-10-09'; // a Friday

const app = (id: string, over: Partial<Application>): Application => ({ id, name: id, type: 'job', status: 'open', priority: 'medium', ...over } as Application);
const proj = (id: string, over: Partial<Project>): Project => ({ id, title: id, description: '', status: 'In Progress', progress: 0, tags: [], ...over } as Project);

describe('relDay', () => {
  it('labels overdue / today / tomorrow / weekday', () => {
    expect(relDay('2026-10-08', TODAY, '2026-10-10')).toBe('overdue');
    expect(relDay(TODAY, TODAY, '2026-10-10')).toBe('today');
    expect(relDay('2026-10-10', TODAY, '2026-10-10')).toBe('tomorrow');
    expect(relDay('2026-10-12', TODAY, '2026-10-10')).toBe('Mon');
  });
});

describe('scheduleFor', () => {
  it('lists today’s events and unfinished mapper blocks by start time', () => {
    const events = [
      { id: 'e1', title: 'Standup', date: TODAY, startTime: '09:30', endTime: '09:45', color: '#f00', reminder: false },
      { id: 'e2', title: 'Tomorrow thing', date: '2026-10-10', color: '#f00', reminder: false },
      { id: 'e3', title: 'Holiday', date: TODAY, color: '#0f0', reminder: false },
    ] as CalendarEvent[];
    const blocks = [
      { id: 'b1', date: TODAY, startTime: '08:00', endTime: '09:00', task: 'Deep work', completed: 'no' },
      { id: 'b2', date: TODAY, startTime: '07:00', endTime: '07:30', task: 'Run', completed: 'yes' },
    ] as DailyMapperEntry[];
    const rows = scheduleFor(TODAY, events, blocks);
    expect(rows.map((r) => r.title)).toEqual(['Holiday', 'Deep work', 'Standup']);
    expect(rows[0].meta).toBe('All day');
    expect(rows[2].meta).toBe('09:30–09:45');
    expect(rows.find((r) => r.kind === 'block')!.hash).toBe('dailymapper');
    expect(rows.find((r) => r.kind === 'event')!.hash).toBe('calendar');
  });
});

describe('deadlinesFor', () => {
  it('picks the next 7 days from each tool, skipping closed/finished items', () => {
    const rows = deadlinesFor(TODAY, {
      applications: [
        app('open-soon', { submissionDeadline: '2026-10-10' }),
        app('closing-date-only', { closingDate: '2026-10-14' }),
        app('submitted', { status: 'submitted', submissionDeadline: '2026-10-10' }),
        app('far', { submissionDeadline: '2026-10-30' }),
        app('past', { submissionDeadline: '2026-10-01' }),
      ],
      projects: [
        proj('p-due', { deadline: '2026-10-12' }),
        proj('p-done', { deadline: '2026-10-12', status: 'Completed' }),
        proj('p-cancel', { deadline: '2026-10-12', status: 'Cancelled' }),
        proj('p-archived', { deadline: '2026-10-12', archived: true }),
        proj('p-deleted', { deadline: '2026-10-12', deleted: true } as Partial<Project>),
      ],
      goals: [
        { id: 'g-late', title: 'g-late', targetDate: '2026-10-05', progress: 50, category: 'Skill' },
        { id: 'g-done', title: 'g-done', targetDate: '2026-10-11', progress: 100, category: 'Skill' },
      ] as Goal[],
      milestones: [
        { id: 'm-today', title: 'm-today', date: TODAY, completed: false, description: '' },
        { id: 'm-done', title: 'm-done', date: TODAY, completed: true, description: '' },
        { id: 'm-past', title: 'm-past', date: '2026-10-01', completed: false, description: '' },
      ] as Milestone[],
    });
    expect(rows.map((r) => r.title)).toEqual(['g-late', 'm-today', 'open-soon', 'p-due', 'closing-date-only']);
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
    expect(byTitle['g-late'].urgent).toBe(true);
    expect(byTitle['open-soon'].urgent).toBe(true);
    expect(byTitle['p-due'].hash).toBe('project/p-due?tab=plan');
    expect(byTitle['closing-date-only'].hash).toBe('applications');
    expect(byTitle['m-today'].meta).toBe('today');
  });

  it('includes the 7th day and excludes the 8th', () => {
    const rows = deadlinesFor(TODAY, { projects: [proj('d7', { deadline: '2026-10-16' }), proj('d8', { deadline: '2026-10-17' })] });
    expect(rows.map((r) => r.title)).toEqual(['d7']);
  });
});

describe('acrossClearMind', () => {
  it('counts habits done today and caps rows', () => {
    const habits = [
      { id: 'h1', name: 'a', streak: 1, completedToday: true, history: [] },
      { id: 'h2', name: 'b', streak: 0, completedToday: false, history: [] },
    ] as Habit[];
    const projects = Array.from({ length: 8 }, (_, i) => proj(`p${i}`, { deadline: '2026-10-11' }));
    const s = acrossClearMind(TODAY, { habits, projects });
    expect(s.habitsDone).toBe(1);
    expect(s.habitsTotal).toBe(2);
    expect(s.deadlines).toHaveLength(5);
    expect(s.empty).toBe(false);
  });

  it('is empty when there is nothing to show', () => {
    expect(acrossClearMind(TODAY, {}).empty).toBe(true);
  });
});
