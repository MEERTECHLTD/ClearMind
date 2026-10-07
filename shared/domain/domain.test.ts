import { describe, it, expect } from 'vitest';
import type { Task } from '../types';
import { stampEdit, mergeRecord } from '../sync/fields';
import {
  createTask, updateTask, completeTask, reopenTask, deleteTask, captureInbox, moveTasks, createProject, createSection,
  deleteSection, addComment, createLabel, applyTemplate, invertEdits, applyEdits, bulkUpdate, deleteProject,
  type DomainState, type Ctx, DomainError, idFromKey,
} from './ops';
import { runFilter, compileFilter, FilterSyntaxError } from './filters';
import { productivitySummary, dailyStreak, resolveInterval, momentum, projectStats } from './productivity';
import { globalSearch } from './views';
import { nextOccurrence, firstOccurrence, describeRecurrence, parseQuickAdd, toISODate } from '../tasks';
import { zonedToUtc, dayInZone } from '../tasks/time';

// Wednesday 7 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 7, 10, 0, 0);
const d = (y: number, m: number, day: number) => toISODate(new Date(y, m - 1, day));
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ now: NOW, source: 'web', ...over });
const empty = (): DomainState => ({ tasks: [], projects: [], labels: [], sections: [], comments: [], completions: [], filters: [], preferences: null });
const run = (s: DomainState, r: { edits: any[] }) => applyEdits(s, r.edits);

