/**
 * Life — the "Life" tab of Insights (#insights?tab=life), formerly Analytics:
 * cross-tool charts (mood, tasks due this week, habit streaks, project status,
 * goals). Metric names are deliberately distinct from the Tasks tab, which
 * counts completions from the completion log:
 *  - "All-time completion rate" = done / all tasks currently on your lists;
 *  - "Tasks due this week" plots tasks by DUE date (done vs due), not by the day
 *    they were completed.
 */
import React, { useEffect, useState } from 'react';
import { BarChart2, PieChart as PieIcon, Activity, TrendingUp, Target, CheckCircle2, Calendar, Flame, Brain } from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import type { LogEntry, Task, Project, Habit, Goal, CalendarEvent } from '../../types';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import { toISODate, addDays } from '../../shared/tasks';
import { cx } from '../tasks/ui';
import { Card, PageLoading } from './PageShell';

type Slice = { name: string; value: number; color: string };
interface WeeklyTaskData { day: string; completed: number; due: number }
interface HabitStreakData { name: string; streak: number; color: string }
interface GoalProgressData { title: string; progress: number; category: string; color: string }

const MOOD_COLORS: Record<string, string> = { Productive: '#10B981', 'Flow State': '#F59E0B', Neutral: '#6B7280', Frustrated: '#EF4444' };
const GOAL_COLORS: Record<string, string> = { Career: '#8B5CF6', Personal: '#10B981', Health: '#EF4444', Skill: '#F59E0B' };
const STATUS_COLORS: Record<string, string> = {
  'Not Started': '#6B7280', Planning: '#F59E0B', 'In Progress': '#3B82F6', 'On Hold': '#EF4444', Completed: '#10B981', Cancelled: '#991B1B',
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TOOLTIP = { contentStyle: { backgroundColor: '#1F2937', borderColor: '#374151', borderRadius: '8px' }, itemStyle: { color: '#E5E7EB' } };
const alive = <T,>(xs: T[]) => xs.filter((x) => !(x as { deleted?: boolean }).deleted);

function Stat({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; color: string }) {
  return (
    <Card className="text-center">
      <div className={`flex items-center justify-center gap-1.5 mb-1 text-xs ${cx.muted}`}>{icon}<span>{label}</span></div>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className={`text-xs ${cx.faint}`}>{sub}</p>
    </Card>
  );
}

function EmptyChart({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className={`h-full flex flex-col items-center justify-center text-center ${cx.muted}`}>
      <span className="mb-2 opacity-60">{icon}</span>
      <p className="text-sm">{title}</p>
      <p className="text-xs mt-1">{hint}</p>
    </div>
  );
}

export default function LifePanel() {
  const [loaded, setLoaded] = useState(false);
  const [moodData, setMoodData] = useState<Slice[]>([]);
  const [weekly, setWeekly] = useState<WeeklyTaskData[]>([]);
  const [habitStreaks, setHabitStreaks] = useState<HabitStreakData[]>([]);
  const [goalProgress, setGoalProgress] = useState<GoalProgressData[]>([]);
  const [projectStatus, setProjectStatus] = useState<Slice[]>([]);
  const [counts, setCounts] = useState({
    projects: 0, done: 0, open: 0, logs: 0, habits: 0, activeGoals: 0, goals: 0, upcomingEvents: 0, avgHabitStreak: 0, completionRate: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const processData = async () => {
      const [logsRaw, tasksRaw, projectsRaw, habitsRaw, goalsRaw, eventsRaw] = await Promise.all([
        dbService.getAll<LogEntry>(STORES.LOGS),
        dbService.getAll<Task>(STORES.TASKS),
        dbService.getAll<Project>(STORES.PROJECTS),
        dbService.getAll<Habit>(STORES.HABITS),
        dbService.getAll<Goal>(STORES.GOALS),
        dbService.getAll<CalendarEvent>(STORES.EVENTS),
      ]);
      if (cancelled) return;
      const logs = alive(logsRaw), tasks = alive(tasksRaw), projects = alive(projectsRaw), habits = alive(habitsRaw), goals = alive(goalsRaw), events = alive(eventsRaw);

      const moods: Record<string, number> = {};
      logs.forEach((l) => { moods[l.mood] = (moods[l.mood] || 0) + 1; });
      setMoodData(Object.keys(moods).map((k) => ({ name: k, value: moods[k], color: MOOD_COLORS[k] || '#3B82F6' })));

      // Last 7 days, by DUE date (local days).
      const now = new Date();
      const week: WeeklyTaskData[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = addDays(now, -i);
        const iso = toISODate(d);
        week.push({ day: DAY_NAMES[d.getDay()], completed: tasks.filter((t) => t.completed && t.dueDate === iso).length, due: tasks.filter((t) => t.dueDate === iso).length });
      }
      setWeekly(week);

      setHabitStreaks(habits
        .map((h) => ({ name: h.name.length > 15 ? `${h.name.substring(0, 15)}…` : h.name, streak: h.streak, color: h.color || '#3b82f6' }))
        .sort((a, b) => b.streak - a.streak).slice(0, 5));

      setGoalProgress(goals.map((g) => ({ title: g.title.length > 20 ? `${g.title.substring(0, 20)}…` : g.title, progress: g.progress, category: g.category, color: GOAL_COLORS[g.category] || '#3B82F6' })));

      const statusCounts: Record<string, number> = {};
      projects.forEach((p) => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });
      setProjectStatus(Object.keys(statusCounts).map((k) => ({ name: k, value: statusCounts[k], color: STATUS_COLORS[k] || '#6B7280' })));

      const done = tasks.filter((t) => t.completed).length;
      const open = tasks.length - done;
      const today = toISODate(now);
      setCounts({
        projects: projects.length,
        done,
        open,
        logs: logs.length,
        habits: habits.length,
        goals: goals.length,
        activeGoals: goals.filter((g) => (g.progress ?? 0) < 100).length,
        upcomingEvents: events.filter((e) => e.date >= today).length,
        avgHabitStreak: habits.length ? Math.round(habits.reduce((s, h) => s + h.streak, 0) / habits.length) : 0,
        completionRate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      });
      setLoaded(true);
    };
    void processData();
    const onSync = () => { void processData(); };
    window.addEventListener('clearmind-sync', onSync as EventListener);
    return () => { cancelled = true; window.removeEventListener('clearmind-sync', onSync as EventListener); };
  }, []);

  if (!loaded) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat icon={<CheckCircle2 size={14} className="text-green-500" />} label="All-time completion rate" value={`${counts.completionRate}%`} sub={`${counts.done} of ${counts.done + counts.open} tasks on your lists`} color="#10B981" />
        <Stat icon={<Flame size={14} className="text-orange-500" />} label="Avg habit streak" value={counts.avgHabitStreak} sub={`${counts.habits} habits tracked`} color="#F97316" />
        <Stat icon={<Target size={14} className="text-violet-500" />} label="Active goals" value={counts.activeGoals} sub={`${counts.goals} goals in total`} color="#8B5CF6" />
        <Stat icon={<Calendar size={14} className="text-blue-500" />} label="Upcoming events" value={counts.upcomingEvents} sub="today or later" color="#3B82F6" />
        <Stat icon={<Brain size={14} className="text-rose-500" />} label="Daily logs" value={counts.logs} sub="journal entries" color="#F43F5E" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Mood (from daily logs)" right={<PieIcon size={16} className={cx.muted} />}>
          <div className="h-64">
            {moodData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={moodData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                    {moodData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                  </Pie>
                  <Tooltip {...TOOLTIP} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={<Activity size={30} />} title="No log data yet." hint="Write in the Journal to see mood patterns." />}
          </div>
        </Card>

        <Card title="Tasks due this week" right={<TrendingUp size={16} className={cx.muted} />}>
          <div className="h-64">
            {weekly.some((d) => d.completed || d.due) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis dataKey="day" stroke="#6B7280" fontSize={12} />
                  <YAxis stroke="#6B7280" fontSize={12} allowDecimals={false} />
                  <Tooltip {...TOOLTIP} />
                  <Area type="monotone" dataKey="due" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.2} name="Due" />
                  <Area type="monotone" dataKey="completed" stroke="#10B981" fill="#10B981" fillOpacity={0.3} name="Due & done" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={<BarChart2 size={30} />} title="Nothing was due in the last 7 days." hint="Completions by day are on the Tasks tab." />}
          </div>
        </Card>

        <Card title="Top habit streaks" right={<Flame size={16} className={cx.muted} />}>
          <div className="h-64">
            {habitStreaks.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={habitStreaks} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis type="number" stroke="#6B7280" fontSize={12} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" stroke="#6B7280" fontSize={11} width={100} />
                  <Tooltip {...TOOLTIP} />
                  <Bar dataKey="streak" name="Day streak" radius={[0, 4, 4, 0]}>
                    {habitStreaks.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={<Flame size={30} />} title="No habits tracked yet." hint="Create habits to build streaks." />}
          </div>
        </Card>

        <Card title="Project status" right={<BarChart2 size={16} className={cx.muted} />}>
          <div className="h-64">
            {projectStatus.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={projectStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                    {projectStatus.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                  </Pie>
                  <Tooltip {...TOOLTIP} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={<BarChart2 size={30} />} title="No projects yet." hint="Start a project to track progress." />}
          </div>
        </Card>
      </div>

      {goalProgress.length ? (
        <Card title="Goal progress" right={<Target size={16} className={cx.muted} />}>
          <div className="space-y-4">
            {goalProgress.map((g, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between items-center gap-2">
                  <span className={`text-sm truncate ${cx.text}`}>{g.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${g.color}20`, color: g.color }}>{g.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${g.progress}%`, backgroundColor: g.color }} />
                  </div>
                  <span className="text-sm font-medium tabular-nums" style={{ color: g.color }}>{g.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat icon={<BarChart2 size={14} className="text-green-500" />} label="Projects" value={counts.projects} sub="in your projects store" color="#10B981" />
        <Stat icon={<CheckCircle2 size={14} className="text-blue-500" />} label="Done tasks on your lists" value={counts.done} sub="completed, not yet cleared" color="#3B82F6" />
        <Stat icon={<Activity size={14} className="text-amber-500" />} label="Open tasks" value={counts.open} sub="still to do" color="#F59E0B" />
      </div>
    </div>
  );
}
