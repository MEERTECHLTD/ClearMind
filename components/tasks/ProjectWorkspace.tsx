/**
 * Web project workspace — parity with the mobile project screen
 * (apps/mobile/app/(app)/project/[id].tsx): progress tracker, in-project
 * search, sections (collapsible, rename / reorder / delete), List ⇄ Board
 * (persisted on project.view), sort options, completed tasks, sub-projects,
 * and moving tasks between sections by drag-and-drop or the "Move to section"
 * menu (keyboard / touch fallback).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Hash, ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, Pencil, Trash2, Archive, ArchiveRestore, FolderPlus,
  Plus, Star, Search as SearchIcon, X, Rows3, Columns3, ArrowUpDown, ArrowUp, ArrowDown, MoveRight, CircleCheck, Check,
} from 'lucide-react';
import type { Completion, Preferences, Project, Section, Task } from '../../types';
import { projectTasks, orderedProjects, compareTasks, compareByOrder, priorityOf, formatDueDate } from '../../shared/tasks';
import { projectStats } from '../../shared/domain';
import { STORES } from '../../services/db';
import { useStore } from './store';
import { useTaskData, useTaskUI } from './TaskContext';
import { Empty } from './TaskList';
import { TaskItem } from './TaskItem';
import { TaskEditor, type AddDefaults } from './TaskEditor';
import { Popover, MenuItem, cx, PRIORITY_COLOR, useTaskToast } from './ui';
import {
  updateProject, deleteProject, projectSubtree, projectColor, addSection, renameSection, removeSection, moveSection,
  setSectionCollapsed, setProjectView, toggleProjectFavorite, moveToSection,
} from './actions';
import { ProjectForm, go } from './TaskViews';

type Sort = 'manual' | 'due' | 'priority' | 'name';
const SORT_LABEL: Record<Sort, string> = { manual: 'Manual order', due: 'Due date', priority: 'Priority', name: 'Alphabetical' };
const PRIO_RANK = { High: 1, Medium: 2, Low: 3, None: 4 } as const;
const SORTERS: Record<Sort, (a: Task, b: Task) => number> = {
  manual: (a, b) => compareByOrder(a, b) || compareTasks(a, b),
  due: compareTasks,
  priority: (a, b) => PRIO_RANK[priorityOf(a)] - PRIO_RANK[priorityOf(b)] || compareTasks(a, b),
  name: (a, b) => a.title.localeCompare(b.title),
};

const DND_TYPE = 'application/x-clearmind-task';
const NO_SECTION = '__none__';
const plural = (n: number, w = 'task') => `${n} ${w}${n === 1 ? '' : 's'}`;

function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try { const v = localStorage.getItem(key) as T | null; return v && allowed.includes(v) ? v : fallback; } catch { return fallback; }
}
function writePref(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }

// ------------------------------------------------------------------ section-aware "Add task"

/** Inline "+ Add task" for a section (the composer files it into the section). */
function SectionAddTask({ projectId, sectionId, compact }: { projectId: string; sectionId: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const defaults: AddDefaults = { projectId, sectionId };
  if (open) return <div className="py-2"><TaskEditor defaults={defaults} onClose={() => setOpen(false)} compact={compact} /></div>;
  return (
    <button onClick={() => setOpen(true)} className={`group w-full flex items-center gap-3 py-2 px-1 text-sm ${cx.muted} hover:text-blue-600 dark:hover:text-blue-400`}>
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors"><Plus size={16} /></span>
      Add task
    </button>
  );
}

// ------------------------------------------------------------------ inline name input (add / rename section)

function NameInput({ initial = '', placeholder, submitLabel, onSubmit, onCancel }: {
  initial?: string; placeholder: string; submitLabel: string; onSubmit: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const submit = () => { if (name.trim()) onSubmit(name.trim()); };
  return (
    <form className="flex flex-wrap items-center gap-2 py-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input
        autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={120}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); } }}
        className={`${cx.input} flex-1 min-w-[10rem]`} aria-label="Section name"
      />
      <button type="submit" disabled={!name.trim()} className={cx.btnPrimary}>{submitLabel}</button>
      <button type="button" onClick={onCancel} className={cx.btnGhost}>Cancel</button>
    </form>
  );
}

