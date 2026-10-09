import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Flame, Trophy, Target, TrendingUp, TrendingDown, Settings2, CircleCheck } from 'lucide-react-native';
import { productivitySummary, intervalSummary, LEVELS, resolvePreferences, type Interval } from '@clearmind/shared/domain';
import { WEEKDAY_SHORT, parseISODate, MONTH_SHORT } from '@clearmind/shared/tasks';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { useCollection } from '../../hooks/useCollection';
import { STORES } from '../../services/db';
import { Screen, Spinner, PageHeader, SegmentedControl } from '../../components/ui';
import { LifeInsights } from '../../components/insights/LifeInsights';
import { Segments } from '../../components/settings/ui';
import { OfflineBanner, IconButton } from '../../components/tasks/TaskScreen';
import { projectColor } from '../../services/taskActions';
import { T } from '../../lib/theme';
import type { Completion, Preferences } from '@clearmind/shared';

function Card({ children, title, right }: { children: React.ReactNode; title?: string; right?: React.ReactNode }) {
  return (
    <View className="mx-4 mt-4 p-4 rounded-2xl bg-midnight-light border border-line">
      {title ? <View className="flex-row items-center mb-3"><Text className="text-ink font-semibold text-[15px] flex-1" accessibilityRole="header">{title}</Text>{right}</View> : null}
      {children}
    </View>
  );
}

function Bar({ value, max, highlight, label, sub }: { value: number; max: number; highlight?: boolean; label: string; sub?: string }) {
  const h = max ? Math.max(4, Math.round((value / max) * 96)) : 4;
  return (
    <View className="items-center flex-1" accessibilityLabel={`${label}: ${value}`}>
      <Text className="text-ink-muted text-[10px] mb-1">{value || ''}</Text>
      <View style={{ height: 96, justifyContent: 'flex-end' }}>
        <View style={{ width: 18, height: h, borderRadius: 6, backgroundColor: highlight ? T.success : value ? T.accent : T.card2 }} />
      </View>
      <Text className="text-ink-muted text-[11px] mt-1.5">{label}</Text>
      {sub ? <Text className="text-ink-muted text-[9px]">{sub}</Text> : null}
    </View>
  );
}

