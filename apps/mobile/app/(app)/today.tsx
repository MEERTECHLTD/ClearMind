import { useMemo } from 'react';
import { Sun } from 'lucide-react-native';
import { todayView, WEEKDAY_SHORT, MONTH_SHORT } from '@clearmind/shared/tasks';
import { TaskScreen, EmptyTasks } from '../../components/tasks/TaskScreen';
import { TaskList, taskItems, type ListItem } from '../../components/tasks/TaskList';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { C } from '../../components/tasks/theme';
import { updateTask } from '../../services/taskActions';
import { useToast } from '../../components/ui';
import { useDayTick } from '../../hooks/useDayTick';

export default function TodayScreen() {
  const ui = useTaskUI();
  const toast = useToast();
  const today = useDayTick(); // re-buckets at midnight / on resume
  const now = new Date();
  const { overdue, today: due } = useMemo(() => todayView(ui.tasks, new Date()), [ui.tasks, today]);

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    if (overdue.length) {
      out.push({
        type: 'header', key: 'h-overdue', title: 'Overdue', color: C.danger,
        action: {
          label: 'Reschedule',
          onPress: () => {
            overdue.forEach((t) => updateTask(t, { dueDate: today }));
            toast.show(`Moved ${overdue.length} task${overdue.length === 1 ? '' : 's'} to today`, 'success');
          },
        },
      });
      out.push(...taskItems(overdue, 'o-'));
    }
    if (overdue.length || due.length) {
      out.push({ type: 'header', key: 'h-today', title: 'Today', subtitle: `${WEEKDAY_SHORT[now.getDay()]} ${MONTH_SHORT[now.getMonth()]} ${now.getDate()}` });
      out.push(...taskItems(due, 't-'));
    }
    if (overdue.length || due.length) out.push({ type: 'add', key: 'add', defaults: { dueDate: today } });
    return out;
  }, [overdue, due, today, toast]);

  const count = overdue.length + due.length;
  return (
    <TaskScreen
      title="Today"
      subtitle={count ? `${count} task${count === 1 ? '' : 's'}` : `${WEEKDAY_SHORT[now.getDay()]} ${MONTH_SHORT[now.getMonth()]} ${now.getDate()}`}
      addDefaults={{ dueDate: today }}
    >
      <TaskList
        items={items}
        showProject
        showParent
        empty={<EmptyTasks icon={<Sun size={36} color={C.today} />} title="You’re all clear for today" subtitle="Enjoy the calm — or tap + to plan something." />}
      />
    </TaskScreen>
  );
}
