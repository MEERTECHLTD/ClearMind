import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
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
} from 'lucide-react-native';
import type { Application } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
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
} from '../../components/ui';

type AppType = Application['type'];
type AppStatus = Application['status'];
type Priority = Application['priority'];
type TypeFilter = 'all' | AppType;
type StatusFilter = 'all' | AppStatus;
type SortKey = 'deadline' | 'priority' | 'created' | 'name';
type GroupKey = 'none' | 'type' | 'status' | 'priority';

// ---- Style/icon maps (ported from the web view) ----
const TYPE_META: Record<AppType, { icon: any; color: string }> = {
  job: { icon: Briefcase, color: '#3B82F6' },
  grant: { icon: GraduationCap, color: '#10b981' },
  scholarship: { icon: Award, color: '#a855f7' },
  other: { icon: FileText, color: '#9ca3af' },
};

const STATUS_META: Record<AppStatus, { bg: string; fg: string; icon: any; color: string; label: string }> = {
  draft: { bg: 'bg-gray-500/15', fg: 'text-gray-300', icon: FileText, color: '#9ca3af', label: 'Draft' },
  open: { bg: 'bg-blue-500/15', fg: 'text-blue-400', icon: FolderOpen, color: '#60a5fa', label: 'Open' },
  submitted: { bg: 'bg-purple-500/15', fg: 'text-purple-400', icon: Send, color: '#c084fc', label: 'Submitted' },
  closed: { bg: 'bg-amber-500/15', fg: 'text-amber-400', icon: Clock, color: '#fbbf24', label: 'Closed' },
  accepted: { bg: 'bg-emerald-500/15', fg: 'text-emerald-400', icon: Check, color: '#34d399', label: 'Accepted' },
  rejected: { bg: 'bg-red-500/15', fg: 'text-red-400', icon: CircleX, color: '#f87171', label: 'Rejected' },
};

const PRIORITY_META: Record<Priority, { bg: string; fg: string }> = {
  High: { bg: 'bg-red-500/15', fg: 'text-red-400' },
  Medium: { bg: 'bg-amber-500/15', fg: 'text-amber-400' },
  Low: { bg: 'bg-emerald-500/15', fg: 'text-emerald-400' },
};

const priorityValue = (p?: Priority): number => (p === 'High' ? 3 : p === 'Medium' ? 2 : p === 'Low' ? 1 : 0);

const formatDate = (dateStr?: string): string | null => {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const isDeadlineSoon = (deadline?: string): boolean => {
  if (!deadline) return false;
  const diffDays = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
};

// Flattened FlatList rows (supports optional grouping while staying a FlatList).
type Row =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'item'; key: string; app: Application };