export default function ProductivityScreen() {
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'tasks' | 'life'>(tabParam === 'life' ? 'life' : 'tasks');
  const ui = useTaskUI();
  const { items: completions, loading } = useCollection<Completion>(STORES.COMPLETIONS);
  const { items: prefItems } = useCollection<Preferences>(STORES.PREFERENCES);
  const prefs = resolvePreferences(prefItems[0]);
  const [iv, setIv] = useState<'today' | 'this_week' | 'this_month' | 'last_week'>('this_week');
  const sum = useMemo(() => productivitySummary({ completions, tasks: ui.tasks, preferences: prefItems[0] ?? null }), [completions, ui.tasks, prefItems]);
  const period = useMemo(() => intervalSummary({ completions, tasks: ui.tasks, preferences: prefItems[0] ?? null }, iv as Interval), [completions, ui.tasks, prefItems, iv]);
  if (loading) return <Spinner label="Loading productivity…" />;

  const m = sum.momentum;
  const lvlIdx = LEVELS.findIndex((l) => l.name === m.level);
  const lvlMin = LEVELS[lvlIdx]?.min ?? 0;
  const nextMin = LEVELS[lvlIdx + 1]?.min ?? m.score;
  const lvlPct = nextMin > lvlMin ? (m.score - lvlMin) / (nextMin - lvlMin) : 1;
  const today = sum.today;
  const todayPct = Math.min(1, today.goal ? today.completed / today.goal : 0);
  const weekMax = Math.max(today.goal, ...sum.week.days.map((d) => d.completed), 1);
  const trendMax = Math.max(...sum.trend.map((t) => t.completed), 1);
  const SOURCE_LABEL: Record<string, string> = { android: 'Android', ios: 'iPhone', web: 'Web', mcp: 'AI agents', api: 'API', cli: 'CLI', widget: 'Widget', notification: 'Notification', unknown: 'Earlier' };

  return (
    <Screen padded={false}>
      <PageHeader
        title="Insights"
        subtitle={tab === 'tasks' ? 'Task momentum, goals and streaks' : 'Insights across all of ClearMind'}
        right={<IconButton label="Productivity settings" onPress={() => router.push('/(app)/settings/productivity')}><Settings2 size={22} color={T.ink} /></IconButton>}
      />
      <OfflineBanner />
      <SegmentedControl<'tasks' | 'life'>
        segments={[{ label: 'Tasks', value: 'tasks' }, { label: 'Life', value: 'life' }]}
        value={tab}
        onChange={setTab}
        className="mx-4 mb-1"
      />
      {tab === 'life' ? <LifeInsights /> : (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card>
          <View className="flex-row items-center">
            <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: `${T.accent}22` }}><Trophy size={28} color={T.accent} /></View>
            <View className="flex-1 ml-4">
              <Text className="text-ink-muted text-xs font-semibold">MOMENTUM</Text>
              <Text className="text-ink text-3xl font-extrabold">{m.score.toLocaleString()}</Text>
              <Text className="text-ink-muted text-sm">{m.level}{m.nextLevel ? ` · ${m.toNextLevel} to ${m.nextLevel}` : ''}</Text>
            </View>
          </View>
          <View className="h-2 rounded-full bg-midnight-lighter mt-4 overflow-hidden"><View style={{ width: `${Math.round(lvlPct * 100)}%`, height: 8, backgroundColor: T.accent }} /></View>
          {m.overduePenalty ? <Text className="text-ink-muted text-xs mt-2">−{m.overduePenalty} for tasks overdue more than 3 days — clearing them restores points.</Text> : null}
        </Card>

        <Card title="Today" right={<Text className="text-ink-muted text-xs">{today.completed}/{today.goal} goal</Text>}>
          <View className="flex-row items-center">
            <View className="flex-1">
              <View className="h-3 rounded-full bg-midnight-lighter overflow-hidden"><View style={{ width: `${Math.round(todayPct * 100)}%`, height: 12, backgroundColor: today.met ? T.success : T.accent }} /></View>
              <Text className="text-ink text-sm mt-2">{today.met ? 'Daily goal reached' : `${today.goal - today.completed} more to reach your goal`}</Text>
            </View>
          </View>
          <View className="flex-row mt-4">
            {[
              { k: 'Completed', v: today.completed, c: T.success },
              { k: 'P1 done', v: today.highPriority, c: '#F43F5E' },
              { k: 'Remaining', v: today.remaining, c: T.accent },
              { k: 'Overdue', v: today.overdue, c: today.overdue ? T.danger : T.muted },
            ].map((x) => (
              <View key={x.k} className="flex-1 items-center">
                <Text className="text-xl font-bold" style={{ color: x.c }}>{x.v}</Text>
                <Text className="text-ink-muted text-[11px]">{x.k}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card title="This week" right={sum.week.changePct != null ? (
          <View className="flex-row items-center">{sum.week.changePct >= 0 ? <TrendingUp size={14} color={T.success} /> : <TrendingDown size={14} color={T.danger} />}<Text className="text-xs ml-1" style={{ color: sum.week.changePct >= 0 ? T.success : T.danger }}>{sum.week.changePct >= 0 ? '+' : ''}{sum.week.changePct}% vs last week</Text></View>
        ) : null}>
          <View className="flex-row">
            {sum.week.days.map((d) => <Bar key={d.day} value={d.completed} max={weekMax} highlight={d.met} label={WEEKDAY_SHORT[parseISODate(d.day)!.getDay()]} />)}
          </View>
          <Text className="text-ink-muted text-xs mt-3">{sum.week.completed}/{sum.week.goal} weekly goal{sum.week.bestDay && sum.week.bestDay.completed ? ` · best day ${WEEKDAY_SHORT[parseISODate(sum.week.bestDay.day)!.getDay()]} (${sum.week.bestDay.completed})` : ''}</Text>
        </Card>

        <View className="flex-row mx-4 mt-4">
          <View className="flex-1 p-4 rounded-2xl bg-midnight-light border border-line mr-2">
            <Flame size={20} color="#F97316" />
            <Text className="text-ink text-2xl font-extrabold mt-1">{m.streak.current}</Text>
            <Text className="text-ink-muted text-xs">day streak{prefs.vacation ? ' (paused)' : ''}</Text>
          </View>
          <View className="flex-1 p-4 rounded-2xl bg-midnight-light border border-line ml-2">
            <Target size={20} color={T.accent} />
            <Text className="text-ink text-2xl font-extrabold mt-1">{m.streak.longest}</Text>
            <Text className="text-ink-muted text-xs">longest streak · {m.daysGoalMet} goal days</Text>
          </View>
        </View>

        <Card title="Last 8 weeks">
          <View className="flex-row">
            {sum.trend.map((t, i) => { const d = parseISODate(t.weekStart)!; return <Bar key={t.weekStart} value={t.completed} max={trendMax} highlight={t.completed >= prefs.weeklyGoal} label={`${d.getDate()}`} sub={i === 0 || d.getDate() <= 7 ? MONTH_SHORT[d.getMonth()] : undefined} />; })}
          </View>
        </Card>

        <Card title="Breakdown">
          <Segments value={iv} onChange={setIv} options={[{ value: 'today', label: 'Today' }, { value: 'this_week', label: 'Week' }, { value: 'last_week', label: 'Last wk' }, { value: 'this_month', label: 'Month' }]} />
          <Text className="text-ink text-sm"><Text className="font-bold">{period.completed}</Text> completed · {period.onTime} on time · {period.late} late</Text>
          <Text className="text-ink-muted text-xs mt-1">P1 {period.byPriority.p1} · P2 {period.byPriority.p2} · P3 {period.byPriority.p3} · P4 {period.byPriority.p4}</Text>
          {period.byProject.length ? <Text className="text-ink-muted text-xs font-semibold mt-4 mb-1">BY PROJECT</Text> : null}
          {period.byProject.slice(0, 6).map((p) => {
            const proj = p.projectId ? ui.projectMap.get(p.projectId) : null;
            return (
              <View key={p.projectId ?? 'inbox'} className="flex-row items-center py-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: proj ? projectColor(proj) : T.accent }} />
                <Text className="text-ink text-sm flex-1 ml-2" numberOfLines={1}>{proj?.title ?? 'Inbox'}</Text>
                <Text className="text-ink-muted text-sm">{p.completed}</Text>
              </View>
            );
          })}
          {Object.keys(period.bySource).length ? <Text className="text-ink-muted text-xs mt-3">From {Object.entries(period.bySource).map(([s, n]) => `${SOURCE_LABEL[s] ?? s} ${n}`).join(' · ')}</Text> : null}
        </Card>

        <Pressable onPress={() => router.push('/(app)/completed')} className="mx-4 mt-4 flex-row items-center p-4 rounded-2xl bg-midnight-light border border-line active:opacity-80" accessibilityRole="button">
          <CircleCheck size={20} color={T.success} />
          <Text className="text-ink text-[15px] flex-1 ml-3">Completed history</Text>
          <Text className="text-ink-muted text-sm">{m.totalCompleted}</Text>
        </Pressable>
        <Text className="text-ink-muted text-xs text-center mt-6 mx-8">Momentum: P1 4 · P2 3 · P3 2 · P4 1 points, +1 when on time, +5 per daily goal and +20 per weekly goal met, plus your streak.</Text>
      </ScrollView>
      )}
    </Screen>
  );
}
