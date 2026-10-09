import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Keyboard,
  Linking,
  TextInput,
} from 'react-native';
import {
  Plus,
  ExternalLink,
  Pencil,
  Trash2,
  Calendar,
  Briefcase,
  GraduationCap,
  FileText,
  Check,
  Clock,
  CircleX,
  Send,
  FolderOpen,
  Award,
  Search,
  Bell,
  Tag as TagIcon,
  Users,
  ListChecks,
  CircleDollarSign,
  Hash,
  Building2,
  ChevronDown,
  ChevronRight,
  X,
  MoreHorizontal,
  ListPlus,
  Flag,
} from 'lucide-react-native';
import type { Application, ApplicationContact, ApplicationRequirement, Workspace } from '@clearmind/shared';
import {
  AppType,
  AppStatus,
  AppPriority,
  APPLICATION_TYPES,
  APPLICATION_STATUSES,
  APPLICATION_PRIORITIES,
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_COLOR,
  priorityValue,
  showGrantFields,
  showFunderField,
  applicationDeadline,
  isReminderEligible,
  isDeadlineSoon,
  relativeDeadline,
  REMINDER_PRESETS,
  reminderPresetKey,
  reminderDaysForKey,
  DEFAULT_REMINDER_LEAD_DAYS,
} from '@clearmind/shared/applications';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { getFlag } from '../../lib/flags';
import { scheduleReminder, cancelReminder, toDateTime } from '../../services/notifications';
import { workspaceService } from '../../services/workspaceService';
import { isFirebaseConfigured } from '../../lib/firebase';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen,
  AppHeader,
  Card,
  Input,
  TextArea,
  Select,
  DateField,
  Fab,
  EmptyState,
  Spinner,
  confirmDialog,
  useToast,
  FormSheet,
  Sheet,
  ActionMenu,
  IconButton,
  type MenuAction,
} from '../../components/ui';
import { WorkspaceBar, WorkspaceBanner, NewWorkspaceModal, MembersModal } from '../../components/ui/WorkspaceShare';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { T } from '../../lib/theme';

// Applications fire reminders at multiple lead times, so we persist an ARRAY of
// scheduled notification ids (vs Tasks' single reminderId) to cancel/reschedule.
// reminderIds is mobile-local — it rides the JSON blob to web where it's ignored.
type MApplication = Application & { reminderIds?: string[]; __wsId?: string };

// Strip the view-only origin tag before persisting to storage.
const stripWs = (a: MApplication): MApplication => {
  const { __wsId, ...rest } = a;
  return rest as MApplication;
};

type TypeFilter = 'all' | AppType;
type StatusFilter = 'all' | AppStatus;
type SortKey = 'deadline' | 'priority' | 'created' | 'name';
type GroupKey = 'none' | 'type' | 'status' | 'priority';

// ---- Icon maps (icons can't live in the platform-agnostic shared core) ----
const TYPE_ICON: Record<AppType, any> = {
  job: Briefcase,
  grant: GraduationCap,
  scholarship: Award,
  other: FileText,
};
const STATUS_ICON: Record<AppStatus, any> = {
  draft: FileText,
  open: FolderOpen,
  submitted: Send,
  closed: Clock,
  accepted: Check,
  rejected: CircleX,
};
const PRIORITY_COLOR: Record<AppPriority, string> = {
  High: '#f87171',
  Medium: '#fbbf24',
  Low: '#34d399',
};

const fmtDate = (s?: string): string | null => {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
};

const withAlpha = (hex: string, alpha: string) => `${hex}${alpha}`;

/** Open a follow-up sheet once the action menu has dismissed (same pattern as the task menu). */
const afterMenu = (fn: () => void) => setTimeout(fn, 250);

/** A deadline as a local YYYY-MM-DD for Quick Add's dueDate. */
const deadlineDay = (deadline?: string): string | undefined => {
  if (!deadline) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return deadline;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ---- Reminder scheduling (schedule-on-write, mirrors tasks.tsx) ----
const cancelReminders = async (ids?: string[]): Promise<void> => {
  for (const id of ids ?? []) await cancelReminder(id);
};

const scheduleDeadlineReminders = async (app: MApplication): Promise<string[]> => {
  if (!getFlag('reminders') || !isReminderEligible(app)) return [];
  const deadline = applicationDeadline(app);
  if (!deadline) return [];
  const leadDays = Array.isArray(app.reminderLeadDays) ? app.reminderLeadDays : DEFAULT_REMINDER_LEAD_DAYS;
  const ids: string[] = [];
  for (const days of leadDays) {
    const when = toDateTime(deadline); // 9am on the deadline day
    if (!when) continue;
    when.setDate(when.getDate() - days);
    const body = `${app.name} — due in ${days} day${days > 1 ? 's' : ''}`;
    const id = await scheduleReminder('Application deadline', body, when); // no-ops for past times
    if (id) ids.push(id);
  }
  return ids;
};

// Flattened FlatList rows (supports optional grouping while staying a FlatList).
type Row =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'item'; key: string; app: MApplication };