describe('field-level sync', () => {
  const base = stampEdit(undefined, { id: 't1', title: 'Write report', completed: false, description: 'v1' } as any, { clientId: 'A', now: '2026-10-07T09:00:00.000Z' }).record;

  it('stamps only changed fields and produces a minimal patch', () => {
    const r = stampEdit(base, { id: 't1', completed: true, title: 'Write report' } as any, { clientId: 'A', now: '2026-10-07T09:05:00.000Z' });
    expect(r.changed).toEqual(['completed']);
    expect(Object.keys(r.patch).sort()).toEqual(['_fc', 'clientId', 'completed', 'id', 'mutationId', 'updatedAt', 'version'].sort());
    expect(r.record.version).toBe(2);
  });

  it('keeps concurrent edits to different fields (complete on mobile + description on web)', () => {
    const mobile = stampEdit(base, { id: 't1', completed: true }, { clientId: 'android', now: '2026-10-07T09:10:00.000Z' }).record;
    const web = stampEdit(base, { id: 't1', description: 'v2' }, { clientId: 'web', now: '2026-10-07T09:11:00.000Z' }).record;
    const m1 = mergeRecord(mobile, web).merged;
    const m2 = mergeRecord(web, mobile).merged;
    expect(m1.completed).toBe(true);
    expect(m1.description).toBe('v2');
    expect(m2.completed).toBe(true);
    expect(m2.description).toBe('v2'); // converges regardless of direction
  });

  it('resolves same-field conflicts deterministically by clock', () => {
    const a = stampEdit(base, { id: 't1', title: 'A title' }, { clientId: 'A', now: '2026-10-07T09:20:00.000Z' }).record;
    const b = stampEdit(base, { id: 't1', title: 'B title' }, { clientId: 'B', now: '2026-10-07T09:21:00.000Z' }).record;
    expect(mergeRecord(a, b).merged.title).toBe('B title');
    expect(mergeRecord(b, a).merged.title).toBe('B title');
  });

  it('a stale offline edit cannot resurrect a deleted record', () => {
    const deleted = stampEdit(base, { id: 't1', deleted: true }, { clientId: 'web', now: '2026-10-07T10:00:00.000Z' }).record;
    const staleEdit = stampEdit(base, { id: 't1', title: 'edited offline' }, { clientId: 'android', now: '2026-10-07T10:05:00.000Z' }).record;
    const m = mergeRecord(staleEdit, deleted);
    expect(m.merged.deleted).toBe(true);
    expect(m.merged.title).toBe('edited offline');
  });

  it('reports what each side needs', () => {
    const local = stampEdit(base, { id: 't1', priority: 'High' }, { clientId: 'A', now: '2026-10-07T11:00:00.000Z' }).record;
    const r = mergeRecord(local, base);
    expect(r.remoteChanged).toBe(true);
    expect(r.remotePatch).toMatchObject({ id: 't1', priority: 'High' });
    expect(r.localChanged).toBe(false);
  });

  it('treats legacy records without clocks by their updatedAt', () => {
    const legacy = { id: 'x', title: 'old', updatedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { id: 'x', title: 'new', updatedAt: '2026-02-01T00:00:00.000Z' };
    expect(mergeRecord(legacy, newer).merged.title).toBe('new');
  });

  it('applies edits onto the current record without reverting newer fields', () => {
    const remoteNewer = { ...base, sectionId: 's9', _fc: { ...base._fc, sectionId: '2026-10-07T12:00:00.000Z' } };
    const r = stampEdit(remoteNewer as any, { id: 't1', priority: 'Low' }, { clientId: 'A', now: '2026-10-07T12:01:00.000Z' });
    expect(r.record.sectionId).toBe('s9');
  });
});

describe('task lifecycle', () => {
  it('creates idempotently with an idempotency key', () => {
    let s = empty();
    const r1 = createTask(s, { title: 'Pay rent', idempotencyKey: 'abc' }, ctx({ source: 'mcp', agent: 'Claude Code' }));
    s = run(s, r1);
    const r2 = createTask(s, { title: 'Pay rent', idempotencyKey: 'abc' }, ctx({ source: 'mcp' }));
    expect(r2.edits).toHaveLength(0);
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]).toMatchObject({ source: 'mcp', agent: 'Claude Code', priority: 'None' });
    expect(r1.edits.find((e) => e.coll === 'activity')!.edit).toMatchObject({ action: 'created', source: 'mcp', agent: 'Claude Code' });
  });

  it('validates input', () => {
    expect(() => createTask(empty(), { title: '  ' }, ctx())).toThrow(DomainError);
    expect(() => createTask(empty(), { title: 'x', dueDate: '07/10/2026' }, ctx())).toThrow(/YYYY-MM-DD/);
    expect(() => createTask(empty(), { title: 'x', projectId: 'nope' }, ctx())).toThrow(/not found/);
  });

  it('completes, records a completion event, and reopens (retracting it)', () => {
    let s = empty();
    const c = createTask(s, { title: 'Ship', dueDate: d(2026, 10, 6), priority: 'High' }, ctx());
    s = run(s, c);
    const done = completeTask(s, c.result.id, ctx({ source: 'android' }));
    s = run(s, done);
    expect(s.tasks[0].completed).toBe(true);
    expect(s.completions).toHaveLength(1);
    expect(s.completions![0]).toMatchObject({ id: `${c.result.id}@once`, wasOverdue: true, priority: 'High', source: 'android' });
    // Completing again is a no-op (idempotent).
    expect(completeTask(s, c.result.id, ctx()).edits).toHaveLength(0);
    s = run(s, reopenTask(s, c.result.id, ctx()));
    expect(s.tasks[0].completed).toBe(false);
    expect(s.completions![0].deleted).toBe(true);
  });

  it('rolls recurring tasks forward with one completion per occurrence', () => {
    let s = empty();
    const c = createTask(s, { title: 'Standup', recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] } }, ctx());
    s = run(s, c);
    expect(s.tasks[0].dueDate).toBe(d(2026, 10, 7));
    const r = completeTask(s, c.result.id, ctx());
    s = run(s, r);
    expect(r.result.nextDueDate).toBe(d(2026, 10, 8));
    expect(s.tasks[0].completed).toBe(false);
    expect(s.completions![0].occurrence).toBe(d(2026, 10, 7));
  });

  it('completes a recurring task for good once the rule ends', () => {
    let s = empty();
    const c = createTask(s, { title: 'Course', dueDate: d(2026, 10, 7), recurrence: { freq: 'daily', interval: 1, until: d(2026, 10, 7) } }, ctx());
    s = run(s, c);
    const r = completeTask(s, c.result.id, ctx());
    expect(r.result.nextDueDate).toBeNull();
    expect(run(s, r).tasks[0].completed).toBe(true);
  });

  it('deletes with tombstones and undoes via invertEdits', () => {
    let s = empty();
    const p = createTask(s, { title: 'Parent' }, ctx()); s = run(s, p);
    const ch = createTask(s, { title: 'Child', parentId: p.result.id }, ctx()); s = run(s, ch);
    const del = deleteTask(s, p.result.id, ctx());
    const undo = invertEdits(s, del.edits);
    s = run(s, del);
    expect(s.tasks.every((t) => t.deleted)).toBe(true);
    s = run(s, { edits: undo });
    expect(s.tasks.every((t) => !t.deleted)).toBe(true);
  });

  it('moves tasks between projects and sections; sections stay consistent', () => {
    let s = empty();
    const a = createProject(s, { title: 'A' }, ctx()); s = run(s, a);
    const b = createProject(s, { title: 'B' }, ctx()); s = run(s, b);
    const sec = createSection(s, { projectId: b.result.id, name: 'Payments' }, ctx()); s = run(s, sec);
    const t1 = createTask(s, { title: 'One', projectId: a.result.id }, ctx()); s = run(s, t1);
    const t2 = createTask(s, { title: 'Two', projectId: a.result.id }, ctx()); s = run(s, t2);
    s = run(s, moveTasks(s, [t1.result.id, t2.result.id], { sectionId: sec.result.id }, ctx({ source: 'mcp' })));
    expect(s.tasks.map((t) => [t.projectId, t.sectionId])).toEqual([[b.result.id, sec.result.id], [b.result.id, sec.result.id]]);
    expect(() => moveTasks(s, [t1.result.id], { projectId: a.result.id, sectionId: sec.result.id }, ctx())).toThrow(/different project/);
    s = run(s, deleteSection(s, sec.result.id, ctx()));
    expect(s.tasks.every((t) => t.sectionId === null && !t.deleted)).toBe(true);
  });

  it('bulk-updates and deletes whole projects', () => {
    let s = empty();
    const p = createProject(s, { title: 'Proj' }, ctx()); s = run(s, p);
    const sub = createProject(s, { title: 'Sub', parentId: p.result.id }, ctx()); s = run(s, sub);
    for (const title of ['a', 'b', 'c']) s = run(s, createTask(s, { title, projectId: sub.result.id }, ctx()));
    s = run(s, bulkUpdate(s, s.tasks.map((t) => t.id), { priority: 'High' }, ctx()));
    expect(s.tasks.every((t) => t.priority === 'High')).toBe(true);
    const del = deleteProject(s, p.result.id, ctx());
    expect(del.result).toEqual({ projects: 2, tasks: 3 });
  });
});

