import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  upcomingView, todayView, addDays, startOfWeek, toISODate, parseISODate, formatDayHeading,
  WEEKDAY_SHORT, MONTH_LONG,
} from '@clearmind/shared/tasks';
import { TaskScreen, IconButton } from '../../components/tasks/TaskScreen';
import { TaskList, taskItems, type ListItem } from '../../components/tasks/TaskList';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { C } from '../../components/tasks/theme';
import { useDayTick } from '../../hooks/useDayTick';

const DAYS_SHOWN = 21;

/**
 * Upcoming: a week strip to jump between days/weeks, then a chronological list
 * of the next three weeks from the selected day (empty days still offer "Add").
 */
export default function UpcomingScreen() {
  const ui = useTaskUI();
  const today = useDayTick();
  const [anchor, setAnchor] = useState<string>(today);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ui.tasks) if (!t.completed && t.dueDate) m.set(t.dueDate, (m.get(t.dueDate) ?? 0) + 1);
    return m;
  }, [ui.tasks]);

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    if (anchor <= today) {
      const { overdue } = todayView(ui.tasks, new Date());
      if (overdue.length) {
        out.push({ type: 'header', key: 'h-overdue', title: 'Overdue', color: C.danger });
        out.push(...taskItems(overdue, 'o-'));
      }
    }
    for (const g of upcomingView(ui.tasks, parseISODate(anchor < today ? today : anchor)!, DAYS_SHOWN)) {
      out.push({ type: 'header', key: `h-${g.date}`, title: formatDayHeading(g.date), color: g.date === today ? C.today : undefined });
      out.push(...taskItems(g.tasks, `${g.date}-`));
      out.push({ type: 'add', key: `add-${g.date}`, defaults: { dueDate: g.date } });
    }
    return out;
  }, [ui.tasks, anchor, today]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const thisWeek = startOfWeek(new Date());
  const canGoBack = weekStart > thisWeek;
  const select = (iso: string) => setAnchor(iso < today ? today : iso);

  return (
    <TaskScreen
      title="Upcoming"
      subtitle={`${MONTH_LONG[weekStart.getMonth()]} ${weekStart.getFullYear()}`}
      addDefaults={{ dueDate: anchor < today ? today : anchor }}
      right={
        anchor !== today ? (
          <Pressable onPress={() => { setAnchor(today); setWeekStart(thisWeek); }} className="px-3 py-1.5 rounded-full border border-line active:opacity-60" accessibilityRole="button">
            <Text className="text-ink text-[13px] font-semibold">Today</Text>
          </Pressable>
        ) : null
      }
    >
      <View className="flex-row items-center px-2 pb-2 border-b border-line">
        <IconButton label="Previous week" onPress={() => canGoBack && setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft size={20} color={canGoBack ? C.ink : C.hairline} />
        </IconButton>
        {days.map((d) => {
          const iso = toISODate(d);
          const past = iso < today;
          const selected = iso === (anchor < today ? today : anchor);
          const n = counts.get(iso) ?? 0;
          return (
            <Pressable
              key={iso}
              onPress={() => !past && select(iso)}
              disabled={past}
              className={`flex-1 items-center py-1.5 rounded-xl ${selected ? 'bg-accent' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: past }}
              accessibilityLabel={`${formatDayHeading(iso)}${n ? `, ${n} tasks` : ''}`}
            >
              <Text className={`text-[11px] ${selected ? 'text-white' : past ? 'text-hairline' : 'text-ink-muted'}`}>{WEEKDAY_SHORT[d.getDay()]}</Text>
              <Text className={`text-[16px] font-bold mt-0.5 ${selected ? 'text-white' : past ? 'text-hairline' : iso === today ? 'text-emerald-400' : 'text-ink'}`}>{d.getDate()}</Text>
              <View className={`w-1 h-1 rounded-full mt-1 ${n ? (selected ? 'bg-white' : 'bg-ink-muted') : 'bg-transparent'}`} />
            </Pressable>
          );
        })}
        <IconButton label="Next week" onPress={() => { const next = addDays(weekStart, 7); setWeekStart(next); select(toISODate(next)); }}>
          <ChevronRight size={20} color={C.ink} />
        </IconButton>
      </View>
      <TaskList items={items} showProject showParent hideDate />
    </TaskScreen>
  );
}