export default function ApplicationsScreen() {
  const personal = useCollection<MApplication>(STORES.APPLICATIONS);
  const toast = useToast();
  const ui = useTaskUI();

  // Collaboration: shared workspaces (null active = personal local-first list).
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [wsItems, setWsItems] = useState<MApplication[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const activeWorkspace = activeWsId ? workspaces.find((w) => w.id === activeWsId) ?? null : null;

  useEffect(() => {
    if (!workspaceService.supported()) return;
    return workspaceService.subscribe(setWorkspaces);
  }, []);

  // Live subscription to the active workspace's applications. Items are tagged with
  // their origin (__wsId) so writes route correctly even if the selection changes.
  // NOTE: we deliberately do NOT auto-reset activeWsId from the async workspaces list
  // — that raced with create/join and silently dropped you to the personal list
  // (deleting a "shared" item then hit personal). Access loss is handled by onError.
  useEffect(() => {
    if (!activeWsId) return;
    const wsId = activeWsId;
    setWsLoading(true);
    return workspaceService.subscribeApplications(
      wsId,
      (apps) => {
        setWsItems(apps.map((a) => ({ ...a, __wsId: wsId })) as MApplication[]);
        setWsLoading(false);
      },
      () => {
        setActiveWsId(null);
        toast.show('That shared workspace is no longer available', 'info');
      }
    );
  }, [activeWsId]);

  const items = activeWsId ? wsItems : personal.items;
  const loading = activeWsId ? wsLoading : personal.loading;

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('deadline');
  const [groupBy, setGroupBy] = useState<GroupKey>('none');
  const [query, setQuery] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MApplication | null>(null);
  const [statusPickerFor, setStatusPickerFor] = useState<MApplication | null>(null);
  const [menuFor, setMenuFor] = useState<MApplication | null>(null);
  const [reqMenuFor, setReqMenuFor] = useState<MApplication | null>(null);

  const processed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((app) => {
      if (typeFilter !== 'all' && app.type !== typeFilter) return false;
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      if (q) {
        const hay = [app.name, app.organization, app.funder, app.referenceNumber, app.notes, ...(app.tags || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'deadline': {
          const da = applicationDeadline(a) ? new Date(applicationDeadline(a)!).getTime() : Infinity;
          const db = applicationDeadline(b) ? new Date(applicationDeadline(b)!).getTime() : Infinity;
          return da - db;
        }
        case 'priority':
          return priorityValue(b.priority) - priorityValue(a.priority);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return filtered;
  }, [items, typeFilter, statusFilter, query, sortBy]);

  const rows = useMemo<Row[]>(() => {
    if (groupBy === 'none') {
      return processed.map((app) => ({ kind: 'item', key: `i:${app.id}`, app }));
    }
    const groups = new Map<string, MApplication[]>();
    for (const app of processed) {
      let key: string;
      switch (groupBy) {
        case 'type':
          key = app.type.charAt(0).toUpperCase() + app.type.slice(1);
          break;
        case 'status':
          key = STATUS_LABEL[app.status] ?? app.status;
          break;
        case 'priority':
          key = `${app.priority || 'Medium'} Priority`;
          break;
        default:
          key = 'Other';
      }
      const bucket = groups.get(key);
      if (bucket) bucket.push(app);
      else groups.set(key, [app]);
    }
    const out: Row[] = [];
    for (const [title, apps] of groups) {
      out.push({ kind: 'header', key: `h:${title}`, title, count: apps.length });
      for (const app of apps) out.push({ kind: 'item', key: `i:${app.id}`, app });
    }
    return out;
  }, [processed, groupBy]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (app: MApplication) => {
    setEditing(app);
    setFormOpen(true);
  };

  const onDelete = async (app: MApplication) => {
    if (
      await confirmDialog({
        title: 'Delete application',
        message: `Delete “${app.name}”?`,
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      try {
        if (app.__wsId) {
          await workspaceService.deleteApplication(app.__wsId, app.id);
        } else {
          await cancelReminders(app.reminderIds);
          personal.remove(app.id);
        }
        toast.show('Application deleted', 'info');
      } catch {
        toast.show('Could not delete — check your connection', 'error');
      }
      return true;
    }
    return false;
  };

  const onOpenLink = (link?: string) => {
    if (!link) return;
    Linking.openURL(link).catch(() => toast.show('Could not open link', 'error'));
  };

  // ---- Task synergy: hand off to Quick Add (the task system owns creation) ----
  const addPrepTask = (app: MApplication) =>
    ui.openQuickAdd({ title: `Prepare: ${app.name}`, dueDate: deadlineDay(applicationDeadline(app)) });
  const requirementToTask = (app: MApplication, req: ApplicationRequirement) =>
    ui.openQuickAdd({ title: `${req.label.trim()} — ${app.name}`, dueDate: deadlineDay(applicationDeadline(app)) });
  const openRequirements = (app: MApplication) => app.requirements?.filter((r) => !r.done && r.label.trim()) ?? [];

  const menuActions = (app: MApplication): MenuAction[] => {
    const open = openRequirements(app);
    const actions: MenuAction[] = [
      { label: 'Edit', icon: <Pencil size={18} color={T.ink} />, onPress: () => afterMenu(() => openEdit(app)) },
      { label: 'Move to stage', icon: <Flag size={18} color={T.ink} />, hint: STATUS_LABEL[app.status] ?? app.status, onPress: () => afterMenu(() => setStatusPickerFor(app)) },
      { label: 'Add task', icon: <ListPlus size={18} color={T.ink} />, onPress: () => afterMenu(() => addPrepTask(app)) },
    ];
    if (open.length) {
      actions.push({
        label: 'Turn requirement into task',
        icon: <ListChecks size={18} color={T.ink} />,
        hint: `${open.length} open`,
        onPress: () => afterMenu(() => (open.length === 1 ? requirementToTask(app, open[0]) : setReqMenuFor(app))),
      });
    }
    if (app.link) actions.push({ label: 'Open application link', icon: <ExternalLink size={18} color={T.ink} />, onPress: () => onOpenLink(app.link) });
    actions.push({ label: 'Delete', icon: <Trash2 size={18} color={T.danger} />, destructive: true, onPress: () => { onDelete(app); } });
    return actions;
  };

  // Inline status change (advance through the pipeline without opening the form).
  const changeStatus = async (app: MApplication, status: AppStatus) => {
    setStatusPickerFor(null);
    if (app.status === status) return;
    const now = new Date().toISOString();
    if (app.__wsId) {
      await workspaceService.putApplication(app.__wsId, stripWs({ ...app, status, updatedAt: now }));
      return;
    }
    await cancelReminders(app.reminderIds);
    const base: MApplication = { ...app, status, updatedAt: now };
    const reminderIds = await scheduleDeadlineReminders(base);
    personal.update({ ...base, reminderIds });
  };

  const handleSave = async (data: FormValues) => {
    // Close + dismiss the keyboard FIRST so the action feels instant and the
    // (rare) permission prompt never blocks the sheet from dismissing.
    Keyboard.dismiss();
    setFormOpen(false);

    const now = new Date().toISOString();
    const fields = {
      name: data.name,
      organization: data.organization || undefined,
      link: data.link || undefined,
      type: data.type,
      status: data.status,
      priority: data.priority,
      openingDate: data.openingDate,
      closingDate: data.closingDate,
      submissionDeadline: data.submissionDeadline,
      submittedDate: data.submittedDate,
      notes: data.notes || undefined,
      funder: showFunderField(data.type) ? data.funder || undefined : undefined,
      awardAmount: showGrantFields(data.type) ? data.awardAmount || undefined : undefined,
      referenceNumber: showGrantFields(data.type) ? data.referenceNumber || undefined : undefined,
      reminderLeadDays: data.reminderLeadDays,
      tags: data.tags.length ? data.tags : undefined,
      contacts: data.contacts.length ? data.contacts : undefined,
      requirements: data.requirements.length ? data.requirements : undefined,
    };

    // Route by the item's origin (edits) / the active workspace (new) — never an
    // ambiguous selection, so a shared-workspace save can't land in the personal list.
    const target = editing ? editing.__wsId ?? null : activeWsId;
    try {
      if (target) {
        // Shared workspace: live Firestore, no per-device reminders.
        const base: MApplication = editing
          ? { ...editing, ...fields, updatedAt: now }
          : { id: newId(), ...fields, createdAt: now };
        await workspaceService.putApplication(target, stripWs(base));
        toast.show(editing ? 'Application updated' : 'Application added', 'success');
      } else if (editing) {
        await cancelReminders(editing.reminderIds);
        const base: MApplication = { ...editing, ...fields, updatedAt: now };
        const reminderIds = await scheduleDeadlineReminders(base);
        personal.update({ ...base, reminderIds });
        toast.show(reminderIds.length ? 'Application updated · reminder set' : 'Application updated', 'success');
      } else {
        const base: MApplication = { id: newId(), ...fields, createdAt: now };
        const reminderIds = await scheduleDeadlineReminders(base);
        personal.create({ ...base, reminderIds });
        toast.show(reminderIds.length ? 'Application added · reminder set' : 'Application added', 'success');
      }
    } catch {
      toast.show('Could not save — check your connection', 'error');
    }
  };

  // ---- Workspace (collaboration) actions ----
  const handleCreateWorkspace = async (name: string, emails: string[], seed: boolean) => {
    // Fresh ids so the shared copies are fully independent of the personal list.
    const seedApps = seed ? personal.items.map(({ reminderIds, ...a }) => ({ ...a, id: newId() })) : [];
    const ws = await workspaceService.create(name, emails, seedApps);
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
    const ok = await confirmDialog({
      title: 'Delete workspace',
      message: `Delete “${activeWorkspace.name}” for everyone? This cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const id = activeWorkspace.id;
    setActiveWsId(null);
    setShowMembers(false);
    await workspaceService.remove(id);
    toast.show('Workspace deleted', 'info');
  };

  const showWorkspaceBar = isFirebaseConfigured() && (workspaces.length > 0 || workspaceService.supported());

  if (loading) return <Spinner label="Loading applications…" />;

  const Controls = (
    <View className="px-4 pt-4 pb-2">
      {/* Search */}
      <View className="flex-row items-center bg-midnight-light rounded-2xl px-3 mb-3 border border-line">
        <Search size={16} color={T.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, organization, funder, tags…"
          placeholderTextColor={T.faint}
          className="flex-1 text-ink text-base px-2 py-3"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <X size={16} color={T.muted} />
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <Select<TypeFilter>
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          className="w-[47%]"
          options={[{ label: 'All Types', value: 'all' }, ...APPLICATION_TYPES.map((t) => ({ label: t.label, value: t.value }))]}
        />
        <Select<StatusFilter>
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-[47%]"
          options={[{ label: 'All Statuses', value: 'all' }, ...APPLICATION_STATUSES.map((s) => ({ label: s.label, value: s.value }))]}
        />
        <Select<SortKey>
          label="Sort by"
          value={sortBy}
          onChange={setSortBy}
          className="w-[47%]"
          options={[
            { label: 'Deadline', value: 'deadline' },
            { label: 'Priority', value: 'priority' },
            { label: 'Created Date', value: 'created' },
            { label: 'Name', value: 'name' },
          ]}
        />
        <Select<GroupKey>
          label="Group by (stages)"
          value={groupBy}
          onChange={setGroupBy}
          className="w-[47%]"
          options={[
            { label: 'No Grouping', value: 'none' },
            { label: 'By Stage (status)', value: 'status' },
            { label: 'By Type', value: 'type' },
            { label: 'By Priority', value: 'priority' },
          ]}
        />
      </View>
      <Text className="text-ink-muted text-xs mt-3 ml-1">
        {processed.length} application{processed.length !== 1 ? 's' : ''}
      </Text>
    </View>
  );

  return (
    <Screen padded={false}>
      <AppHeader
        title="Applications"
        subtitle={activeWorkspace ? `${activeWorkspace.name} · shared workspace` : 'Track your job, grant, and scholarship applications.'}
      />

      {showWorkspaceBar ? (
        <WorkspaceBar
          workspaces={workspaces}
          activeWsId={activeWsId}
          personalLabel="My Applications"
          onSelect={setActiveWsId}
          onShareNew={() => setShowNewWorkspace(true)}
        />
      ) : null}

      {activeWorkspace ? (
        <WorkspaceBanner workspace={activeWorkspace} isOwner={workspaceService.isOwner(activeWorkspace)} onMembers={() => setShowMembers(true)} />
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={34} color={T.accent} />}
          title={activeWsId ? 'No applications here yet' : 'No applications yet'}
          subtitle={activeWsId ? 'Add the first application to this shared workspace.' : 'Add your first application to track jobs, grants, and scholarships.'}
          ctaTitle="New Application"
          onCta={openAdd}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          ListHeaderComponent={Controls}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
          ListEmptyComponent={
            <EmptyState
              fill={false}
              icon={<Search size={34} color={T.muted} />}
              title="No matches"
              subtitle="No applications match your filters."
            />
          }
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <View className="flex-row items-center mt-5 mb-2">
                <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: STATUS_COLOR[item.title.toLowerCase() as AppStatus] ?? T.accent }} />
                <Text className="text-ink text-base font-semibold">{item.title}</Text>
                <Text className="text-ink-muted text-xs ml-2">({item.count})</Text>
              </View>
            ) : (
              <View className="mb-3">
                <ApplicationCard
                  app={item.app}
                  onEdit={() => openEdit(item.app)}
                  onMenu={() => setMenuFor(item.app)}
                  onOpenLink={() => onOpenLink(item.app.link)}
                  onStatusPress={() => setStatusPickerFor(item.app)}
                />
              </View>
            )
          }
        />
      )}

      <Fab onPress={openAdd} label="New application" />

      <ApplicationFormModal
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
        onDelete={editing ? async () => { if (await onDelete(editing)) setFormOpen(false); } : undefined}
      />

      <ActionMenu
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor?.name}
        actions={menuFor ? menuActions(menuFor) : []}
      />

      <ActionMenu
        visible={!!reqMenuFor}
        onClose={() => setReqMenuFor(null)}
        title="Turn requirement into task"
        actions={reqMenuFor ? openRequirements(reqMenuFor).map((r) => ({
          label: r.label.trim(),
          icon: <ListPlus size={18} color={T.ink} />,
          onPress: () => afterMenu(() => requirementToTask(reqMenuFor, r)),
        })) : []}
      />

      <StatusPickerModal
        app={statusPickerFor}
        onCancel={() => setStatusPickerFor(null)}
        onPick={(s) => statusPickerFor && changeStatus(statusPickerFor, s)}
      />

      <NewWorkspaceModal
        visible={showNewWorkspace}
        supported={workspaceService.supported()}
        seedCount={personal.items.length}
        seedNoun="application"
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

function StatusPill({ status, onPress }: { status: AppStatus; onPress?: () => void }) {
  const color = STATUS_COLOR[status] ?? T.muted;
  const label = STATUS_LABEL[status] ?? status;
  const Icon = STATUS_ICON[status] ?? FileText;
  const body = (
    <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: withAlpha(color, '26') }}>
      <Icon size={12} color={color} />
      <Text className="text-xs font-semibold ml-1" style={{ color }}>
        {label}
      </Text>
      {onPress ? <ChevronDown size={12} color={color} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={6} className="active:opacity-70" accessibilityRole="button" accessibilityLabel={`Stage: ${label}. Change stage`}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

function PriorityPill({ priority }: { priority: AppPriority }) {
  const color = PRIORITY_COLOR[priority] ?? T.muted;
  return (
    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: withAlpha(color, '26') }}>
      <Text className="text-xs font-semibold" style={{ color }}>
        {priority}
      </Text>
    </View>
  );
}

function ApplicationCard({
  app,
  onEdit,
  onMenu,
  onOpenLink,
  onStatusPress,
}: {
  app: MApplication;
  onEdit: () => void;
  onMenu: () => void;
  onOpenLink: () => void;
  onStatusPress: () => void;
}) {
  const TypeIcon = TYPE_ICON[app.type] ?? FileText;
  const typeColor = TYPE_COLOR[app.type] ?? T.muted;
  const deadline = applicationDeadline(app);
  const soon = isDeadlineSoon(deadline);
  const armed = isReminderEligible(app) && (!Array.isArray(app.reminderLeadDays) || app.reminderLeadDays.length > 0);
  const reqDone = app.requirements?.filter((r) => r.done).length ?? 0;
  const reqTotal = app.requirements?.length ?? 0;

  return (
    <Pressable onPress={onEdit} onLongPress={onMenu} delayLongPress={300} accessibilityRole="button" accessibilityLabel={`Edit ${app.name}`} accessibilityHint="Long-press for more actions">
    <Card>
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center">
          <TypeIcon size={16} color={typeColor} />
          <Text className="text-ink-muted text-xs uppercase ml-1.5" style={{ letterSpacing: 1 }}>
            {app.type}
          </Text>
          {armed ? <Bell size={12} color={T.accent} style={{ marginLeft: 6 }} /> : null}
        </View>
        <View className="-mr-2 -mt-2">
          <IconButton onPress={onMenu} label={`Actions for ${app.name}`}>
            <MoreHorizontal size={18} color={T.muted} />
          </IconButton>
        </View>
      </View>

      <Text className="text-ink text-base font-semibold mt-2">{app.name}</Text>
      {app.organization ? <Text className="text-ink-muted text-sm mt-0.5">{app.organization}</Text> : null}
      {app.funder ? (
        <View className="flex-row items-center mt-1">
          <Building2 size={11} color={T.muted} />
          <Text className="text-ink-muted text-xs ml-1">Funder: {app.funder}</Text>
        </View>
      ) : null}

      <View className="flex-row items-center flex-wrap mt-3" style={{ gap: 8 }}>
        <StatusPill status={app.status} onPress={onStatusPress} />
        {app.priority ? <PriorityPill priority={app.priority} /> : null}
        {app.awardAmount ? (
          <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
            <CircleDollarSign size={11} color="#34d399" />
            <Text className="text-emerald-400 text-xs font-semibold ml-1">{app.awardAmount}</Text>
          </View>
        ) : null}
      </View>

      {app.referenceNumber ? (
        <View className="flex-row items-center mt-2">
          <Hash size={11} color={T.muted} />
          <Text className="text-ink-muted text-xs ml-1">{app.referenceNumber}</Text>
        </View>
      ) : null}

      <View className="mt-3" style={{ gap: 6 }}>
        {deadline ? (
          <View className="flex-row items-center">
            <Calendar size={12} color={soon ? '#f97316' : T.muted} />
            <Text className={`text-xs ml-2 ${soon ? 'text-orange-400' : 'text-ink-muted'}`}>
              Deadline: {fmtDate(deadline)} · {relativeDeadline(deadline)}
            </Text>
          </View>
        ) : null}
        {app.openingDate ? (
          <View className="flex-row items-center">
            <Clock size={12} color={T.muted} />
            <Text className="text-ink-muted text-xs ml-2">Opens: {fmtDate(app.openingDate)}</Text>
          </View>
        ) : null}
        {app.submittedDate ? (
          <View className="flex-row items-center">
            <Send size={12} color="#34d399" />
            <Text className="text-emerald-400 text-xs ml-2">Submitted: {fmtDate(app.submittedDate)}</Text>
          </View>
        ) : null}
      </View>

      {reqTotal > 0 ? (
        <View className="mt-3">
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center">
              <ListChecks size={12} color={T.muted} />
              <Text className="text-ink-muted text-xs ml-1">Requirements</Text>
            </View>
            <Text className="text-ink-muted text-xs">
              {reqDone}/{reqTotal}
            </Text>
          </View>
          <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(148,163,184,0.25)' }}>
            <View className="h-full bg-accent rounded-full" style={{ width: `${reqTotal ? (reqDone / reqTotal) * 100 : 0}%` }} />
          </View>
        </View>
      ) : null}

      {app.tags && app.tags.length > 0 ? (
        <View className="flex-row flex-wrap mt-3" style={{ gap: 6 }}>
          {app.tags.map((t) => (
            <View key={t} className="flex-row items-center rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(148,163,184,0.18)' }}>
              <TagIcon size={9} color={T.muted} />
              <Text className="text-ink-muted text-xs ml-1">{t}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {app.contacts && app.contacts.length > 0 ? (
        <View className="flex-row items-center mt-3">
          <Users size={11} color={T.muted} />
          <Text className="text-ink-muted text-xs ml-1">{app.contacts.map((c) => c.name).join(', ')}</Text>
        </View>
      ) : null}

      {app.notes ? (
        <Text className="text-ink-muted text-sm mt-3" numberOfLines={2}>
          {app.notes}
        </Text>
      ) : null}

      {app.link ? (
        <Pressable onPress={onOpenLink} hitSlop={6} className="flex-row items-center mt-3 active:opacity-60" accessibilityRole="link">
          <ExternalLink size={14} color={T.accent} />
          <Text className="text-accent text-sm ml-2 font-medium">Open Application</Text>
        </Pressable>
      ) : null}
    </Card>
    </Pressable>
  );
}

function StatusPickerModal({
  app,
  onCancel,
  onPick,
}: {
  app: MApplication | null;
  onCancel: () => void;
  onPick: (s: AppStatus) => void;
}) {
  return (
    <Sheet visible={!!app} onClose={onCancel} title="Move to stage" padded={false}>
      {APPLICATION_STATUSES.map((s) => {
        const sel = app?.status === s.value;
        const color = STATUS_COLOR[s.value];
        return (
          <Pressable
            key={s.value}
            onPress={() => onPick(s.value)}
            className="flex-row items-center justify-between px-5 py-3.5 active:bg-midnight-lighter"
            style={{ minHeight: 52 }}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={s.label}
          >
            <View className="flex-row items-center">
              <View className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: color }} />
              <Text className={`text-base ${sel ? 'text-accent font-semibold' : 'text-ink'}`}>{s.label}</Text>
            </View>
            {sel ? <Check size={18} color={T.accent} /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

type FormValues = {
  name: string;
  organization: string;
  link: string;
  type: AppType;
  status: AppStatus;
  priority: AppPriority;
  openingDate?: string;
  closingDate?: string;
  submissionDeadline?: string;
  submittedDate?: string;
  notes: string;
  funder: string;
  awardAmount: string;
  referenceNumber: string;
  reminderLeadDays: number[];
  tags: string[];
  contacts: ApplicationContact[];
  requirements: ApplicationRequirement[];
};

function ApplicationFormModal({
  visible,
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  visible: boolean;
  initial: MApplication | null;
  onCancel: () => void;
  onSave: (values: FormValues) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [link, setLink] = useState('');
  const [type, setType] = useState<AppType>('job');
  const [status, setStatus] = useState<AppStatus>('draft');
  const [priority, setPriority] = useState<AppPriority>('Medium');
  const [openingDate, setOpeningDate] = useState<string | undefined>(undefined);
  const [closingDate, setClosingDate] = useState<string | undefined>(undefined);
  const [submissionDeadline, setSubmissionDeadline] = useState<string | undefined>(undefined);
  const [submittedDate, setSubmittedDate] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [funder, setFunder] = useState('');
  const [awardAmount, setAwardAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [reminderLeadDays, setReminderLeadDays] = useState<number[]>([...DEFAULT_REMINDER_LEAD_DAYS]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [contacts, setContacts] = useState<ApplicationContact[]>([]);
  const [requirements, setRequirements] = useState<ApplicationRequirement[]>([]);
  const [showMoreDates, setShowMoreDates] = useState(false);

  // Reset fields whenever the modal (re)opens.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setName(initial?.name ?? '');
      setOrganization(initial?.organization ?? '');
      setLink(initial?.link ?? '');
      setType(initial?.type ?? 'job');
      setStatus(initial?.status ?? 'draft');
      setPriority(initial?.priority ?? 'Medium');
      setOpeningDate(initial?.openingDate || undefined);
      setClosingDate(initial?.closingDate || undefined);
      setSubmissionDeadline(initial?.submissionDeadline || undefined);
      setSubmittedDate(initial?.submittedDate || undefined);
      setNotes(initial?.notes ?? '');
      setFunder(initial?.funder ?? '');
      setAwardAmount(initial?.awardAmount ?? '');
      setReferenceNumber(initial?.referenceNumber ?? '');
      setReminderLeadDays(initial?.reminderLeadDays ?? [...DEFAULT_REMINDER_LEAD_DAYS]);
      setTags(initial?.tags ? [...initial.tags] : []);
      setTagDraft('');
      setContacts(initial?.contacts ? initial.contacts.map((c) => ({ ...c })) : []);
      setRequirements(initial?.requirements ? initial.requirements.map((r) => ({ ...r })) : []);
      setShowMoreDates(!!(initial?.closingDate || initial?.submittedDate || (initial?.type !== 'grant' && initial?.openingDate)));
    }
  }

  const grant = showGrantFields(type);
  const funderShown = showFunderField(type);
  const hasDeadline = !!(submissionDeadline || closingDate);

  const addTag = () => {
    const t = tagDraft.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagDraft('');
  };

  const save = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      organization: organization.trim(),
      link: link.trim(),
      type,
      status,
      priority,
      openingDate,
      closingDate,
      submissionDeadline,
      submittedDate,
      notes: notes.trim(),
      funder: funder.trim(),
      awardAmount: awardAmount.trim(),
      referenceNumber: referenceNumber.trim(),
      reminderLeadDays,
      tags,
      contacts: contacts.filter((c) => c.name.trim()),
      requirements: requirements.filter((r) => r.label.trim()),
    });
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onCancel}
      title={initial ? 'Edit Application' : 'New Application'}
      submitLabel={initial ? 'Update' : 'Create'}
      onSubmit={save}
      submitDisabled={!name.trim()}
      onDelete={onDelete}
      deleteLabel="Delete application"
      fill
    >
      {/* Identity first */}
      <Input label="Application Name *" placeholder="e.g. Software Engineer at Google" value={name} onChangeText={setName} className="mb-3" />
      <Input label="Organization" placeholder="Company or host organization" value={organization} onChangeText={setOrganization} className="mb-3" />

      <Select<AppType>
        label="Type"
        value={type}
        onChange={setType}
        className="mb-3"
        options={APPLICATION_TYPES.map((t) => ({ label: t.label, value: t.value }))}
      />
      <View className="flex-row mb-3" style={{ gap: 12 }}>
        <Select<AppStatus>
          label="Status"
          value={status}
          onChange={setStatus}
          className="flex-1"
          options={APPLICATION_STATUSES.map((s) => ({ label: s.label, value: s.value }))}
        />
        <Select<AppPriority>
          label="Priority"
          value={priority}
          onChange={setPriority}
          className="flex-1"
          options={APPLICATION_PRIORITIES.map((p) => ({ label: p.label, value: p.value }))}
        />
      </View>

      {/* Grant identity: opening date right under type for grants */}
      {grant ? (
        <View className="mb-3">
          <DateField label="Opening Date" value={openingDate} onChange={setOpeningDate} />
        </View>
      ) : null}

      {/* Type-specific detail block */}
      {grant ? (
        <View className="rounded-2xl border border-line p-3 mb-3" style={{ gap: 12 }}>
          <Text className="text-ink-muted text-xs uppercase">{type === 'grant' ? 'Grant details' : 'Scholarship details'}</Text>
          {funderShown ? (
            <Input label="Funder / Awarding Body" placeholder="e.g. NSF, Gates Foundation" value={funder} onChangeText={setFunder} />
          ) : null}
          <View className="flex-row" style={{ gap: 12 }}>
            <View className="flex-1">
              <Input label="Award Amount" placeholder="$50,000" value={awardAmount} onChangeText={setAwardAmount} />
            </View>
            <View className="flex-1">
              <Input label="Reference No." placeholder="NSF-2026-1187" value={referenceNumber} onChangeText={setReferenceNumber} />
            </View>
          </View>
        </View>
      ) : null}

      <Input label="Application Link" placeholder="https://..." value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" className="mb-3" />

      {/* Deadline + reminder (always visible) */}
      <View className="mb-3">
        <DateField label="Submission Deadline" value={submissionDeadline} onChange={setSubmissionDeadline} />
      </View>
      {hasDeadline ? (
        <Select<string>
          label="Remind me"
          value={reminderPresetKey(reminderLeadDays)}
          onChange={(k) => setReminderLeadDays(reminderDaysForKey(k))}
          className="mb-3"
          options={REMINDER_PRESETS.map((p) => ({ label: p.label, value: p.key }))}
        />
      ) : null}

      {/* More dates (collapsed) */}
      <Pressable onPress={() => setShowMoreDates((v) => !v)} className="flex-row items-center mb-3 active:opacity-70" accessibilityRole="button" accessibilityState={{ expanded: showMoreDates }}>
        {showMoreDates ? <ChevronDown size={16} color={T.accent} /> : <ChevronRight size={16} color={T.accent} />}
        <Text className="text-accent text-sm ml-1">More dates</Text>
      </Pressable>
      {showMoreDates ? (
        <View className="mb-3" style={{ gap: 12 }}>
          {!grant ? <DateField label="Opening Date" value={openingDate} onChange={setOpeningDate} /> : null}
          <DateField label="Closing Date" value={closingDate} onChange={setClosingDate} />
          <DateField label="Submitted Date" value={submittedDate} onChange={setSubmittedDate} />
        </View>
      ) : null}

      {/* Tags */}
      <Text className="text-ink-muted text-xs mb-1.5 ml-1">Tags</Text>
      {tags.length ? (
        <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
          {tags.map((t) => (
            <Pressable key={t} onPress={() => setTags(tags.filter((x) => x !== t))} accessibilityRole="button" accessibilityLabel={`Remove tag ${t}`} className="flex-row items-center rounded-full px-2.5 py-1 active:opacity-70" style={{ backgroundColor: 'rgba(59,130,246,0.18)' }}>
              <Text className="text-accent text-xs mr-1">{t}</Text>
              <X size={11} color={T.accent} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
        <View className="flex-1">
          <Input placeholder="Add a tag" value={tagDraft} onChangeText={setTagDraft} onSubmitEditing={addTag} returnKeyType="done" />
        </View>
        <Pressable onPress={addTag} accessibilityRole="button" accessibilityLabel="Add tag" className="px-4 py-3 rounded-2xl bg-midnight-lighter active:opacity-80">
          <Plus size={18} color={T.ink} />
        </Pressable>
      </View>

      {/* Requirements checklist */}
      <Text className="text-ink-muted text-xs mb-1.5 ml-1">Requirements / Documents</Text>
      <View className="mb-3" style={{ gap: 8 }}>
        {requirements.map((r, i) => (
          <View key={r.id} className="flex-row items-center" style={{ gap: 8 }}>
            <Pressable
              onPress={() => setRequirements(requirements.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
              hitSlop={6}
              className="active:opacity-70"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!r.done }}
              accessibilityLabel={r.label || 'Requirement'}
            >
              {r.done ? <Check size={20} color="#34d399" /> : <View className="w-5 h-5 rounded border border-line" />}
            </Pressable>
            <View className="flex-1">
              <Input placeholder="e.g. CV, cover letter…" value={r.label} onChangeText={(v) => setRequirements(requirements.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
            </View>
            <Pressable onPress={() => setRequirements(requirements.filter((_, j) => j !== i))} hitSlop={6} className="active:opacity-70" accessibilityRole="button" accessibilityLabel="Remove requirement">
              <Trash2 size={16} color={T.muted} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setRequirements([...requirements, { id: newId(), label: '', done: false }])} className="flex-row items-center active:opacity-70" accessibilityRole="button">
          <Plus size={16} color={T.accent} />
          <Text className="text-accent text-sm ml-1">Add requirement</Text>
        </Pressable>
      </View>

      {/* Contacts */}
      <Text className="text-ink-muted text-xs mb-1.5 ml-1">Contacts</Text>
      <View className="mb-3" style={{ gap: 8 }}>
        {contacts.map((c, i) => (
          <View key={c.id} className="flex-row items-center" style={{ gap: 8 }}>
            <View className="flex-1">
              <Input placeholder="Name" value={c.name} onChangeText={(v) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
            </View>
            <View className="flex-1">
              <Input placeholder="Email / role" value={c.email ?? ''} onChangeText={(v) => setContacts(contacts.map((x, j) => (j === i ? { ...x, email: v } : x)))} autoCapitalize="none" />
            </View>
            <Pressable onPress={() => setContacts(contacts.filter((_, j) => j !== i))} hitSlop={6} className="active:opacity-70" accessibilityRole="button" accessibilityLabel="Remove contact">
              <Trash2 size={16} color={T.muted} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setContacts([...contacts, { id: newId(), name: '' }])} className="flex-row items-center active:opacity-70" accessibilityRole="button">
          <Plus size={16} color={T.accent} />
          <Text className="text-accent text-sm ml-1">Add contact</Text>
        </Pressable>
      </View>

      <TextArea label="Notes" placeholder="Additional notes about this application..." value={notes} onChangeText={setNotes} minHeight={90} className="mb-2" />
    </FormSheet>
  );
}