describe('inbox capture', () => {
  it('parses natural language and creates missing projects/labels', () => {
    let s = empty();
    const r = captureInbox(s, 'Call Ahmed tomorrow 9am every Monday #MeerTech p1 @calls !15m', ctx({ source: 'mcp' }));
    s = run(s, r);
    expect(s.projects.map((p) => p.title)).toEqual(['MeerTech']);
    expect(s.labels.map((l) => l.name)).toEqual(['calls']);
    expect(r.result).toMatchObject({ title: 'Call Ahmed', priority: 'High', dueTime: '09:00', projectId: s.projects[0].id, reminders: [{ type: 'relative', minutesBefore: 15 }] });
    expect(r.result.recurrence).toMatchObject({ freq: 'weekly', weekdays: [1] });
  });

  it('keeps text verbatim when parsing is off or it is a note', () => {
    const r = captureInbox(empty(), 'Idea: tomorrow #big p1', ctx(), { parse: false });
    expect(r.result).toMatchObject({ title: 'Idea: tomorrow #big p1', projectId: null });
    const n = captureInbox(empty(), 'Remember the blue notebook', ctx(), { kind: 'note' });
    expect(n.result.kind).toBe('note');
  });

  it('respects the smart-dates preference', () => {
    const s = { ...empty(), preferences: { id: 'preferences' as const, smartDates: false } };
    const r = captureInbox(s, 'Report tomorrow p2', ctx());
    expect(r.result.title).toBe('Report tomorrow');
    expect(r.result.dueDate).toBeUndefined();
    expect(r.result.priority).toBe('Medium');
  });
});

