import React, { useMemo, useState } from 'react';
import { History, Bot, Smartphone, Globe, Terminal, Bell, LayoutGrid, Cpu, X } from 'lucide-react';
import type { Activity } from '../../types';
import { formatDayHeading, toISODate } from '../../shared/tasks';
import { STORES } from '../../services/db';
import { useStore } from '../tasks/store';
import { useTaskData, useTaskUI } from '../tasks/TaskContext';
import { cx } from '../tasks/ui';
import { projectColor } from '../tasks/actions';
import { go } from '../tasks/TaskViews';
import { PageShell, Segmented, PageLoading } from './PageShell';

const VERB: Record<string, string> = {
  created: 'created', completed: 'completed', reopened: 'reopened', deleted: 'deleted', restored: 'restored', moved: 'moved',
  priority: 'changed priority of', rescheduled: 'rescheduled', renamed: 'renamed', commented: 'commented on', archived: 'archived',
  unarchived: 'unarchived', updated: 'updated',
};
const SRC: Record<string, { label: string; Icon: typeof Bot }> = {
  android: { label: 'Android', Icon: Smartphone }, ios: { label: 'iPhone', Icon: Smartphone }, web: { label: 'Web', Icon: Globe },
  mcp: { label: 'MCP', Icon: Bot }, api: { label: 'API', Icon: Bot }, cli: { label: 'CLI', Icon: Terminal },
  widget: { label: 'Widget', Icon: LayoutGrid }, notification: { label: 'Notification', Icon: Bell }, system: { label: 'System', Icon: Cpu },
};
const AGENT = new Set(['mcp', 'api', 'cli']);
const TYPES = ['all', 'created', 'completed', 'reopened', 'rescheduled', 'priority', 'moved', 'renamed', 'commented', 'deleted'] as const;
type TypeFilter = typeof TYPES[number];
const ENTITIES = ['all', 'task', 'project', 'section', 'label', 'comment'] as const;
type EntityFilter = typeof ENTITIES[number];

function describe(a: Activity) {
  const d = (a.details ?? {}) as Record<string, any>;
  const what = a.entity === 'project' ? `project “${a.title ?? ''}”` : a.entity === 'section' ? `section “${a.title ?? ''}”` : a.entity === 'label' ? `label “${a.title ?? ''}”` : `“${a.title ?? 'task'}”`;
  let extra = '';
  if (a.action === 'priority' && d.from != null) extra = ` (${d.from} → ${d.to})`;
  if (a.action === 'rescheduled') extra = d.to ? ` to ${d.to}` : ' (no date)';
  if (a.action === 'completed' && d.next) extra = ` · next ${d.next}`;
  if (a.action === 'commented' && d.text) extra = `: ${String(d.text).slice(0, 140)}`;
  return { verb: VERB[a.action] ?? a.action, what, extra };
}

/** Source badge, e.g. "Claude Code via MCP" for agent actions. */
function SourceBadge({ a }: { a: Activity }) {
  const s = SRC[a.source ?? ''] ?? { label: a.source ?? 'Unknown', Icon: History };
  const agent = AGENT.has(a.source ?? '') || !!a.agent;
  const text = a.agent ? `${a.agent} via ${s.label}` : s.label;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md max-w-full ${agent
      ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
      : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400'}`}>
      <s.Icon size={11} className="shrink-0" /><span className="truncate">{text}</span>
    </span>
  );
}

const time = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

