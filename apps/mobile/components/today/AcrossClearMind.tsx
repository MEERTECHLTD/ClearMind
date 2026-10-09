/**
 * "Across ClearMind" — the part of Today that pulls in the rest of the app
 * (what used to be a separate Overview screen): today's schedule from the
 * Calendar and Daily Mapper, habit check-ins, and the next 7 days of
 * deadlines from Applications, Projects, Goals and Milestones. Every row opens
 * the tool that owns it; empty groups are hidden.
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { CalendarDays, LayoutGrid, Flame, Briefcase, FolderKanban, Target, Flag, ChevronRight } from 'lucide-react-native';
import type { Application, CalendarEvent, DailyMapperEntry, Goal, Habit, Milestone, Project } from '@clearmind/shared';
import { applicationDeadline, REMINDER_SKIP_STATUSES } from '@clearmind/shared/applications';
import { addDays, toISODate } from '@clearmind/shared/tasks';
import { useCollection } from '../../hooks/useCollection';
import { STORES } from '../../services/db';
import { T } from '../../lib/theme';

type Row = { key: string; icon: React.ReactNode; title: string; meta?: string; href: Href; urgent?: boolean };

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

function relDay(iso: string, today: string, tomorrow: string): string {
  if (iso < today) return 'overdue';
  if (iso === today) return 'today';
  if (iso === tomorrow) return 'tomorrow';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export function AcrossClearMind({ today, projects }: { today: string; projects: Project[] }) {
  const router = useRouter();
  const { items: events } = useCollection<CalendarEvent>(STORES.EVENTS);
  const { items: blocks } = useCollection<DailyMapperEntry>(STORES.DAILY_MAPPER);
  const { items: habits } = useCollection<Habit>(STORES.HABITS);
  const { items: apps } = useCollection<Application>(STORES.APPLICATIONS);
  const { items: goals } = useCollection<Goal>(STORES.GOALS);
  const { items: milestones } = useCollection<Milestone>(STORES.MILESTONES);

  const { schedule, deadlines, habitsDone, habitsTotal } = useMemo(() => {
    const tomorrow = toISODate(addDays(new Date(`${today}T12:00:00`), 1));
    const horizon = toISODate(addDays(new Date(`${today}T12:00:00`), 7));
    const within = (iso: string) => !!iso && iso <= horizon;

    const sched = [
      ...events.filter((e) => e.date === today).map((e) => ({
        key: `e-${e.id}`, at: e.startTime ?? '', icon: <CalendarDays size={16} color={e.color || T.accent} />,
        title: e.title, meta: e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : 'All day', href: '/(app)/calendar' as Href,
      })),
      ...blocks.filter((b) => b.date === today && b.completed !== 'yes').map((b) => ({
        key: `b-${b.id}`, at: b.startTime ?? '', icon: <LayoutGrid size={16} color={b.color || T.muted} />,
        title: b.task, meta: `${b.startTime}–${b.endTime}`, href: '/(app)/dailymapper' as Href,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    const dl: (Row & { at: string })[] = [];
    for (const a of apps) {
      if (REMINDER_SKIP_STATUSES.includes(a.status)) continue;
      const d = day(applicationDeadline(a));
      if (within(d) && d >= today) dl.push({ key: `a-${a.id}`, at: d, icon: <Briefcase size={16} color="#3B82F6" />, title: a.name, meta: relDay(d, today, tomorrow), href: '/(app)/applications', urgent: d <= tomorrow });
    }
    for (const p of projects) {
      const d = day(p.deadline);
      if (!p.deleted && !p.archived && within(d) && p.status !== 'Completed' && p.status !== 'Cancelled') {
        dl.push({ key: `p-${p.id}`, at: d, icon: <FolderKanban size={16} color={p.color ?? '#A855F7'} />, title: p.title, meta: relDay(d, today, tomorrow), href: `/(app)/project/${p.id}?tab=plan` as Href, urgent: d <= tomorrow });
      }
    }
    for (const g of goals) {
      const d = day(g.targetDate);
      if (within(d) && (g.progress ?? 0) < 100) dl.push({ key: `g-${g.id}`, at: d, icon: <Target size={16} color="#34D399" />, title: g.title, meta: relDay(d, today, tomorrow), href: '/(app)/goals', urgent: d < today });
    }
    for (const m of milestones) {
      const d = day(m.date);
      if (within(d) && d >= today && !m.completed) dl.push({ key: `m-${m.id}`, at: d, icon: <Flag size={16} color="#A78BFA" />, title: m.title, meta: relDay(d, today, tomorrow), href: '/(app)/milestones', urgent: d === today });
    }
    dl.sort((a, b) => a.at.localeCompare(b.at));

    return {
      schedule: sched.slice(0, 4),
      deadlines: dl.slice(0, 5),
      habitsDone: habits.filter((h) => h.completedToday).length,
      habitsTotal: habits.length,
    };
  }, [today, events, blocks, habits, apps, goals, milestones, projects]);

  if (!schedule.length && !deadlines.length && !habitsTotal) return null;

  const RowView = ({ r }: { r: Row }) => (
    <Pressable onPress={() => router.push(r.href)} className="flex-row items-center py-2 active:opacity-60" accessibilityRole="button" accessibilityLabel={`${r.title}${r.meta ? `, ${r.meta}` : ''}`}>
      {r.icon}
      <Text className="text-ink text-[14px] ml-2.5 flex-1" numberOfLines={1}>{r.title}</Text>
      {r.meta ? <Text className="text-xs ml-2" style={{ color: r.urgent ? T.danger : T.muted }}>{r.meta}</Text> : null}
    </Pressable>
  );

  return (
    <View className="mx-4 mb-1 px-3 pt-2 pb-1 rounded-2xl bg-midnight-light border border-line">
      {habitsTotal ? (
        <Pressable onPress={() => router.push('/(app)/habits')} className="flex-row items-center py-2 active:opacity-60" accessibilityRole="button" accessibilityLabel={`Habits: ${habitsDone} of ${habitsTotal} done today`}>
          <Flame size={16} color={habitsDone === habitsTotal ? T.success : '#F97316'} />
          <Text className="text-ink text-[14px] ml-2.5 flex-1">Habits</Text>
          <Text className="text-ink-muted text-xs mr-1">{habitsDone}/{habitsTotal} today</Text>
          <ChevronRight size={14} color={T.muted} />
        </Pressable>
      ) : null}
      {schedule.length ? (
        <>
          <Text className="text-ink-muted text-[11px] font-semibold mt-1">SCHEDULE</Text>
          {schedule.map((r) => <RowView key={r.key} r={r} />)}
        </>
      ) : null}
      {deadlines.length ? (
        <>
          <Text className="text-ink-muted text-[11px] font-semibold mt-1">COMING UP</Text>
          {deadlines.map((r) => <RowView key={r.key} r={r} />)}
        </>
      ) : null}
    </View>
  );
}
