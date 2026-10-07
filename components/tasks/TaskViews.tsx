import React, { useMemo, useRef, useState } from 'react';
import {
  Inbox, Sun, ChevronLeft, ChevronRight, Search as SearchIcon, Tag, Hash, CircleCheck, CalendarX, CalendarRange,
  Flag, CalendarOff, Repeat, MoreHorizontal, Pencil, Trash2, Archive, ArchiveRestore, FolderPlus, Plus, X,
} from 'lucide-react';
import type { Label, Project, Task } from '../../types';
import {
  todayView, upcomingView, inboxTasks, projectTasks, labelTasks, searchTasks, completedTasks, compareTasks,
  isOverdue, priorityOf, addDays, startOfWeek, toISODate, parseISODate, formatDayHeading, todayISO,
  WEEKDAY_SHORT, MONTH_SHORT, MONTH_LONG, orderedProjects, priorityFromLevel,
} from '../../shared/tasks';
import { useTaskData, useTaskUI } from './TaskContext';
import { TaskList, Section, Empty, AddTaskRow } from './TaskList';
import { TaskItem } from './TaskItem';
import { Popover, MenuItem, Modal, cx, PRIORITY_COLOR, useTaskToast } from './ui';
import { updateTask, updateProject, deleteProject, projectSubtree, projectColor, deleteLabel, updateLabel, createLabel, createProject } from './actions';
import { LIST_COLORS } from '../../shared/tasks';

export const go = (hash: string) => { window.location.hash = hash; };

// ------------------------------------------------------------------ layout

