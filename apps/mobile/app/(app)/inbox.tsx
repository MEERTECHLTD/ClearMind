import { useMemo } from 'react';
import { Inbox } from 'lucide-react-native';
import { inboxTasks } from '@clearmind/shared/tasks';
import { TaskScreen, EmptyTasks } from '../../components/tasks/TaskScreen';
import { TaskList, taskItems, type ListItem } from '../../components/tasks/TaskList';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { C } from '../../components/tasks/theme';

export default function InboxScreen() {
  const ui = useTaskUI();
  const tasks = useMemo(() => inboxTasks(ui.tasks, ui.projectMap), [ui.tasks, ui.projectMap]);
  const items = useMemo<ListItem[]>(
    () => (tasks.length ? [...taskItems(tasks), { type: 'add', key: 'add', defaults: { projectId: null } }] : []),
    [tasks]
  );
  return (
    <TaskScreen title="Inbox" subtitle={tasks.length ? `${tasks.length} task${tasks.length === 1 ? '' : 's'}` : undefined} addDefaults={{ projectId: null }}>
      <TaskList
        items={items}
        empty={<EmptyTasks icon={<Inbox size={36} color={C.accent} />} title="Your Inbox is clear" subtitle="Capture anything with + — sort it into projects later." />}
      />
    </TaskScreen>
  );
}
