import React, { useMemo, useState } from 'react';
import { Flame, Trophy, Target, TrendingUp, TrendingDown, CircleCheck, Bot, Clock, AlertTriangle } from 'lucide-react';
import type { Completion, Preferences } from '../../types';
import { productivitySummary, intervalSummary, weeklyTrend, LEVELS, resolvePreferences, type Interval } from '../../shared/domain';
import { WEEKDAY_SHORT, MONTH_SHORT, parseISODate } from '../../shared/tasks';
import { STORES } from '../../services/db';
import { useStore } from '../tasks/store';
import { useTaskData } from '../tasks/TaskContext';
import { cx, PRIORITY_COLOR } from '../tasks/ui';
import { projectColor } from '../tasks/actions';
import { go } from '../tasks/TaskViews';
import { Card, Segmented, PageLoading } from './PageShell';

const ACCENT = '#3B82F6';
const GOAL_MET = '#16A34A';

export const SOURCE_LABEL: Record<string, string> = {
  android: 'Android', ios: 'iPhone', web: 'Web', mcp: 'AI agents (MCP)', api: 'API', cli: 'CLI', widget: 'Widget', notification: 'Notification', system: 'System', unknown: 'Earlier',
};
const AGENT_SOURCES = new Set(['mcp', 'api', 'cli']);

