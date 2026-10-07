/** Built-in project templates (architecture ready for user-created templates later). */
import type { TaskPriority } from '../types';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  view: 'list' | 'board';
  sections: { name: string; tasks: { title: string; priority?: TaskPriority; description?: string }[] }[];
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'software-release', name: 'Software release', description: 'Plan, build, test and ship a release.', icon: '🚀', color: '#3B82F6', view: 'board',
    sections: [
      { name: 'Backlog', tasks: [{ title: 'Collect requirements' }, { title: 'Write acceptance criteria' }] },
      { name: 'Development', tasks: [{ title: 'Implement features', priority: 'Medium' }, { title: 'Code review' }] },
      { name: 'Testing', tasks: [{ title: 'Regression test pass', priority: 'Medium' }, { title: 'Fix release blockers', priority: 'High' }] },
      { name: 'Deployment', tasks: [{ title: 'Prepare release notes' }, { title: 'Deploy to production', priority: 'High' }, { title: 'Monitor after release' }] },
    ],
  },
  {
    id: 'product-launch', name: 'Product launch', description: 'Track blockers and everything needed before go-live.', icon: '📣', color: '#F97316', view: 'list',
    sections: [
      { name: 'Blocks the launch', tasks: [{ title: 'Resolve launch blockers', priority: 'High' }] },
      { name: 'Before go-live', tasks: [{ title: 'Final QA sign-off', priority: 'Medium' }, { title: 'Production credentials in place', priority: 'High' }] },
      { name: 'Launch day', tasks: [{ title: 'Announce launch' }, { title: 'Watch dashboards & support' }] },
      { name: 'Backlog', tasks: [] },
    ],
  },
  {
    id: 'kanban', name: 'Kanban board', description: 'A simple board: To do → In progress → Waiting → Done.', icon: '🗂️', color: '#14B8A6', view: 'board',
    sections: [{ name: 'To do', tasks: [] }, { name: 'In progress', tasks: [] }, { name: 'Waiting', tasks: [] }, { name: 'Done', tasks: [] }],
  },
  {
    id: 'weekly-review', name: 'Weekly review', description: 'A repeatable routine to close the week well.', icon: '🗓️', color: '#8B5CF6', view: 'list',
    sections: [
      { name: 'Get clear', tasks: [{ title: 'Empty the Inbox' }, { title: 'Review notes & loose papers' }] },
      { name: 'Get current', tasks: [{ title: 'Review overdue tasks' }, { title: 'Review upcoming calendar' }, { title: 'Update project statuses' }] },
      { name: 'Get creative', tasks: [{ title: 'Pick next week’s top 3 priorities', priority: 'High' }] },
    ],
  },
  {
    id: 'personal', name: 'Personal life', description: 'Home, health, errands and admin.', icon: '🏡', color: '#22C55E', view: 'list',
    sections: [{ name: 'Home', tasks: [] }, { name: 'Health', tasks: [] }, { name: 'Errands', tasks: [] }, { name: 'Admin & bills', tasks: [] }],
  },
];
