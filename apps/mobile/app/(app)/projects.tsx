import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderKanban, Download, Upload, FileText, Pencil, Trash2, ExternalLink, ClipboardList } from 'lucide-react-native';
import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Project, ProjectCategory, Workspace } from '@clearmind/shared';
import { newId } from '../../lib/id';
import { workspaceService } from '../../services/workspaceService';
import { isFirebaseConfigured } from '../../lib/firebase';
import { WorkspaceBar, WorkspaceBanner, NewWorkspaceModal, MembersModal } from '../../components/ui/WorkspaceShare';
import { Screen, AppHeader, Fab, EmptyState, Spinner, StatCard, Sheet, ActionMenu, confirmDialog, useToast } from '../../components/ui';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { createProject, updateProject, deleteProject, projectSubtree } from '../../services/taskActions';
import {
  CATEGORY_META, STATUSES, PRIORITIES, HEALTHS, listToCsv, applyPlanForm, taskProgressByProject, PlanFormSheet, PlanSummary, PortfolioCard,
  type Status, type Priority, type Health, type PlanForm, type TaskProgress,
} from '../../components/projects/plan';
import { T } from '../../lib/theme';

// Origin-tagged project (where it lives — a shared workspace vs the personal store).
type MProject = Project & { __wsId?: string };
const stripWsP = (p: MProject): Project => {
  const { __wsId, ...rest } = p;
  return rest as Project;
};

/** Plan fields written onto a personal project through the domain layer (keeps activity + field-level sync). */
const planPatch = (p: Project): Partial<Project> => {
  const { id: _i, createdAt: _c, color: _co, parentId: _pa, order: _o, archived: _a, icon: _ic, favorite: _f, view: _v, ...rest } = p as any;
  return rest;
};

/**
 * Projects portfolio — every project with its plan (status, health, progress,
 * category) and live task counts. Same records as Browse → My Projects; a
 * card opens the one project screen (tasks · board · plan). Shared
 * workspaces and Excel import/export live here.
 */