/** Single-series bar chart: one hue, goal-met days in green (with a legend line below). */
function Bars({ data, max, goal, ariaLabel }: { data: { key: string; value: number; label: string; sub?: string; met?: boolean; title: string }[]; max: number; goal?: number; ariaLabel: string }) {
  const H = 112;
  const goalY = goal && max ? Math.min(1, goal / max) : null;
  return (
    <div role="img" aria-label={ariaLabel} className="relative">
      <div className="relative flex items-end gap-1 sm:gap-2" style={{ height: H + 18 }}>
        {goalY != null ? (
          <div className="absolute left-0 right-0 border-t border-dashed border-gray-300 dark:border-gray-700 pointer-events-none" style={{ bottom: goalY * H }} aria-hidden />
        ) : null}
        {data.map((d) => {
          const h = max ? Math.max(d.value ? 4 : 2, Math.round((d.value / max) * H)) : 2;
          return (
            <div key={d.key} className="group relative flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={d.title}>
              <span className={`text-[10px] mb-1 tabular-nums ${cx.muted}`}>{d.value || ''}</span>
              <div className="w-full max-w-[28px] rounded-t-[4px] transition-opacity group-hover:opacity-80"
                style={{ height: h, background: d.value ? (d.met ? GOAL_MET : ACCENT) : 'rgba(148,163,184,0.25)' }} />
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[11px] px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">{d.title}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 sm:gap-2 mt-1.5 border-t border-gray-200 dark:border-gray-800 pt-1.5">
        {data.map((d) => (
          <div key={d.key} className="flex-1 min-w-0 text-center">
            <div className={`text-[11px] truncate ${cx.muted}`}>{d.label}</div>
            {d.sub ? <div className={`text-[9px] truncate ${cx.faint}`}>{d.sub}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Meter({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function BreakdownRow({ label, value, total, color, icon }: { label: string; value: number; total: number; color: string; icon?: React.ReactNode }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 text-sm">
        {icon ?? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        <span className={`flex-1 truncate ${cx.text}`}>{label}</span>
        <span className={`tabular-nums ${cx.muted}`}>{value}<span className={`ml-1.5 text-xs ${cx.faint}`}>{pct}%</span></span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** The "Tasks" tab of Insights (#insights): momentum, goals, streaks and breakdowns from the completion log. */
export default function ProductivityPanel() {
  const { tasks, projectMap, loading } = useTaskData();
  const cs = useStore<Completion>(STORES.COMPLETIONS);
  const ps = useStore<Preferences>(STORES.PREFERENCES);
  const prefRec = ps.items[0] ?? null;
  const prefs = resolvePreferences(prefRec);
  const completions = cs.items;
  const [iv, setIv] = useState<'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month'>('this_week');
  const [weeks, setWeeks] = useState<'4' | '8'>('4');

  const input = useMemo(() => ({ completions, tasks, preferences: prefRec }), [completions, tasks, prefRec]);
  const sum = useMemo(() => productivitySummary(input), [input]);
  const trend = useMemo(() => weeklyTrend(input, Number(weeks)), [input, weeks]);
  const period = useMemo(() => intervalSummary(input, iv as Interval), [input, iv]);

  if (loading || !cs.loaded) return <PageLoading />;

  const m = sum.momentum;
  const lvlIdx = Math.max(0, LEVELS.findIndex((l) => l.name === m.level));
  const lvlMin = LEVELS[lvlIdx]?.min ?? 0;
  const nextMin = LEVELS[lvlIdx + 1]?.min ?? m.score;
  const lvlPct = nextMin > lvlMin ? (m.score - lvlMin) / (nextMin - lvlMin) : 1;
  const today = sum.today;
  const week = sum.week;
  const weekMax = Math.max(today.goal, ...week.days.map((d) => d.completed), 1);
  const trendMax = Math.max(prefs.weeklyGoal, ...trend.map((t) => t.completed), 1);
  const settings = () => go('settings?s=productivity');
  const sources = Object.entries(period.bySource).sort((a, b) => b[1] - a[1]);
  const agentDone = sources.filter(([s]) => AGENT_SOURCES.has(s)).reduce((n, [, v]) => n + v, 0);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Momentum */}
        <Card className="md:col-span-2">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 bg-blue-50 dark:bg-blue-500/10"><Trophy size={28} className="text-blue-600 dark:text-blue-400" /></div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold tracking-wide ${cx.muted}`}>MOMENTUM</p>
              <p className={`text-3xl font-extrabold tabular-nums ${cx.text}`}>{m.score.toLocaleString()}</p>
              <p className={`text-sm ${cx.muted}`}>{m.level}{m.nextLevel ? ` · ${m.toNextLevel.toLocaleString()} to ${m.nextLevel}` : ' · top level'}</p>
            </div>
            <div className="hidden sm:block text-right">
              <p className={`text-2xl font-bold tabular-nums ${cx.text}`}>{m.totalCompleted.toLocaleString()}</p>
              <p className={`text-xs ${cx.muted}`}>completions, all time</p>
            </div>
          </div>
          <div className="mt-4"><Meter value={Math.round(lvlPct * 100)} max={100} color={ACCENT} /></div>
          {m.overduePenalty ? <p className={`text-xs mt-2 ${cx.muted}`}>−{m.overduePenalty} for tasks overdue more than 3 days — clearing them restores points.</p> : null}
        </Card>

        {/* Today */}
        <Card title="Today" right={<span className={`text-xs ${cx.muted}`}>{today.completed}/{today.goal} daily goal</span>}>
          <Meter value={today.completed} max={today.goal} color={today.met ? GOAL_MET : ACCENT} />
          <p className={`text-sm mt-2 ${cx.text}`}>{today.met ? 'Daily goal reached — nice work.' : `${Math.max(0, today.goal - today.completed)} more to reach your goal`}</p>
          <div className="grid grid-cols-4 gap-2 mt-4 text-center">
            {[
              { k: 'Done', v: today.completed, c: GOAL_MET },
              { k: 'P1 done', v: today.highPriority, c: PRIORITY_COLOR.High },
              { k: 'Remaining', v: today.remaining, c: ACCENT },
              { k: 'Overdue', v: today.overdue, c: today.overdue ? '#EF4444' : '#9CA3AF' },
            ].map((x) => (
              <div key={x.k}>
                <div className="text-xl font-bold tabular-nums" style={{ color: x.c }}>{x.v}</div>
                <div className={`text-[11px] ${cx.muted}`}>{x.k}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Streaks + weekly goal */}
        <Card title="Goals & streaks" right={<button onClick={settings} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">Edit goals</button>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-orange-50 dark:bg-orange-500/10 p-3">
              <Flame size={18} className="text-orange-500" />
              <div className={`text-2xl font-extrabold tabular-nums mt-1 ${cx.text}`}>{m.streak.current}</div>
              <div className={`text-xs ${cx.muted}`}>day streak{prefs.vacation ? ' (paused)' : ''}</div>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 p-3">
              <Target size={18} className="text-blue-500" />
              <div className={`text-2xl font-extrabold tabular-nums mt-1 ${cx.text}`}>{m.streak.longest}</div>
              <div className={`text-xs ${cx.muted}`}>longest · {m.daysGoalMet} goal days</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm mb-1.5">
              <span className={`flex-1 ${cx.text}`}>Weekly goal</span>
              <span className={`tabular-nums ${cx.muted}`}>{week.completed}/{week.goal}</span>
            </div>
            <Meter value={week.completed} max={week.goal} color={week.met ? GOAL_MET : ACCENT} />
          </div>
        </Card>

        {/* This week */}
        <Card title="This week" right={week.changePct != null ? (
          <span className={`inline-flex items-center gap-1 text-xs ${week.changePct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
            {week.changePct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{week.changePct >= 0 ? '+' : ''}{week.changePct}% vs last week
          </span>
        ) : null}>
          <Bars
            ariaLabel={`Completed per day this week: ${week.days.map((d) => `${WEEKDAY_SHORT[parseISODate(d.day)!.getDay()]} ${d.completed}`).join(', ')}`}
            max={weekMax} goal={today.goal}
            data={week.days.map((d) => { const dt = parseISODate(d.day)!; return { key: d.day, value: d.completed, met: d.met, label: WEEKDAY_SHORT[dt.getDay()], title: `${WEEKDAY_SHORT[dt.getDay()]} ${MONTH_SHORT[dt.getMonth()]} ${dt.getDate()}: ${d.completed} done` }; })}
          />
          <p className={`text-xs mt-3 ${cx.muted}`}>
            Dashed line = daily goal · green = goal met{week.bestDay && week.bestDay.completed ? ` · best day ${WEEKDAY_SHORT[parseISODate(week.bestDay.day)!.getDay()]} (${week.bestDay.completed})` : ''}
          </p>
        </Card>

        {/* Weekly trend */}
        <Card title="Weekly trend" right={<Segmented label="Weeks" value={weeks} onChange={setWeeks} options={[{ value: '4', label: '4 wk' }, { value: '8', label: '8 wk' }]} />}>
          <Bars
            ariaLabel={`Completed per week: ${trend.map((t) => `${t.weekStart} ${t.completed}`).join(', ')}`}
            max={trendMax} goal={prefs.weeklyGoal}
            data={trend.map((t, i) => { const d = parseISODate(t.weekStart)!; return { key: t.weekStart, value: t.completed, met: t.completed >= prefs.weeklyGoal, label: `${d.getDate()}`, sub: i === 0 || d.getDate() <= 7 ? MONTH_SHORT[d.getMonth()] : undefined, title: `Week of ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}: ${t.completed} done` }; })}
          />
          <p className={`text-xs mt-3 ${cx.muted}`}>Dashed line = weekly goal ({prefs.weeklyGoal}) · {m.weeksGoalMet} week{m.weeksGoalMet === 1 ? '' : 's'} met overall</p>
        </Card>

        {/* Breakdown */}
        <Card title="Breakdown" className="md:col-span-2" right={
          <Segmented label="Period" value={iv} onChange={setIv} options={[
            { value: 'today', label: 'Today' }, { value: 'this_week', label: 'Week' }, { value: 'last_week', label: 'Last wk' }, { value: 'this_month', label: 'Month' }, { value: 'last_month', label: 'Last mo' },
          ]} />
        }>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4">
            <span className={`text-sm ${cx.text}`}><span className="text-xl font-bold tabular-nums">{period.completed}</span> completed</span>
            <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"><Clock size={14} />{period.onTime} on time</span>
            <span className="inline-flex items-center gap-1.5 text-sm text-red-500"><AlertTriangle size={14} />{period.late} late</span>
            {agentDone ? <span className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400"><Bot size={14} />{agentDone} by agents</span> : null}
          </div>
          {period.completed ? (
            <>
              <div className="h-2.5 flex rounded-full overflow-hidden gap-0.5 mb-5" role="img" aria-label={`${period.onTime} on time, ${period.late} late`}>
                {period.onTime ? <div style={{ flex: period.onTime, background: GOAL_MET }} /> : null}
                {period.late ? <div style={{ flex: period.late, background: '#EF4444' }} /> : null}
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <h3 className={`text-xs font-semibold mb-1 ${cx.muted}`}>BY PRIORITY</h3>
                  {([['P1', period.byPriority.p1, PRIORITY_COLOR.High], ['P2', period.byPriority.p2, PRIORITY_COLOR.Medium], ['P3', period.byPriority.p3, PRIORITY_COLOR.Low], ['P4', period.byPriority.p4, PRIORITY_COLOR.None]] as const).map(([k, v, c]) => (
                    <BreakdownRow key={k} label={`Priority ${k.slice(1)}`} value={v} total={period.completed} color={c} />
                  ))}
                </div>
                <div className="min-w-0">
                  <h3 className={`text-xs font-semibold mb-1 ${cx.muted}`}>BY PROJECT</h3>
                  {period.byProject.slice(0, 6).map((p) => {
                    const proj = p.projectId ? projectMap.get(p.projectId) : null;
                    return (
                      <button key={p.projectId ?? 'inbox'} className="block w-full text-left rounded-md hover:bg-gray-50 dark:hover:bg-white/5" onClick={() => go(proj ? `project/${proj.id}` : 'inbox')}>
                        <BreakdownRow label={proj?.title ?? (p.projectId ? 'Deleted project' : 'Inbox')} value={p.completed} total={period.completed} color={proj ? projectColor(proj) : ACCENT} />
                      </button>
                    );
                  })}
                  {period.byProject.length > 6 ? <p className={`text-xs mt-1 ${cx.faint}`}>+{period.byProject.length - 6} more</p> : null}
                </div>
                <div>
                  <h3 className={`text-xs font-semibold mb-1 ${cx.muted}`}>BY SOURCE</h3>
                  {sources.map(([s, n]) => (
                    <BreakdownRow key={s} label={SOURCE_LABEL[s] ?? s} value={n} total={period.completed} color={AGENT_SOURCES.has(s) ? '#8B5CF6' : '#64748B'}
                      icon={AGENT_SOURCES.has(s) ? <Bot size={13} className="text-violet-500 shrink-0" /> : undefined} />
                  ))}
                </div>
              </div>
            </>
          ) : <p className={`text-sm ${cx.muted}`}>Nothing completed in this period yet.</p>}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={() => go('completed')} className={`inline-flex items-center gap-2 ${cx.btnGhost}`}><CircleCheck size={15} className="text-green-500" />Completed history</button>
        <button onClick={() => go('activity')} className={`inline-flex items-center gap-2 ${cx.btnGhost}`}>Activity</button>
      </div>
      <p className={`text-xs mt-6 ${cx.muted}`}>Momentum: P1 4 · P2 3 · P3 2 · P4 1 points, +1 when on time, +5 per daily goal and +20 per weekly goal met, plus your current streak.</p>
    </>
  );
}