export default function ApplicationsScreen() {
  const { items, loading, create, update, remove } = useCollection<Application>(STORES.APPLICATIONS);
  const toast = useToast();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('deadline');
  const [groupBy, setGroupBy] = useState<GroupKey>('none');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);

  const processed = useMemo(() => {
    const filtered = items.filter((app) => {
      if (typeFilter !== 'all' && app.type !== typeFilter) return false;
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      return true;
    });
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'deadline': {
          const da = a.submissionDeadline ? new Date(a.submissionDeadline).getTime() : Infinity;
          const db = b.submissionDeadline ? new Date(b.submissionDeadline).getTime() : Infinity;
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
  }, [items, typeFilter, statusFilter, sortBy]);

  const rows = useMemo<Row[]>(() => {
    if (groupBy === 'none') {
      return processed.map((app) => ({ kind: 'item', key: `i:${app.id}`, app }));
    }
    const groups = new Map<string, Application[]>();
    for (const app of processed) {
      let key: string;
      switch (groupBy) {
        case 'type':
          key = app.type.charAt(0).toUpperCase() + app.type.slice(1);
          break;
        case 'status':
          key = app.status.charAt(0).toUpperCase() + app.status.slice(1);
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
  const openEdit = (app: Application) => {
    setEditing(app);
    setFormOpen(true);
  };

  const onDelete = async (app: Application) => {
    if (
      await confirmDialog({
        title: 'Delete application',
        message: `Delete “${app.name}”?`,
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      remove(app.id);
      toast.show('Application deleted', 'info');
    }
  };

  const onOpenLink = (link?: string) => {
    if (!link) return;
    Linking.openURL(link).catch(() => toast.show('Could not open link', 'error'));
  };

  const handleSave = (data: FormValues) => {
    const now = new Date().toISOString();
    if (editing) {
      update({
        ...editing,
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
        updatedAt: now,
      });
      toast.show('Application updated', 'success');
    } else {
      create({
        id: newId(),
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
        createdAt: now,
      });
      toast.show('Application added', 'success');
    }
    setFormOpen(false);
  };

  if (loading) return <Spinner label="Loading applications…" />;

  const Controls = (
    <View className="px-4 pt-4 pb-2">
      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <Select<TypeFilter>
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          className="w-[47%]"
          options={[
            { label: 'All Types', value: 'all' },
            { label: 'Jobs', value: 'job' },
            { label: 'Grants', value: 'grant' },
            { label: 'Scholarships', value: 'scholarship' },
            { label: 'Other', value: 'other' },
          ]}
        />
        <Select<StatusFilter>
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-[47%]"
          options={[
            { label: 'All Statuses', value: 'all' },
            { label: 'Draft', value: 'draft' },
            { label: 'Open', value: 'open' },
            { label: 'Submitted', value: 'submitted' },
            { label: 'Closed', value: 'closed' },
            { label: 'Accepted', value: 'accepted' },
            { label: 'Rejected', value: 'rejected' },
          ]}
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
          label="Group by"
          value={groupBy}
          onChange={setGroupBy}
          className="w-[47%]"
          options={[
            { label: 'No Grouping', value: 'none' },
            { label: 'By Type', value: 'type' },
            { label: 'By Status', value: 'status' },
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
      <AppHeader title="Applications" subtitle="Track your job, grant, and scholarship applications." />

      {items.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={40} color="#3B82F6" />}
          title="No applications yet"
          subtitle="Add your first application to track jobs, grants, and scholarships."
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
            <View className="items-center py-16 px-8">
              <Briefcase size={40} color="#6b7280" />
              <Text className="text-ink-muted text-sm text-center mt-4">
                No applications match your filters.
              </Text>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <View className="flex-row items-center mt-5 mb-2">
                <View className="w-2 h-2 rounded-full bg-accent mr-2" />
                <Text className="text-ink text-base font-semibold">{item.title}</Text>
                <Text className="text-ink-muted text-xs ml-2">({item.count})</Text>
              </View>
            ) : (
              <View className="mb-3">
                <ApplicationCard
                  app={item.app}
                  onEdit={() => openEdit(item.app)}
                  onDelete={() => onDelete(item.app)}
                  onOpenLink={() => onOpenLink(item.app.link)}
                />
              </View>
            )
          }
        />
      )}

      <Fab onPress={openAdd} />

      <ApplicationFormModal
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </Screen>
  );
}

function StatusPill({ status }: { status: AppStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <View className={`flex-row items-center rounded-full px-2.5 py-1 ${meta.bg}`}>
      <Icon size={12} color={meta.color} />
      <Text className={`text-xs font-semibold ml-1 ${meta.fg}`}>{meta.label}</Text>
    </View>
  );
}

function PriorityPill({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return (
    <View className={`rounded-full px-2.5 py-1 ${meta.bg}`}>
      <Text className={`text-xs font-semibold ${meta.fg}`}>{priority}</Text>
    </View>
  );
}

function ApplicationCard({
  app,
  onEdit,
  onDelete,
  onOpenLink,
}: {
  app: Application;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLink: () => void;
}) {
  const TypeIcon = TYPE_META[app.type].icon;
  const deadlineSoon = isDeadlineSoon(app.submissionDeadline);
  return (
    <Card>
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center">
          <TypeIcon size={16} color={TYPE_META[app.type].color} />
          <Text className="text-ink-muted text-xs uppercase ml-1.5" style={{ letterSpacing: 1 }}>
            {app.type}
          </Text>
        </View>
        <View className="flex-row items-center -mr-1">
          <Pressable onPress={onEdit} hitSlop={8} className="p-1.5 active:opacity-60">
            <Pencil size={18} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} className="p-1.5 active:opacity-60">
            <Trash2 size={18} color="#9ca3af" />
          </Pressable>
        </View>
      </View>

      <Text className="text-ink text-base font-semibold mt-2">{app.name}</Text>
      {app.organization ? <Text className="text-ink-muted text-sm mt-0.5">{app.organization}</Text> : null}

      <View className="flex-row items-center flex-wrap mt-3" style={{ gap: 8 }}>
        <StatusPill status={app.status} />
        {app.priority ? <PriorityPill priority={app.priority} /> : null}
      </View>

      <View className="mt-3" style={{ gap: 6 }}>
        {app.submissionDeadline ? (
          <View className="flex-row items-center">
            <Calendar size={12} color={deadlineSoon ? '#f97316' : '#9ca3af'} />
            <Text className={`text-xs ml-2 ${deadlineSoon ? 'text-orange-400' : 'text-ink-muted'}`}>
              Deadline: {formatDate(app.submissionDeadline)}
              {deadlineSoon ? '  •  Soon!' : ''}
            </Text>
          </View>
        ) : null}
        {app.openingDate ? (
          <View className="flex-row items-center">
            <Clock size={12} color="#9ca3af" />
            <Text className="text-ink-muted text-xs ml-2">Opens: {formatDate(app.openingDate)}</Text>
          </View>
        ) : null}
        {app.closingDate ? (
          <View className="flex-row items-center">
            <Clock size={12} color="#9ca3af" />
            <Text className="text-ink-muted text-xs ml-2">Closes: {formatDate(app.closingDate)}</Text>
          </View>
        ) : null}
        {app.submittedDate ? (
          <View className="flex-row items-center">
            <Send size={12} color="#34d399" />
            <Text className="text-emerald-400 text-xs ml-2">Submitted: {formatDate(app.submittedDate)}</Text>
          </View>
        ) : null}
      </View>

      {app.notes ? (
        <Text className="text-ink-muted text-sm mt-3" numberOfLines={2}>
          {app.notes}
        </Text>
      ) : null}

      {app.link ? (
        <Pressable onPress={onOpenLink} hitSlop={6} className="flex-row items-center mt-3 active:opacity-60">
          <ExternalLink size={14} color="#3B82F6" />
          <Text className="text-accent text-sm ml-2 font-medium">Open Application</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

type FormValues = {
  name: string;
  organization: string;
  link: string;
  type: AppType;
  status: AppStatus;
  priority: Priority;
  openingDate?: string;
  closingDate?: string;
  submissionDeadline?: string;
  submittedDate?: string;
  notes: string;
};

function ApplicationFormModal({
  visible,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: Application | null;
  onCancel: () => void;
  onSave: (values: FormValues) => void;
}) {
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [link, setLink] = useState('');
  const [type, setType] = useState<AppType>('job');
  const [status, setStatus] = useState<AppStatus>('draft');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [openingDate, setOpeningDate] = useState<string | undefined>(undefined);
  const [closingDate, setClosingDate] = useState<string | undefined>(undefined);
  const [submissionDeadline, setSubmissionDeadline] = useState<string | undefined>(undefined);
  const [submittedDate, setSubmittedDate] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');

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
    }
  }

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
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
          <Pressable
            className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5"
            style={{ maxHeight: '90%' }}
            onPress={() => {}}
          >
            <Text className="text-ink text-lg font-bold mb-4">
              {initial ? 'Edit Application' : 'New Application'}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Input
                label="Application Name *"
                placeholder="Software Engineer at Google"
                value={name}
                onChangeText={setName}
                className="mb-3"
              />
              <Input
                label="Organization"
                placeholder="Company or organization name"
                value={organization}
                onChangeText={setOrganization}
                className="mb-3"
              />
              <Input
                label="Application Link"
                placeholder="https://..."
                value={link}
                onChangeText={setLink}
                autoCapitalize="none"
                keyboardType="url"
                className="mb-3"
              />

              <Select<AppType>
                label="Type"
                value={type}
                onChange={setType}
                className="mb-3"
                options={[
                  { label: 'Job', value: 'job' },
                  { label: 'Grant', value: 'grant' },
                  { label: 'Scholarship', value: 'scholarship' },
                  { label: 'Other', value: 'other' },
                ]}
              />
              <Select<AppStatus>
                label="Status"
                value={status}
                onChange={setStatus}
                className="mb-3"
                options={[
                  { label: 'Draft', value: 'draft' },
                  { label: 'Open', value: 'open' },
                  { label: 'Submitted', value: 'submitted' },
                  { label: 'Closed', value: 'closed' },
                  { label: 'Accepted', value: 'accepted' },
                  { label: 'Rejected', value: 'rejected' },
                ]}
              />
              <Select<Priority>
                label="Priority"
                value={priority}
                onChange={setPriority}
                className="mb-3"
                options={[
                  { label: 'High', value: 'High' },
                  { label: 'Medium', value: 'Medium' },
                  { label: 'Low', value: 'Low' },
                ]}
              />

              <View className="mb-3">
                <DateField label="Opening Date" value={openingDate} onChange={setOpeningDate} />
              </View>
              <View className="mb-3">
                <DateField label="Closing Date" value={closingDate} onChange={setClosingDate} />
              </View>
              <View className="mb-3">
                <DateField
                  label="Submission Deadline"
                  value={submissionDeadline}
                  onChange={setSubmissionDeadline}
                />
              </View>
              <View className="mb-3">
                <DateField label="Submitted Date" value={submittedDate} onChange={setSubmittedDate} />
              </View>

              <TextArea
                label="Notes"
                placeholder="Additional notes about this application..."
                value={notes}
                onChangeText={setNotes}
                minHeight={90}
                className="mb-2"
              />
            </ScrollView>

            <View className="flex-row mt-4 mb-8" style={{ gap: 12 }}>
              <Pressable
                onPress={onCancel}
                className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80"
              >
                <Text className="text-ink font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={save}
                disabled={!name.trim()}
                className={`flex-1 items-center py-3.5 rounded-full ${name.trim() ? 'bg-accent active:bg-accent-hover' : 'bg-midnight-lighter'}`}
              >
                <Text className={`font-bold ${name.trim() ? 'text-white' : 'text-ink-muted'}`}>
                  {initial ? 'Update' : 'Create'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
