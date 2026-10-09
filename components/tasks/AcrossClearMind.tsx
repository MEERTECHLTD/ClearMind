/**
 * "Across ClearMind" — the part of Today that pulls in the rest of the app
 * (what used to be the separate Dashboard): habit check-ins, today's schedule
 * from the Calendar and Daily Mapper, and the next 7 days of deadlines from
 * Applications, Projects, Goals and Milestones. Every row opens the tool that
 * owns it; empty groups are hidden, and the whole panel hides when empty.
 * Selection logic: utils/acrossClearMind.ts (shared with mobile's rules).
 */
import React, { useEffect, useMemo } from 'react';
import { CalendarDays, LayoutGrid, Flame, Briefcase, FolderKanban, Target, Flag, ChevronRight } from 'lucide-react';
import type { Application, CalendarEvent, DailyMapperEntry, Goal, Habit, Milestone } from '../../types';
import { STORES } from '../../services/db';
import { acrossClearMind, type AcrossKind, type AcrossRow } from '../../utils/acrossClearMind';
import { useStore, getStore } from './store';
import { useTaskData } from './TaskContext';
import { cx } from './ui';

const go = (hash: string) => { window.location.hash = hash; };

const KIND_ICON: Record<AcrossKind, (color?: string) => React.ReactNode> = {
  event: (c) => <CalendarDays size={16} color={c || '#3B82F6'} />,
  block: (c) => <LayoutGrid size={16} color={c || '#64748B'} />,
  application: () => <Briefcase size={16} color="#3B82F6" />,
  project: (c) => <FolderKanban size={16} color={c || '#A855F7'} />,
  goal: () => <Target size={16} color="#10B981" />,
  milestone: () => <Flag size={16} color="#8B5CF6" />,
};

const OTHER_STORES = [STORES.EVENTS, STORES.DAILY_MAPPER, STORES.HABITS, STORES.APPLICATIONS, STORES.GOALS, STORES.MILESTONES];

function Row({ r }: { r: AcrossRow }) {
  return (
    <button onClick={() => go(r.hash)} className={`w-full flex items-center gap-2.5 py-2 px-1 rounded-md text-left ${cx.hover}`} aria-label={`${r.title}, ${r.meta}`}>
      <span className="shrink-0">{KIND_ICON[r.kind](r.color)}</span>
      <span className={`flex-1 min-w-0 truncate text-sm ${cx.text}`}>{r.title}</span>
      <span className={`text-xs shrink-0 ${r.urgent ? 'text-red-500 font-medium' : cx.muted}`}>{r.meta}</span>
    </button>
  );
}

export function AcrossClearMind({ today }: { today: string }) {
  const { projects } = useTaskData();
  const events = useStore<CalendarEvent>(STORES.EVENTS).items;
  const blocks = useStore<DailyMapperEntry>(STORES.DAILY_MAPPER).items;
  const habits = useStore<Habit>(STORES.HABITS).items;
  const applications = useStore<Application>(STORES.APPLICATIONS).items;
  const goals = useStore<Goal>(STORES.GOALS).items;
  const milestones = useStore<Milestone>(STORES.MILESTONES).items;

  // The tools themselves write straight to IndexedDB; re-read when Today opens
  // so a habit ticked a moment ago shows here.
  useEffect(() => { for (const s of OTHER_STORES) void getStore(s).load(); }, []);

  const s = useMemo(
    () => acrossClearMind(today, { events, blocks, habits, applications, projects, goals, milestones }),
    [today, events, blocks, habits, applications, projects, goals, milestones],
  );
  if (s.empty) return null;

  const allDone = s.habitsTotal > 0 && s.habitsDone === s.habitsTotal;
  return (
    <section aria-label="Across ClearMind" className={`mt-8 rounded-xl border ${cx.border} ${cx.card} px-3 pt-2.5 pb-1.5`}>
      <h2 className={`text-xs font-semibold uppercase tracking-wide px-1 mb-1 ${cx.muted}`}>Across ClearMind</h2>
      {s.habitsTotal ? (
        <button onClick={() => go('habits')} className={`w-full flex items-center gap-2.5 py-2 px-1 rounded-md text-left ${cx.hover}`} aria-label={`Habits: ${s.habitsDone} of ${s.habitsTotal} done today`}>
          <Flame size={16} color={allDone ? '#16A34A' : '#F97316'} className="shrink-0" />
          <span className={`flex-1 text-sm ${cx.text}`}>Habits</span>
          <span className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${Math.round((s.habitsDone / s.habitsTotal) * 100)}%`, background: allDone ? '#16A34A' : '#F97316' }} />
          </span>
          <span className={`text-xs tabular-nums ${cx.muted}`}>{s.habitsDone}/{s.habitsTotal} today</span>
          <ChevronRight size={14} className={cx.faint} />
        </button>
      ) : null}
      {s.schedule.length ? (
        <>
          <h3 className={`text-[11px] font-semibold px-1 mt-2 ${cx.faint}`}>SCHEDULE</h3>
          {s.schedule.map((r) => <Row key={r.key} r={r} />)}
        </>
      ) : null}
      {s.deadlines.length ? (
        <>
          <h3 className={`text-[11px] font-semibold px-1 mt-2 ${cx.faint}`}>COMING UP</h3>
          {s.deadlines.map((r) => <Row key={r.key} r={r} />)}
        </>
      ) : null}
    </section>
  );
}