export default function ProjectsScreen() {
  const router = useRouter();
  const ui = useTaskUI();
  const toast = useToast();
  const [filter, setFilter] = useState<ProjectCategory | 'All'>('All');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MProject | null>(null);
  const [detail, setDetail] = useState<MProject | null>(null);
  const [menu, setMenu] = useState<MProject | null>(null);
  const [busy, setBusy] = useState(false);

  // Collaboration: shared workspaces (separate Firestore path, not the personal store).
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [wsItems, setWsItems] = useState<MProject[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const activeWorkspace = activeWsId ? workspaces.find((w) => w.id === activeWsId) ?? null : null;

  useEffect(() => {
    if (!workspaceService.supported()) return;
    return workspaceService.subscribe(setWorkspaces);
  }, []);
  // Live subscription to the active workspace's projects, origin-tagged so writes
  // route correctly. Access loss handled via onError (no racy activeWsId reset).
  useEffect(() => {
    if (!activeWsId) return;
    const wsId = activeWsId;
    setWsLoading(true);
    return workspaceService.subscribeProjects(
      wsId,
      (list) => { setWsItems(list.map((p) => ({ ...p, __wsId: wsId })) as MProject[]); setWsLoading(false); },
      () => { setActiveWsId(null); toast.show('That shared workspace is no longer available', 'error'); }
    );
  }, [activeWsId]); // eslint-disable-line react-hooks/exhaustive-deps

  const personal = useMemo(() => ui.projects.filter((p) => !p.deleted && !p.archived), [ui.projects]);
  const projects: MProject[] = activeWsId ? wsItems : personal;
  const loading = activeWsId ? wsLoading : ui.loading;

  // Live task counts per personal project (shared-workspace projects have no task list).
  const taskCounts = useMemo(() => taskProgressByProject(ui.tasks), [ui.tasks]);

  const filtered = useMemo(
    () => (filter === 'All' ? projects : projects.filter((p) => p.category === filter)),
    [projects, filter],
  );

  const stats = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter((p) => p.status === 'Completed').length;
    const active = projects.filter((p) => p.status === 'In Progress').length;
    const avg = total ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / total) : 0;
    return { total, completed, active, avg };
  }, [projects]);

  const usedCategories = useMemo(
    () => CATEGORY_META.filter((m) => projects.some((p) => p.category === m.value)),
    [projects],
  );

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p: MProject) => { setEditing(p); setFormOpen(true); };
  const openProject = (p: MProject) => (p.__wsId ? setDetail(p) : router.push(`/(app)/project/${p.id}`));

  /** Create a personal project through the domain layer, then attach its plan. */
  const createPersonal = (p: Project): Project => {
    const created = createProject({ title: p.title, description: p.description || null });
    updateProject(created, planPatch(p));
    return created;
  };

  const onDelete = async (p: MProject) => {
    if (p.__wsId) {
      if (!(await confirmDialog({ title: 'Delete project', message: `Delete “${p.title}” from this shared workspace for everyone?`, confirmText: 'Delete', destructive: true }))) return;
      try {
        await workspaceService.deleteProject(p.__wsId, p.id);
        setDetail((d) => (d && d.id === p.id ? null : d));
        toast.show('Project deleted', 'info');
      } catch {
        toast.show('Could not delete — check your connection', 'error');
      }
      return;
    }
    // Personal: same cascade as Browse (sub-projects, sections and tasks).
    const ids = new Set(projectSubtree(ui.projects, p.id));
    const n = ui.tasks.filter((t) => t.projectId && ids.has(t.projectId)).length;
    const ok = await confirmDialog({
      title: 'Delete project',
      message: `Delete “${p.title}” and its ${n} task${n === 1 ? '' : 's'}${ids.size > 1 ? ' (including sub-projects)' : ''}? This can’t be undone.`,
      confirmText: 'Delete', destructive: true,
    });
    if (ok) { await deleteProject(p.id); toast.show('Project deleted', 'info'); }
  };

  // ---- Workspace (collaboration) actions ----
  const handleCreateWorkspace = async (name: string, emails: string[], seed: boolean) => {
    const ws = await workspaceService.create(name, emails, []);
    if (seed) await workspaceService.seedProjects(ws.id, personal.map((p) => ({ ...stripWsP(p), id: newId() })));
    setShowNewWorkspace(false);
    setActiveWsId(ws.id);
    toast.show(`Workspace “${ws.name}” created`, 'success');
  };
  const handleSetMembers = async (emails: string[]) => {
    if (!activeWorkspace) return;
    await workspaceService.setMembers(activeWorkspace, emails);
    toast.show('Members updated', 'success');
  };
  const handleDeleteWorkspace = async () => {
    if (!activeWorkspace) return;
    const ok = await confirmDialog({ title: 'Delete workspace', message: `Delete “${activeWorkspace.name}” for everyone? This cannot be undone.`, confirmText: 'Delete', destructive: true });
    if (!ok) return;
    const id = activeWorkspace.id;
    setActiveWsId(null);
    setShowMembers(false);
    await workspaceService.remove(id);
    toast.show('Workspace deleted', 'info');
  };

  const handleSave = async (f: PlanForm) => {
    if (!f.title.trim()) return;
    // Route by the item's origin (edit) / the active workspace (new) — never an
    // ambiguous selection, so a shared-workspace save can't land in the personal list.
    const target = editing ? editing.__wsId ?? null : activeWsId;
    try {
      if (editing) {
        const updated = applyPlanForm(stripWsP(editing), f, editing.id);
        if (target) await workspaceService.putProject(target, updated);
        else updateProject(editing, planPatch(updated));
        setDetail((d) => (d && d.id === editing.id ? { ...updated, __wsId: d.__wsId } : d));
        toast.show('Project updated', 'success');
      } else {
        const fresh = applyPlanForm(null, f, newId());
        if (target) {
          await workspaceService.putProject(target, fresh);
          toast.show('Project created', 'success');
        } else {
          const created = createPersonal(fresh);
          toast.show(`Project “${created.title}” created`, 'success');
        }
      }
      setFormOpen(false);
    } catch {
      toast.show('Could not save — check your connection', 'error');
    }
  };

  // ---------- Excel ----------
  const projectToRow = (p: Project) => ({
    'Title*': p.title,
    'Description': p.description || '',
    'Status': p.status,
    'Priority': p.priority || '',
    'Category': p.category || '',
    'Start Date': p.startDate || '',
    'Deadline': p.deadline || '',
    'Project Manager': p.projectManager || '',
    'Team Members': listToCsv(p.team),
    'Stakeholders': listToCsv(p.stakeholders),
    'Tags': listToCsv(p.tags),
    'Notes': p.notes || '',
    'Reporting Structure': p.reportingStructure || '',
    'Total Budget': p.totalBudget ?? '',
    'Health Status': p.healthStatus || '',
    'Progress': p.progress ?? 0,
  });

  const writeAndShare = async (wb: XLSX.WorkBook, filename: string) => {
    const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const uri = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: filename,
      });
    } else {
      toast.show('Saved to app documents', 'info');
    }
  };

  const exportTemplate = async () => {
    try {
      setBusy(true);
      const templateData = [{
        'Title*': 'Example Project', 'Description': 'Project description here', 'Status': 'Planning',
        'Priority': 'Medium', 'Category': 'IT', 'Start Date': '2026-01-15', 'Deadline': '2026-06-30',
        'Project Manager': 'John Doe', 'Team Members': 'Alice, Bob, Charlie', 'Stakeholders': 'CEO, CTO',
        'Tags': 'web, development, priority', 'Notes': 'Additional notes here',
        'Reporting Structure': 'Reports to: CTO', 'Total Budget': '50000', 'Health Status': 'On Track',
      }];
      const instructions = [
        { Instructions: 'ClearMind Project Import Template' },
        { Instructions: '' },
        { Instructions: 'Required: Title*' },
        { Instructions: 'Status: Not Started, Planning, In Progress, On Hold, Completed, Cancelled' },
        { Instructions: 'Priority: Critical, High, Medium, Low' },
        { Instructions: 'Category: Energy, Green Energy, Finance, Health, IT, Education, Construction, Manufacturing, Retail, Marketing, Research, Government, Non-Profit, Startup, Personal, Other' },
        { Instructions: 'Dates: YYYY-MM-DD. Team Members / Stakeholders / Tags: comma-separated.' },
        { Instructions: 'Health Status: On Track, At Risk, Off Track' },
        { Instructions: 'Delete the example row before importing. One project per row.' },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(templateData), 'Projects');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instructions), 'Instructions');
      await writeAndShare(wb, 'ClearMind_Project_Template.xlsx');
    } catch (e) {
      toast.show('Could not create template', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportProjects = async () => {
    if (projects.length === 0) { toast.show('No projects to export', 'info'); return; }
    try {
      setBusy(true);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projects.map(projectToRow)), 'Projects');
      await writeAndShare(wb, 'ClearMind_Projects.xlsx');
      toast.show(`Exported ${projects.length} project${projects.length !== 1 ? 's' : ''}`, 'success');
    } catch (e) {
      toast.show('Export failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const importProjects = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      setBusy(true);

      const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = XLSX.read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as Record<string, any>[];

      if (rows.length === 0) { toast.show('No data found in file', 'error'); return; }

      const validStatuses = STATUSES as string[];
      const validPriorities = PRIORITIES as string[];
      const validCategories = CATEGORY_META.map((c) => c.value) as string[];
      const validHealth = HEALTHS as string[];

      // Parsing helpers ported verbatim from the web importer.
      const parseDate = (dateValue: any): string | undefined => {
        if (dateValue === undefined || dateValue === null || dateValue === '') return undefined;
        if (typeof dateValue === 'number') {
          const d = XLSX.SSF.parse_date_code(dateValue);
          if (!d) return undefined;
          return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        if (typeof dateValue === 'string') {
          const match = dateValue.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (match) return dateValue;
        }
        return undefined;
      };
      const parseList = (value: any): string[] => {
        if (!value) return [];
        return String(value).split(',').map((s) => s.trim()).filter(Boolean);
      };

      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        const rawTitle = row['Title*'] ?? row['Title'];
        if (!rawTitle || typeof rawTitle !== 'string' || !rawTitle.trim()) { skipped++; continue; }

        let status: Status = 'Planning';
        if (row['Status'] && validStatuses.includes(row['Status'])) status = row['Status'] as Status;
        let priority: Priority = 'Medium';
        if (row['Priority'] && validPriorities.includes(row['Priority'])) priority = row['Priority'] as Priority;
        let category: ProjectCategory | undefined;
        if (row['Category'] && validCategories.includes(row['Category'])) category = row['Category'] as ProjectCategory;
        let healthStatus: Health = 'On Track';
        if (row['Health Status'] && validHealth.includes(row['Health Status'])) healthStatus = row['Health Status'] as Health;

        const progressRaw = row['Progress'];
        const progress = typeof progressRaw === 'number'
          ? Math.max(0, Math.min(100, Math.round(progressRaw)))
          : 0;

        const project: Project = {
          id: newId(),
          title: rawTitle.trim(),
          description: row['Description'] ? String(row['Description']).trim() : '',
          status,
          progress,
          tags: parseList(row['Tags']),
          deadline: parseDate(row['Deadline']),
          startDate: parseDate(row['Start Date']),
          projectManager: row['Project Manager'] ? String(row['Project Manager']).trim() : undefined,
          team: parseList(row['Team Members']),
          stakeholders: parseList(row['Stakeholders']),
          priority,
          category,
          notes: row['Notes'] ? String(row['Notes']).trim() : undefined,
          reportingStructure: row['Reporting Structure'] ? String(row['Reporting Structure']).trim() : undefined,
          totalBudget: row['Total Budget'] ? Number(row['Total Budget']) : undefined,
          healthStatus,
          projectMilestones: [],
          teamCheckIns: [],
          createdAt: new Date().toISOString(),
        };
        if (activeWsId) await workspaceService.putProject(activeWsId, project);
        else createPersonal(project);
        imported++;
      }

      if (imported > 0) {
        toast.show(`Imported ${imported} project${imported !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}`, 'success');
      } else {
        toast.show('No valid rows found (missing Title)', 'error');
      }
    } catch (e) {
      toast.show('Failed to read Excel file', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading projects…" />;

  const ListHeader = (
    <View className="pt-1">
      <View className="flex-row gap-3 mb-4">
        <ActionButton icon={<Upload size={16} color="#a78bfa" />} label="Import" onPress={importProjects} disabled={busy} />
        <ActionButton icon={<Download size={16} color="#34d399" />} label="Export" onPress={exportProjects} disabled={busy} />
        <ActionButton icon={<FileText size={16} color={T.muted} />} label="Template" onPress={exportTemplate} disabled={busy} />
      </View>

      <View className="flex-row gap-3 mb-4">
        <StatCard className="flex-1" label="Total" value={stats.total} />
        <StatCard className="flex-1" label="Active" value={stats.active} />
        <StatCard className="flex-1" label="Done" value={stats.completed} />
        <StatCard className="flex-1" label="Avg %" value={stats.avg} />
      </View>

      {usedCategories.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 -mx-4 px-4">
          <FilterChip label={`All (${projects.length})`} active={filter === 'All'} onPress={() => setFilter('All')} />
          {usedCategories.map((m) => {
            const count = projects.filter((p) => p.category === m.value).length;
            return (
              <FilterChip
                key={m.value}
                label={`${m.label} (${count})`}
                active={filter === m.value}
                color={m.color}
                icon={<m.Icon size={13} color={filter === m.value ? '#fff' : m.color} />}
                onPress={() => setFilter(m.value)}
              />
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Screen padded={false}>
      <AppHeader
        title="Projects"
        subtitle={activeWorkspace ? `${activeWorkspace.name} · shared workspace` : `${stats.total} project${stats.total !== 1 ? 's' : ''} · ${stats.completed} completed`}
      />

      {isFirebaseConfigured() && (workspaces.length > 0 || workspaceService.supported()) ? (
        <WorkspaceBar workspaces={workspaces} activeWsId={activeWsId} personalLabel="My Projects" onSelect={setActiveWsId} onShareNew={() => setShowNewWorkspace(true)} />
      ) : null}
      {activeWorkspace ? (
        <WorkspaceBanner workspace={activeWorkspace} isOwner={workspaceService.isOwner(activeWorkspace)} onMembers={() => setShowMembers(true)} />
      ) : null}

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={34} color={T.accent} />}
          title="No projects yet"
          subtitle="Create a project to plan it and track its tasks — or import from Excel."
          ctaTitle="New project"
          onCta={openAdd}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListEmptyComponent={
            <View className="py-16 items-center">
              <Text className="text-ink-muted">No projects in this category.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <PortfolioCard
              project={item}
              tasks={item.__wsId ? undefined : taskCounts.get(item.id) ?? { open: 0, done: 0 }}
              onPress={() => openProject(item)}
              onLongPress={() => setMenu(item)}
            />
          )}
        />
      )}

      <Fab onPress={openAdd} label="New project" />

      <PlanFormSheet
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />

      <ActionMenu
        visible={!!menu}
        onClose={() => setMenu(null)}
        title={menu?.title}
        actions={menu ? [
          ...(!menu.__wsId ? [{ label: 'Open tasks', icon: <ExternalLink size={18} color={T.muted} />, onPress: () => router.push(`/(app)/project/${menu.id}`) }] : []),
          { label: 'View plan', icon: <ClipboardList size={18} color={T.muted} />, onPress: () => { const p = menu; setTimeout(() => (p.__wsId ? setDetail(p) : router.push(`/(app)/project/${p.id}?tab=plan`)), 250); } },
          { label: 'Edit plan', icon: <Pencil size={18} color={T.muted} />, onPress: () => { const p = menu; setTimeout(() => openEdit(p), 250); } },
          { label: 'Delete', icon: <Trash2 size={18} color={T.danger} />, destructive: true, onPress: () => onDelete(menu) },
        ] : []}
      />

      {/* Shared-workspace projects have no task list — their plan opens here. */}
      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={detail?.title} fill>
        {detail ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            <PlanSummary project={detail} onEdit={() => { const p = detail; setDetail(null); setTimeout(() => openEdit(p), 250); }} />
          </ScrollView>
        ) : null}
      </Sheet>

      <NewWorkspaceModal
        visible={showNewWorkspace}
        supported={workspaceService.supported()}
        seedCount={personal.length}
        seedNoun="project"
        onCancel={() => setShowNewWorkspace(false)}
        onCreate={handleCreateWorkspace}
      />
      <MembersModal
        workspace={showMembers ? activeWorkspace : null}
        isOwner={activeWorkspace ? workspaceService.isOwner(activeWorkspace) : false}
        currentEmail={workspaceService.currentEmail()}
        onCancel={() => setShowMembers(false)}
        onSave={handleSetMembers}
        onDelete={handleDeleteWorkspace}
      />
    </Screen>
  );
}

// ---------------- small building blocks ----------------

function ActionButton({ icon, label, onPress, disabled }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-midnight-light border border-line active:opacity-70 ${disabled ? 'opacity-50' : ''}`}
    >
      {icon}
      <Text className="text-ink text-xs font-semibold">{label}</Text>
    </Pressable>
  );
}

function FilterChip({ label, active, onPress, color, icon }: { label: string; active: boolean; onPress: () => void; color?: string; icon?: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`flex-row items-center mr-2 px-3 py-2 rounded-full border active:opacity-70 ${active ? 'bg-accent border-accent' : 'bg-midnight-light border-line'}`}
    >
      {icon ? <View className="mr-1.5">{icon}</View> : null}
      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{label}</Text>
    </Pressable>
  );
}
