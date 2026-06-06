import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Modal, ScrollView } from 'react-native';
import {
  FolderKanban, Plus, Pencil, Trash2, Calendar, Users, Download, Upload, FileText,
  Zap, Leaf, DollarSign, Heart, Monitor, GraduationCap, Building, Factory, ShoppingBag,
  Megaphone, FlaskConical, Landmark, HandHeart, Rocket, User, FolderOpen, X, MessageSquare,
  Layers, TriangleAlert, Wallet, Compass, ChartColumn, CircleAlert,
} from 'lucide-react-native';
import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Project, ProjectCategory } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, TextArea, Select, DateField, SliderField, ProgressBar,
  Badge, Fab, EmptyState, Spinner, StatCard, confirmDialog, useToast,
} from '../../components/ui';

type Status = Project['status'];
type Priority = NonNullable<Project['priority']>;
type Health = NonNullable<Project['healthStatus']>;
type BadgeTone = 'accent' | 'green' | 'amber' | 'red' | 'muted';

const STATUSES: Status[] = ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low'];
const HEALTHS: Health[] = ['On Track', 'At Risk', 'Off Track'];

// Category metadata: icon + accent hex (arbitrary colors -> inline style).
const CATEGORY_META: { value: ProjectCategory; label: string; Icon: typeof Zap; color: string }[] = [
  { value: 'Energy', label: 'Energy', Icon: Zap, color: '#eab308' },
  { value: 'Green Energy', label: 'Green Energy', Icon: Leaf, color: '#22c55e' },
  { value: 'Finance', label: 'Finance', Icon: DollarSign, color: '#10b981' },
  { value: 'Health', label: 'Health', Icon: Heart, color: '#ef4444' },
  { value: 'IT', label: 'IT', Icon: Monitor, color: '#3b82f6' },
  { value: 'Education', label: 'Education', Icon: GraduationCap, color: '#a855f7' },
  { value: 'Construction', label: 'Construction', Icon: Building, color: '#f97316' },
  { value: 'Manufacturing', label: 'Manufacturing', Icon: Factory, color: '#6b7280' },
  { value: 'Retail', label: 'Retail', Icon: ShoppingBag, color: '#ec4899' },
  { value: 'Marketing', label: 'Marketing', Icon: Megaphone, color: '#6366f1' },
  { value: 'Research', label: 'Research', Icon: FlaskConical, color: '#06b6d4' },
  { value: 'Government', label: 'Government', Icon: Landmark, color: '#64748b' },
  { value: 'Non-Profit', label: 'Non-Profit', Icon: HandHeart, color: '#f43f5e' },
  { value: 'Startup', label: 'Startup', Icon: Rocket, color: '#8b5cf6' },
  { value: 'Personal', label: 'Personal', Icon: User, color: '#14b8a6' },
  { value: 'Other', label: 'Other', Icon: FolderOpen, color: '#9ca3af' },
];
const getCategoryMeta = (c?: ProjectCategory) =>
  CATEGORY_META.find((m) => m.value === c) || CATEGORY_META[CATEGORY_META.length - 1];

const STATUS_TONE: Record<Status, BadgeTone> = {
  'Completed': 'green',
  'On Hold': 'amber',
  'Cancelled': 'red',
  'Not Started': 'muted',
  'Planning': 'accent',
  'In Progress': 'accent',
};
const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  Critical: 'red', High: 'amber', Medium: 'accent', Low: 'muted',
};
const HEALTH_TONE: Record<Health, BadgeTone> = {
  'On Track': 'green', 'At Risk': 'amber', 'Off Track': 'red',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (dateStr?: string): string | null => {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return dateStr;
};

const csvToList = (v: string): string[] => v.split(',').map((s) => s.trim()).filter(Boolean);
const listToCsv = (v?: string[]): string => (v && v.length ? v.join(', ') : '');

// ---- Excel column mapping (shared by template/export) ----
const HEALTH_VALUES = ['On Track', 'At Risk', 'Off Track'];

interface FormState {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  category: ProjectCategory | '';
  progress: number;
  startDate?: string;
  deadline?: string;
  healthStatus: Health;
  projectManager: string;
  team: string;
  stakeholders: string;
  tags: string;
  reportingStructure: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  title: '', description: '', status: 'Planning', priority: 'Medium', category: '',
  progress: 0, startDate: undefined, deadline: undefined, healthStatus: 'On Track',
  projectManager: '', team: '', stakeholders: '', tags: '', reportingStructure: '', notes: '',
});

