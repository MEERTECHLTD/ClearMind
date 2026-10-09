import React, { useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import {
  FileText, Repeat, Target, Flag, Sparkles, Calendar, ClipboardList, Briefcase, BookOpen, NotebookPen, TrendingUp, FolderKanban,
  ChevronLeft, ChevronDown, ChevronRight, MoreHorizontal, Flame,
  Plus, Search, Inbox, CalendarCheck, CalendarRange, LayoutGrid, CircleCheck, Hash, Pencil, FolderPlus, ArrowUp, ArrowDown,
  Archive, Trash2, History, LayoutTemplate, Star, Filter as FilterIcon, StarOff,
} from 'lucide-react';
import { ViewState, UserProfile, Project, Completion, Preferences } from '../types';
import { daySummary, dailyStreak } from '../shared/domain';
import { STORES } from '../services/db';
import { useStore } from './tasks/store';
import { orderedProjects, openCounts, todayView } from '../shared/tasks';
import { useTaskData, useTaskUI } from './tasks/TaskContext';
import { Popover, MenuItem, useTaskToast } from './tasks/ui';
import { ProjectForm, go, useSavedFilters } from './tasks/TaskViews';
import { projectColor, updateProject, moveProject, deleteProject, projectSubtree } from './tasks/actions';
import { saveFilterAction } from './tasks/actions';

interface SidebarProps {
  currentView: ViewState;
  currentParam?: string;
  onChangeView: (view: ViewState) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  user: UserProfile;
  isMobileOpen?: boolean;
}

/**
 * Grouped ClearMind tools (same IA as mobile Browse). Each item may also be
 * "active" for related routes (Applications covers the AI Reviewer). Settings
 * lives in the avatar header and the top bar; Dashboard folded into Today,
 * Mind Map into Notes, Productivity + Analytics into Insights, Daily Log + Rant
 * Corner into Journal.
 */
type ToolItem = { id: ViewState; label: string; icon: React.ReactNode; also?: ViewState[] };
type ToolGroup = { key: string; label: string; items: ToolItem[] };
const GROUPS: ToolGroup[] = [
  {
    key: 'plan', label: 'Plan', items: [
      { id: 'calendar', label: 'Calendar', icon: <Calendar size={18} className="text-rose-500" /> },
      { id: 'dailymapper', label: 'Daily Mapper', icon: <ClipboardList size={18} className="text-cyan-500" /> },
      { id: 'goals', label: 'Goals', icon: <Target size={18} className="text-emerald-500" /> },
      { id: 'milestones', label: 'Milestones', icon: <Flag size={18} className="text-violet-500" /> },
      { id: 'habits', label: 'Habits', icon: <Repeat size={18} className="text-orange-500" /> },
    ],
  },
  {
    key: 'think', label: 'Think', items: [
      { id: 'journal', label: 'Journal', icon: <NotebookPen size={18} className="text-pink-500" />, also: ['dailylog', 'rant'] },
      { id: 'iris', label: 'Iris (AI)', icon: <Sparkles size={18} className="text-purple-500" /> },
    ],
  },
  {
    key: 'grow', label: 'Grow', items: [
      { id: 'applications', label: 'Applications', icon: <Briefcase size={18} className="text-blue-500" />, also: ['reviewer'] },
      { id: 'learningvault', label: 'Learning Vault', icon: <BookOpen size={18} className="text-teal-500" /> },
    ],
  },
];

const readBool = (k: string, d: boolean) => {
  try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; }
};
const writeBool = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* ignore */ } };

