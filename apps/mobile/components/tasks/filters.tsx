import React from 'react';
import { CalendarX, Flag, CalendarOff, Repeat, CalendarRange } from 'lucide-react-native';
import { compareTasks, isOverdue, priorityOf, todayISO, addDays, toISODate } from '@clearmind/shared/tasks';
import type { MTask } from '../../services/taskActions';
import { C, PRIORITY_COLOR } from './theme';

export interface TaskFilter {
  id: string;
  title: string;
  icon: React.ReactNode;
  emptyText: string;
  select: (tasks: MTask[]) => MTask[];
}

const open = (tasks: MTask[]) => tasks.filter((t) => !t.completed);

/** Built-in smart filters (Search tab + Browse). */
export const FILTERS: TaskFilter[] = [
  {
    id: 'overdue', title: 'Overdue', icon: <CalendarX size={20} color={C.danger} />, emptyText: 'Nothing overdue. Nice.',
    select: (t) => open(t).filter((x) => isOverdue(x)).sort(compareTasks),
  },
  {
    id: 'next7', title: 'Next 7 days', icon: <CalendarRange size={20} color={C.week} />, emptyText: 'Nothing scheduled for the next 7 days.',
    select: (t) => {
      const from = todayISO();
      const to = toISODate(addDays(new Date(), 6));
      return open(t).filter((x) => x.dueDate && x.dueDate >= from && x.dueDate <= to).sort(compareTasks);
    },
  },
  ...(['High', 'Medium', 'Low'] as const).map((p, i) => ({
    id: `p${i + 1}`,
    title: `Priority ${i + 1}`,
    icon: <Flag size={20} color={PRIORITY_COLOR[p]} fill={PRIORITY_COLOR[p]} />,
    emptyText: `No open Priority ${i + 1} tasks.`,
    select: (t: MTask[]) => open(t).filter((x) => priorityOf(x) === p).sort(compareTasks),
  })),
  {
    id: 'nodate', title: 'No date', icon: <CalendarOff size={20} color={C.muted} />, emptyText: 'Every task has a date.',
    select: (t) => open(t).filter((x) => !x.dueDate && !x.parentId).sort(compareTasks),
  },
  {
    id: 'recurring', title: 'Recurring', icon: <Repeat size={20} color={C.accent} />, emptyText: 'No repeating tasks yet — try “every monday” in Quick Add.',
    select: (t) => open(t).filter((x) => !!x.recurrence).sort(compareTasks),
  },
];