function Page({ title, subtitle, titleColor, actions, children, back }: {
  title: string; subtitle?: string; titleColor?: string; actions?: React.ReactNode; children: React.ReactNode; back?: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-[#05050A]">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-6 pb-24">
        <header className="flex items-center gap-2 mb-4">
          {back ? (
            <button onClick={() => history.back()} className={`p-1 -ml-1 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Back"><ChevronLeft size={20} /></button>
          ) : null}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate" style={titleColor ? { color: titleColor } : undefined}><span className={titleColor ? '' : cx.text}>{title}</span></h1>
            {subtitle ? <p className={`text-sm mt-0.5 ${cx.muted}`}>{subtitle}</p> : null}
          </div>
          {actions}
        </header>
        {children}
      </div>
    </div>
  );
}

function Loading() {
  return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
}

const plural = (n: number, w = 'task') => `${n} ${w}${n === 1 ? '' : 's'}`;

// ------------------------------------------------------------------ views

export function InboxView() {
  const { tasks, projectMap, loading } = useTaskData();
  const list = useMemo(() => inboxTasks(tasks, projectMap), [tasks, projectMap]);
  if (loading) return <Loading />;
  return (
    <Page title="Inbox" subtitle={list.length ? plural(list.length) : undefined}>
      <TaskList tasks={list} addDefaults={{ projectId: null }} />
      {!list.length ? <Empty icon={<Inbox size={34} className="text-blue-500" />} title="Your Inbox is clear" subtitle="Capture anything here — press Q from anywhere to quick add, sort it into projects later." /> : null}
    </Page>
  );
}

export function TodayView() {
  const { tasks, loading } = useTaskData();
  const toast = useTaskToast();
  const today = todayISO();
  const { overdue, today: due } = useMemo(() => todayView(tasks, new Date()), [tasks, today]);
  const now = new Date();
  if (loading) return <Loading />;
  const count = overdue.length + due.length;
  return (
    <Page title="Today" subtitle={count ? plural(count) : `${WEEKDAY_SHORT[now.getDay()]} ${MONTH_SHORT[now.getMonth()]} ${now.getDate()}`}>
      {overdue.length ? (
        <Section title="Overdue" color="#EF4444" action={
          <button className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline" onClick={() => { overdue.forEach((t) => updateTask(t, { dueDate: today })); toast(`Moved ${plural(overdue.length)} to today`); }}>Reschedule</button>
        }>
          <TaskList tasks={overdue} showProject showParent />
        </Section>
      ) : null}
      <Section title="Today" subtitle={`${WEEKDAY_SHORT[now.getDay()]} ${MONTH_SHORT[now.getMonth()]} ${now.getDate()}`}>
        <TaskList tasks={due} showProject showParent addDefaults={{ dueDate: today }} />
      </Section>
      {!count ? <Empty icon={<Sun size={34} className="text-green-500" />} title="You’re all clear for today" subtitle="Enjoy the calm — or add something to plan your day." /> : null}
    </Page>
  );
}

export function UpcomingView() {
  const { tasks, loading } = useTaskData();
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const thisWeek = startOfWeek(new Date());
  const from = toISODate(weekStart) < today ? today : toISODate(weekStart);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) if (!t.completed && t.dueDate) m.set(t.dueDate, (m.get(t.dueDate) ?? 0) + 1);
    return m;
  }, [tasks]);
  const groups = useMemo(() => upcomingView(tasks, parseISODate(from)!, 14), [tasks, from]);
  const overdue = useMemo(() => (from === today ? todayView(tasks, new Date()).overdue : []), [tasks, from, today]);
  if (loading) return <Loading />;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const canBack = weekStart > thisWeek;
  return (
    <Page
      title="Upcoming"
      subtitle={`${MONTH_LONG[weekStart.getMonth()]} ${weekStart.getFullYear()}`}
      actions={
        <div className="flex items-center gap-1">
          <button disabled={!canBack} onClick={() => setWeekStart(addDays(weekStart, -7))} className={`p-1.5 rounded-md border ${cx.border} ${cx.hover} ${cx.muted} disabled:opacity-30`} aria-label="Previous week"><ChevronLeft size={16} /></button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className={`p-1.5 rounded-md border ${cx.border} ${cx.hover} ${cx.muted}`} aria-label="Next week"><ChevronRight size={16} /></button>
          {weekStart.getTime() !== thisWeek.getTime() ? <button onClick={() => setWeekStart(thisWeek)} className={`ml-1 ${cx.btnGhost}`}>Today</button> : null}
        </div>
      }
    >
      <div className={`grid grid-cols-7 gap-1 pb-3 mb-2 border-b ${cx.border}`}>
        {days.map((d) => {
          const iso = toISODate(d);
          const past = iso < today;
          const n = counts.get(iso) ?? 0;
          return (
            <button key={iso} disabled={past} onClick={() => document.getElementById(`day-${iso}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={`flex flex-col items-center py-1.5 rounded-lg ${past ? 'opacity-30' : cx.hover} ${iso === today ? 'text-green-600 dark:text-green-400' : cx.text}`}>
              <span className={`text-[11px] ${cx.muted}`}>{WEEKDAY_SHORT[d.getDay()]}</span>
              <span className="text-base font-bold">{d.getDate()}</span>
              <span className={`w-1 h-1 rounded-full mt-0.5 ${n ? 'bg-gray-400' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
      {overdue.length ? <Section title="Overdue" color="#EF4444"><TaskList tasks={overdue} showProject showParent /></Section> : null}
      {groups.map((g) => (
        <div id={`day-${g.date}`} key={g.date} className="scroll-mt-4">
          <Section title={formatDayHeading(g.date)} color={g.date === today ? '#16A34A' : undefined}>
            <TaskList tasks={g.tasks} showProject showParent hideDate addDefaults={{ dueDate: g.date }} />
          </Section>
        </div>
      ))}
    </Page>
  );
}

export function SearchView() {
  const { tasks, projects, labels, projectMap, labelMap, loading } = useTaskData();
  const [q, setQ] = useState('');
  const [withDone, setWithDone] = useState(false);
  const query = q.trim();
  const results = useMemo(() => (query ? searchTasks(tasks, query, projectMap, labelMap, withDone) : []), [tasks, query, projectMap, labelMap, withDone]);
  const pHits = query ? projects.filter((p) => p.title.toLowerCase().includes(query.toLowerCase())) : [];
  const lHits = query ? labels.filter((l) => l.name.toLowerCase().includes(query.replace(/^[@%]/, '').toLowerCase())) : [];
  if (loading) return <Loading />;
  return (
    <Page title="Search">
      <div className={`flex items-center gap-2 ${cx.input} py-2.5`}>
        <SearchIcon size={18} className={cx.muted} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, descriptions, projects, labels…" className="flex-1 bg-transparent outline-none" aria-label="Search" />
        {q ? <button onClick={() => setQ('')} aria-label="Clear search" className={cx.muted}><X size={16} /></button> : null}
      </div>
      {query ? (
        <>
          <label className={`inline-flex items-center gap-2 text-sm mt-3 ${cx.muted}`}>
            <input type="checkbox" checked={withDone} onChange={(e) => setWithDone(e.target.checked)} /> Include completed
          </label>
          {pHits.length || lHits.length ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {pHits.map((p) => <button key={p.id} onClick={() => go(`project/${p.id}`)} className={`inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md border ${cx.border} ${cx.hover} ${cx.text}`}><Hash size={13} color={projectColor(p)} />{p.title}</button>)}
              {lHits.map((l) => <button key={l.id} onClick={() => go(`label/${l.id}`)} className={`inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md border ${cx.border} ${cx.hover} ${cx.text}`}><Tag size={13} color={l.color} />{l.name}</button>)}
            </div>
          ) : null}
          <Section title="Tasks" subtitle={String(results.length)}>
            <TaskList tasks={results} showProject showParent />
            {!results.length ? <Empty icon={<SearchIcon size={30} className={cx.muted} />} title="No matching tasks" subtitle={`Nothing found for “${query}”.`} /> : null}
          </Section>
        </>
      ) : <p className={`text-sm mt-4 ${cx.muted}`}>Tip: search matches task names, descriptions, project names and labels. Try “@errand” or a project name.</p>}
    </Page>
  );
}

// ------------------------------------------------------------------ filters

export interface WebFilter { id: string; title: string; icon: React.ReactNode; empty: string; select: (t: Task[]) => Task[] }
const openOnly = (t: Task[]) => t.filter((x) => !x.completed);

export const FILTERS: WebFilter[] = [
  { id: 'overdue', title: 'Overdue', icon: <CalendarX size={18} color="#EF4444" />, empty: 'Nothing overdue. Nice.', select: (t) => openOnly(t).filter((x) => isOverdue(x)).sort(compareTasks) },
  {
    id: 'next7', title: 'Next 7 days', icon: <CalendarRange size={18} color="#8B5CF6" />, empty: 'Nothing scheduled for the next 7 days.',
    select: (t) => { const a = todayISO(); const b = toISODate(addDays(new Date(), 6)); return openOnly(t).filter((x) => x.dueDate && x.dueDate >= a && x.dueDate <= b).sort(compareTasks); },
  },
  ...(['High', 'Medium', 'Low'] as const).map((p, i) => ({
    id: `p${i + 1}`, title: `Priority ${i + 1}`, icon: <Flag size={18} color={PRIORITY_COLOR[p]} fill={PRIORITY_COLOR[p]} />,
    empty: `No open Priority ${i + 1} tasks.`, select: (t: Task[]) => openOnly(t).filter((x) => priorityOf(x) === p).sort(compareTasks),
  })),
  { id: 'nodate', title: 'No date', icon: <CalendarOff size={18} className="text-gray-400" />, empty: 'Every task has a date.', select: (t) => openOnly(t).filter((x) => !x.dueDate && !x.parentId).sort(compareTasks) },
  { id: 'recurring', title: 'Recurring', icon: <Repeat size={18} className="text-blue-500" />, empty: 'No repeating tasks yet — try “every monday” when adding a task.', select: (t) => openOnly(t).filter((x) => !!x.recurrence).sort(compareTasks) },
];

export function FilterView({ id }: { id: string }) {
  const { tasks, loading } = useTaskData();
  const f = FILTERS.find((x) => x.id === id) ?? FILTERS[0];
  const list = useMemo(() => f.select(tasks), [f, tasks]);
  if (loading) return <Loading />;
  const lvl = /^p([1-3])$/.exec(f.id);
  return (
    <Page title={f.title} subtitle={list.length ? plural(list.length) : undefined} back>
      <TaskList tasks={list} showProject showParent addDefaults={lvl ? { priority: priorityFromLevel(Number(lvl[1])) } : f.id === 'next7' ? { dueDate: todayISO() } : undefined} />
      {!list.length ? <Empty icon={f.icon} title={f.empty} /> : null}
    </Page>
  );
}

function LabelForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Label | null }) {
  const { labels } = useTaskData();
  const [name, setName] = useState('');
  const [color, setColor] = useState(LIST_COLORS[5].hex);
  const [was, setWas] = useState(false);
  if (open !== was) { setWas(open); if (open) { setName(initial?.name ?? ''); setColor(initial?.color ?? LIST_COLORS[(labels.length + 5) % LIST_COLORS.length].hex); } }
  const clean = name.trim().replace(/^[@%]/, '').replace(/\s+/g, '_');
  const dupe = labels.some((l) => l.id !== initial?.id && l.name.toLowerCase() === clean.toLowerCase());
  const save = () => { if (!clean || dupe) return; if (initial) updateLabel(initial, { name: clean, color }); else createLabel({ name: clean, color }); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit label' : 'Add label'}>
      <div className="p-5 space-y-4">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Label name" className={`${cx.input} w-full`} aria-label="Label name" />
        {dupe ? <p className="text-xs text-red-500 -mt-2">A label with that name already exists.</p> : null}
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex justify-end gap-2"><button onClick={onClose} className={cx.btnGhost}>Cancel</button><button onClick={save} disabled={!clean || dupe} className={cx.btnPrimary}>{initial ? 'Save' : 'Add'}</button></div>
      </div>
    </Modal>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      {LIST_COLORS.map((c) => (
        <button key={c.hex} onClick={() => onChange(c.hex)} role="radio" aria-checked={value === c.hex} aria-label={c.name} title={c.name}
          className={`w-7 h-7 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-[#0F1219] ${value === c.hex ? 'ring-2 ring-gray-400' : ''}`} style={{ background: c.hex }} />
      ))}
    </div>
  );
}

export function FiltersLabelsView() {
  const { tasks, labels, loading } = useTaskData();
  const [form, setForm] = useState<null | { initial?: Label }>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) if (!t.completed) for (const id of t.labelIds ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [tasks]);
  if (loading) return <Loading />;
  const sorted = [...labels].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Page title="Filters & Labels">
      <Section title="Filters">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => go(`filter/${f.id}`)} className={`w-full flex items-center gap-3 py-2.5 px-1 border-b ${cx.border} ${cx.hover} text-sm ${cx.text}`}>
            {f.icon}<span className="flex-1 text-left">{f.title}</span><span className={cx.muted}>{f.select(tasks).length || ''}</span>
          </button>
        ))}
      </Section>
      <Section title="Labels" action={<button onClick={() => setForm({})} className={`p-1 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Add label"><Plus size={16} /></button>}>
        {sorted.map((l) => (
          <div key={l.id} className={`group flex items-center gap-3 py-2.5 px-1 border-b ${cx.border} ${cx.hover} text-sm cursor-pointer`} onClick={() => go(`label/${l.id}`)}>
            <Tag size={16} color={l.color} /><span className={`flex-1 ${cx.text}`}>{l.name}</span>
            <span className={cx.muted}>{counts.get(l.id) || ''}</span>
            <button onClick={(e) => { e.stopPropagation(); setForm({ initial: l }); }} className={`p-1 rounded opacity-0 group-hover:opacity-100 ${cx.muted}`} aria-label={`Edit ${l.name}`}><Pencil size={14} /></button>
          </div>
        ))}
        {!sorted.length ? <p className={`text-sm py-3 ${cx.muted}`}>No labels yet. Add one with +, or type “@label” when adding a task.</p> : null}
      </Section>
      <LabelForm open={!!form} initial={form?.initial} onClose={() => setForm(null)} />
    </Page>
  );
}

export function LabelView({ id }: { id: string }) {
  const { tasks, labelMap, loading } = useTaskData();
  const toast = useTaskToast();
  const [edit, setEdit] = useState(false);
  const label = labelMap.get(id);
  const list = useMemo(() => labelTasks(tasks, id), [tasks, id]);
  if (loading) return <Loading />;
  if (!label) return <Page title="Label" back><Empty icon={<Tag size={30} className={cx.muted} />} title="This label no longer exists" /></Page>;
  return (
    <Page title={label.name} titleColor={label.color} subtitle={plural(list.length)} back actions={
      <div className="flex gap-1">
        <button onClick={() => setEdit(true)} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Edit label"><Pencil size={16} /></button>
        <button onClick={() => { if (confirm(`Delete label “${label.name}”? Tasks keep everything else.`)) { deleteLabel(label.id); toast('Label deleted'); go('filters'); } }} className={`p-1.5 rounded-md ${cx.hover} text-red-500`} aria-label="Delete label"><Trash2 size={16} /></button>
      </div>
    }>
      <TaskList tasks={list} showProject showParent addDefaults={{ labelIds: [label.id] }} />
      {!list.length ? <Empty icon={<Tag size={30} color={label.color} />} title="No open tasks with this label" /> : null}
      <LabelForm open={edit} initial={label} onClose={() => setEdit(false)} />
    </Page>
  );
}

// ------------------------------------------------------------------ projects

export function ProjectForm({ open, onClose, initial, parentId }: { open: boolean; onClose: () => void; initial?: Project | null; parentId?: string | null }) {
  const { projects } = useTaskData();
  const [name, setName] = useState('');
  const [color, setColor] = useState(LIST_COLORS[0].hex);
  const [parent, setParent] = useState<string | null>(null);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) { setName(initial?.title ?? ''); setColor(initial ? projectColor(initial) : LIST_COLORS[projects.length % LIST_COLORS.length].hex); setParent(initial ? initial.parentId ?? null : parentId ?? null); }
  }
  const blocked = new Set(initial ? projectSubtree(projects, initial.id) : []);
  const options = orderedProjects(projects).filter(({ project }) => !blocked.has(project.id));
  const save = () => {
    const title = name.trim();
    if (!title) return;
    if (initial) updateProject(initial, { title, color, parentId: parent });
    else { const p = createProject({ title, color, parentId: parent }); go(`project/${p.id}`); }
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit project' : 'Add project'}>
      <div className="p-5 space-y-4">
        <label className="block">
          <span className={`text-xs font-semibold ${cx.muted}`}>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className={`${cx.input} w-full mt-1`} />
        </label>
        <div><span className={`text-xs font-semibold ${cx.muted}`}>Colour</span><div className="mt-1.5"><ColorPicker value={color} onChange={setColor} /></div></div>
        <label className="block">
          <span className={`text-xs font-semibold ${cx.muted}`}>Parent project</span>
          <select value={parent ?? ''} onChange={(e) => setParent(e.target.value || null)} className={`${cx.input} w-full mt-1`}>
            <option value="">No parent</option>
            {options.map(({ project, depth }) => <option key={project.id} value={project.id}>{'  '.repeat(depth)}{project.title}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2"><button onClick={onClose} className={cx.btnGhost}>Cancel</button><button onClick={save} disabled={!name.trim()} className={cx.btnPrimary}>{initial ? 'Save' : 'Add'}</button></div>
      </div>
    </Modal>
  );
}

export function ProjectView({ id }: { id: string }) {
  const { tasks, projects, projectMap, loading } = useTaskData();
  const toast = useTaskToast();
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<null | 'edit' | 'child'>(null);
  const [showDone, setShowDone] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const project = projectMap.get(id);
  const open = useMemo(() => projectTasks(tasks, id), [tasks, id]);
  const done = useMemo(() => tasks.filter((t) => t.completed && !t.parentId && t.projectId === id), [tasks, id]);
  const children = useMemo(() => orderedProjects(projects).filter(({ project: p }) => p.parentId === id), [projects, id]);
  if (loading) return <Loading />;
  if (!project) return <Page title="Project" back><Empty icon={<Hash size={30} className={cx.muted} />} title="This project no longer exists" /></Page>;

  const remove = () => {
    const ids = new Set(projectSubtree(projects, project.id));
    const n = tasks.filter((t) => t.projectId && ids.has(t.projectId)).length;
    if (!confirm(`Delete “${project.title}”${ids.size > 1 ? ' and its sub-projects' : ''}, including ${plural(n)}? This can’t be undone.`)) return;
    deleteProject(project.id);
    toast('Project deleted');
    go('inbox');
  };

  return (
    <Page title={project.title} titleColor={projectColor(project)} subtitle={`${plural(open.length, 'open task')}${project.archived ? ' · archived' : ''}`} back actions={
      <>
        <button ref={moreRef} onClick={() => setMenu(true)} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Project options"><MoreHorizontal size={18} /></button>
        <Popover anchor={moreRef.current} open={menu} onClose={() => setMenu(false)} width={220}>
          <MenuItem icon={<Pencil size={15} />} label="Edit project" onClick={() => { setMenu(false); setForm('edit'); }} />
          <MenuItem icon={<FolderPlus size={15} />} label="Add sub-project" onClick={() => { setMenu(false); setForm('child'); }} />
          {project.archived
            ? <MenuItem icon={<ArchiveRestore size={15} />} label="Unarchive" onClick={() => { setMenu(false); updateProject(project, { archived: false }); toast('Project restored'); }} />
            : <MenuItem icon={<Archive size={15} />} label="Archive" onClick={() => { setMenu(false); updateProject(project, { archived: true }); toast('Project archived'); }} />}
          <MenuItem icon={<Trash2 size={15} />} label="Delete project" danger onClick={() => { setMenu(false); remove(); }} />
        </Popover>
      </>
    }>
      {children.length ? (
        <div className="mb-2">
          {children.map(({ project: c }) => (
            <button key={c.id} onClick={() => go(`project/${c.id}`)} className={`w-full flex items-center gap-3 py-2 px-1 border-b ${cx.border} ${cx.hover} text-sm ${cx.text}`}>
              <Hash size={15} color={projectColor(c)} /><span className="flex-1 text-left">{c.title}</span>
              <span className={cx.muted}>{tasks.filter((t) => !t.completed && t.projectId === c.id).length || ''}</span><ChevronRight size={15} className={cx.faint} />
            </button>
          ))}
        </div>
      ) : null}
      <TaskList tasks={open} addDefaults={{ projectId: project.id }} />
      {done.length ? (
        <Section title="Completed" subtitle={String(done.length)} action={<button onClick={() => setShowDone((x) => !x)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">{showDone ? 'Hide' : 'Show'}</button>}>
          {showDone ? <TaskList tasks={done} /> : null}
        </Section>
      ) : null}
      <ProjectForm open={form !== null} initial={form === 'edit' ? project : null} parentId={form === 'child' ? project.id : null} onClose={() => setForm(null)} />
    </Page>
  );
}

export function CompletedView() {
  const { tasks, loading } = useTaskData();
  const done = useMemo(() => completedTasks(tasks), [tasks]);
  const groups = useMemo(() => {
    const out: { day: string; tasks: Task[] }[] = [];
    for (const t of done.slice(0, 500)) {
      const d = t.completedAt ? new Date(t.completedAt) : null;
      const day = d && !Number.isNaN(d.getTime()) ? toISODate(d) : 'earlier';
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, tasks: [] });
      out[out.length - 1].tasks.push(t);
    }
    return out;
  }, [done]);
  if (loading) return <Loading />;
  return (
    <Page title="Completed" subtitle={done.length ? `${plural(done.length)} · click a tick to restore` : undefined}>
      {groups.map((g) => (
        <Section key={g.day} title={g.day === 'earlier' ? 'Earlier' : formatDayHeading(g.day)}>
          {g.tasks.map((t) => <TaskItem key={t.id} task={t} showProject showParent />)}
        </Section>
      ))}
      {done.length > 500 ? <p className={`text-xs mt-3 ${cx.muted}`}>Showing the latest 500 of {done.length}.</p> : null}
      {!done.length ? <Empty icon={<CircleCheck size={32} className="text-green-500" />} title="No completed tasks yet" subtitle="Tasks you finish show up here and can be restored." /> : null}
    </Page>
  );
}

export { AddTaskRow };
