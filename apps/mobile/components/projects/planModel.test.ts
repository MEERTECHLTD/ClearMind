import { describe, it, expect } from 'vitest';
import type { Project } from '@clearmind/shared';
import { applyPlanForm, formFromProject, emptyForm, hasPlan, csvToList } from './planModel';

const taskProject: Project = {
  id: 'p1', title: 'Website', description: '', status: 'In Progress', progress: 0, tags: [],
  color: '#F43F5E', parentId: 'parent', order: 3, archived: false, favorite: true, view: 'board',
  implementationPlan: { phases: [{ id: 'ph', name: 'Build', status: 'In Progress', progress: 40, deliverables: [], order: 1 }] },
  risks: [{ id: 'r', title: 'Scope', severity: 'High', likelihood: 'Medium', status: 'Open' }],
};

describe('project plan model', () => {
  it('editing the plan keeps task-list fields and deferred sub-entities', () => {
    const f = { ...formFromProject(taskProject), status: 'On Hold' as const, team: 'Ada, Lin', deadline: '2026-12-01' };
    const next = applyPlanForm(taskProject, f, 'ignored');
    expect(next).toMatchObject({ id: 'p1', color: '#F43F5E', parentId: 'parent', order: 3, favorite: true, view: 'board', status: 'On Hold', team: ['Ada', 'Lin'], deadline: '2026-12-01' });
    expect(next.implementationPlan?.phases).toHaveLength(1);
    expect(next.risks).toHaveLength(1);
  });

  it('creating from the form yields a valid project', () => {
    const p = applyPlanForm(null, { ...emptyForm(), title: '  Launch  ', tags: 'a, ,b' }, 'new');
    expect(p).toMatchObject({ id: 'new', title: 'Launch', status: 'Planning', tags: ['a', 'b'], projectMilestones: [], teamCheckIns: [] });
  });

  it('hasPlan distinguishes plain task projects from planned ones', () => {
    expect(hasPlan({ id: 'x', title: 'Inbox-ish', description: '', status: 'Planning', progress: 0, tags: [] })).toBe(false);
    expect(hasPlan(taskProject)).toBe(true);
    expect(hasPlan({ id: 'y', title: 't', description: '', status: 'Planning', progress: 0, tags: [], deadline: '2026-01-01' })).toBe(true);
  });

  it('csv helper trims and drops blanks', () => {
    expect(csvToList(' a ,b,, c ')).toEqual(['a', 'b', 'c']);
  });
});
