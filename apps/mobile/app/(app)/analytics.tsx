import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { G, Circle, Rect, Line, Text as SvgText } from 'react-native-svg';
import {
  BarChart2,
  PieChart as PieIcon,
  Activity,
  TrendingUp,
  Target,
  CheckCircle2,
  Calendar,
  Flame,
  Brain,
} from 'lucide-react-native';
import type { LogEntry, Task, Project, Habit, Goal, CalendarEvent, Rant } from '@clearmind/shared';
import { dbService, STORES } from '../../services/db';
import { syncBus } from '../../services/events';
import { Screen, AppHeader, Card, StatCard, ProgressBar, Spinner } from '../../components/ui';

// ---------------------------------------------------------------------------
// Derived-shape types (ported 1:1 from the web AnalyticsView).
// ---------------------------------------------------------------------------
interface WeeklyTaskData {
  day: string;
  completed: number;
  created: number;
}
interface HabitStreakData {
  name: string;
  streak: number;
  color: string;
}
interface GoalProgressData {
  title: string;
  progress: number;
  category: string;
  color: string;
}
interface Slice {
  name: string;
  value: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Hand-rolled charts (react-native-svg). No chart library.
// ---------------------------------------------------------------------------

/** Donut chart drawn with a stroked Circle per slice (handles the 1-slice/full-ring case). */
function Donut({ width, slices }: { width: number; slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (width <= 0 || total <= 0) return null;
  const size = Math.min(width, 200);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;
  const inner = outer * 0.62;
  const radius = (outer + inner) / 2;
  const sw = outer - inner;
  const circ = 2 * Math.PI * radius;
  let acc = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${cx}, ${cy}`}>
        {slices.map((s, i) => {
          const len = (s.value / total) * circ;
          const node = (
            <Circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={sw}
              strokeDasharray={`${len} ${Math.max(circ - len, 0)}`}
              strokeDashoffset={circ - acc}
            />
          );
          acc += len;
          return node;
        })}
      </G>
    </Svg>
  );
}

/** Small color-swatch legend rendered with RN views (Recharts <Legend/> replacement). */
function Legend({ slices }: { slices: Slice[] }) {
  return (
    <View className="flex-row flex-wrap justify-center mt-3">
      {slices.map((s, i) => (
        <View key={i} className="flex-row items-center mr-3 mb-1.5">
          <View className="w-2.5 h-2.5 rounded-sm mr-1.5" style={{ backgroundColor: s.color }} />
          <Text className="text-ink-muted text-xs">
            {s.name} ({s.value})
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Weekly grouped bars: completed (green) + due (blue) per day. */
function WeeklyBars({ width, data }: { width: number; data: WeeklyTaskData[] }) {
  if (width <= 0 || data.length === 0) return null;
  const H = 170;
  const padTop = 10;
  const padBottom = 22;
  const chartBottom = H - padBottom;
  const plotH = chartBottom - padTop;
  const max = Math.max(1, ...data.map((d) => Math.max(d.completed, d.created)));
  const n = data.length;
  const groupW = width / n;
  const barW = Math.max(4, groupW * 0.26);
  return (
    <Svg width={width} height={H}>
      <Line x1={0} y1={chartBottom} x2={width} y2={chartBottom} stroke="#374151" strokeWidth={1} />
      {data.map((d, i) => {
        const center = i * groupW + groupW / 2;
        const cH = (d.completed / max) * plotH;
        const dH = (d.created / max) * plotH;
        return (
          <G key={i}>
            <Rect
              x={center - barW - 1}
              y={chartBottom - dH}
              width={barW}
              height={dH}
              rx={2}
              fill="#3B82F6"
              opacity={0.7}
            />
            <Rect
              x={center + 1}
              y={chartBottom - cH}
              width={barW}
              height={cH}
              rx={2}
              fill="#10B981"
            />
            <SvgText x={center} y={H - 6} fill="#6B7280" fontSize={10} textAnchor="middle">
              {d.day}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Horizontal habit-streak bars with left-aligned name labels (Recharts vertical bar replacement). */
function HabitBars({ width, data }: { width: number; data: HabitStreakData[] }) {
  if (width <= 0 || data.length === 0) return null;
  const rowH = 32;
  const barH = 16;
  const gutter = 108;
  const valGutter = 30;
  const H = data.length * rowH + 4;
  const barAreaW = Math.max(10, width - gutter - valGutter);
  const max = Math.max(1, ...data.map((d) => d.streak));
  return (
    <Svg width={width} height={H}>
      {data.map((d, i) => {
        const y = i * rowH + 2;
        const barW = (d.streak / max) * barAreaW;
        return (
          <G key={i}>
            <SvgText x={gutter - 8} y={y + barH - 3} fill="#9ca3af" fontSize={11} textAnchor="end">
              {d.name}
            </SvgText>
            <Rect x={gutter} y={y} width={barAreaW} height={barH} rx={4} fill="#1f2937" />
            <Rect x={gutter} y={y} width={Math.max(barW, 0)} height={barH} rx={4} fill={d.color} />
            <SvgText x={gutter + Math.max(barW, 0) + 6} y={y + barH - 3} fill={d.color} fontSize={11}>
              {String(d.streak)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Container that measures its own width via onLayout, then renders the chart. */
function Measured({
  height,
  render,
}: {
  height: number;
  render: (w: number) => React.ReactNode;
}) {
  const [w, setW] = useState(0);
  return (
    <View
      onLayout={(e) => {
        const nw = Math.round(e.nativeEvent.layout.width);
        if (nw !== w) setW(nw);
      }}
      // alignSelf:'stretch' so we fill the parent's width even when the parent is
      // items-center (otherwise this hugs its content -> width 0 when render(0)
      // returns null -> the donut never gets a width and stays blank).
      style={{ minHeight: height, alignSelf: 'stretch' }}
      className="items-center justify-center"
    >
      {render(w)}
    </View>
  );
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-4">
      <View className="flex-row items-center mb-3">
        {icon}
        <Text className="text-ink text-base font-bold ml-2">{title}</Text>
      </View>
      {children}
    </Card>
  );
}

function ChartEmpty({ icon, line1, line2 }: { icon: React.ReactNode; line1: string; line2: string }) {
  return (
    <View className="items-center justify-center py-8">
      <View className="opacity-50 mb-2">{icon}</View>
      <Text className="text-ink-muted text-sm">{line1}</Text>
      <Text className="text-ink-muted text-xs mt-1">{line2}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function AnalyticsScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [rants, setRants] = useState<Rant[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [l, t, p, h, g, e, r] = await Promise.all([
      dbService.getAll<LogEntry>(STORES.LOGS),
      dbService.getAll<Task>(STORES.TASKS),
      dbService.getAll<Project>(STORES.PROJECTS),
      dbService.getAll<Habit>(STORES.HABITS),
      dbService.getAll<Goal>(STORES.GOALS),
      dbService.getAll<CalendarEvent>(STORES.EVENTS),
      dbService.getAll<Rant>(STORES.RANTS),
    ]);
    setLogs(l);
    setTasks(t);
    setProjects(p);
    setHabits(h);
    setGoals(g);
    setEvents(e);
    setRants(r);
    setLoading(false);
  }, []);

  // Initial load + refresh whenever the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  // Live cloud-sync updates while the screen is mounted.
  useEffect(() => {
    const unsub = syncBus.subscribe(() => reload());
    return unsub;
  }, [reload]);

  // -------------------------------------------------------------------------
  // Aggregation math — ported VERBATIM from the web AnalyticsView.
  // (date math intentionally timezone-naive, exactly like the web.)
  // -------------------------------------------------------------------------
  const moodData = useMemo<Slice[]>(() => {
    const moods: Record<string, number> = {};
    logs.forEach((log) => {
      moods[log.mood] = (moods[log.mood] || 0) + 1;
    });
    const moodColors: Record<string, string> = {
      Productive: '#10B981',
      'Flow State': '#F59E0B',
      Neutral: '#6B7280',
      Frustrated: '#EF4444',
    };
    return Object.keys(moods).map((key) => ({
      name: key,
      value: moods[key],
      color: moodColors[key] || '#3B82F6',
    }));
  }, [logs]);

  const weeklyTaskData = useMemo<WeeklyTaskData[]>(() => {
    const today = new Date();
    const weekData: WeeklyTaskData[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = dayNames[date.getDay()];
      const completedOnDay = tasks.filter((t) => t.completed && t.dueDate === dateStr).length;
      const createdOnDay = tasks.filter((t) => t.dueDate === dateStr).length;
      weekData.push({ day: dayName, completed: completedOnDay, created: createdOnDay });
    }
    return weekData;
  }, [tasks]);

  const habitStreaks = useMemo<HabitStreakData[]>(
    () =>
      habits
        .map((h) => ({
          name: h.name.length > 15 ? h.name.substring(0, 15) + '...' : h.name,
          streak: h.streak,
          color: h.color || '#3b82f6',
        }))
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 5),
    [habits]
  );

  const goalProgress = useMemo<GoalProgressData[]>(() => {
    const categoryColors: Record<string, string> = {
      Career: '#8B5CF6',
      Personal: '#10B981',
      Health: '#EF4444',
      Skill: '#F59E0B',
    };
    return goals.map((g) => ({
      title: g.title.length > 20 ? g.title.substring(0, 20) + '...' : g.title,
      progress: g.progress,
      category: g.category,
      color: categoryColors[g.category] || '#3B82F6',
    }));
  }, [goals]);

  const projectStatusData = useMemo<Slice[]>(() => {
    const statusCounts: Record<string, number> = {};
    projects.forEach((p) => {
      statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    });
    const statusColors: Record<string, string> = {
      'Not Started': '#6B7280',
      Planning: '#F59E0B',
      'In Progress': '#3B82F6',
      'On Hold': '#EF4444',
      Completed: '#10B981',
      Cancelled: '#991B1B',
    };
    return Object.keys(statusCounts).map((key) => ({
      name: key,
      value: statusCounts[key],
      color: statusColors[key] || '#6B7280',
    }));
  }, [projects]);

  const counts = useMemo(() => {
    const completedTasks = tasks.filter((t) => t.completed).length;
    const pendingTasks = tasks.filter((t) => !t.completed).length;
    const totalTasks = tasks.length;
    const avgStreak =
      habits.length > 0
        ? Math.round(habits.reduce((sum, h) => sum + h.streak, 0) / habits.length)
        : 0;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingEventsCount = events.filter((e) => e.date >= todayStr).length;
    return {
      totalProjects: projects.length,
      completedTasks,
      pendingTasks,
      totalLogs: logs.length,
      totalHabits: habits.length,
      totalGoals: goals.length,
      upcomingEvents: upcomingEventsCount,
      totalRants: rants.length,
      avgHabitStreak: avgStreak,
      taskCompletionRate: completionRate,
    };
  }, [tasks, habits, events, projects, logs, goals, rants]);

  if (loading) return <Spinner label="Crunching your numbers…" />;

  const hasWeekly = weeklyTaskData.some((d) => d.completed > 0 || d.created > 0);

  return (
    <Screen padded={false}>
      <AppHeader title="Analytics" subtitle="Real insights from your productivity data." />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Headline metrics */}
        <View className="flex-row flex-wrap -mx-1.5 mb-2">
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard
              label="Task Completion"
              value={`${counts.taskCompletionRate}%`}
              icon={<CheckCircle2 size={18} color="#10b981" />}
            />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard
              label="Avg Habit Streak"
              value={counts.avgHabitStreak}
              icon={<Flame size={18} color="#f59e0b" />}
            />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard
              label="Active Goals"
              value={counts.totalGoals}
              icon={<Target size={18} color="#8b5cf6" />}
            />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard
              label="Upcoming Events"
              value={counts.upcomingEvents}
              icon={<Calendar size={18} color="#3b82f6" />}
            />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard
              label="Daily Logs"
              value={counts.totalLogs}
              icon={<Brain size={18} color="#ef4444" />}
            />
          </View>
        </View>

        {/* Mood Distribution */}
        <ChartCard title="Mood Distribution" icon={<PieIcon size={18} color="#e2e8f0" />}>
          {moodData.length > 0 ? (
            <View className="items-center">
              <Measured height={200} render={(w) => <Donut width={w} slices={moodData} />} />
              <Legend slices={moodData} />
            </View>
          ) : (
            <ChartEmpty
              icon={<Activity size={32} color="#6b7280" />}
              line1="No log data available yet."
              line2="Start logging to see mood patterns."
            />
          )}
        </ChartCard>

        {/* Weekly Task Activity */}
        <ChartCard title="Weekly Task Activity" icon={<TrendingUp size={18} color="#e2e8f0" />}>
          {hasWeekly ? (
            <View>
              <Measured height={170} render={(w) => <WeeklyBars width={w} data={weeklyTaskData} />} />
              <View className="flex-row justify-center mt-2">
                <View className="flex-row items-center mr-4">
                  <View className="w-2.5 h-2.5 rounded-sm mr-1.5" style={{ backgroundColor: '#10B981' }} />
                  <Text className="text-ink-muted text-xs">Completed</Text>
                </View>
                <View className="flex-row items-center">
                  <View className="w-2.5 h-2.5 rounded-sm mr-1.5" style={{ backgroundColor: '#3B82F6' }} />
                  <Text className="text-ink-muted text-xs">Due</Text>
                </View>
              </View>
            </View>
          ) : (
            <ChartEmpty
              icon={<BarChart2 size={32} color="#6b7280" />}
              line1="No task activity this week."
              line2="Complete tasks to see trends."
            />
          )}
        </ChartCard>

        {/* Top Habit Streaks */}
        <ChartCard title="Top Habit Streaks" icon={<Flame size={18} color="#e2e8f0" />}>
          {habitStreaks.length > 0 ? (
            <Measured height={64} render={(w) => <HabitBars width={w} data={habitStreaks} />} />
          ) : (
            <ChartEmpty
              icon={<Flame size={32} color="#6b7280" />}
              line1="No habits tracked yet."
              line2="Create habits to build streaks."
            />
          )}
        </ChartCard>

        {/* Project Status */}
        <ChartCard title="Project Status" icon={<BarChart2 size={18} color="#e2e8f0" />}>
          {projectStatusData.length > 0 ? (
            <View className="items-center">
              <Measured height={200} render={(w) => <Donut width={w} slices={projectStatusData} />} />
              <Legend slices={projectStatusData} />
            </View>
          ) : (
            <ChartEmpty
              icon={<BarChart2 size={32} color="#6b7280" />}
              line1="No projects created yet."
              line2="Start a project to track progress."
            />
          )}
        </ChartCard>

        {/* Goal Progress */}
        {goalProgress.length > 0 ? (
          <ChartCard title="Goal Progress" icon={<Target size={18} color="#e2e8f0" />}>
            <View className="gap-3">
              {goalProgress.map((goal, index) => (
                <View key={index}>
                  <View className="flex-row justify-between items-center mb-1.5">
                    <Text className="text-ink text-sm flex-1 mr-2" numberOfLines={1}>
                      {goal.title}
                    </Text>
                    <View
                      className="px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${goal.color}33` }}
                    >
                      <Text className="text-xs" style={{ color: goal.color }}>
                        {goal.category}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center">
                    <ProgressBar value={goal.progress} className="flex-1 mr-2" />
                    <Text className="text-sm font-semibold" style={{ color: goal.color }}>
                      {goal.progress}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ChartCard>
        ) : null}

        {/* Summary totals */}
        <View className="flex-row flex-wrap -mx-1.5 mt-1">
          <View className="w-1/3 px-1.5">
            <Card className="items-center py-5">
              <Text className="text-ink-muted text-xs mb-2 text-center">Projects</Text>
              <Text className="text-3xl font-extrabold" style={{ color: '#10b981' }}>
                {counts.totalProjects}
              </Text>
            </Card>
          </View>
          <View className="w-1/3 px-1.5">
            <Card className="items-center py-5">
              <Text className="text-ink-muted text-xs mb-2 text-center">Completed</Text>
              <Text className="text-3xl font-extrabold" style={{ color: '#3b82f6' }}>
                {counts.completedTasks}
              </Text>
            </Card>
          </View>
          <View className="w-1/3 px-1.5">
            <Card className="items-center py-5">
              <Text className="text-ink-muted text-xs mb-2 text-center">Pending</Text>
              <Text className="text-3xl font-extrabold" style={{ color: '#f59e0b' }}>
                {counts.pendingTasks}
              </Text>
            </Card>
          </View>
        </View>

        <Text className="text-ink-muted text-xs text-center mt-6">
          All analytics are computed locally from your ClearMind data.
        </Text>
      </ScrollView>
    </Screen>
  );
}