const Sidebar: React.FC<SidebarProps> = ({ currentView, currentParam, onChangeView, isCollapsed, toggleCollapse, user, isMobileOpen }) => {
  const { tasks, projects, projectMap } = useTaskData();
  const ui = useTaskUI();
  const toast = useTaskToast();
  const [showProjects, setShowProjects] = useState(() => readBool('cm.sb.projects', true));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(GROUPS.map((g) => [g.key, readBool(`cm.sb.${g.key}`, true)])));
  const toggleGroup = (k: string) => setOpenGroups((o) => { const v = !o[k]; writeBool(`cm.sb.${k}`, v); return { ...o, [k]: v }; });
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<null | { initial?: Project; parentId?: string }>(null);
  const [menuFor, setMenuFor] = useState<{ project: Project; el: HTMLElement } | null>(null);

  const expanded = !isCollapsed || !!isMobileOpen;
  const tree = useMemo(() => orderedProjects(projects), [projects]);
  const archived = useMemo(() => projects.filter((p) => p.archived), [projects]);
  const counts = useMemo(() => openCounts(tasks, projectMap), [tasks, projectMap]);
  const todayCount = useMemo(() => { const v = todayView(tasks); return v.overdue.length + v.today.length; }, [tasks]);
  const saved = useSavedFilters();
  const [showFavs, setShowFavs] = useState(() => readBool('cm.sb.favs', true));
  const favProjects = useMemo(() => tree.filter(({ project }) => project.favorite).map(({ project }) => project), [tree]);
  const favFilters = useMemo(() => saved.filters.filter((f) => f.favorite), [saved.filters]);
  // Productivity mini-progress: today's completions vs the daily goal + current streak.
  const completions = useStore<Completion>(STORES.COMPLETIONS).items;
  const prefRec = useStore<Preferences>(STORES.PREFERENCES).items[0] ?? null;
  const prod = useMemo(() => {
    const d = daySummary({ completions, tasks: [], preferences: prefRec });
    return { done: d.completed, goal: d.goal, met: d.met, streak: dailyStreak(completions, prefRec).current };
  }, [completions, prefRec]);

  const navBtn = (active: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${active
      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold'
      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'}`;

  const Item = ({ id, label, icon, count, active }: { id: ViewState; label: string; icon: React.ReactNode; count?: number; active?: boolean }) => {
    const on = active ?? currentView === id;
    return (
      <li>
        <button onClick={() => onChangeView(id)} className={navBtn(on)} title={!expanded ? label : undefined} aria-label={!expanded ? label : undefined} aria-current={on ? 'page' : undefined}>
          <span className="shrink-0">{icon}</span>
          {expanded ? <><span className="flex-1 text-left truncate">{label}</span>{count ? <span className="text-xs text-gray-400">{count}</span> : null}</> : null}
        </button>
      </li>
    );
  };

  const siblings = (p: Project) => tree.filter((x) => (x.project.parentId ?? null) === (p.parentId ?? null)).map((x) => x.project);

  return (
    <aside className={`h-screen bg-gray-50 dark:bg-[#0B0D13] border-r dark:border-gray-800 border-gray-200 flex flex-col transition-all duration-300 z-50
      ${isMobileOpen ? 'translate-x-0 w-72 fixed' : '-translate-x-full fixed md:relative md:translate-x-0'}
      ${isCollapsed ? 'md:w-16' : 'md:w-72'}`}>
      {/* Header */}
      <div className="px-3 flex items-center justify-between h-14 shrink-0">
        {expanded ? (
          <button onClick={() => go('settings?s=account')} className="flex items-center gap-2 min-w-0 rounded-lg px-1 py-1 -ml-1 hover:bg-gray-100 dark:hover:bg-white/5" title="Account settings">
            <Avatar nickname={user.nickname} photoURL={user.photoURL} githubUsername={user.githubUsername} email={user.email} />
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user.nickname}</span>
              {user.email ? <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">{user.email}</span> : null}
            </span>
          </button>
        ) : (
          <button onClick={() => go('settings?s=account')} className="mx-auto rounded-full" title={user.nickname} aria-label="Account settings">
            <Avatar nickname={user.nickname} photoURL={user.photoURL} githubUsername={user.githubUsername} email={user.email} size={30} />
          </button>
        )}
        <button onClick={toggleCollapse} className="hidden md:block text-gray-400 hover:text-gray-900 dark:hover:text-white p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800" aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <ChevronLeft size={18} className={`transform transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 touch-pan-y overscroll-contain">
        <ul className="space-y-0.5">
          <li>
            <button onClick={() => ui.openQuickAdd()} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10" title={!expanded ? 'Add task (Q)' : undefined} aria-label={!expanded ? 'Add task' : undefined}>
              <span className="w-[18px] h-[18px] rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"><Plus size={14} /></span>
              {expanded ? <><span className="flex-1 text-left">Add task</span><kbd className="text-[10px] font-normal text-gray-400 border border-gray-300 dark:border-gray-700 rounded px-1">Q</kbd></> : null}
            </button>
          </li>
          <Item id="search" label="Search" icon={<Search size={18} />} />
          <Item id="inbox" label="Inbox" icon={<Inbox size={18} className="text-blue-500" />} count={counts.get(null)} />
          <Item id="today" label="Today" icon={<CalendarCheck size={18} className="text-green-600" />} count={todayCount} />
          <Item id="upcoming" label="Upcoming" icon={<CalendarRange size={18} className="text-violet-500" />} />
          <Item id="notes" label="Notes" icon={<FileText size={18} className="text-amber-500" />} active={currentView === 'notes' || currentView === 'mindmap'} />
          <Item id="filters" label="Filters & Labels" icon={<LayoutGrid size={18} className="text-orange-500" />} />
          {expanded ? saved.filters.filter((f) => !f.favorite).slice(0, 8).map((f) => (
            <li key={f.id}>
              <button onClick={() => go(`filter/saved:${f.id}`)} className={navBtn(currentView === 'filter' && currentParam === `saved:${f.id}`)} style={{ paddingLeft: 28 }}>
                <FilterIcon size={15} color={f.color ?? '#9CA3AF'} className="shrink-0" /><span className="flex-1 text-left truncate">{f.name}</span>
              </button>
            </li>
          )) : null}
          <Item id="completed" label="Completed" icon={<CircleCheck size={18} className="text-emerald-500" />} />
          <li>
            <button onClick={() => onChangeView('insights')} className={navBtn(currentView === 'insights')} title={!expanded ? `Insights · ${prod.done}/${prod.goal} today` : undefined} aria-label={!expanded ? 'Insights' : undefined} aria-current={currentView === 'insights' ? 'page' : undefined}>
              <span className="shrink-0"><TrendingUp size={18} className="text-orange-500" /></span>
              {expanded ? (
                <>
                  <span className="flex-1 text-left truncate">Insights</span>
                  {prod.streak ? <span className="inline-flex items-center gap-0.5 text-[11px] text-orange-500 tabular-nums" title={`${prod.streak}-day streak`}>{prod.streak}<Flame size={11} aria-hidden /></span> : null}
                  <span className="flex items-center gap-1.5" title={`${prod.done} of ${prod.goal} done today`}>
                    <span className="w-10 h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.round((prod.done / Math.max(1, prod.goal)) * 100))}%`, background: prod.met ? '#16A34A' : '#3B82F6' }} />
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums">{prod.done}/{prod.goal}</span>
                  </span>
                </>
              ) : null}
            </button>
          </li>
          <Item id="activity" label="Activity" icon={<History size={18} className="text-sky-500" />} />
          <Item id="templates" label="Templates" icon={<LayoutTemplate size={18} className="text-teal-500" />} />
        </ul>

        {/* Favorites */}
        {expanded && (favProjects.length || favFilters.length) ? (
          <div className="mt-5">
            <button onClick={() => { setShowFavs(!showFavs); writeBool('cm.sb.favs', !showFavs); }} className="w-full flex items-center gap-1 px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" aria-expanded={showFavs}>
              Favorites {showFavs ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {showFavs ? (
              <ul className="space-y-0.5">
                {favProjects.map((p) => (
                  <li key={p.id} className="group relative">
                    <button onClick={() => go(`project/${p.id}`)} className={navBtn(currentView === 'project' && currentParam === p.id)}>
                      <Hash size={16} color={projectColor(p)} className="shrink-0" />
                      <span className="flex-1 text-left truncate">{p.title}</span>
                      <span className="text-xs text-gray-400 group-hover:invisible">{counts.get(p.id) || ''}</span>
                    </button>
                    <button onClick={() => updateProject(p, { favorite: false })} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10" aria-label={`Remove ${p.title} from favorites`} title="Remove from favorites"><StarOff size={14} /></button>
                  </li>
                ))}
                {favFilters.map((f) => (
                  <li key={f.id} className="group relative">
                    <button onClick={() => go(`filter/saved:${f.id}`)} className={navBtn(currentView === 'filter' && currentParam === `saved:${f.id}`)}>
                      <FilterIcon size={16} color={f.color ?? '#9CA3AF'} className="shrink-0" />
                      <span className="flex-1 text-left truncate">{f.name}</span>
                    </button>
                    <button onClick={() => saveFilterAction({ id: f.id, name: f.name, query: f.query, color: f.color ?? null, favorite: false })} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10" aria-label={`Remove ${f.name} from favorites`} title="Remove from favorites"><StarOff size={14} /></button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Projects */}
        {expanded ? (
          <div className="mt-5">
            <div className="group flex items-center px-3 py-1">
              <button onClick={() => { setShowProjects(!showProjects); writeBool('cm.sb.projects', !showProjects); }} className="flex-1 flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" aria-expanded={showProjects}>
                My Projects {showProjects ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button onClick={() => setForm({})} className="p-1 rounded text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-white/10" aria-label="Add project" title="Add project"><Plus size={15} /></button>
            </div>
            <ul className="space-y-0.5">
              <li>
                <button onClick={() => onChangeView('projects')} className={navBtn(currentView === 'projects')} aria-current={currentView === 'projects' ? 'page' : undefined}>
                  <FolderKanban size={16} className="shrink-0 text-gray-500 dark:text-gray-400" />
                  <span className="flex-1 text-left truncate">All projects &amp; plans</span>
                </button>
              </li>
            </ul>
            {showProjects ? (
              <ul className="space-y-0.5">
                {tree.map(({ project, depth }) => {
                  const active = currentView === 'project' && currentParam === project.id;
                  return (
                    <li key={project.id} className="group relative">
                      <button onClick={() => go(`project/${project.id}`)} className={navBtn(active)} style={{ paddingLeft: 12 + depth * 16 }}>
                        <Hash size={16} color={projectColor(project)} className="shrink-0" />
                        <span className="flex-1 text-left truncate">{project.title}</span>
                        <span className="text-xs text-gray-400 group-hover:invisible">{counts.get(project.id) || ''}</span>
                      </button>
                      <button
                        onClick={(e) => setMenuFor({ project, el: e.currentTarget })}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10"
                        aria-label={`Options for ${project.title}`}
                      ><MoreHorizontal size={15} /></button>
                    </li>
                  );
                })}
                {!tree.length ? <li className="px-3 py-1.5 text-xs text-gray-400">No projects yet — click + or type “#Name” when adding a task.</li> : null}
                {archived.length ? (
                  <li>
                    <button onClick={() => setShowArchived(!showArchived)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                      <Archive size={13} /> Archived ({archived.length}) {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    {showArchived ? archived.map((p) => (
                      <button key={p.id} onClick={() => go(`project/${p.id}`)} className={`${navBtn(currentView === 'project' && currentParam === p.id)} opacity-70`} style={{ paddingLeft: 28 }}>
                        <Hash size={15} color={projectColor(p)} /><span className="truncate">{p.title}</span>
                      </button>
                    )) : null}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-0.5 mt-3"><Item id="projects" label="All projects & plans" icon={<FolderKanban size={18} className="text-gray-500 dark:text-gray-400" />} /></ul>
        )}

        {/* ClearMind tools, grouped */}
        {GROUPS.map((g) => {
          const isActive = (t: ToolItem) => currentView === t.id || !!t.also?.includes(currentView);
          const groupActive = g.items.some(isActive);
          const open = openGroups[g.key] || groupActive;
          return (
            <div key={g.key} className={expanded ? 'mt-5' : 'mt-3'}>
              {expanded ? (
                <button onClick={() => toggleGroup(g.key)} className="w-full flex items-center gap-1 px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" aria-expanded={open}>
                  {g.label} {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : <div className="border-t dark:border-gray-800 border-gray-200 mx-2 mb-2" role="separator" aria-label={g.label} />}
              {open || !expanded ? (
                <ul className="space-y-0.5" aria-label={g.label}>
                  {g.items.map((t) => <Item key={t.id} id={t.id} label={t.label} icon={t.icon} active={isActive(t)} />)}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>

      <ProjectForm open={!!form} initial={form?.initial} parentId={form?.parentId} onClose={() => setForm(null)} />
      <Popover anchor={menuFor?.el ?? null} open={!!menuFor} onClose={() => setMenuFor(null)} width={210}>
        {menuFor ? (() => {
          const p = menuFor.project;
          const close = () => setMenuFor(null);
          return (
            <>
              <MenuItem icon={<Pencil size={15} />} label="Edit" onClick={() => { close(); setForm({ initial: p }); }} />
              <MenuItem icon={<FolderPlus size={15} />} label="Add sub-project" onClick={() => { close(); setForm({ parentId: p.id }); }} />
              <MenuItem icon={p.favorite ? <StarOff size={15} /> : <Star size={15} />} label={p.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => { close(); updateProject(p, { favorite: !p.favorite }); }} />
              <MenuItem icon={<ArrowUp size={15} />} label="Move up" onClick={() => { close(); moveProject(siblings(p), p.id, -1); }} />
              <MenuItem icon={<ArrowDown size={15} />} label="Move down" onClick={() => { close(); moveProject(siblings(p), p.id, 1); }} />
              <MenuItem icon={<Archive size={15} />} label="Archive" onClick={() => { close(); updateProject(p, { archived: true }); toast('Project archived'); }} />
              <MenuItem icon={<Trash2 size={15} />} label="Delete" danger onClick={() => {
                close();
                const ids = new Set(projectSubtree(projects, p.id));
                const n = tasks.filter((t) => t.projectId && ids.has(t.projectId)).length;
                if (confirm(`Delete “${p.title}” and its ${n} task${n === 1 ? '' : 's'}${ids.size > 1 ? ' (including sub-projects)' : ''}? This can’t be undone.`)) {
                  deleteProject(p.id);
                  toast('Project deleted');
                  if (currentView === 'project' && currentParam && ids.has(currentParam)) go('inbox');
                }
              }} />
            </>
          );
        })() : null}
      </Popover>
    </aside>
  );
};

export default Sidebar;
