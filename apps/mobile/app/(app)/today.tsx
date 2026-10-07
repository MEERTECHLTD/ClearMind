import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Sun, Flame, CalendarArrowUp } from 'lucide-react-native';
import type { Completion } from '@clearmind/shared';
import { todayView, WEEKDAY_LONG, MONTH_LONG, addDays, toISODate } from '@clearmind/shared/tasks';
import { daySummary, dailyStreak } from '@clearmind/shared/domain';
import { TaskScreen, EmptyTasks } from '../../components/tasks/TaskScreen';
import { TaskList, taskItems, type ListItem } from '../../components/tasks/TaskList';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { C } from '../../components/tasks/theme';
import { bulkUpdate } from '../../services/taskActions';
import { useCollection } from '../../hooks/useCollection';
import { STORES } from '../../services/db';
import { useToast } from '../../components/ui';
import { useDayTick } from '../../hooks/useDayTick';
import { T } from '../../lib/theme';

/** Today — the daily command center. */
export default function TodayScreen() {
  const ui = useTaskUI();
  const router = useRouter();
  const toast = useToast();
  const today = useDayTick(); // re-buckets at midnight / on resume
  const { items: completions } = useCollection<Completion>(STORES.COMPLETIONS);
  const [showDone, setShowDone] = useState(false);
  const now = new Date();
  const { overdue, today: due } = useMemo(() => todayView(ui.tasks, new Date()), [ui.tasks, today]);
  const day = useMemo(() => daySummary({ completions, tasks: ui.tasks, preferences: ui.prefs }), [completions, ui.tasks, ui.prefs, today]);
  const streak = useMemo(() => dailyStreak(completions, ui.prefs).current, [completions, ui.prefs, today]);
  const doneToday = useMemo(() => completions.filter((c) => !c.deleted && c.day === today).sort((a, b) => b.completedAt.localeCompare(a.completedAt)), [completions, today]);

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    if (overdue.length) {
      out.push({
        type: 'header', key: 'h-overdue', title: 'Overdue', subtitle: String(overdue.length), color: C.danger,
        action: {
          label: 'Reschedule all',
          onPress: () => {
            const r = bulkUpdate(overdue.map((t) => t.id), { dueDate: today });
            toast.show(`Moved ${overdue.length} task${overdue.length === 1 ? '' : 's'} to today`, 'info', { label: 'Undo', onPress: r.undo });
          },
        },
      });
      out.push(...taskItems(overdue, 'o-'));
    }
    out.push({ type: 'header', key: 'h-today', title: 'Today', subtitle: due.length ? String(due.length) : undefined });
    out.push(...taskItems(due, 't-'));
    out.push({ type: 'add', key: 'add', defaults: { dueDate: today } });
    if (doneToday.length) {
      out.push({ type: 'header', key: 'h-done', title: 'Completed today', subtitle: String(doneToday.length), color: C.success, collapsed: !showDone, onToggle: () => setShowDone((x) => !x) });
      if (showDone) {
        const doneTasks = ui.tasks.filter((t) => t.completed && doneToday.some((c) => c.taskId === t.id));
        out.push(...taskItems(doneTasks, 'd-'));
        // Recurring tasks rolled forward — show their completion records.
        for (const c of doneToday) if (!doneTasks.some((t) => t.id === c.taskId)) out.push({ type: 'note', key: `n-${c.id}`, text: `✓ ${c.title}` });
      }
    }
    return out;
  }, [overdue, due, today, doneToday, showDone, ui.tasks, toast]);

  const pct = Math.min(1, day.goal ? day.completed / day.goal : 0);
  const tomorrow = toISODate(addDays(now, 1));
  const header = (
    <Pressable onPress={() => router.push('/(app)/productivity')} className="mx-4 mt-1 mb-1 p-3 rounded-2xl bg-midnight-light border border-line flex-row items-center" accessibilityRole="button" accessibilityLabel={`${day.completed} of ${day.goal} tasks done today, ${streak} day streak`}>
      <View className="flex-1">
        <Text className="text-ink text-sm font-semibold">{day.met ? 'Daily goal reached 🎉' : `${day.completed}/${day.goal} done today`}</Text>
        <View className="h-2 rounded-full bg-midnight-lighter mt-2 overflow-hidden"><View style={{ width: `${Math.round(pct * 100)}%`, height: 8, backgroundColor: day.met ? T.success : T.accent }} /></View>
      </View>
      <View className="flex-row items-center ml-4">
        <Flame size={18} color={streak ? '#F97316' : C.muted} />
        <Text className="text-ink font-bold ml-1">{streak}</Text>
      </View>
    </Pressable>
  );

  const count = overdue.length + due.length;
  return (
    <TaskScreen
      title="Today"
      subtitle={`${WEEKDAY_LONG[now.getDay()]}, ${MONTH_LONG[now.getMonth()]} ${now.getDate()}${count ? ` · ${count} to do` : ''}`}
      addDefaults={{ dueDate: today }}
    >
      <TaskList
        items={count || doneToday.length ? items : []}
        header={header}
        showProject
        showParent
        empty={
          <View>
            <EmptyTasks icon={<Sun size={36} color={C.today} />} title="You’re all clear for today" subtitle="Enjoy the calm — or plan something with +." />
            <Pressable onPress={() => router.push('/(app)/upcoming')} className="flex-row items-center justify-center py-2 active:opacity-60">
              <CalendarArrowUp size={16} color={C.accent} /><Text className="text-accent text-sm ml-2">See what’s coming {tomorrow ? 'next' : ''}</Text>
            </Pressable>
          </View>
        }
      />
    </TaskScreen>
  );
}
