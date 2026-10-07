import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Hash, Ellipsis, Pencil, Trash2, Archive, ArchiveRestore, FolderPlus, CircleCheck, ChevronRight, Rows3, Columns3, Star,
  History, Search, X, ArrowUpDown, Plus, ArrowUp, ArrowDown, MoveRight,
} from 'lucide-react-native';
import type { Section, Completion, Task } from '@clearmind/shared';
import { projectTasks, orderedProjects, compareTasks, priorityOf, formatDueDate } from '@clearmind/shared/tasks';
import { projectStats } from '@clearmind/shared/domain';
import { TaskScreen, EmptyTasks, IconButton, useBack } from '../../../components/tasks/TaskScreen';
import { TaskList, taskItems, type ListItem } from '../../../components/tasks/TaskList';
import { useTaskUI } from '../../../components/tasks/TaskUIProvider';
import { ProjectFormSheet } from '../../../components/tasks/forms';
import { C, PRIORITY_COLOR, dueColor } from '../../../components/tasks/theme';
import { TaskCheckbox } from '../../../components/tasks/TaskRow';
import { ActionMenu, Sheet, Button, confirmDialog, useToast } from '../../../components/ui';
import { useCollection } from '../../../hooks/useCollection';
import { STORES } from '../../../services/db';
import {
  deleteProject, updateProject, projectColor, projectSubtree, createSection, updateSection, deleteSection, reorderSections, moveTasks, type MTask,
} from '../../../services/taskActions';
import { T } from '../../../lib/theme';

type Sort = 'manual' | 'due' | 'priority' | 'name';
const SORTERS: Record<Sort, (a: Task, b: Task) => number> = {
  manual: (a, b) => (a.order ?? 0) - (b.order ?? 0) || compareTasks(a, b),
  due: compareTasks,
  priority: (a, b) => ({ High: 1, Medium: 2, Low: 3, None: 4 }[priorityOf(a)] - { High: 1, Medium: 2, Low: 3, None: 4 }[priorityOf(b)]) || compareTasks(a, b),
  name: (a, b) => a.title.localeCompare(b.title),
};

function Stat({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <View className="items-center flex-1">
      <Text className="text-lg font-bold" style={{ color: color ?? T.ink }}>{value}</Text>
      <Text className="text-ink-muted text-[10px] text-center">{label}</Text>
    </View>
  );
}