describe('comments, labels, templates', () => {
  it('adds comments idempotently', () => {
    let s = empty();
    const t = createTask(s, { title: 'x' }, ctx()); s = run(s, t);
    const c1 = addComment(s, { taskId: t.result.id, text: 'Looks good', idempotencyKey: 'k1' }, ctx()); s = run(s, c1);
    expect(addComment(s, { taskId: t.result.id, text: 'Looks good', idempotencyKey: 'k1' }, ctx()).edits).toHaveLength(0);
    expect(s.comments).toHaveLength(1);
  });
  it('dedupes labels by name across devices', () => {
    expect(createLabel(empty(), { name: '@Finance' }, ctx()).result.id).toBe(createLabel(empty(), { name: 'finance' }, ctx()).result.id);
  });
  it('applies a template with sections and tasks', () => {
    const r = applyTemplate(empty(), 'software-release', {}, ctx());
    const s = run(empty(), r);
    expect(s.projects).toHaveLength(1);
    expect(s.sections.map((x) => x.name)).toEqual(['Backlog', 'Development', 'Testing', 'Deployment']);
    expect(s.tasks.length).toBeGreaterThan(5);
    expect(s.tasks.every((t) => t.sectionId && t.projectId === s.projects[0].id)).toBe(true);
  });
  it('derives stable ids from idempotency keys', () => {
    expect(idFromKey('a')).toBe(idFromKey('a'));
    expect(idFromKey('a')).not.toBe(idFromKey('b'));
  });
});

describe('recurrence (advanced)', () => {
  it('handles monthly day, last day and nth weekday', () => {
    expect(nextOccurrence({ freq: 'monthly', interval: 1, monthDay: 1 }, d(2026, 10, 1), NOW)).toBe(d(2026, 11, 1));
    expect(nextOccurrence({ freq: 'monthly', interval: 1, monthDay: -1 }, d(2026, 10, 31), NOW)).toBe(d(2026, 11, 30));
    expect(nextOccurrence({ freq: 'monthly', interval: 1, nthWeekday: { weekday: 1, ordinal: 1 } }, d(2026, 10, 5), NOW)).toBe(d(2026, 11, 2));
    expect(nextOccurrence({ freq: 'monthly', interval: 1, nthWeekday: { weekday: 5, ordinal: -1 } }, d(2026, 10, 30), NOW)).toBe(d(2026, 11, 27));
    expect(nextOccurrence({ freq: 'monthly', interval: 3 }, d(2026, 10, 15), NOW)).toBe(d(2027, 1, 15));
    expect(firstOccurrence({ freq: 'monthly', interval: 1, nthWeekday: { weekday: 1, ordinal: 1 } }, NOW)).toBe(d(2026, 11, 2));
  });
  it('supports completion-anchored recurrence', () => {
    // Due long ago; anchored to completion → 30 days after today.
    expect(nextOccurrence({ freq: 'daily', interval: 30, anchor: 'completion' }, d(2026, 6, 1), NOW)).toBe(d(2026, 11, 6));
  });
  it('describes rules', () => {
    expect(describeRecurrence({ freq: 'monthly', interval: 1, monthDay: 1 })).toBe('Every month on the 1st');
    expect(describeRecurrence({ freq: 'monthly', interval: 1, monthDay: -1 })).toBe('Every month on the last day');
    expect(describeRecurrence({ freq: 'monthly', interval: 1, nthWeekday: { weekday: 1, ordinal: 1 } })).toBe('Every first Monday');
    expect(describeRecurrence({ freq: 'daily', interval: 30, anchor: 'completion' })).toBe('Every 30 days after completion');
  });
});