const formFromProject = (p: Project): FormState => ({
  title: p.title,
  description: p.description || '',
  status: p.status,
  priority: p.priority ?? 'Medium',
  category: p.category ?? '',
  progress: p.progress ?? 0,
  startDate: p.startDate,
  deadline: p.deadline,
  healthStatus: p.healthStatus ?? 'On Track',
  projectManager: p.projectManager ?? '',
  team: listToCsv(p.team),
  stakeholders: listToCsv(p.stakeholders),
  tags: listToCsv(p.tags),
  reportingStructure: p.reportingStructure ?? '',
  notes: p.notes ?? '',
});

export default function ProjectsScreen() {
  const { items: projects, loading, create, update, remove } = useCollection<Project>(STORES.PROJECTS);
  const toast = useToast();

  const [filter, setFilter] = useState<ProjectCategory | 'All'>('All');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [detail, setDetail] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

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
  const openEdit = (p: Project) => { setEditing(p); setFormOpen(true); };

  const onDelete = async (p: Project) => {
    if (await confirmDialog({ title: 'Delete project', message: `Delete “${p.title}”?`, confirmText: 'Delete', destructive: true })) {
      remove(p.id);
      setDetail((d) => (d && d.id === p.id ? null : d));
      toast.show('Project deleted', 'info');
    }
  };

  const handleSave = (f: FormState) => {
    const title = f.title.trim();
    if (!title) return;
    const category = (f.category || undefined) as ProjectCategory | undefined;
    if (editing) {
      // Spread `editing` FIRST so deferred sub-entities (phases/risks/resources/
      // metrics/check-ins/alignments/milestones) survive the edit.
      update({
        ...editing,
        title,
        description: f.description.trim(),
        status: f.status,
        progress: Math.round(f.progress),
        priority: f.priority,
        category,
        startDate: f.startDate,
        deadline: f.deadline,
        healthStatus: f.healthStatus,
        projectManager: f.projectManager.trim() || undefined,
        team: csvToList(f.team),
        stakeholders: csvToList(f.stakeholders),
        tags: csvToList(f.tags),
        reportingStructure: f.reportingStructure.trim() || undefined,
        notes: f.notes.trim() || undefined,
        updatedAt: new Date().toISOString(),
      });
      toast.show('Project updated', 'success');
    } else {
      create({
        id: newId(),
        title,
        description: f.description.trim(),
        status: f.status,
        progress: Math.round(f.progress),
        priority: f.priority,
        category,
        startDate: f.startDate,
        deadline: f.deadline,
        healthStatus: f.healthStatus,
        projectManager: f.projectManager.trim() || undefined,
        team: csvToList(f.team),
        stakeholders: csvToList(f.stakeholders),
        tags: csvToList(f.tags),
        reportingStructure: f.reportingStructure.trim() || undefined,
        notes: f.notes.trim() || undefined,
        projectMilestones: [],
        teamCheckIns: [],
        createdAt: new Date().toISOString(),
      });
      toast.show('Project created', 'success');
    }
    setFormOpen(false);
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
      const validHealth = HEALTH_VALUES;

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
        await create(project);
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
    <View className="pt-3">
      <Text className="text-ink-muted text-sm mb-3">
        Manage projects with plans, teams, and progress.
      </Text>

      <View className="flex-row gap-3 mb-4">
        <ActionButton icon={<Upload size={16} color="#a78bfa" />} label="Import" onPress={importProjects} disabled={busy} />
        <ActionButton icon={<Download size={16} color="#34d399" />} label="Export" onPress={exportProjects} disabled={busy} />
        <ActionButton icon={<FileText size={16} color="#9ca3af" />} label="Template" onPress={exportTemplate} disabled={busy} />
      </View>

      <View className="flex-row gap-3 mb-4">
        <StatCard className="flex-1" label="Total" value={stats.total} />
        <StatCard className="flex-1" label="Active" value={stats.active} />
        <StatCard className="flex-1" label="Done" value={stats.completed} />
        <StatCard className="flex-1" label="Avg %" value={stats.avg} />
      </View>

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
    </View>
  );

  return (
    <Screen padded={false}>
      <AppHeader
        title="Projects"
        subtitle={`${stats.total} project${stats.total !== 1 ? 's' : ''} · ${stats.completed} completed`}
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={40} color="#3B82F6" />}
          title="No projects yet"
          subtitle="Create your first project or import from Excel."
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
            <ProjectCard
              project={item}
              onPress={() => setDetail(item)}
              onEdit={() => openEdit(item)}
              onDelete={() => onDelete(item)}
            />
          )}
        />
      )}

      <Fab onPress={openAdd} />

      <ProjectFormModal
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />

      <ProjectDetailModal
        project={detail}
        onClose={() => setDetail(null)}
        onEdit={(p) => { setDetail(null); openEdit(p); }}
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
      className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-midnight-light border border-hairline active:opacity-70 ${disabled ? 'opacity-50' : ''}`}
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
      className={`flex-row items-center mr-2 px-3 py-2 rounded-full border active:opacity-70 ${active ? 'bg-accent border-accent' : 'bg-midnight-light border-hairline'}`}
    >
      {icon ? <View className="mr-1.5">{icon}</View> : null}
      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{label}</Text>
    </Pressable>
  );
}

function ProjectCard({ project, onPress, onEdit, onDelete }: { project: Project; onPress: () => void; onEdit: () => void; onDelete: () => void }) {
  const meta = getCategoryMeta(project.category);
  const lastCheckIn = project.teamCheckIns?.[project.teamCheckIns.length - 1];
  const phaseCount = project.implementationPlan?.phases?.length ?? 0;
  const donePhases = project.implementationPlan?.phases?.filter((p) => p.status === 'Completed').length ?? 0;
  const openRisks = project.risks?.filter((r) => r.status === 'Open').length ?? 0;

  return (
    <Card onPress={onPress}>
      <View className="flex-row items-start">
        <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: meta.color + '22' }}>
          <meta.Icon size={20} color={meta.color} />
        </View>
        <View className="flex-1">
          {project.category ? (
            <Text className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: meta.color }}>
              {project.category}
            </Text>
          ) : null}
          <Text className="text-ink text-base font-semibold" numberOfLines={1}>{project.title}</Text>
        </View>
        <View className="flex-row items-center ml-2">
          <Pressable onPress={onEdit} hitSlop={8} className="p-1.5 active:opacity-60">
            <Pencil size={17} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} className="p-1.5 active:opacity-60">
            <Trash2 size={17} color="#9ca3af" />
          </Pressable>
        </View>
      </View>

      {project.description ? (
        <Text className="text-ink-muted text-sm mt-2" numberOfLines={2}>{project.description}</Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2 mt-3">
        <Badge label={project.status} tone={STATUS_TONE[project.status]} />
        {project.healthStatus ? <Badge label={project.healthStatus} tone={HEALTH_TONE[project.healthStatus]} /> : null}
        {project.priority ? <Badge label={project.priority} tone={PRIORITY_TONE[project.priority]} /> : null}
      </View>

      {project.deadline ? (
        <View className="flex-row items-center mt-3">
          <Calendar size={13} color="#9ca3af" />
          <Text className="text-ink-muted text-xs ml-1.5">Deadline: {formatDate(project.deadline)}</Text>
        </View>
      ) : null}

      {(project.team?.length || lastCheckIn || phaseCount || openRisks) ? (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
          {project.team && project.team.length > 0 ? (
            <MetaRow icon={<Users size={12} color="#9ca3af" />} text={`${project.team.length} member${project.team.length > 1 ? 's' : ''}`} />
          ) : null}
          {lastCheckIn ? (
            <MetaRow icon={<MessageSquare size={12} color="#9ca3af" />} text={`Check-in ${formatDate(lastCheckIn.date)}`} />
          ) : null}
          {phaseCount ? (
            <MetaRow icon={<Layers size={12} color="#818cf8" />} text={`${donePhases}/${phaseCount} phases`} />
          ) : null}
          {openRisks ? (
            <MetaRow icon={<TriangleAlert size={12} color="#fb923c" />} text={`${openRisks} open risk${openRisks !== 1 ? 's' : ''}`} />
          ) : null}
        </View>
      ) : null}

      <View className="mt-3">
        <View className="flex-row justify-between mb-1">
          <Text className="text-ink-muted text-xs">Progress</Text>
          <Text className="text-ink-muted text-xs">{project.progress ?? 0}%</Text>
        </View>
        <ProgressBar value={project.progress ?? 0} tone={(project.progress ?? 0) >= 100 ? 'green' : 'accent'} />
      </View>

      {project.tags && project.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5 mt-3 pt-3 border-t border-hairline">
          {project.tags.slice(0, 6).map((t) => (
            <View key={t} className="px-2 py-0.5 rounded bg-midnight-lighter">
              <Text className="text-ink-muted text-[10px] uppercase tracking-wider">{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View className="flex-row items-center">
      {icon}
      <Text className="text-ink-muted text-xs ml-1">{text}</Text>
    </View>
  );
}

// ---------------- form modal ----------------

function ProjectFormModal({
  visible, initial, onCancel, onSave,
}: {
  visible: boolean;
  initial: Project | null;
  onCancel: () => void;
  onSave: (f: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [lastVisible, setLastVisible] = useState(false);

  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) setForm(initial ? formFromProject(initial) : emptyForm());
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const categoryOptions = [
    { label: 'No category', value: '' },
    ...CATEGORY_META.map((m) => ({ label: m.label, value: m.value })),
  ];

  const save = () => {
    if (!form.title.trim()) return;
    onSave(form);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-midnight rounded-t-3xl border-t border-hairline" style={{ maxHeight: '92%' }}>
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <Text className="text-ink text-lg font-bold">{initial ? 'Edit project' : 'New project'}</Text>
            <Pressable onPress={onCancel} hitSlop={8} className="p-1 active:opacity-60">
              <X size={22} color="#9ca3af" />
            </Pressable>
          </View>

          <ScrollView className="px-5" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Input label="Title *" placeholder="Project title" value={form.title} onChangeText={(v) => set('title', v)} className="mb-3" />
            <TextArea label="Description" placeholder="What is this project about?" value={form.description} onChangeText={(v) => set('description', v)} minHeight={70} className="mb-3" />

            <View className="flex-row gap-3 mb-3">
              <Select<Status> label="Status" value={form.status} onChange={(v) => set('status', v)} options={STATUSES.map((s) => ({ label: s, value: s }))} className="flex-1" />
              <Select<Priority> label="Priority" value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITIES.map((p) => ({ label: p, value: p }))} className="flex-1" />
            </View>

            <Select<string>
              label="Category"
              value={form.category}
              onChange={(v) => set('category', v as ProjectCategory | '')}
              options={categoryOptions}
              className="mb-3"
            />

            <Select<Health> label="Health" value={form.healthStatus} onChange={(v) => set('healthStatus', v)} options={HEALTHS.map((h) => ({ label: h, value: h }))} className="mb-3" />

            <View className="mb-3">
              <SliderField label="Progress" value={form.progress} onChange={(v) => set('progress', v)} />
            </View>

            <View className="flex-row gap-3 mb-3">
              <View className="flex-1">
                <DateField label="Start date" value={form.startDate} onChange={(v) => set('startDate', v)} placeholder="Start" />
              </View>
              <View className="flex-1">
                <DateField label="Deadline" value={form.deadline} onChange={(v) => set('deadline', v)} placeholder="Deadline" />
              </View>
            </View>

            <Input label="Project manager" placeholder="e.g. John Smith" value={form.projectManager} onChangeText={(v) => set('projectManager', v)} className="mb-3" />
            <Input label="Team members (comma-separated)" placeholder="Alice, Bob, Charlie" value={form.team} onChangeText={(v) => set('team', v)} className="mb-3" />
            <Input label="Stakeholders (comma-separated)" placeholder="CEO, CTO" value={form.stakeholders} onChangeText={(v) => set('stakeholders', v)} className="mb-3" />
            <Input label="Tags (comma-separated)" placeholder="react, api, mobile" value={form.tags} onChangeText={(v) => set('tags', v)} className="mb-3" />
            <Input label="Reporting structure" placeholder="Reports to: …" value={form.reportingStructure} onChangeText={(v) => set('reportingStructure', v)} className="mb-3" />
            <TextArea label="Notes" placeholder="Additional notes…" value={form.notes} onChangeText={(v) => set('notes', v)} minHeight={60} className="mb-4" />
          </ScrollView>

          <View className="flex-row gap-3 px-5 pt-3 pb-8 border-t border-hairline">
            <Pressable onPress={onCancel} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80">
              <Text className="text-ink font-semibold">Cancel</Text>
            </Pressable>
            <Pressable onPress={save} className={`flex-1 items-center py-3.5 rounded-full bg-accent active:bg-accent-hover ${form.title.trim() ? '' : 'opacity-50'}`}>
              <Text className="text-white font-bold">{initial ? 'Save' : 'Create'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------- detail modal ----------------

function ProjectDetailModal({ project, onClose, onEdit }: { project: Project | null; onClose: () => void; onEdit: (p: Project) => void }) {
  if (!project) return null;
  const meta = getCategoryMeta(project.category);
  const budgetPct = project.totalBudget && project.totalBudget > 0
    ? Math.round(((project.budgetUsed || 0) / project.totalBudget) * 100)
    : null;

  return (
    <Modal visible={!!project} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-midnight rounded-t-3xl border-t border-hairline" style={{ maxHeight: '90%' }}>
          <View className="flex-row items-center px-5 pt-5 pb-3">
            <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: meta.color + '22' }}>
              <meta.Icon size={20} color={meta.color} />
            </View>
            <Text className="text-ink text-lg font-bold flex-1" numberOfLines={2}>{project.title}</Text>
            <Pressable onPress={onClose} hitSlop={8} className="p-1 active:opacity-60">
              <X size={22} color="#9ca3af" />
            </Pressable>
          </View>

          <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap gap-2 mb-4">
              <Badge label={project.status} tone={STATUS_TONE[project.status]} />
              {project.healthStatus ? <Badge label={project.healthStatus} tone={HEALTH_TONE[project.healthStatus]} /> : null}
              {project.priority ? <Badge label={project.priority} tone={PRIORITY_TONE[project.priority]} /> : null}
              {project.category ? <Badge label={project.category} tone="muted" /> : null}
            </View>

            {project.description ? <Text className="text-ink text-sm mb-4 leading-5">{project.description}</Text> : null}

            <View className="mb-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-ink-muted text-xs">Progress</Text>
                <Text className="text-ink text-xs font-semibold">{project.progress ?? 0}%</Text>
              </View>
              <ProgressBar value={project.progress ?? 0} tone={(project.progress ?? 0) >= 100 ? 'green' : 'accent'} />
            </View>

            <DetailRow icon={<Calendar size={14} color="#9ca3af" />} label="Start" value={formatDate(project.startDate)} />
            <DetailRow icon={<Calendar size={14} color="#9ca3af" />} label="Deadline" value={formatDate(project.deadline)} />
            <DetailRow icon={<User size={14} color="#9ca3af" />} label="Manager" value={project.projectManager} />
            <DetailRow icon={<Users size={14} color="#9ca3af" />} label="Team" value={listToCsv(project.team) || null} />
            <DetailRow icon={<Compass size={14} color="#9ca3af" />} label="Stakeholders" value={listToCsv(project.stakeholders) || null} />
            <DetailRow icon={<FileText size={14} color="#9ca3af" />} label="Reporting" value={project.reportingStructure} />
            {budgetPct !== null ? (
              <DetailRow icon={<Wallet size={14} color="#9ca3af" />} label="Budget used" value={`${budgetPct}%`} />
            ) : null}

            {project.tags && project.tags.length > 0 ? (
              <View className="mt-1 mb-3">
                <Text className="text-ink-muted text-xs mb-1.5">Tags</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {project.tags.map((t) => (
                    <View key={t} className="px-2 py-1 rounded bg-midnight-lighter">
                      <Text className="text-ink-muted text-[10px] uppercase tracking-wider">{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {project.notes ? (
              <View className="mb-3">
                <Text className="text-ink-muted text-xs mb-1">Notes</Text>
                <Text className="text-ink text-sm leading-5">{project.notes}</Text>
              </View>
            ) : null}

            {/* Read-only summary of advanced sub-entities (managed on web). */}
            {(project.implementationPlan?.phases?.length || project.risks?.length || project.resources?.length || project.performanceMetrics?.length || project.teamCheckIns?.length || project.alignments?.length) ? (
              <View className="mt-1 mb-2 p-3 rounded-2xl bg-midnight-light border border-hairline">
                <Text className="text-ink-muted text-xs mb-2">Advanced (view-only here)</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                  {project.implementationPlan?.phases?.length ? <MetaRow icon={<Layers size={12} color="#818cf8" />} text={`${project.implementationPlan.phases.length} phases`} /> : null}
                  {project.risks?.length ? <MetaRow icon={<TriangleAlert size={12} color="#fb923c" />} text={`${project.risks.length} risks`} /> : null}
                  {project.resources?.length ? <MetaRow icon={<Wallet size={12} color="#34d399" />} text={`${project.resources.length} resources`} /> : null}
                  {project.performanceMetrics?.length ? <MetaRow icon={<ChartColumn size={12} color="#22d3ee" />} text={`${project.performanceMetrics.length} metrics`} /> : null}
                  {project.teamCheckIns?.length ? <MetaRow icon={<MessageSquare size={12} color="#9ca3af" />} text={`${project.teamCheckIns.length} check-ins`} /> : null}
                  {project.alignments?.length ? <MetaRow icon={<Compass size={12} color="#c084fc" />} text={`${project.alignments.length} alignments`} /> : null}
                </View>
              </View>
            ) : null}

            <View className="h-3" />
          </ScrollView>

          <View className="flex-row gap-3 px-5 pt-3 pb-8 border-t border-hairline">
            <Pressable onPress={onClose} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80">
              <Text className="text-ink font-semibold">Close</Text>
            </Pressable>
            <Pressable onPress={() => onEdit(project)} className="flex-1 flex-row justify-center items-center py-3.5 rounded-full bg-accent active:bg-accent-hover">
              <Pencil size={16} color="#fff" />
              <Text className="text-white font-bold ml-2">Edit</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row items-start mb-2.5">
      <View className="mt-0.5 mr-2">{icon}</View>
      <Text className="text-ink-muted text-xs w-24">{label}</Text>
      <Text className="text-ink text-sm flex-1">{value}</Text>
    </View>
  );
}