/** Kanban column card. */
function BoardCard({ task, onOpen, onToggle, onMove }: { task: MTask; onOpen: () => void; onToggle: () => void; onMove: () => void }) {
  return (
    <Pressable onPress={onOpen} onLongPress={onMove} delayLongPress={300} className="mb-2 p-3 rounded-xl bg-midnight border border-line active:opacity-80" accessibilityHint="Long-press to move to another section">
      <View className="flex-row items-start">
        <View className="mr-2 mt-0.5"><TaskCheckbox task={task} checked={task.completed} onPress={onToggle} size={18} /></View>
        <Text className="text-ink text-[14px] flex-1" numberOfLines={3}>{task.title}</Text>
      </View>
      {task.dueDate ? <Text className="text-xs mt-1.5 ml-7" style={{ color: dueColor(task) }}>{formatDueDate(task.dueDate)}{task.dueTime ? ` ${task.dueTime}` : ''}</Text> : null}
    </Pressable>
  );
}

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ui = useTaskUI();
  const router = useRouter();
  const toast = useToast();
  const goBack = useBack();
  const { items: allSections } = useCollection<Section>(STORES.SECTIONS);
  const { items: completions } = useCollection<Completion>(STORES.COMPLETIONS);
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<null | 'edit' | 'child'>(null);
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>('manual');
  const [sortMenu, setSortMenu] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [sectionSheet, setSectionSheet] = useState<null | { mode: 'add' } | { mode: 'rename'; section: Section }>(null);
  const [sectionName, setSectionName] = useState('');
  const [sectionMenu, setSectionMenu] = useState<Section | null>(null);
  const [moveTask, setMoveTask] = useState<MTask | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const project = ui.projectMap.get(id);

  const sections = useMemo(() => allSections.filter((s) => !s.deleted && s.projectId === id && !s.archived).sort((a, b) => a.order - b.order), [allSections, id]);
  const open = useMemo(() => {
    let list = projectTasks(ui.tasks, id);
    if (query) { const q = query.toLowerCase(); list = list.filter((t) => `${t.title} ${t.description ?? ''}`.toLowerCase().includes(q)); }
    return [...list].sort(SORTERS[sort]);
  }, [ui.tasks, id, sort, query]);
  const done = useMemo(() => ui.tasks.filter((t) => t.completed && !t.parentId && t.projectId === id), [ui.tasks, id]);
  const children = useMemo(() => orderedProjects(ui.projects).filter(({ project: p }) => p.parentId === id), [ui.projects, id]);
  const stats = useMemo(() => projectStats([id], { tasks: ui.tasks, completions, preferences: ui.prefs, sections: allSections }), [id, ui.tasks, completions, ui.prefs, allSections]);
  const view = project?.view === 'board' ? 'board' : 'list';

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    const loose = open.filter((t) => !t.sectionId || !sections.some((s) => s.id === t.sectionId));
    out.push(...taskItems(loose));
    out.push({ type: 'add', key: 'add', defaults: { projectId: id } });
    for (const s of sections) {
      const ts = open.filter((t) => t.sectionId === s.id);
      const isCollapsed = collapsed.has(s.id);
      out.push({
        type: 'header', key: `s-${s.id}`, title: s.name, subtitle: String(ts.length), collapsed: isCollapsed,
        onToggle: () => setCollapsed((c) => { const n = new Set(c); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; }),
        onMenu: () => setSectionMenu(s),
      });
      if (!isCollapsed) {
        out.push(...taskItems(ts, `${s.id}-`));
        out.push({ type: 'add', key: `add-${s.id}`, defaults: { projectId: id, sectionId: s.id } });
      }
    }
    if (done.length) {
      out.push({ type: 'header', key: 'h-done', title: 'Completed', subtitle: String(done.length), action: { label: showDone ? 'Hide' : 'Show', onPress: () => setShowDone((x) => !x) } });
      if (showDone) out.push(...taskItems(done, 'd-'));
    }
    return out;
  }, [open, done, showDone, id, sections, collapsed]);

  if (!project) {
    return (
      <TaskScreen title="Project" back fab={false}>
        <EmptyTasks icon={<Hash size={34} color={C.muted} />} title="This project no longer exists" />
      </TaskScreen>
    );
  }

  const color = projectColor(project);
  const onDelete = async () => {
    const ids = new Set(projectSubtree(ui.projects, project.id));
    const n = ui.tasks.filter((t) => t.projectId && ids.has(t.projectId)).length;
    const subs = ids.size - 1;
    const ok = await confirmDialog({
      title: 'Delete project',
      message: `Delete “${project.title}”${subs ? ` and ${subs} sub-project${subs === 1 ? '' : 's'}` : ''}, including ${n} task${n === 1 ? '' : 's'}? This can’t be undone.`,
      confirmText: 'Delete', destructive: true,
    });
    if (!ok) return;
    await deleteProject(project.id);
    toast.show('Project deleted', 'info');
    goBack();
  };

  const saveSection = () => {
    const name = sectionName.trim();
    if (!name || !sectionSheet) return;
    if (sectionSheet.mode === 'add') createSection(project.id, name);
    else updateSection(sectionSheet.section.id, { name });
    setSectionSheet(null);
  };

  const moveSection = (s: Section, dir: -1 | 1) => {
    const ids = sections.map((x) => x.id);
    const i = ids.indexOf(s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderSections(project.id, ids);
  };

  const header = (
    <View>
      <Pressable onPress={() => setTrackerOpen((x) => !x)} className="mx-4 mt-1 mb-2 p-3 rounded-2xl bg-midnight-light border border-line" accessibilityRole="button" accessibilityLabel={`Project progress ${stats.progress} percent`} accessibilityState={{ expanded: trackerOpen }}>
        <View className="flex-row items-center">
          <Text className="text-ink font-semibold text-sm flex-1">{stats.progress}% complete</Text>
          <Text className="text-ink-muted text-xs">{stats.completedThisWeek} done this week</Text>
        </View>
        <View className="h-2 rounded-full bg-midnight-lighter mt-2 overflow-hidden"><View style={{ width: `${stats.progress}%`, height: 8, backgroundColor: color }} /></View>
        <View className="flex-row mt-3">
          <Stat value={stats.open} label="Open" />
          <Stat value={stats.overdue} label="Overdue" color={stats.overdue ? T.danger : undefined} />
          <Stat value={stats.dueToday} label="Today" color={stats.dueToday ? C.today : undefined} />
          <Stat value={stats.dueThisWeek} label="This week" />
          <Stat value={stats.blocked} label="Blocked" color={stats.blocked ? '#F97316' : undefined} />
          <Stat value={stats.highPriority} label="P1" color={stats.highPriority ? PRIORITY_COLOR.High : undefined} />
        </View>
        {trackerOpen ? (
          <View className="mt-3">
            <View className="flex-row items-end h-12 mb-1">
              {stats.trend.map((w) => { const max = Math.max(...stats.trend.map((x) => x.completed), 1); return <View key={w.weekStart} className="flex-1 items-center"><View style={{ width: 14, height: Math.max(3, (w.completed / max) * 44), borderRadius: 4, backgroundColor: w.completed ? color : T.card2 }} /></View>; })}
            </View>
            <Text className="text-ink-muted text-[10px] text-center">Completed per week (last 6)</Text>
            {stats.recentlyCompleted.length ? <Text className="text-ink-muted text-xs font-semibold mt-3">RECENTLY COMPLETED</Text> : null}
            {stats.recentlyCompleted.map((r) => <Text key={r.completedAt + r.taskId} className="text-ink text-[13px] mt-1" numberOfLines={1}>✓ {r.title}</Text>)}
            {stats.upcoming.length ? <Text className="text-ink-muted text-xs font-semibold mt-3">COMING UP</Text> : null}
            {stats.upcoming.map((u) => <Text key={u.id} className="text-ink text-[13px] mt-1" numberOfLines={1}>{formatDueDate(u.dueDate)} · {u.title}</Text>)}
          </View>
        ) : null}
      </Pressable>
      {query !== null ? (
        <View className="flex-row items-center mx-4 mb-2 px-3 rounded-xl bg-midnight-light border border-line">
          <Search size={16} color={C.muted} />
          <TextInput value={query} onChangeText={setQuery} autoFocus placeholder={`Search in ${project.title}`} placeholderTextColor={T.faint} className="flex-1 text-ink py-2.5 ml-2" accessibilityLabel="Search in project" />
          <Pressable onPress={() => setQuery(null)} hitSlop={10} accessibilityLabel="Close search"><X size={16} color={C.muted} /></Pressable>
        </View>
      ) : null}
      {children.map(({ project: c }) => (
        <Pressable key={c.id} onPress={() => router.push(`/(app)/project/${c.id}`)} className="flex-row items-center px-4 py-2.5 active:bg-midnight-light" accessibilityRole="button">
          <Hash size={16} color={projectColor(c)} />
          <Text className="text-ink text-[15px] ml-3 flex-1">{c.title}</Text>
          <Text className="text-ink-muted text-[13px] mr-1">{ui.tasks.filter((t) => !t.completed && t.projectId === c.id).length || ''}</Text>
          <ChevronRight size={16} color={C.muted} />
        </Pressable>
      ))}
    </View>
  );

  const columns = [{ id: null as string | null, name: 'No section' }, ...sections.map((s) => ({ id: s.id as string | null, name: s.name }))];

  return (
    <TaskScreen
      title={`${project.icon ? `${project.icon} ` : ''}${project.title}`}
      titleColor={color}
      subtitle={`${open.length} open${project.archived ? ' · archived' : ''}`}
      back
      addDefaults={{ projectId: project.id }}
      right={
        <>
          <IconButton label="Search in project" onPress={() => setQuery(query === null ? '' : null)}><Search size={20} color={C.ink} /></IconButton>
          <IconButton label={view === 'board' ? 'Show as list' : 'Show as board'} onPress={() => updateProject(project, { view: view === 'board' ? 'list' : 'board' })}>
            {view === 'board' ? <Rows3 size={20} color={C.ink} /> : <Columns3 size={20} color={C.ink} />}
          </IconButton>
          <IconButton label="Project options" onPress={() => setMenu(true)}><Ellipsis size={22} color={C.ink} /></IconButton>
        </>
      }
    >
      {view === 'list' ? (
        <TaskList items={items} header={header} empty={<EmptyTasks icon={<CircleCheck size={34} color={color} />} title="No tasks here yet" subtitle="Tap + to add one, or add a section to organise work." />} />
      ) : (
        <ScrollView>
          {header}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 96 }}>
            {columns.map((col) => {
              const ts = open.filter((t) => (col.id ? t.sectionId === col.id : !t.sectionId || !sections.some((s) => s.id === t.sectionId)));
              const sec = sections.find((s) => s.id === col.id);
              return (
                <View key={col.id ?? 'none'} style={{ width: 270 }} className="mr-3 p-2.5 rounded-2xl bg-midnight-light border border-line">
                  <Pressable onLongPress={sec ? () => setSectionMenu(sec) : undefined} className="flex-row items-center mb-2 px-1">
                    <Text className="text-ink font-semibold flex-1" numberOfLines={1}>{col.name}</Text>
                    <Text className="text-ink-muted text-xs">{ts.length}</Text>
                    {sec ? <Pressable onPress={() => setSectionMenu(sec)} hitSlop={8} className="ml-2" accessibilityLabel={`${sec.name} options`}><Ellipsis size={16} color={C.muted} /></Pressable> : null}
                  </Pressable>
                  {ts.map((t) => <BoardCard key={t.id} task={t} onOpen={() => ui.openTask(t.id)} onToggle={() => ui.toggle(t)} onMove={() => setMoveTask(t)} />)}
                  <Pressable onPress={() => ui.openQuickAdd({ projectId: project.id, sectionId: col.id })} className="flex-row items-center px-1 py-2 active:opacity-60" accessibilityRole="button">
                    <Plus size={16} color={C.accent} /><Text className="text-ink-muted text-sm ml-2">Add task</Text>
                  </Pressable>
                </View>
              );
            })}
            <Pressable onPress={() => { setSectionName(''); setSectionSheet({ mode: 'add' }); }} style={{ width: 200 }} className="p-4 rounded-2xl border border-line items-center justify-center active:opacity-60" accessibilityRole="button">
              <Plus size={18} color={C.accent} /><Text className="text-accent text-sm mt-1">Add section</Text>
            </Pressable>
          </ScrollView>
        </ScrollView>
      )}

      <ActionMenu
        visible={menu}
        onClose={() => setMenu(false)}
        title={project.title}
        actions={[
          { label: 'Add section', icon: <Rows3 size={18} color={C.muted} />, onPress: () => setTimeout(() => { setSectionName(''); setSectionSheet({ mode: 'add' }); }, 250) },
          { label: `Sort: ${{ manual: 'Manual', due: 'Due date', priority: 'Priority', name: 'Name' }[sort]}`, icon: <ArrowUpDown size={18} color={C.muted} />, onPress: () => setTimeout(() => setSortMenu(true), 250) },
          { label: project.favorite ? 'Remove from favorites' : 'Add to favorites', icon: <Star size={18} color={project.favorite ? '#F59E0B' : C.muted} fill={project.favorite ? '#F59E0B' : 'transparent'} />, onPress: () => updateProject(project, { favorite: !project.favorite }) },
          { label: 'Edit project', icon: <Pencil size={18} color={C.muted} />, onPress: () => setTimeout(() => setForm('edit'), 250) },
          { label: 'Add sub-project', icon: <FolderPlus size={18} color={C.muted} />, onPress: () => setTimeout(() => setForm('child'), 250) },
          { label: 'Activity', icon: <History size={18} color={C.muted} />, onPress: () => router.push(`/(app)/activity?project=${project.id}`) },
          project.archived
            ? { label: 'Unarchive', icon: <ArchiveRestore size={18} color={C.muted} />, onPress: () => { updateProject(project, { archived: false }); toast.show('Project restored', 'success'); } }
            : { label: 'Archive', icon: <Archive size={18} color={C.muted} />, onPress: () => { updateProject(project, { archived: true }); toast.show('Project archived', 'info'); goBack(); } },
          { label: 'Delete project', icon: <Trash2 size={18} color={C.danger} />, destructive: true, onPress: onDelete },
        ]}
      />
      <ActionMenu
        visible={sortMenu}
        onClose={() => setSortMenu(false)}
        title="Sort tasks by"
        actions={(['manual', 'due', 'priority', 'name'] as Sort[]).map((k) => ({ label: { manual: 'Manual order', due: 'Due date', priority: 'Priority', name: 'Name' }[k], hint: sort === k ? '✓' : undefined, onPress: () => setSort(k) }))}
      />
      <ActionMenu
        visible={!!sectionMenu}
        onClose={() => setSectionMenu(null)}
        title={sectionMenu?.name}
        actions={sectionMenu ? [
          { label: 'Rename', icon: <Pencil size={18} color={C.muted} />, onPress: () => { const s = sectionMenu; setTimeout(() => { setSectionName(s.name); setSectionSheet({ mode: 'rename', section: s }); }, 250); } },
          { label: 'Move up', icon: <ArrowUp size={18} color={C.muted} />, onPress: () => moveSection(sectionMenu, -1) },
          { label: 'Move down', icon: <ArrowDown size={18} color={C.muted} />, onPress: () => moveSection(sectionMenu, 1) },
          {
            label: 'Delete section', icon: <Trash2 size={18} color={C.danger} />, destructive: true,
            onPress: async () => {
              const s = sectionMenu;
              const n = ui.tasks.filter((t) => !t.completed && t.sectionId === s.id).length;
              if (await confirmDialog({ title: 'Delete section', message: n ? `“${s.name}” has ${n} task(s). They’ll move to the project’s main list.` : `Delete “${s.name}”?`, confirmText: 'Delete', destructive: true })) deleteSection(s.id);
            },
          },
        ] : []}
      />
      <ActionMenu
        visible={!!moveTask}
        onClose={() => setMoveTask(null)}
        title="Move to section"
        actions={moveTask ? columns.map((col) => ({ label: col.name, icon: <MoveRight size={18} color={C.muted} />, hint: (moveTask.sectionId ?? null) === col.id ? '✓' : undefined, onPress: () => moveTasks([moveTask.id], { projectId: project.id, sectionId: col.id }) })) : []}
      />
      <Sheet visible={!!sectionSheet} onClose={() => setSectionSheet(null)} title={sectionSheet?.mode === 'rename' ? 'Rename section' : 'Add section'}>
        <TextInput value={sectionName} onChangeText={setSectionName} autoFocus placeholder="e.g. Blocks the build, In progress, Waiting" placeholderTextColor={T.faint} className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line" returnKeyType="done" onSubmitEditing={saveSection} accessibilityLabel="Section name" />
        <View className="mt-4 mb-1"><Button title={sectionSheet?.mode === 'rename' ? 'Save' : 'Add section'} onPress={saveSection} disabled={!sectionName.trim()} /></View>
      </Sheet>
      <ProjectFormSheet
        visible={form !== null}
        initial={form === 'edit' ? project : null}
        parentId={form === 'child' ? project.id : null}
        projects={ui.projects}
        onClose={() => setForm(null)}
      />
    </TaskScreen>
  );
}