describe('quick add (extended)', () => {
  const P = { now: NOW, projects: [{ id: 'rw', title: 'RanaWallet' }], labels: [{ id: 'fin', name: 'finance' }] };
  it('parses the spec examples', () => {
    expect(parseQuickAdd('Call Simon tomorrow at 9am p1', P)).toMatchObject({ title: 'Call Simon', dueDate: d(2026, 10, 8), dueTime: '09:00', priority: 'High' });
    expect(parseQuickAdd('Recharge Tallese meters Friday #RanaWallet', P)).toMatchObject({ title: 'Recharge Tallese meters', dueDate: d(2026, 10, 9), projectId: 'rw' });
    const odyssey = parseQuickAdd('Send Odyssey API update every Monday at 10am', P);
    expect(odyssey).toMatchObject({ title: 'Send Odyssey API update', dueTime: '10:00', recurrence: { freq: 'weekly', weekdays: [1] } });
    expect(parseQuickAdd('Follow up with Ahmed in 3 days', P)).toMatchObject({ title: 'Follow up with Ahmed', dueDate: d(2026, 10, 10) });
    expect(parseQuickAdd('Review Flutterwave settlement next Wednesday @finance', P)).toMatchObject({ title: 'Review Flutterwave settlement', dueDate: d(2026, 10, 14), labels: [{ id: 'fin', name: 'finance' }] });
  });
  it('parses advanced recurrence phrases', () => {
    expect(parseQuickAdd('Pay rent every month on the 1st', P).recurrence).toMatchObject({ freq: 'monthly', monthDay: 1, anchor: 'scheduled' });
    expect(parseQuickAdd('Board report first monday of every month', P).recurrence).toMatchObject({ nthWeekday: { weekday: 1, ordinal: 1 } });
    expect(parseQuickAdd('Invoices last day of every month', P).recurrence).toMatchObject({ monthDay: -1 });
    expect(parseQuickAdd('Service generator every 30 days after completion', P)).toMatchObject({ title: 'Service generator', recurrence: { freq: 'daily', interval: 30, anchor: 'completion' } });
    expect(parseQuickAdd('Water plants every! 3 days', P).recurrence).toMatchObject({ anchor: 'completion' });
    expect(parseQuickAdd('Taxes every 3 months', P).recurrence).toMatchObject({ freq: 'monthly', interval: 3 });
    expect(parseQuickAdd('Weekly sync every Friday at 4pm', P)).toMatchObject({ dueTime: '16:00', recurrence: { weekdays: [5] } });
  });
  it('parses reminders and durations', () => {
    const r = parseQuickAdd('Dentist tomorrow 3pm !1h !14:30 for 45 min', P);
    expect(r).toMatchObject({ title: 'Dentist', dueTime: '15:00', duration: 45 });
    expect(r.reminders).toEqual([{ minutesBefore: 60 }, { time: '14:30' }]);
  });
  it('honours next-week and weekend settings', () => {
    expect(parseQuickAdd('x next week', { ...P, nextWeek: 'plus7' }).dueDate).toBe(d(2026, 10, 14));
    expect(parseQuickAdd('x weekend', { ...P, weekend: 'sunday' }).dueDate).toBe(d(2026, 10, 11));
  });
});

describe('filters', () => {
  let s = empty();
  const p = createProject(s, { title: 'RanaWallet' }, ctx()); s = run(s, p);
  const w = createLabel(s, { name: 'waiting' }, ctx()); s = run(s, w);
  s = run(s, createTask(s, { title: 'Prod keys', priority: 'High', projectId: p.result.id }, ctx()));
  s = run(s, createTask(s, { title: 'Partner reply', priority: 'High', projectId: p.result.id, labelIds: [w.result.id] }, ctx()));
  s = run(s, createTask(s, { title: 'Old thing', dueDate: d(2026, 10, 1) }, ctx()));
  const fc = { projects: s.projects, labels: s.labels, sections: s.sections, now: NOW };
  it('combines terms with & | ! and groups', () => {
    expect(runFilter(s.tasks, 'p1 & #RanaWallet & !@waiting', fc).map((t) => t.title)).toEqual(['Prod keys']);
    expect(runFilter(s.tasks, '(overdue | @waiting)', fc).map((t) => t.title).sort()).toEqual(['Old thing', 'Partner reply']);
    expect(runFilter(s.tasks, 'no date & !p1', fc)).toHaveLength(0);
    expect(runFilter(s.tasks, 'search: keys', fc).map((t) => t.title)).toEqual(['Prod keys']);
  });
  it('rejects malformed queries', () => {
    expect(() => compileFilter('p1 & (', fc)).toThrow(FilterSyntaxError);
  });
});