// ------------------------------------------------------------------ tracker

function Stat({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className={`text-base font-bold ${color ? '' : cx.text}`} style={color ? { color } : undefined}>{value}</span>
      <span className={`text-[10px] leading-tight text-center ${cx.muted}`}>{label}</span>
    </div>
  );
}

function Tracker({ project, sections }: { project: Project; sections: Section[] }) {
  const { tasks } = useTaskData();
  const completions = useStore<Completion>(STORES.COMPLETIONS).items;
  const prefs = (useStore<Preferences>(STORES.PREFERENCES).items[0] as Preferences | undefined) ?? null;
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(
    () => projectStats([project.id], { tasks, completions, preferences: prefs, sections }),
    [project.id, tasks, completions, prefs, sections],
  );
  const color = projectColor(project);
  const max = Math.max(1, ...stats.trend.map((w) => w.completed));

  return (
    <div className={`rounded-xl border ${cx.border} ${cx.card} p-3 mb-4`}>
      <button onClick={() => setExpanded((x) => !x)} className="w-full text-left" aria-expanded={expanded} aria-label={`Project progress ${stats.progress} percent. ${expanded ? 'Hide' : 'Show'} details`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold flex-1 ${cx.text}`}>{stats.progress}% complete</span>
          <span className={`text-xs ${cx.muted}`}>{stats.completedThisWeek} done this week</span>
          <ChevronDown size={14} className={`${cx.faint} transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 mt-2 overflow-hidden">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${stats.progress}%`, background: color }} />
        </div>
      </button>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-y-2 mt-3">
        <Stat value={stats.open} label="Open" />
        <Stat value={stats.completed} label="Done" />
        <Stat value={stats.overdue} label="Overdue" color={stats.overdue ? '#EF4444' : undefined} />
        <Stat value={stats.dueToday} label="Today" color={stats.dueToday ? '#16A34A' : undefined} />
        <Stat value={stats.dueThisWeek} label="This week" />
        <Stat value={stats.blocked} label="Blocked" color={stats.blocked ? '#F97316' : undefined} />
        <Stat value={stats.highPriority} label="P1" color={stats.highPriority ? PRIORITY_COLOR.High : undefined} />
      </div>
      {expanded ? (
        <div className={`mt-3 pt-3 border-t ${cx.border} grid gap-4 sm:grid-cols-3`}>
          <div>
            <div className="flex items-end gap-1.5 h-12" aria-hidden>
              {stats.trend.map((w) => (
                <div key={w.weekStart} className="flex-1 flex justify-center" title={`Week of ${w.weekStart}: ${w.completed}`}>
                  <div className={`w-3 rounded ${w.completed ? '' : 'bg-gray-200 dark:bg-white/10'}`} style={{ height: Math.max(3, (w.completed / max) * 44), background: w.completed ? color : undefined }} />
                </div>
              ))}
            </div>
            <p className={`text-[10px] text-center mt-1 ${cx.muted}`}>Completed per week (last {stats.trend.length})</p>
          </div>
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${cx.muted}`}>Recently completed</p>
            {stats.recentlyCompleted.length
              ? stats.recentlyCompleted.map((r) => <p key={r.completedAt + r.taskId} className={`text-xs mt-1 truncate ${cx.text}`}>✓ {r.title}</p>)
              : <p className={`text-xs mt-1 ${cx.faint}`}>Nothing yet</p>}
          </div>
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${cx.muted}`}>Coming up</p>
            {stats.upcoming.length
              ? stats.upcoming.map((u) => <p key={u.id} className={`text-xs mt-1 truncate ${cx.text}`}>{formatDueDate(u.dueDate)} · {u.title}</p>)
              : <p className={`text-xs mt-1 ${cx.faint}`}>No dated tasks</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ workspace

type Column = { id: string | null; name: string; section?: Section };
type MenuState =
  | null
  | { kind: 'project' | 'sort'; el: HTMLElement }
  | { kind: 'section'; el: HTMLElement; section: Section }
  | { kind: 'move'; el: HTMLElement; task: Task };

export function ProjectWorkspace({ id }: { id: string }) {
  const { tasks, projects, projectMap, loading } = useTaskData();
  const ui = useTaskUI();
  const toast = useTaskToast();
  const sectionStore = useStore<Section>(STORES.SECTIONS);
  const [menu, setMenu] = useState<MenuState>(null);
  const [form, setForm] = useState<null | 'edit' | 'child'>(null);
  const [sort, setSortState] = useState<Sort>(() => readPref<Sort>(`cm.project.${id}.sort`, 'manual', ['manual', 'due', 'priority', 'name']));
  const [showDone, setShowDoneState] = useState(() => readPref(`cm.project.${id}.done`, 'no', ['yes', 'no']) === 'yes');
  const [query, setQuery] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const project = projectMap.get(id);

  useEffect(() => {
    setSortState(readPref<Sort>(`cm.project.${id}.sort`, 'manual', ['manual', 'due', 'priority', 'name']));
    setShowDoneState(readPref(`cm.project.${id}.done`, 'no', ['yes', 'no']) === 'yes');
    setQuery(''); setAddingSection(false); setRenaming(null); setMenu(null);
  }, [id]);
  const setSort = (s: Sort) => { setSortState(s); writePref(`cm.project.${id}.sort`, s); };
  const setShowDone = (v: boolean) => { setShowDoneState(v); writePref(`cm.project.${id}.done`, v ? 'yes' : 'no'); };

  const sections = useMemo(
    () => sectionStore.items.filter((s) => !s.deleted && !s.archived && s.projectId === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [sectionStore.items, id],
  );
  const sectionIds = useMemo(() => new Set(sections.map((s) => s.id)), [sections]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (t: Task) => `${t.title} ${t.description ?? ''}`.toLowerCase().includes(q) : () => true;
  }, [query]);
  const open = useMemo(() => projectTasks(tasks, id).filter(matches).sort(SORTERS[sort]), [tasks, id, matches, sort]);
  const done = useMemo(
    () => tasks.filter((t) => t.completed && !t.deleted && !t.parentId && t.projectId === id && matches(t))
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [tasks, id, matches],
  );
  const children = useMemo(() => orderedProjects(projects).filter(({ project: p }) => p.parentId === id), [projects, id]);

  const columnKey = (t: Task) => (t.sectionId && sectionIds.has(t.sectionId) ? t.sectionId : NO_SECTION);
  const bySection = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of open) { const k = columnKey(t); m.set(k, [...(m.get(k) ?? []), t]); }
    return m;
  }, [open, sectionIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneBySection = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of done) { const k = columnKey(t); m.set(k, [...(m.get(k) ?? []), t]); }
    return m;
  }, [done, sectionIds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!project) {
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-[#05050A]">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-6">
          <button onClick={() => history.back()} className={`p-1 -ml-1 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Back"><ChevronLeft size={20} /></button>
          <Empty icon={<Hash size={30} className={cx.muted} />} title="This project no longer exists" />
        </div>
      </div>
    );
  }

  const color = projectColor(project);
  const view: 'list' | 'board' = project.view === 'board' ? 'board' : 'list';
  const columns: Column[] = [{ id: null, name: 'No section' }, ...sections.map((s) => ({ id: s.id as string | null, name: s.name, section: s }))];
  const closeMenu = () => setMenu(null);
  const searching = query.trim().length > 0;

  // ---- actions
  const removeProject = () => {
    const ids = new Set(projectSubtree(projects, project.id));
    const n = tasks.filter((t) => t.projectId && ids.has(t.projectId)).length;
    const subs = ids.size - 1;
    if (!confirm(`Delete “${project.title}”${subs ? ` and ${plural(subs, 'sub-project')}` : ''}, including ${plural(n)}? This can’t be undone.`)) return;
    deleteProject(project.id);
    toast('Project deleted');
    go('inbox');
  };
  const deleteSectionConfirm = (s: Section) => {
    const n = tasks.filter((t) => !t.completed && !t.deleted && t.sectionId === s.id).length;
    if (!confirm(n ? `Delete section “${s.name}”? Its ${plural(n)} will move to the project’s main list.` : `Delete section “${s.name}”?`)) return;
    const undo = removeSection(s.id);
    toast('Section deleted', { label: 'Undo', onClick: undo });
  };
  const moveTask = (task: Task, sectionId: string | null) => {
    if ((task.sectionId && sectionIds.has(task.sectionId) ? task.sectionId : null) === sectionId) return;
    const undo = moveToSection([task.id], project.id, sectionId);
    const name = sectionId ? sections.find((s) => s.id === sectionId)?.name ?? 'section' : 'No section';
    toast(`Moved to ${name}`, { label: 'Undo', onClick: undo });
  };
  const toggleCollapsed = (s: Section) => setSectionCollapsed(s.id, !s.collapsed);

  // ---- drag and drop (HTML5)
  const dragProps = (t: Task) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DND_TYPE, t.id); e.dataTransfer.setData('text/plain', t.title); e.dataTransfer.effectAllowed = 'move'; },
    onDragEnd: () => setDropTarget(null),
  });
  const dropProps = (sectionId: string | null) => {
    const key = sectionId ?? NO_SECTION;
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DND_TYPE)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget((k) => (k === key ? null : k)); },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault(); setDropTarget(null);
        const task = tasks.find((x) => x.id === e.dataTransfer.getData(DND_TYPE));
        if (task) moveTask(task, sectionId);
      },
    };
  };
  const dropRing = (sectionId: string | null) => (dropTarget === (sectionId ?? NO_SECTION) ? 'ring-2 ring-blue-500/60 bg-blue-50/60 dark:bg-blue-500/10' : '');

  // ---- pieces
  const moveButton = (t: Task) => (
    <button
      onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'move', el: e.currentTarget, task: t }); }}
      className={`p-1.5 rounded-md ${cx.hover} ${cx.muted} opacity-100 md:opacity-0 md:group-hover/row:opacity-100 focus:opacity-100`}
      aria-label={`Move “${t.title}” to section`} title="Move to section"
    ><MoveRight size={15} /></button>
  );

  const sectionMenuButton = (s: Section) => (
    <button onClick={(e) => setMenu({ kind: 'section', el: e.currentTarget, section: s })} className={`p-1 rounded-md ${cx.hover} ${cx.muted}`} aria-label={`${s.name} options`}>
      <MoreHorizontal size={16} />
    </button>
  );

  const listRow = (t: Task) => (
    <div key={t.id} className="group/row flex items-start" {...(sections.length ? dragProps(t) : {})}>
      <div className="flex-1 min-w-0"><TaskItem task={t} /></div>
      {sections.length ? <div className="pt-2.5 pl-0.5">{moveButton(t)}</div> : null}
    </div>
  );

  const listView = (
    <div>
      {/* No section */}
      <div {...dropProps(null)} className={`rounded-lg transition-colors ${dropRing(null)}`}>
        {(bySection.get(NO_SECTION) ?? []).map(listRow)}
        {!searching ? <SectionAddTask projectId={project.id} sectionId={null} /> : null}
        {showDone ? (doneBySection.get(NO_SECTION) ?? []).map(listRow) : null}
      </div>
      {sections.map((s) => {
        const list = bySection.get(s.id) ?? [];
        const doneList = showDone ? doneBySection.get(s.id) ?? [] : [];
        const collapsed = !!s.collapsed && !searching;
        return (
          <section key={s.id} className="mt-6" aria-label={s.name}>
            {renaming === s.id ? (
              <NameInput initial={s.name} placeholder="Section name" submitLabel="Save" onCancel={() => setRenaming(null)} onSubmit={(n) => { renameSection(s.id, n); setRenaming(null); }} />
            ) : (
              <div {...dropProps(s.id)} className={`flex items-center gap-1 pb-1.5 border-b ${cx.border} rounded-t-md transition-colors ${dropRing(s.id)}`}>
                <button onClick={() => toggleCollapsed(s)} className={`flex-1 min-w-0 flex items-center gap-1.5 text-left py-0.5 rounded-md`} aria-expanded={!collapsed}>
                  <ChevronRight size={15} className={`${cx.muted} shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
                  <h3 className={`text-sm font-bold truncate ${cx.text}`}>{s.name}</h3>
                  <span className={`text-xs ${cx.muted}`}>{list.length || ''}</span>
                </button>
                {sectionMenuButton(s)}
              </div>
            )}
            {!collapsed ? (
              <div {...dropProps(s.id)} className={`rounded-b-lg transition-colors ${dropRing(s.id)}`}>
                {list.map(listRow)}
                {!searching ? <SectionAddTask projectId={project.id} sectionId={s.id} /> : null}
                {doneList.map(listRow)}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );

  const boardView = (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto overscroll-x-contain pb-4">
      <div className="flex items-start gap-3 w-max">
        {columns.map((col) => {
          const list = bySection.get(col.id ?? NO_SECTION) ?? [];
          const doneList = showDone ? doneBySection.get(col.id ?? NO_SECTION) ?? [] : [];
          return (
            <div key={col.id ?? NO_SECTION} {...dropProps(col.id)} className={`w-[17rem] sm:w-72 shrink-0 rounded-xl border ${cx.border} bg-gray-50 dark:bg-white/[0.03] p-2.5 transition-colors ${dropRing(col.id)}`} aria-label={`${col.name} column`}>
              {col.section && renaming === col.section.id ? (
                <NameInput initial={col.name} placeholder="Section name" submitLabel="Save" onCancel={() => setRenaming(null)} onSubmit={(n) => { renameSection(col.section!.id, n); setRenaming(null); }} />
              ) : (
                <div className="flex items-center gap-2 px-1 mb-2 min-h-[28px]">
                  <h3 className={`text-sm font-semibold flex-1 truncate ${col.section ? cx.text : cx.muted}`}>{col.name}</h3>
                  <span className={`text-xs ${cx.muted}`}>{list.length}</span>
                  {col.section ? sectionMenuButton(col.section) : null}
                </div>
              )}
              <div className="space-y-2">
                {[...list, ...doneList].map((t) => (
                  <div key={t.id} {...dragProps(t)} className={`group/row relative rounded-lg border ${cx.border} ${cx.card} pl-2 pr-1 shadow-sm cursor-grab active:cursor-grabbing [&>div:first-child>div]:border-b-0 ${t.completed ? 'opacity-70' : ''}`}>
                    <div className="min-w-0"><TaskItem task={t} /></div>
                    {columns.length > 1 ? <div className="flex justify-end -mt-2 pb-1">{moveButton(t)}</div> : null}
                  </div>
                ))}
                {!list.length && !doneList.length ? <p className={`text-xs text-center py-3 ${cx.faint}`}>{columns.length > 1 ? 'Drop tasks here' : 'No tasks'}</p> : null}
              </div>
              {!searching ? <div className="mt-1"><SectionAddTask projectId={project.id} sectionId={col.id} compact /></div> : null}
            </div>
          );
        })}
        <div className="w-[17rem] sm:w-72 shrink-0">
          {addingSection ? (
            <div className={`rounded-xl border ${cx.border} ${cx.card} px-2.5`}>
              <NameInput placeholder="e.g. In progress, Waiting, Done" submitLabel="Add" onCancel={() => setAddingSection(false)} onSubmit={(n) => { addSection(project.id, n); setAddingSection(false); }} />
            </div>
          ) : (
            <button onClick={() => setAddingSection(true)} className={`w-full rounded-xl border border-dashed ${cx.border} p-4 flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400 ${cx.hover}`}>
              <Plus size={16} /> Add section
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const hasAnything = open.length || done.length || sections.length;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-white dark:bg-[#05050A]">
      <div className={`${view === 'board' ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 sm:px-8 pt-6 pb-24`}>
        {/* Title row */}
        <header className="flex items-center gap-1.5 mb-3">
          <button onClick={() => history.back()} className={`p-1 -ml-1 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Back"><ChevronLeft size={20} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate flex items-center gap-2" style={{ color }}>
              {project.icon ? <span aria-hidden>{project.icon}</span> : <Hash size={20} className="shrink-0" />}
              <span className="truncate">{project.title}</span>
            </h1>
            <p className={`text-sm mt-0.5 ${cx.muted}`}>{plural(open.length, 'open task')}{project.archived ? ' · archived' : ''}</p>
          </div>
          <button
            onClick={() => toggleProjectFavorite(project)} aria-pressed={!!project.favorite}
            aria-label={project.favorite ? 'Remove from favourites' : 'Add to favourites'} title={project.favorite ? 'Remove from favourites' : 'Add to favourites'}
            className={`p-1.5 rounded-md ${cx.hover} ${project.favorite ? 'text-amber-500' : cx.muted}`}
          ><Star size={18} fill={project.favorite ? 'currentColor' : 'none'} /></button>
          <button onClick={(e) => setMenu({ kind: 'project', el: e.currentTarget })} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Project options"><MoreHorizontal size={18} /></button>
        </header>

        <Tracker project={project} sections={sections} />

        {/* Toolbar: search · view · sort */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className={`flex-1 min-w-[10rem] flex items-center gap-2 ${cx.input} py-1.5`}>
            <SearchIcon size={15} className={`${cx.faint} shrink-0`} />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search in ${project.title}`}
              onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }}
              className="flex-1 min-w-0 bg-transparent outline-none" aria-label="Search in project"
            />
            {query ? <button onClick={() => setQuery('')} className={cx.faint} aria-label="Clear search"><X size={14} /></button> : null}
          </div>
          <div role="radiogroup" aria-label="View" className={`inline-flex rounded-lg border ${cx.border} p-0.5`}>
            {(['list', 'board'] as const).map((v) => (
              <button
                key={v} role="radio" aria-checked={view === v} onClick={() => setProjectView(project, v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${view === v ? 'bg-gray-100 dark:bg-white/10 ' + cx.text : cx.muted + ' ' + cx.hover}`}
              >
                {v === 'list' ? <Rows3 size={14} /> : <Columns3 size={14} />}{v === 'list' ? 'List' : 'Board'}
              </button>
            ))}
          </div>
          <button onClick={(e) => setMenu({ kind: 'sort', el: e.currentTarget })} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${cx.border} text-xs font-medium ${cx.muted} ${cx.hover}`} aria-label={`Sort and display: ${SORT_LABEL[sort]}`}>
            <ArrowUpDown size={14} /><span className="hidden sm:inline">{sort === 'manual' ? 'Sort' : SORT_LABEL[sort]}</span>
          </button>
        </div>

        {/* Sub-projects */}
        {children.length ? (
          <div className="mb-4">
            {children.map(({ project: c }) => (
              <button key={c.id} onClick={() => go(`project/${c.id}`)} className={`w-full flex items-center gap-3 py-2 px-1 border-b ${cx.border} ${cx.hover} text-sm ${cx.text}`}>
                <Hash size={15} color={projectColor(c)} /><span className="flex-1 text-left truncate">{c.title}</span>
                <span className={cx.muted}>{tasks.filter((t) => !t.completed && !t.deleted && t.projectId === c.id).length || ''}</span><ChevronRight size={15} className={cx.faint} />
              </button>
            ))}
          </div>
        ) : null}

        {view === 'board' ? boardView : listView}

        {view === 'list' ? (
          addingSection ? (
            <div className="mt-4"><NameInput placeholder="e.g. In progress, Waiting, Done" submitLabel="Add section" onCancel={() => setAddingSection(false)} onSubmit={(n) => { addSection(project.id, n); setAddingSection(false); }} /></div>
          ) : (
            <button onClick={() => setAddingSection(true)} className="group mt-6 w-full flex items-center gap-3 text-sm font-medium text-blue-600 dark:text-blue-400" aria-label="Add section">
              <span className={`flex-1 h-px bg-gray-200 dark:bg-gray-800 group-hover:bg-blue-500`} /><span className="inline-flex items-center gap-1"><Plus size={15} />Add section</span><span className="flex-1 h-px bg-gray-200 dark:bg-gray-800 group-hover:bg-blue-500" />
            </button>
          )
        ) : null}

        {done.length ? (
          <button onClick={() => setShowDone(!showDone)} className="block mt-6 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            {showDone ? 'Hide' : 'Show'} {plural(done.length, 'completed task')}
          </button>
        ) : null}
        {searching && !open.length && !(showDone && done.length) ? <Empty icon={<SearchIcon size={30} className={cx.muted} />} title="No matching tasks" subtitle={`Nothing in ${project.title} matches “${query.trim()}”.`} /> : null}
        {!searching && !hasAnything ? <Empty icon={<CircleCheck size={32} style={{ color }} />} title="No tasks here yet" subtitle="Add a task, or add a section to organise work." /> : null}
      </div>

      {/* Menus */}
      <Popover anchor={menu?.kind === 'project' ? menu.el : null} open={menu?.kind === 'project'} onClose={closeMenu} width={230}>
        <MenuItem icon={<Pencil size={15} />} label="Edit project" onClick={() => { closeMenu(); setForm('edit'); }} />
        <MenuItem icon={<FolderPlus size={15} />} label="Add sub-project" onClick={() => { closeMenu(); setForm('child'); }} />
        <MenuItem icon={<Rows3 size={15} />} label="Add section" onClick={() => { closeMenu(); setAddingSection(true); }} />
        <MenuItem icon={<Star size={15} />} label={project.favorite ? 'Remove from favourites' : 'Add to favourites'} onClick={() => { closeMenu(); toggleProjectFavorite(project); }} />
        {project.archived
          ? <MenuItem icon={<ArchiveRestore size={15} />} label="Unarchive" onClick={() => { closeMenu(); updateProject(project, { archived: false }); toast('Project restored'); }} />
          : <MenuItem icon={<Archive size={15} />} label="Archive" onClick={() => { closeMenu(); updateProject(project, { archived: true }); toast('Project archived'); }} />}
        <MenuItem icon={<Trash2 size={15} />} label="Delete project" danger onClick={() => { closeMenu(); removeProject(); }} />
      </Popover>

      <Popover anchor={menu?.kind === 'sort' ? menu.el : null} open={menu?.kind === 'sort'} onClose={closeMenu} width={220}>
        <p className={`px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide ${cx.muted}`}>Sort by</p>
        {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
          <MenuItem key={k} label={SORT_LABEL[k]} selected={sort === k} onClick={() => { setSort(k); closeMenu(); }} />
        ))}
        <div className={`my-1 border-t ${cx.border}`} />
        <MenuItem icon={showDone ? <Check size={15} /> : <CircleCheck size={15} />} label="Show completed tasks" hint={done.length ? String(done.length) : undefined} selected={showDone} onClick={() => setShowDone(!showDone)} />
      </Popover>

      <Popover anchor={menu?.kind === 'section' ? menu.el : null} open={menu?.kind === 'section'} onClose={closeMenu} width={210}>
        {menu?.kind === 'section' ? (() => {
          const s = menu.section;
          const i = sections.findIndex((x) => x.id === s.id);
          const ids = sections.map((x) => x.id);
          return (
            <>
              <MenuItem icon={<Pencil size={15} />} label="Rename" onClick={() => { closeMenu(); setRenaming(s.id); }} />
              {i > 0 ? <MenuItem icon={view === 'board' ? <ChevronLeft size={15} /> : <ArrowUp size={15} />} label={view === 'board' ? 'Move left' : 'Move up'} onClick={() => { closeMenu(); moveSection(project.id, ids, s.id, -1); }} /> : null}
              {i < ids.length - 1 ? <MenuItem icon={view === 'board' ? <ChevronRight size={15} /> : <ArrowDown size={15} />} label={view === 'board' ? 'Move right' : 'Move down'} onClick={() => { closeMenu(); moveSection(project.id, ids, s.id, 1); }} /> : null}
              <MenuItem icon={<Trash2 size={15} />} label="Delete section" danger onClick={() => { closeMenu(); deleteSectionConfirm(s); }} />
            </>
          );
        })() : null}
      </Popover>

      <Popover anchor={menu?.kind === 'move' ? menu.el : null} open={menu?.kind === 'move'} onClose={closeMenu} width={220}>
        <p className={`px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide ${cx.muted}`}>Move to section</p>
        {menu?.kind === 'move' ? columns.map((col) => {
          const current = (menu.task.sectionId && sectionIds.has(menu.task.sectionId) ? menu.task.sectionId : null) === col.id;
          return <MenuItem key={col.id ?? NO_SECTION} icon={<MoveRight size={15} />} label={col.name} selected={current} onClick={() => { const t = menu.task; closeMenu(); moveTask(t, col.id); }} />;
        }) : null}
      </Popover>

      <ProjectForm open={form !== null} initial={form === 'edit' ? project : null} parentId={form === 'child' ? project.id : null} onClose={() => setForm(null)} />
    </div>
  );
}
