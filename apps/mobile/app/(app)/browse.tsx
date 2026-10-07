import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Inbox, Hash, Plus, Tag, CircleCheck, Settings, ChevronRight, ChevronDown, Pencil, Trash2, Archive, ArchiveRestore,
  ArrowUp, ArrowDown, FolderPlus, LayoutDashboard, CalendarDays, Sparkles, NotebookPen, Flame, Target, ScrollText,
  LayoutGrid, Flag, FolderKanban, Briefcase, GraduationCap, Network, BarChart3, MessageSquareWarning,
} from 'lucide-react-native';
import type { Label, Project, SavedFilter } from '@clearmind/shared';
import { Star, History, LayoutTemplate, Bot, Filter as FilterIcon, Search as SearchIcon } from 'lucide-react-native';
import { useCollection } from '../../hooks/useCollection';
import { STORES } from '../../services/db';
import { SavedFilterSheet } from '../../components/tasks/SavedFilterSheet';
import { orderedProjects, openCounts } from '@clearmind/shared/tasks';
import { Screen, ActionMenu, confirmDialog, useToast } from '../../components/ui';
import { OfflineBanner } from '../../components/tasks/TaskScreen';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { ProjectFormSheet, LabelFormSheet } from '../../components/tasks/forms';
import { FILTERS } from '../../components/tasks/filters';
import { C } from '../../components/tasks/theme';
import { useAuth } from '../../hooks/useAuth';
import { projectColor, updateProject, deleteProject, moveProject, deleteLabel, projectSubtree } from '../../services/taskActions';

const TOOLS: { label: string; icon: React.ReactNode; href: Href }[] = [
  { label: 'Overview', icon: <LayoutDashboard size={20} color={C.accent} />, href: '/(app)/dashboard' },
  { label: 'Calendar', icon: <CalendarDays size={20} color={C.accent} />, href: '/(app)/calendar' },
  { label: 'Iris (AI assistant)', icon: <Sparkles size={20} color={C.accent} />, href: '/(app)/iris' },
  { label: 'Notes', icon: <NotebookPen size={20} color={C.accent} />, href: '/(app)/notes' },
  { label: 'Habits', icon: <Flame size={20} color={C.accent} />, href: '/(app)/habits' },
  { label: 'Goals', icon: <Target size={20} color={C.accent} />, href: '/(app)/goals' },
  { label: 'Daily Log', icon: <ScrollText size={20} color={C.accent} />, href: '/(app)/dailylog' },
  { label: 'Daily Mapper', icon: <LayoutGrid size={20} color={C.accent} />, href: '/(app)/dailymapper' },
  { label: 'Milestones', icon: <Flag size={20} color={C.accent} />, href: '/(app)/milestones' },
  { label: 'Project planner', icon: <FolderKanban size={20} color={C.accent} />, href: '/(app)/projects' },
  { label: 'Applications', icon: <Briefcase size={20} color={C.accent} />, href: '/(app)/applications' },
  { label: 'Learning Vault', icon: <GraduationCap size={20} color={C.accent} />, href: '/(app)/learningvault' },
  { label: 'Mind Map', icon: <Network size={20} color={C.accent} />, href: '/(app)/mindmap' },
  { label: 'Analytics', icon: <BarChart3 size={20} color={C.accent} />, href: '/(app)/analytics' },
  { label: 'Rant Corner', icon: <MessageSquareWarning size={20} color={C.accent} />, href: '/(app)/rant' },
];

