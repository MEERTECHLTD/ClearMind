import { useMemo } from 'react';
import { CircleCheck } from 'lucide-react-native';
import { completedTasks, toISODate, formatDayHeading } from '@clearmind/shared/tasks';
import { TaskScreen, EmptyTasks } from '../../components/tasks/TaskScreen';
import { TaskList, type ListItem } from '../../components/tasks/TaskList';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { C } from '../../components/tasks/theme';

const MAX = 500; // keep the view fast for long-time users

/** Completed tasks grouped by completion day; tap the tick to restore one. */
export default function CompletedScreen() {
  const ui = useTaskUI();
  const done = useMemo(() => completedTasks(ui.tasks), [ui.tasks]);
  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    let current = '';
    for (const t of done.slice(0, MAX)) {
      const d = t.completedAt ? new Date(t.completedAt) : null;
      const day = d && !Number.isNaN(d.getTime()) ? toISODate(d) : 'earlier';
      if (day !== current) {
        current = day;
        out.push({ type: 'header', key: `h-${day}`, title: day === 'earlier' ? 'Earlier' : formatDayHeading(day) });
      }
      out.push({ type: 'task', key: t.id, task: t });
    }
    if (done.length > MAX) out.push({ type: 'note', key: 'more', text: `Showing the latest ${MAX} of ${done.length} completed tasks.` });
    return out;
  }, [done]);

  return (
    <TaskScreen title="Completed" subtitle={done.length ? `${done.length} task${done.length === 1 ? '' : 's'} · tap a tick to restore` : undefined} back fab={false}>
      <TaskList items={items} showProject showParent empty={<EmptyTasks icon={<CircleCheck size={34} color={C.success} />} title="No completed tasks yet" subtitle="Tasks you finish show up here, and can be restored." />} />
    </TaskScreen>
  );
}
