/**
 * "Across ClearMind" — the part of Today that pulls in the rest of the app
 * (what used to be a separate Overview screen): today's schedule from the
 * Calendar and Daily Mapper, habit check-ins, and the next 7 days of
 * deadlines from Applications, Projects, Goals and Milestones. Every row opens
 * the tool that owns it; empty groups are hidden. Selection rules are shared
 * with the web Today (@clearmind/shared/today/across).
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { CalendarDays, LayoutGrid, Flame, Briefcase, FolderKanban, Target, Flag, ChevronRight } from 'lucide-react-native';
import type { Application, CalendarEvent, DailyMapperEntry, Goal, Habit, Milestone, Project } from '@clearmind/shared';
import { acrossClearMind, type AcrossKind, type AcrossRow } from '@clearmind/shared/today/across';
import { useCollection } from '../../hooks/useCollection';
import { STORES } from '../../services/db';
import { T } from '../../lib/theme';

const ICON: Record<AcrossKind, { Icon: typeof Flag; color: string }> = {
  event: { Icon: CalendarDays, color: '#3B82F6' },
  block: { Icon: LayoutGrid, color: '#9CA3AF' },
  application: { Icon: Briefcase, color: '#3B82F6' },
  project: { Icon: FolderKanban, color: '#A855F7' },
  goal: { Icon: Target, color: '#34D399' },
  milestone: { Icon: Flag, color: '#A78BFA' },
};

export function AcrossClearMind({ today, projects }: { today: string; projects: Project[] }) {
  const router = useRouter();
  const { items: events } = useCollection<CalendarEvent>(STORES.EVENTS);
  const { items: blocks } = useCollection<DailyMapperEntry>(STORES.DAILY_MAPPER);
  const { items: habits } = useCollection<Habit>(STORES.HABITS);
  const { items: applications } = useCollection<Application>(STORES.APPLICATIONS);
  const { items: goals } = useCollection<Goal>(STORES.GOALS);
  const { items: milestones } = useCollection<Milestone>(STORES.MILESTONES);

  const sum = useMemo(
    () => acrossClearMind(today, { events, blocks, habits, applications, projects, goals, milestones }),
    [today, events, blocks, habits, applications, projects, goals, milestones],
  );
  if (sum.empty) return null;

  const RowView = ({ r }: { r: AcrossRow }) => {
    const { Icon, color } = ICON[r.kind];
    return (
      <Pressable onPress={() => router.push(`/(app)/${r.hash}` as Href)} className="flex-row items-center py-2 active:opacity-60" accessibilityRole="button" accessibilityLabel={`${r.title}${r.meta ? `, ${r.meta}` : ''}`}>
        <Icon size={16} color={r.color || color} />
        <Text className="text-ink text-[14px] ml-2.5 flex-1" numberOfLines={1}>{r.title}</Text>
        {r.meta ? <Text className="text-xs ml-2" style={{ color: r.urgent ? T.danger : T.muted }}>{r.meta}</Text> : null}
      </Pressable>
    );
  };

  return (
    <View className="mx-4 mb-1 px-3 pt-2 pb-1 rounded-2xl bg-midnight-light border border-line">
      {sum.habitsTotal ? (
        <Pressable onPress={() => router.push('/(app)/habits')} className="flex-row items-center py-2 active:opacity-60" accessibilityRole="button" accessibilityLabel={`Habits: ${sum.habitsDone} of ${sum.habitsTotal} done today`}>
          <Flame size={16} color={sum.habitsDone === sum.habitsTotal ? T.success : '#F97316'} />
          <Text className="text-ink text-[14px] ml-2.5 flex-1">Habits</Text>
          <Text className="text-ink-muted text-xs mr-1">{sum.habitsDone}/{sum.habitsTotal} today</Text>
          <ChevronRight size={14} color={T.muted} />
        </Pressable>
      ) : null}
      {sum.schedule.length ? (
        <>
          <Text className="text-ink-muted text-[11px] font-semibold mt-1">SCHEDULE</Text>
          {sum.schedule.map((r) => <RowView key={r.key} r={r} />)}
        </>
      ) : null}
      {sum.deadlines.length ? (
        <>
          <Text className="text-ink-muted text-[11px] font-semibold mt-1">COMING UP</Text>
          {sum.deadlines.map((r) => <RowView key={r.key} r={r} />)}
        </>
      ) : null}
    </View>
  );
}
