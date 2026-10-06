import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TaskScreen, EmptyTasks } from '../../../components/tasks/TaskScreen';
import { TaskList, taskItems } from '../../../components/tasks/TaskList';
import { useTaskUI } from '../../../components/tasks/TaskUIProvider';
import { FILTERS } from '../../../components/tasks/filters';
import { priorityFromLevel, todayISO } from '@clearmind/shared/tasks';

export default function FilterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ui = useTaskUI();
  const filter = FILTERS.find((f) => f.id === id) ?? FILTERS[0];
  const tasks = useMemo(() => filter.select(ui.tasks), [filter, ui.tasks]);
  const items = useMemo(() => taskItems(tasks), [tasks]);

  // New tasks added here should land in the filter where that's meaningful.
  const pLevel = /^p([1-3])$/.exec(filter.id);
  const addDefaults = pLevel
    ? { priority: priorityFromLevel(Number(pLevel[1])) }
    : filter.id === 'next7' ? { dueDate: todayISO() } : {};

  return (
    <TaskScreen title={filter.title} subtitle={tasks.length ? `${tasks.length} task${tasks.length === 1 ? '' : 's'}` : undefined} back addDefaults={addDefaults}>
      <TaskList items={items} showProject showParent empty={<EmptyTasks icon={filter.icon} title={filter.emptyText} />} />
    </TaskScreen>
  );
}