describe('productivity engine', () => {
  const comp = (day: string, i: number, priority: Task['priority'] = 'None', over = {}) =>
    ({ id: `t${day}${i}@once`, taskId: `t${day}${i}`, title: 'x', priority, occurrence: 'once', completedAt: `${day}T10:00:00.000Z`, day, ...over });
  const days = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
  const completions = days.flatMap((day) => [0, 1, 2, 3, 4].map((i) => comp(day, i, i === 0 ? 'High' : 'None')));
  const prefs = { id: 'preferences' as const, dailyGoal: 5, weeklyGoal: 20, weekStart: 1 as const };

  it('computes today, week and intervals with the week-start preference', () => {
    const p = productivitySummary({ completions, tasks: [], preferences: prefs, now: NOW });
    expect(p.today).toMatchObject({ completed: 5, goal: 5, met: true, highPriority: 1 });
    expect(p.week.from).toBe('2026-10-05');
    expect(p.week.completed).toBe(15);
    expect(resolveInterval('this_week', { ...prefs, weekStart: 0 }, NOW).from).toBe('2026-10-04');
  });
  it('tracks streaks and skips days off', () => {
    expect(dailyStreak(completions, prefs, NOW)).toEqual({ current: 5, longest: 5 });
    const gap = completions.filter((c) => c.day !== '2026-10-05');
    expect(dailyStreak(gap, prefs, NOW).current).toBe(2);
    expect(dailyStreak(gap, { ...prefs, daysOff: [1] }, NOW).current).toBe(4); // Oct 5 is a Monday (day off)
  });
  it('scores momentum from events, and retracted completions do not count', () => {
    const m = momentum({ completions, tasks: [], preferences: prefs, now: NOW });
    expect(m.totalCompleted).toBe(25);
    expect(m.score).toBeGreaterThan(0);
    const retracted = completions.map((c, i) => (i === 0 ? { ...c, deleted: true } : c));
    expect(momentum({ completions: retracted, tasks: [], preferences: prefs, now: NOW }).totalCompleted).toBe(24);
  });
  it('produces project tracker stats', () => {
    let s = empty();
    const p = createProject(s, { title: 'Launch' }, ctx()); s = run(s, p);
    const sec = createSection(s, { projectId: p.result.id, name: 'Blocks the build' }, ctx()); s = run(s, sec);
    s = run(s, createTask(s, { title: 'blocker', projectId: p.result.id, sectionId: sec.result.id, priority: 'High' }, ctx()));
    const done = createTask(s, { title: 'done', projectId: p.result.id }, ctx()); s = run(s, done);
    s = run(s, completeTask(s, done.result.id, ctx()));
    const st = projectStats([p.result.id], { tasks: s.tasks, completions: s.completions!, sections: s.sections, preferences: null, now: NOW });
    expect(st).toMatchObject({ total: 2, open: 1, completed: 1, blocked: 1, highPriority: 1, progress: 50, completedThisWeek: 1 });
  });
});

describe('search & time zones', () => {
  it('searches comments and section names too', () => {
    let s = empty();
    const p = createProject(s, { title: 'Odyssey' }, ctx()); s = run(s, p);
    const sec = createSection(s, { projectId: p.result.id, name: 'Payments' }, ctx()); s = run(s, sec);
    const t = createTask(s, { title: 'Endpoint docs', projectId: p.result.id, sectionId: sec.result.id }, ctx()); s = run(s, t);
    s = run(s, addComment(s, { taskId: t.result.id, text: 'include settlement history' }, ctx()));
    expect(globalSearch(s as any, 'settlement').tasks.map((x) => x.title)).toEqual(['Endpoint docs']);
    expect(globalSearch(s as any, 'payments').tasks).toHaveLength(1);
  });
  it('keeps local wall-clock times in their zone', () => {
    expect(zonedToUtc('2026-10-07', '09:00', 'Africa/Lagos')!.toISOString()).toBe('2026-10-07T08:00:00.000Z');
    expect(dayInZone('2026-10-07T23:30:00.000Z', 'Africa/Lagos')).toBe('2026-10-08');
    expect(dayInZone('2026-10-07T23:30:00.000Z', 'America/New_York')).toBe('2026-10-07');
  });
});

describe('update semantics', () => {
  it('records meaningful activity only', () => {
    let s = empty();
    const t = createTask(s, { title: 'x', priority: 'Low' }, ctx()); s = run(s, t);
    const u = updateTask(s, t.result.id, { priority: 'High', dueDate: d(2026, 10, 9), description: 'details' }, ctx({ source: 'mcp', agent: 'Codex' }));
    const acts = u.edits.filter((e) => e.coll === 'activity').map((e) => e.edit);
    expect(acts.map((a) => a.action)).toEqual(['priority', 'rescheduled']);
    expect(acts[0]).toMatchObject({ details: { from: 'P3', to: 'P1' }, agent: 'Codex', source: 'mcp' });
  });
  it('clearing the date clears time and recurrence', () => {
    let s = empty();
    const t = createTask(s, { title: 'x', dueDate: d(2026, 10, 9), dueTime: '10:00', recurrence: { freq: 'daily', interval: 1 } }, ctx()); s = run(s, t);
    s = run(s, updateTask(s, t.result.id, { dueDate: null }, ctx()));
    expect(s.tasks[0]).toMatchObject({ dueDate: null, dueTime: null, recurrence: null });
  });
});