function NavRow({ icon, label, count, onPress, onLongPress, indent = 0, right }: {
  icon: React.ReactNode; label: string; count?: number; onPress: () => void; onLongPress?: () => void; indent?: number; right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="flex-row items-center px-4 py-3 active:bg-midnight-light"
      style={{ paddingLeft: 16 + indent * 20, minHeight: 48 }}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count} open tasks` : label}
      accessibilityHint={onLongPress ? 'Long-press for options' : undefined}
    >
      <View className="w-8">{icon}</View>
      <Text className="text-ink text-[15px] flex-1" numberOfLines={1}>{label}</Text>
      {count ? <Text className="text-ink-muted text-[13px] mr-1">{count}</Text> : null}
      {right}
    </Pressable>
  );
}

function SectionTitle({ title, onAdd, addLabel, open, onToggle }: {
  title: string; onAdd?: () => void; addLabel?: string; open?: boolean; onToggle?: () => void;
}) {
  return (
    <View className="flex-row items-center px-4 mt-5 mb-1">
      <Pressable onPress={onToggle} disabled={!onToggle} className="flex-row items-center flex-1" accessibilityRole={onToggle ? 'button' : 'header'} accessibilityState={onToggle ? { expanded: open } : undefined}>
        <Text className="text-ink-muted text-xs font-semibold">{title}</Text>
        {onToggle ? (open ? <ChevronDown size={14} color={C.muted} style={{ marginLeft: 4 }} /> : <ChevronRight size={14} color={C.muted} style={{ marginLeft: 4 }} />) : null}
      </Pressable>
      {onAdd ? (
        <Pressable onPress={onAdd} hitSlop={12} className="p-1 active:opacity-60" accessibilityLabel={addLabel} accessibilityRole="button">
          <Plus size={18} color={C.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Browse: Inbox, projects (nested, reorderable), labels, filters, completed, and every ClearMind tool. */
export default function BrowseScreen() {
  const router = useRouter();
  const ui = useTaskUI();
  const toast = useToast();
  const { profile, user } = useAuth();
  const [projectForm, setProjectForm] = useState<null | { initial?: Project; parentId?: string }>(null);
  const [labelForm, setLabelForm] = useState<null | { initial?: Label }>(null);
  const [projectMenu, setProjectMenu] = useState<Project | null>(null);
  const [labelMenu, setLabelMenu] = useState<Label | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const { items: savedFilters } = useCollection<SavedFilter>(STORES.FILTERS);
  const [filterForm, setFilterForm] = useState<null | { initial?: SavedFilter }>(null);
  const favorites = useMemo(() => ({
    projects: ui.projects.filter((p) => p.favorite && !p.archived && !p.deleted),
    labels: ui.labels.filter((l) => l.favorite && !l.deleted),
    filters: savedFilters.filter((f) => f.favorite && !f.deleted),
  }), [ui.projects, ui.labels, savedFilters]);

  const tree = useMemo(() => orderedProjects(ui.projects), [ui.projects]);
  const archived = useMemo(() => ui.projects.filter((p) => p.archived).sort((a, b) => a.title.localeCompare(b.title)), [ui.projects]);
  const counts = useMemo(() => openCounts(ui.tasks, ui.projectMap), [ui.tasks, ui.projectMap]);
  const labelCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ui.tasks) if (!t.completed) for (const id of t.labelIds ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [ui.tasks]);
  const labels = useMemo(() => [...ui.labels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)), [ui.labels]);
  const name = profile?.nickname || user?.displayName || user?.email?.split('@')[0] || 'You';

  const siblings = (p: Project) => tree.filter((x) => (x.project.parentId ?? null) === (p.parentId ?? null)).map((x) => x.project);

  const confirmDeleteProject = async (p: Project) => {
    const ids = new Set(projectSubtree(ui.projects, p.id));
    const n = ui.tasks.filter((t) => t.projectId && ids.has(t.projectId)).length;
    const ok = await confirmDialog({
      title: 'Delete project',
      message: `Delete “${p.title}” and its ${n} task${n === 1 ? '' : 's'}${ids.size > 1 ? ' (including sub-projects)' : ''}? This can’t be undone.`,
      confirmText: 'Delete', destructive: true,
    });
    if (ok) { await deleteProject(p.id); toast.show('Project deleted', 'info'); }
  };

  return (
    <Screen padded={false}>
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <View className="w-9 h-9 rounded-full bg-accent items-center justify-center mr-3">
          <Text className="text-white font-extrabold">{name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text className="text-ink text-[22px] font-extrabold flex-1" numberOfLines={1} accessibilityRole="header">Browse</Text>
        <Pressable onPress={() => router.push('/(app)/settings')} hitSlop={8} className="p-2 rounded-full active:bg-midnight-lighter" accessibilityLabel="Settings" accessibilityRole="button">
          <Settings size={22} color={C.ink} />
        </Pressable>
      </View>
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <NavRow icon={<Inbox size={20} color={C.accent} />} label="Inbox" count={counts.get(null)} onPress={() => router.push('/(app)/inbox')} />
        <NavRow icon={<CircleCheck size={20} color={C.success} />} label="Completed" onPress={() => router.push('/(app)/completed')} />
        <NavRow icon={<Flame size={20} color="#F97316" />} label="Productivity" onPress={() => router.push('/(app)/productivity')} />
        <NavRow icon={<History size={20} color={C.muted} />} label="Activity" onPress={() => router.push('/(app)/activity')} />

        {favorites.projects.length + favorites.labels.length + favorites.filters.length ? (
          <>
            <SectionTitle title="FAVORITES" />
            {favorites.projects.map((p) => <NavRow key={p.id} icon={<Hash size={20} color={projectColor(p)} />} label={p.title} count={counts.get(p.id)} onPress={() => router.push(`/(app)/project/${p.id}`)} onLongPress={() => setProjectMenu(p)} right={<Star size={13} color="#F59E0B" fill="#F59E0B" />} />)}
            {favorites.labels.map((l) => <NavRow key={l.id} icon={<Tag size={18} color={l.color} />} label={l.name} count={labelCounts.get(l.id)} onPress={() => router.push(`/(app)/label/${l.id}`)} />)}
            {favorites.filters.map((f) => <NavRow key={f.id} icon={<FilterIcon size={18} color={f.color ?? C.accent} />} label={f.name} onPress={() => router.push(`/(app)/filter/saved:${f.id}`)} />)}
          </>
        ) : null}

        <SectionTitle title="MY PROJECTS" onAdd={() => setProjectForm({})} addLabel="Add project" />
        {tree.length ? tree.map(({ project, depth }) => (
          <NavRow
            key={project.id}
            indent={depth}
            icon={<Hash size={20} color={projectColor(project)} />}
            label={project.title}
            count={counts.get(project.id)}
            onPress={() => router.push(`/(app)/project/${project.id}`)}
            onLongPress={() => setProjectMenu(project)}
          />
        )) : (
          <Pressable onPress={() => setProjectForm({})} className="px-4 py-3 active:opacity-60">
            <Text className="text-ink-muted text-[14px]">No projects yet — tap + to create one, or type “#Name” in Quick Add.</Text>
          </Pressable>
        )}
        {archived.length ? (
          <>
            <SectionTitle title={`ARCHIVED (${archived.length})`} open={showArchived} onToggle={() => setShowArchived((x) => !x)} />
            {showArchived ? archived.map((p) => (
              <NavRow key={p.id} icon={<Archive size={18} color={C.muted} />} label={p.title} onPress={() => router.push(`/(app)/project/${p.id}`)} onLongPress={() => setProjectMenu(p)} />
            )) : null}
          </>
        ) : null}

        <SectionTitle title="LABELS" onAdd={() => setLabelForm({})} addLabel="Add label" />
        {labels.length ? labels.map((l) => (
          <NavRow key={l.id} icon={<Tag size={18} color={l.color} />} label={l.name} count={labelCounts.get(l.id)} onPress={() => router.push(`/(app)/label/${l.id}`)} onLongPress={() => setLabelMenu(l)} />
        )) : (
          <Text className="text-ink-muted text-[14px] px-4 py-3">Add labels with + or “@label” in Quick Add.</Text>
        )}

        <SectionTitle title="FILTERS" onAdd={() => setFilterForm({})} addLabel="Add filter" />
        {savedFilters.filter((f) => !f.deleted).map((f) => (
          <NavRow key={f.id} icon={<FilterIcon size={18} color={f.color ?? C.accent} />} label={f.name} onPress={() => router.push(`/(app)/filter/saved:${f.id}`)} onLongPress={() => setFilterForm({ initial: f })} />
        ))}
        {FILTERS.map((f) => (
          <NavRow key={f.id} icon={f.icon} label={f.title} onPress={() => router.push(`/(app)/filter/${f.id}`)} />
        ))}

        <SectionTitle title="MORE" />
        <NavRow icon={<LayoutTemplate size={20} color={C.accent} />} label="Project templates" onPress={() => router.push('/(app)/templates')} />
        <NavRow icon={<Bot size={20} color={C.accent} />} label="Integrations & AI agents" onPress={() => router.push('/(app)/settings/integrations')} />
        <NavRow icon={<SearchIcon size={20} color={C.accent} />} label="Search" onPress={() => router.push('/(app)/search')} />

        <SectionTitle title="CLEARMIND TOOLS" open={showTools} onToggle={() => setShowTools((x) => !x)} />
        {showTools ? TOOLS.map((t) => (
          <NavRow key={t.label} icon={t.icon} label={t.label} onPress={() => router.push(t.href)} right={<ChevronRight size={16} color={C.muted} />} />
        )) : null}
      </ScrollView>

      <SavedFilterSheet visible={!!filterForm} initial={filterForm?.initial} onClose={() => setFilterForm(null)} />
      <ProjectFormSheet
        visible={!!projectForm}
        initial={projectForm?.initial}
        parentId={projectForm?.parentId}
        projects={ui.projects}
        onClose={() => setProjectForm(null)}
        onSaved={(p) => { if (!projectForm?.initial) toast.show(`Project “${p.title}” created`, 'success'); }}
      />
      <LabelFormSheet visible={!!labelForm} initial={labelForm?.initial} labels={ui.labels} onClose={() => setLabelForm(null)} />

      <ActionMenu
        visible={!!projectMenu}
        onClose={() => setProjectMenu(null)}
        title={projectMenu?.title}
        actions={projectMenu ? [
          { label: 'Edit', icon: <Pencil size={18} color={C.muted} />, onPress: () => { const p = projectMenu; setTimeout(() => setProjectForm({ initial: p }), 250); } },
          { label: 'Add sub-project', icon: <FolderPlus size={18} color={C.muted} />, onPress: () => { const p = projectMenu; setTimeout(() => setProjectForm({ parentId: p.id }), 250); } },
          ...(!projectMenu.archived ? [
            { label: 'Move up', icon: <ArrowUp size={18} color={C.muted} />, onPress: () => moveProject(siblings(projectMenu), projectMenu.id, -1) },
            { label: 'Move down', icon: <ArrowDown size={18} color={C.muted} />, onPress: () => moveProject(siblings(projectMenu), projectMenu.id, 1) },
            { label: 'Archive', icon: <Archive size={18} color={C.muted} />, onPress: () => { updateProject(projectMenu, { archived: true }); toast.show('Project archived', 'info'); } },
          ] : [
            { label: 'Unarchive', icon: <ArchiveRestore size={18} color={C.muted} />, onPress: () => { updateProject(projectMenu, { archived: false }); toast.show('Project restored', 'success'); } },
          ]),
          { label: 'Delete', icon: <Trash2 size={18} color={C.danger} />, destructive: true, onPress: () => confirmDeleteProject(projectMenu) },
        ] : []}
      />
      <ActionMenu
        visible={!!labelMenu}
        onClose={() => setLabelMenu(null)}
        title={labelMenu?.name}
        actions={labelMenu ? [
          { label: 'Edit', icon: <Pencil size={18} color={C.muted} />, onPress: () => { const l = labelMenu; setTimeout(() => setLabelForm({ initial: l }), 250); } },
          {
            label: 'Delete', icon: <Trash2 size={18} color={C.danger} />, destructive: true,
            onPress: async () => {
              const l = labelMenu;
              if (await confirmDialog({ title: 'Delete label', message: `Delete “${l.name}”? Tasks keep everything else.`, confirmText: 'Delete', destructive: true })) {
                deleteLabel(l.id);
                toast.show('Label deleted', 'info');
              }
            },
          },
        ] : []}
      />
    </Screen>
  );
}