/** History of meaningful changes across devices and agents (#activity, #activity/<projectId>). */
export default function ActivityView({ projectId }: { projectId?: string }) {
  const { taskMap, projectMap, loading } = useTaskData();
  const ui = useTaskUI();
  const snap = useStore<Activity>(STORES.ACTIVITY);
  const [who, setWho] = useState<'all' | 'mine' | 'agents'>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [entity, setEntity] = useState<EntityFilter>('all');
  const [source, setSource] = useState<string>('all');
  const [limit, setLimit] = useState(300);

  const sources = useMemo(() => [...new Set(snap.items.map((a) => a.source ?? '').filter(Boolean))].sort(), [snap.items]);
  const filtered = useMemo(() => snap.items
    .filter((a) => !a.deleted && a.at && (!projectId || a.projectId === projectId || (a.entity === 'project' && a.entityId === projectId)))
    .filter((a) => who === 'all' || (who === 'agents' ? AGENT.has(a.source ?? '') || !!a.agent : !AGENT.has(a.source ?? '') && !a.agent))
    .filter((a) => source === 'all' || (a.source ?? '') === source)
    .filter((a) => type === 'all' || a.action === type)
    .filter((a) => entity === 'all' || a.entity === entity)
    .sort((a, b) => b.at.localeCompare(a.at)), [snap.items, projectId, who, source, type, entity]);
  const groups = useMemo(() => {
    const out: { day: string; items: Activity[] }[] = [];
    for (const a of filtered.slice(0, limit)) {
      const d = new Date(a.at);
      const day = Number.isNaN(d.getTime()) ? 'earlier' : toISODate(d);
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(a);
    }
    return out;
  }, [filtered, limit]);

  if (loading || !snap.loaded) return <PageLoading />;
  const proj = projectId ? projectMap.get(projectId) : null;
  const filtersOn = who !== 'all' || type !== 'all' || entity !== 'all' || source !== 'all';
  const selectCls = `${cx.input} py-1 text-xs`;

  const open = (a: Activity) => {
    if (a.entity === 'task' && taskMap.has(a.entityId)) ui.openTask(a.entityId);
    else if (a.entity === 'comment' && typeof (a.details as any)?.taskId === 'string' && taskMap.has((a.details as any).taskId)) ui.openTask((a.details as any).taskId);
    else if (a.entity === 'project' && projectMap.has(a.entityId)) go(`project/${a.entityId}`);
    else if (a.entity === 'section' && a.projectId && projectMap.has(a.projectId)) go(`project/${a.projectId}`);
  };
  const clickable = (a: Activity) =>
    (a.entity === 'task' && taskMap.has(a.entityId)) ||
    (a.entity === 'comment' && taskMap.has((a.details as any)?.taskId)) ||
    (a.entity === 'project' && projectMap.has(a.entityId)) ||
    (a.entity === 'section' && !!a.projectId && projectMap.has(a.projectId));

  return (
    <PageShell title="Activity" back={!!projectId} subtitle={proj ? `Changes in ${proj.title}` : 'All changes, from every device and agent'}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Segmented label="Who" value={who} onChange={setWho} options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Me' }, { value: 'agents', label: 'Agents' }]} />
        <select aria-label="Activity type" value={type} onChange={(e) => setType(e.target.value as TypeFilter)} className={selectCls}>
          {TYPES.map((t) => <option key={t} value={t}>{t === 'all' ? 'Any action' : t === 'priority' ? 'Priority changed' : t[0].toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select aria-label="Item type" value={entity} onChange={(e) => setEntity(e.target.value as EntityFilter)} className={selectCls}>
          {ENTITIES.map((t) => <option key={t} value={t}>{t === 'all' ? 'Any item' : `${t[0].toUpperCase() + t.slice(1)}s`}</option>)}
        </select>
        <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className={selectCls}>
          <option value="all">Any source</option>
          {sources.map((s) => <option key={s} value={s}>{SRC[s]?.label ?? s}</option>)}
        </select>
        {filtersOn ? <button onClick={() => { setWho('all'); setType('all'); setEntity('all'); setSource('all'); }} className={`inline-flex items-center gap-1 text-xs ${cx.muted} hover:underline`}><X size={12} />Clear</button> : null}
        {proj ? <button onClick={() => go('activity')} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">All projects</button> : null}
      </div>

      {groups.map((g) => (
        <section key={g.day} className="mt-5 first:mt-0">
          <h3 className={`text-sm font-bold pb-1.5 border-b ${cx.border} ${cx.text}`}>{g.day === 'earlier' ? 'Earlier' : formatDayHeading(g.day)}</h3>
          <ul>
            {g.items.map((a) => {
              const { verb, what, extra } = describe(a);
              const p = a.projectId && !projectId ? projectMap.get(a.projectId) : null;
              const canOpen = clickable(a);
              const isAgent = AGENT.has(a.source ?? '') || !!a.agent;
              return (
                <li key={a.id}>
                  <button disabled={!canOpen} onClick={() => open(a)}
                    className={`w-full text-left flex gap-3 py-2.5 px-1 border-b ${cx.border} ${canOpen ? `${cx.hover} cursor-pointer` : 'cursor-default'}`}>
                    <span className="pt-0.5 shrink-0">{isAgent ? <Bot size={16} className="text-violet-500" /> : <History size={16} className={cx.faint} />}</span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm break-words ${cx.text}`}>
                        {a.agent ? <span className="font-semibold">{a.agent} </span> : null}
                        {verb} <span className={canOpen ? 'font-medium' : ''}>{what}</span>{extra}
                        {p ? <span className={cx.muted}> in <span style={{ color: projectColor(p) }}>#</span>{p.title}</span> : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={`text-xs tabular-nums ${cx.muted}`}>{time(a.at)}</span>
                        <SourceBadge a={a} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {filtered.length > limit ? (
        <div className="text-center mt-4"><button onClick={() => setLimit((n) => n + 300)} className={cx.btnGhost}>Show more ({filtered.length - limit} older)</button></div>
      ) : null}
      {!filtered.length ? (
        <div className="flex flex-col items-center text-center py-16 px-6">
          <History size={32} className={cx.muted} />
          <p className={`mt-3 font-semibold ${cx.text}`}>{filtersOn ? 'No matching activity' : 'No activity yet'}</p>
          <p className={`text-sm mt-1 ${cx.muted}`}>Changes from your devices and connected agents appear here.</p>
        </div>
      ) : null}
    </PageShell>
  );
}
