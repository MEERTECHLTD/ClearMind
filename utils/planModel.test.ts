import { describe, it, expect } from 'vitest';
import type { Project } from '../shared/types';
import { applyPlanForm, emptyForm, formFromProject, hasPlan, planPatch, taskPct, taskProgressByProject } from './planModel';

const taskProject = (over: Partial<Project> = {}): Project => ({
  id: 'p1', title: 'Website', description: '', status: 'In Progress', progress: 0, tags: [],
  color: '#ff0000', parentId: null, order: 3, archived: false, favorite: true, view: 'board', createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
} as Project);

describe('plan model', () => {
  it('a plain task project has no plan; plan fields make one', () => {
    expect(hasPlan(taskProject())).toBe(false);
    expect(hasPlan(taskProject({ deadline: '2026-12-01' }))).toBe(true);
    expect(hasPlan(taskProject({ status: 'On Hold' }))).toBe(true);
    expect(hasPlan(taskProject({ risks: [{ id: 'r', title: 'x', severity: 'Low', likelihood: 'Low', status: 'Open' }] }))).toBe(true);
  });

  it('editing keeps task-list fields and sub-entities (spreads the record)', () => {
    const phases = [{ id: 'ph', name: 'Build', order: 1, status: 'In Progress' as const, progress: 50, deliverables: [] }];
    const base = taskProject({ implementationPlan: { phases }, teamCheckIns: [{ id: 'c', date: '2026-01-02', attendees: [], notes: 'n' }] });
    const f = { ...formFromProject(base), title: '  Website v2 ', team: 'Ann, Bob ,', totalBudget: '5000', deadline: '2026-12-01' };
    const next = applyPlanForm(base, f, base.id);
    expect(next.title).toBe('Website v2');
    expect(next.team).toEqual(['Ann', 'Bob']);
    expect(next.totalBudget).toBe(5000);
    expect(next.color).toBe('#ff0000');
    expect(next.view).toBe('board');
    expect(next.order).toBe(3);
    expect(next.implementationPlan?.phases).toEqual(phases);
    expect(next.teamCheckIns).toHaveLength(1);
  });

  it('creates a fresh plan record', () => {
    const p = applyPlanForm(null, { ...emptyForm(), title: 'New', progress: 140 }, 'id1');
    expect(p.id).toBe('id1');
    expect(p.progress).toBe(100);
    expect(p.totalBudget).toBeUndefined();
    expect(p.projectMilestones).toEqual([]);
  });

  it('planPatch never carries identity or task-list fields', () => {
    const patch = planPatch({ ...taskProject({ deadline: '2026-12-01' }), __wsId: 'ws' } as Project);
    for (const k of ['id', 'createdAt', 'color', 'parentId', 'order', 'archived', 'favorite', 'view', '__wsId']) expect(patch).not.toHaveProperty(k);
    expect(patch.deadline).toBe('2026-12-01');
    expect(patch.title).toBe('Website');
  });

  it('task progress counts top-level open/done tasks per project', () => {
    const m = taskProgressByProject([
      { projectId: 'p1', completed: true }, { projectId: 'p1' }, { projectId: 'p1', parentId: 'x', completed: true },
      { projectId: 'p1', deleted: true }, { projectId: null },
    ]);
    expect(m.get('p1')).toEqual({ open: 1, done: 1 });
    expect(taskPct(m.get('p1'))).toBe(50);
    expect(taskPct({ open: 0, done: 0 })).toBeNull();
  });
});
