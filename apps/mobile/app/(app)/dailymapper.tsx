import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Trash2,
  ArrowRight,
  ArrowUpDown,
  Copy,
  Star,
  RefreshCw,
  Briefcase,
  Coffee,
  Ellipsis,
  CheckSquare,
  MessageSquare as CommentIcon, Zap as AdjustIcon,
} from 'lucide-react-native';
import type { DailyMapperEntry, DailyMapperTemplate } from '@clearmind/shared';
import { todayView } from '@clearmind/shared/tasks';
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
  TimeField,
  DateField,
  SegmentedControl,
  Badge,
  StatCard,
  Fab,
  EmptyState,
  Spinner,
  Button,
  FormSheet,
  Sheet,
  ActionMenu,
  IconButton,
  confirmDialog,
  useToast,
} from '../../components/ui';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import type { MTask } from '../../services/taskActions';
import { T } from '../../lib/theme';

// ---------- pure helpers (local-date based — never use toISOString for day keys) ----------
type Completed = 'yes' | 'no' | 'partial';
type Location = 'home' | 'work' | 'other';
type PermanentType = 'daily' | 'workday' | 'weekend';
type SortKey = 'time' | 'location';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toISODate(new Date());
const parseDay = (s: string) => new Date(`${s}T00:00:00`);

const isWeekend = (s: string) => {
  const day = parseDay(s).getDay();
  return day === 0 || day === 6;
};

const formatLongDate = (s: string) => {
  const d = parseDay(s);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const PRESETS: { start: string; end: string }[] = [
  { start: '05:00', end: '05:30' },
  { start: '06:00', end: '07:00' },
  { start: '08:00', end: '09:00' },
  { start: '09:00', end: '10:00' },
  { start: '12:00', end: '13:00' },
  { start: '14:00', end: '15:00' },
  { start: '17:00', end: '18:00' },
  { start: '21:00', end: '22:00' },
];

const COMPLETED_OPTS = [
  { label: 'Not done', value: 'no' as Completed },
  { label: 'Partial', value: 'partial' as Completed },
  { label: 'Completed', value: 'yes' as Completed },
];
const LOCATION_OPTS = [
  { label: 'Home', value: 'home' as Location },
  { label: 'Work', value: 'work' as Location },
  { label: 'Other', value: 'other' as Location },
];

const LOCATION_LABEL: Record<Location, string> = { home: 'Home', work: 'Work', other: 'Other' };
const PERMANENT_LABEL: Record<PermanentType, string> = {
  daily: 'Every Day',
  workday: 'Workdays',
  weekend: 'Weekends',
};
const LOCATION_TONE: Record<Location, 'green' | 'accent' | 'amber'> = {
  home: 'green',
  work: 'accent',
  other: 'amber',
};

type FormData = {
  startTime: string;
  endTime: string;
  task: string;
  completed: Completed;
  comment: string;
  adjustment: string;
  color: string;
  location: Location;
  makePermanent: boolean;
  permanentType: PermanentType;
};

export default function DailyMapperScreen() {
  const {
    items: entries,
    loading: loadingEntries,
    create: createEntry,
    update: updateEntry,
    remove: removeEntry,
  } = useCollection<DailyMapperEntry>(STORES.DAILY_MAPPER);
  const {
    items: templates,
    loading: loadingTemplates,
    create: createTemplate,
    remove: removeTemplate,
  } = useCollection<DailyMapperTemplate>(STORES.DAILY_MAPPER_TEMPLATES);
  const toast = useToast();
  const ui = useTaskUI();

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [sortBy, setSortBy] = useState<SortKey>('time');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyMapperEntry | null>(null);
  const [presetTime, setPresetTime] = useState<{ start: string; end: string } | null>(null);

  const [moveTarget, setMoveTarget] = useState<DailyMapperEntry | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<DailyMapperEntry | null>(null);

  // Open tasks due today or overdue — offered as quick picks in the add-block form.
  const todaysTasks = useMemo<MTask[]>(() => {
    const { overdue, today } = todayView(ui.tasks, new Date());
    return [...overdue, ...today].filter((t) => !t.deleted) as MTask[];
  }, [ui.tasks]);

  const isToday = selectedDate === todayStr();

  // --- one-time, idempotent: auto-move past incomplete entries + apply permanent templates ---
  const migratedRef = useRef(false);
  useEffect(() => {
    if (loadingEntries || loadingTemplates || migratedRef.current) return;
    migratedRef.current = true;
    const today = todayStr();

    // Auto-move incomplete, non-template entries from prior days to today.
    const moved: DailyMapperEntry[] = [];
    const working = entries.map((e) => {
      if (e.date < today && e.completed !== 'yes' && !e.templateId) {
        const u: DailyMapperEntry = {
          ...e,
          date: today,
          adjustment: e.adjustment
            ? `${e.adjustment} | Auto-moved from ${e.date}`
            : `Auto-moved from ${e.date}`,
        };
        moved.push(u);
        return u;
      }
      return e;
    });
    moved.forEach((m) => updateEntry(m));

    // Apply permanent templates to today (skip already-applied / duplicate time+task).
    const todayEntries = working.filter((e) => e.date === today);
    const appliedTemplateIds = new Set(
      todayEntries.filter((e) => e.templateId).map((e) => e.templateId),
    );
    const existingKeys = new Set(todayEntries.map((e) => `${e.startTime}-${e.endTime}-${e.task}`));
    const wknd = isWeekend(today);

    for (const t of templates) {
      if (appliedTemplateIds.has(t.id)) continue;
      const key = `${t.startTime}-${t.endTime}-${t.task}`;
      if (existingKeys.has(key)) continue;
      const apply =
        t.permanentType === 'daily' ||
        (t.permanentType === 'workday' && !wknd) ||
        (t.permanentType === 'weekend' && wknd);
      if (!apply) continue;
      createEntry({
        id: newId(),
        date: today,
        startTime: t.startTime,
        endTime: t.endTime,
        task: t.task,
        color: t.color,
        location: t.location,
        completed: 'no',
        templateId: t.id,
        isPermanent: true,
        permanentType: t.permanentType,
      });
      existingKeys.add(key);
    }
  }, [loadingEntries, loadingTemplates]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayEntries = useMemo(() => {
    const filtered = entries.filter((e) => e.date === selectedDate);
    if (sortBy === 'location') {
      const order: Record<string, number> = { home: 0, work: 1, other: 2 };
      return [...filtered].sort((a, b) => {
        const la = order[a.location || 'other'] ?? 2;
        const lb = order[b.location || 'other'] ?? 2;
        if (la !== lb) return la - lb;
        return a.startTime.localeCompare(b.startTime);
      });
    }
    return [...filtered].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [entries, selectedDate, sortBy]);

  const stats = useMemo(() => {
    const total = dayEntries.length;
    const completed = dayEntries.filter((e) => e.completed === 'yes').length;
    const partial = dayEntries.filter((e) => e.completed === 'partial').length;
    return { total, completed, partial };
  }, [dayEntries]);

  const hasAutoMoved = isToday && dayEntries.some((e) => e.adjustment?.includes('Auto-moved'));

  const navigateDay = (dir: number) => {
    const cur = parseDay(selectedDate);
    cur.setDate(cur.getDate() + dir);
    setSelectedDate(toISODate(cur));
  };

  const openAdd = (preset?: { start: string; end: string }) => {
    setEditing(null);
    setPresetTime(preset ?? null);
    setFormOpen(true);
  };
  const openEdit = (entry: DailyMapperEntry) => {
    setEditing(entry);
    setPresetTime(null);
    setFormOpen(true);
  };

  const setCompletion = (entry: DailyMapperEntry, value: Completed) => {
    updateEntry({ ...entry, completed: value });
  };

  const handleSave = (data: FormData) => {
    if (!data.task.trim()) return;
    const base = {
      startTime: data.startTime,
      endTime: data.endTime,
      task: data.task.trim(),
      completed: data.completed,
      comment: data.comment.trim() || undefined,
      adjustment: data.adjustment.trim() || undefined,
      color: data.color,
      location: data.location,
      isPermanent: data.makePermanent,
      permanentType: data.makePermanent ? data.permanentType : undefined,
    };

    if (editing) {
      updateEntry({ ...editing, ...base });
      if (data.makePermanent && !editing.templateId) {
        const exists = templates.find(
          (t) =>
            t.task === base.task &&
            t.startTime === base.startTime &&
            t.permanentType === data.permanentType,
        );
        if (!exists) {
          createTemplate({
            id: newId(),
            startTime: data.startTime,
            endTime: data.endTime,
            task: base.task,
            color: data.color,
            location: data.location,
            permanentType: data.permanentType,
            createdAt: new Date().toISOString(),
          });
        }
      }
      toast.show('Time block updated', 'success');
    } else {
      let templateId: string | undefined;
      if (data.makePermanent) {
        templateId = newId();
        createTemplate({
          id: templateId,
          startTime: data.startTime,
          endTime: data.endTime,
          task: base.task,
          color: data.color,
          location: data.location,
          permanentType: data.permanentType,
          createdAt: new Date().toISOString(),
        });
      }
      createEntry({ id: newId(), date: selectedDate, ...base, templateId });
      toast.show('Time block added', 'success');
    }
    setFormOpen(false);
  };

  const handleDelete = async (entry: DailyMapperEntry): Promise<boolean> => {
    if (entry.templateId) {
      const ok = await confirmDialog({
        title: 'Permanent time block',
        message: 'Delete this entry AND stop it from appearing on future days?',
        confirmText: 'Delete',
        destructive: true,
      });
      if (!ok) return false;
      removeTemplate(entry.templateId);
      entries.filter((e) => e.templateId === entry.templateId).forEach((e) => removeEntry(e.id));
      toast.show('Permanent block removed', 'info');
    } else {
      const ok = await confirmDialog({
        title: 'Delete time block',
        message: 'Delete this time block?',
        confirmText: 'Delete',
        destructive: true,
      });
      if (!ok) return false;
      removeEntry(entry.id);
      toast.show('Time block deleted', 'info');
    }
    return true;
  };

  const handleMove = (target: string) => {
    if (!moveTarget) return;
    updateEntry({
      ...moveTarget,
      date: target,
      adjustment: moveTarget.adjustment
        ? `${moveTarget.adjustment} | Moved from ${moveTarget.date}`
        : `Moved from ${moveTarget.date}`,
    });
    setMoveTarget(null);
    toast.show('Time block moved', 'success');
  };

  const handleCopyDay = (target: string) => {
    if (dayEntries.length === 0) return;
    dayEntries.forEach((e) =>
      createEntry({
        ...e,
        id: newId(),
        date: target,
        completed: 'no',
        comment: undefined,
        adjustment: undefined,
      }),
    );
    setCopyOpen(false);
    toast.show(`Copied ${dayEntries.length} blocks to ${target}`, 'success');
  };

  const handleDeleteTemplate = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Delete permanent todo',
      message: 'It will no longer be added to new days.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (ok) removeTemplate(id);
  };

  if (loadingEntries || loadingTemplates) return <Spinner label="Loading your day…" />;

  return (
    <Screen padded={false}>
      <AppHeader
        title="Daily Mapper"
        subtitle="Time-block day planner"
        right={
          <View className="flex-row items-center">
            <IconButton
              onPress={() => setSortBy(sortBy === 'time' ? 'location' : 'time')}
              label={sortBy === 'time' ? 'Sort by location' : 'Sort by time'}
            >
              <ArrowUpDown size={20} color={T.muted} />
            </IconButton>
            <IconButton
              onPress={() => {
                if (dayEntries.length === 0) {
                  toast.show('Nothing to copy on this day', 'info');
                  return;
                }
                setCopyOpen(true);
              }}
              label="Copy day to another date"
            >
              <Copy size={20} color={T.muted} />
            </IconButton>
            <IconButton onPress={() => setTemplatesOpen(true)} label="Permanent todos">
              <Star size={20} color="#f59e0b" />
            </IconButton>
          </View>
        }
      />

      <FlatList
        data={dayEntries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="mb-3">
            {/* Date navigation */}
            <Card className="flex-row items-center justify-between mb-3">
              <Pressable onPress={() => navigateDay(-1)} hitSlop={8} className="p-1 active:opacity-60" accessibilityRole="button" accessibilityLabel="Previous day">
                <ChevronLeft size={22} color={T.muted} />
              </Pressable>
              <View className="items-center flex-1 px-2">
                <Text className="text-ink text-base font-bold text-center" numberOfLines={1}>
                  {formatLongDate(selectedDate)}
                </Text>
                <View className="flex-row items-center mt-1.5">
                  {isToday ? (
                    <View className="mr-2">
                      <Badge label="Today" tone="accent" />
                    </View>
                  ) : null}
                  <Badge
                    label={isWeekend(selectedDate) ? 'Weekend' : 'Workday'}
                    tone={isWeekend(selectedDate) ? 'green' : 'accent'}
                  />
                </View>
                {!isToday ? (
                  <Pressable onPress={() => setSelectedDate(todayStr())} className="mt-2 active:opacity-60" accessibilityRole="button">
                    <Text className="text-accent text-xs font-semibold">Go to Today</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable onPress={() => navigateDay(1)} hitSlop={8} className="p-1 active:opacity-60" accessibilityRole="button" accessibilityLabel="Next day">
                <ChevronRight size={22} color={T.muted} />
              </Pressable>
            </Card>

            {/* Stats */}
            {dayEntries.length > 0 ? (
              <View className="flex-row mb-1" style={{ gap: 10 }}>
                <StatCard className="flex-1" label="Blocks" value={stats.total} />
                <StatCard className="flex-1" label="Completed" value={stats.completed} />
                <StatCard className="flex-1" label="Partial" value={stats.partial} />
              </View>
            ) : null}

            {/* Auto-moved banner */}
            {hasAutoMoved ? (
              <View className="flex-row items-center bg-accent/15 border border-accent/30 rounded-2xl px-4 py-3 mt-2">
                <ArrowRight size={16} color={T.accent} />
                <Text className="text-accent text-xs ml-2 flex-1">
                  Some entries were auto-moved from previous days. Look for the “Auto-moved” note.
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View className="px-2 pt-6">
            <EmptyState
              fill={false}
              icon={<Clock size={34} color={T.accent} />}
              title="No time blocks for this day"
              subtitle="Plan your day in focused time blocks — tap a preset below or add your own."
              ctaTitle="Add a time block"
              onCta={() => openAdd()}
            />
            <View className="flex-row flex-wrap justify-center px-2" style={{ gap: 8 }}>
              {PRESETS.map((p) => (
                <Pressable
                  key={`${p.start}-${p.end}`}
                  onPress={() => openAdd(p)}
                  className="bg-midnight-light border border-line rounded-full px-3 py-2 active:opacity-70"
                  accessibilityRole="button"
                  accessibilityLabel={`Add block ${formatTime(p.start)} to ${formatTime(p.end)}`}
                >
                  <Text className="text-ink-muted text-xs">
                    {formatTime(p.start)} – {formatTime(p.end)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <EntryCard
            entry={item}
            onCompletion={(v) => setCompletion(item, v)}
            onEdit={() => openEdit(item)}
            onMenu={() => setMenuFor(item)}
          />
        )}
      />

      <Fab onPress={() => openAdd()} label="Add time block" />

      <EntryFormSheet
        visible={formOpen}
        editing={editing}
        preset={presetTime}
        todaysTasks={todaysTasks}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
        onDelete={editing ? async () => { if (await handleDelete(editing)) setFormOpen(false); } : undefined}
      />

      <ActionMenu
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.task}
        actions={menuFor ? [
          { label: 'Edit time block', icon: <Pencil size={18} color={T.muted} />, onPress: () => openEdit(menuFor) },
          { label: 'Move to date', icon: <ArrowRight size={18} color={T.muted} />, onPress: () => setMoveTarget(menuFor) },
          { label: 'Delete', icon: <Trash2 size={18} color={T.danger} />, destructive: true, onPress: () => { handleDelete(menuFor); } },
        ] : []}
      />

      <DatePickSheet
        visible={moveTarget !== null}
        title="Move to date"
        confirmLabel="Move entry"
        initialDate={todayStr()}
        onCancel={() => setMoveTarget(null)}
        onConfirm={handleMove}
      />

      <DatePickSheet
        visible={copyOpen}
        title="Copy day to date"
        confirmLabel="Copy schedule"
        initialDate={todayStr()}
        onCancel={() => setCopyOpen(false)}
        onConfirm={handleCopyDay}
      />

      <TemplatesSheet
        visible={templatesOpen}
        templates={templates}
        onDelete={handleDeleteTemplate}
        onClose={() => setTemplatesOpen(false)}
      />
    </Screen>
  );
}

// ---------------- Entry card ----------------
function EntryCard({
  entry,
  onCompletion,
  onEdit,
  onMenu,
}: {
  entry: DailyMapperEntry;
  onCompletion: (v: Completed) => void;
  onEdit: () => void;
  onMenu: () => void;
}) {
  const color = entry.color || '#3B82F6';
  return (
    <Card>
      <View className="flex-row">
        <View className="w-1.5 rounded-full mr-3" style={{ backgroundColor: color }} />
        <View className="flex-1">
          <Pressable
            onPress={onEdit}
            onLongPress={onMenu}
            className="flex-row items-start justify-between active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={`${formatTime(entry.startTime)} to ${formatTime(entry.endTime)}: ${entry.task}. Tap to edit, long-press for options`}
          >
            <View className="flex-1 pr-2">
              <Text className="text-ink-muted text-xs font-semibold mb-0.5">
                {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
              </Text>
              <Text className="text-ink text-base font-medium">{entry.task}</Text>
            </View>
            <Pressable
              onPress={onMenu}
              hitSlop={8}
              className="p-1.5 -mt-1 -mr-1 rounded-full active:bg-midnight-lighter"
              accessibilityRole="button"
              accessibilityLabel={`Options for ${entry.task}`}
            >
              <Ellipsis size={18} color={T.muted} />
            </Pressable>
          </Pressable>

          {(entry.location || (entry.isPermanent && entry.permanentType)) ? (
            <View className="flex-row items-center flex-wrap mt-2" style={{ gap: 6 }}>
              {entry.location ? (
                <Badge label={LOCATION_LABEL[entry.location]} tone={LOCATION_TONE[entry.location]} />
              ) : null}
              {entry.isPermanent && entry.permanentType ? (
                <Badge label={PERMANENT_LABEL[entry.permanentType]} tone="amber" />
              ) : null}
            </View>
          ) : null}

          {entry.comment ? (
            <View className="flex-row items-start mt-2"><CommentIcon size={14} color={T.muted} style={{ marginTop: 2 }} /><Text className="text-ink-muted text-sm ml-1.5 flex-1">{entry.comment}</Text></View>
          ) : null}
          {entry.adjustment ? (
            <View className="flex-row items-start mt-1"><AdjustIcon size={14} color="#FBBF24" style={{ marginTop: 2 }} /><Text className="text-amber-400 text-sm ml-1.5 flex-1">{entry.adjustment}</Text></View>
          ) : null}

          <View className="mt-3">
            <SegmentedControl<Completed>
              value={entry.completed}
              onChange={onCompletion}
              segments={[
                { label: 'No', value: 'no' },
                { label: 'Partial', value: 'partial' },
                { label: 'Done', value: 'yes' },
              ]}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

// ---------------- Add / edit sheet ----------------
function EntryFormSheet({
  visible,
  editing,
  preset,
  todaysTasks,
  onCancel,
  onSave,
  onDelete,
}: {
  visible: boolean;
  editing: DailyMapperEntry | null;
  preset: { start: string; end: string } | null;
  todaysTasks: MTask[];
  onCancel: () => void;
  onSave: (d: FormData) => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<FormData>({
    startTime: '08:00',
    endTime: '08:30',
    task: '',
    completed: 'no',
    comment: '',
    adjustment: '',
    color: '#3B82F6',
    location: 'home',
    makePermanent: false,
    permanentType: 'daily',
  });

  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      if (editing) {
        setForm({
          startTime: editing.startTime,
          endTime: editing.endTime,
          task: editing.task,
          completed: editing.completed,
          comment: editing.comment || '',
          adjustment: editing.adjustment || '',
          color: editing.color || '#3B82F6',
          location: editing.location || 'home',
          makePermanent: editing.isPermanent || false,
          permanentType: editing.permanentType || 'daily',
        });
      } else {
        setForm({
          startTime: preset?.start || '08:00',
          endTime: preset?.end || '08:30',
          task: '',
          completed: 'no',
          comment: '',
          adjustment: '',
          color: '#3B82F6',
          location: 'home',
          makePermanent: false,
          permanentType: 'daily',
        });
      }
    }
  }

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = form.task.trim().length > 0;

  return (
    <FormSheet
      visible={visible}
      onClose={onCancel}
      title={editing ? 'Edit time block' : 'New time block'}
      submitLabel={editing ? 'Save block' : 'Add block'}
      onSubmit={() => canSave && onSave(form)}
      submitDisabled={!canSave}
      onDelete={onDelete}
      deleteLabel="Delete time block"
      fill
    >
      <View className="flex-row mb-3" style={{ gap: 12 }}>
        <View className="flex-1">
          <TimeField
            label="Start time"
            value={form.startTime}
            clearable={false}
            onChange={(v) => set('startTime', v || '08:00')}
          />
        </View>
        <View className="flex-1">
          <TimeField
            label="End time"
            value={form.endTime}
            clearable={false}
            onChange={(v) => set('endTime', v || '08:30')}
          />
        </View>
      </View>

      <Input
        label="Task / activity"
        placeholder="e.g. Morning workout, Deep work…"
        value={form.task}
        onChangeText={(v) => set('task', v)}
        className="mb-3"
      />

      {/* Quick pick from the task system: today's + overdue open tasks fill the block text. */}
      {!editing && todaysTasks.length > 0 ? (
        <View className="mb-3">
          <View className="flex-row items-center mb-1.5 ml-1">
            <CheckSquare size={12} color={T.muted} />
            <Text className="text-ink-muted text-xs ml-1.5">From today's tasks</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
            {todaysTasks.map((t) => {
              const picked = form.task.trim() === t.title.trim();
              return (
                <Pressable
                  key={t.id}
                  onPress={() => set('task', t.title)}
                  className={`px-3 py-2 rounded-full border ${picked ? 'border-accent bg-accent/15' : 'border-line bg-midnight-light'} active:opacity-70`}
                  style={{ maxWidth: 220 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked }}
                  accessibilityLabel={`Use task “${t.title}”`}
                >
                  <Text className={`text-xs ${picked ? 'text-accent font-semibold' : 'text-ink'}`} numberOfLines={1}>{t.title}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <Select<Completed>
        label="Completion status"
        value={form.completed}
        onChange={(v) => set('completed', v)}
        options={COMPLETED_OPTS}
        className="mb-3"
      />

      <Select<Location>
        label="Location"
        value={form.location}
        onChange={(v) => set('location', v)}
        options={LOCATION_OPTS}
        className="mb-3"
      />

      <TextArea
        label="Comment (optional)"
        placeholder="Notes about how it went…"
        value={form.comment}
        onChangeText={(v) => set('comment', v)}
        minHeight={70}
        className="mb-3"
      />

      <Input
        label="Adjustment (optional)"
        placeholder="e.g. Moved to 6:00 AM, skipped…"
        value={form.adjustment}
        onChangeText={(v) => set('adjustment', v)}
        className="mb-3"
      />

      <Text className="text-ink-muted text-xs mb-1.5 ml-1">Color</Text>
      <View className="flex-row flex-wrap mb-4" style={{ gap: 10 }}>
        {COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => set('color', c)}
            style={{ backgroundColor: c, borderWidth: form.color === c ? 2 : 0, borderColor: T.ink }}
            className="w-9 h-9 rounded-full"
            accessibilityRole="button"
            accessibilityLabel={`Colour ${c}`}
            accessibilityState={{ selected: form.color === c }}
          />
        ))}
      </View>

      {/* Make permanent */}
      <Pressable
        onPress={() => set('makePermanent', !form.makePermanent)}
        className="flex-row items-center bg-midnight-light border border-line rounded-2xl px-4 py-3 active:opacity-80"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: form.makePermanent }}
      >
        <View
          className={`w-5 h-5 rounded-md mr-3 items-center justify-center border ${
            form.makePermanent ? 'bg-accent border-accent' : 'border-line'
          }`}
        >
          {form.makePermanent ? <Star size={13} color="#fff" /> : null}
        </View>
        <Text className="text-ink text-sm font-medium flex-1">Make this a permanent todo</Text>
      </Pressable>

      {form.makePermanent ? (
        <View className="mt-3">
          <Text className="text-ink-muted text-xs mb-1.5 ml-1">Repeats on</Text>
          <SegmentedControl<PermanentType>
            value={form.permanentType}
            onChange={(v) => set('permanentType', v)}
            segments={[
              { label: 'Every day', value: 'daily' },
              { label: 'Workdays', value: 'workday' },
              { label: 'Weekends', value: 'weekend' },
            ]}
          />
        </View>
      ) : null}
    </FormSheet>
  );
}

// ---------------- Date pick sheet (move / copy) ----------------
function DatePickSheet({
  visible,
  title,
  confirmLabel,
  initialDate,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  initialDate: string;
  onCancel: () => void;
  onConfirm: (date: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) setDate(initialDate);
  }

  return (
    <FormSheet
      visible={visible}
      onClose={onCancel}
      title={title}
      submitLabel={confirmLabel}
      onSubmit={() => onConfirm(date)}
    >
      <DateField label="Date" value={date} clearable={false} onChange={(v) => setDate(v || date)} />
    </FormSheet>
  );
}

// ---------------- Templates (permanent todos) sheet ----------------
function TemplatesSheet({
  visible,
  templates,
  onDelete,
  onClose,
}: {
  visible: boolean;
  templates: DailyMapperTemplate[];
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const groups: { type: PermanentType; label: string; icon: React.ReactNode }[] = [
    { type: 'daily', label: 'Every Day', icon: <RefreshCw size={14} color={T.accent} /> },
    { type: 'workday', label: 'Workdays (Mon–Fri)', icon: <Briefcase size={14} color={T.accent} /> },
    { type: 'weekend', label: 'Weekends (Sat–Sun)', icon: <Coffee size={14} color="#10B981" /> },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Permanent todos" right={<Star size={18} color="#f59e0b" />}>
      <Text className="text-ink-muted text-xs mb-3">
        These tasks are automatically added to your day based on their type.
      </Text>

      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {templates.length === 0 ? (
          <EmptyState
            fill={false}
            icon={<Star size={34} color={T.faint} />}
            title="No permanent todos yet"
            subtitle="Add one by enabling “Make permanent” on a time block."
          />
        ) : (
          groups.map((g) => {
            const list = templates.filter((t) => t.permanentType === g.type);
            if (list.length === 0) return null;
            return (
              <View key={g.type} className="mb-5">
                <View className="flex-row items-center mb-2">
                  {g.icon}
                  <Text className="text-ink-muted text-xs font-semibold uppercase ml-2">{g.label}</Text>
                </View>
                {list.map((t) => (
                  <View
                    key={t.id}
                    className="flex-row items-center bg-midnight border border-line rounded-2xl px-3 py-3 mb-2"
                  >
                    <View
                      className="w-1.5 h-9 rounded-full mr-3"
                      style={{ backgroundColor: t.color || '#3B82F6' }}
                    />
                    <View className="flex-1">
                      <Text className="text-ink text-sm font-medium" numberOfLines={1}>
                        {t.task}
                      </Text>
                      <Text className="text-ink-muted text-xs mt-0.5">
                        {formatTime(t.startTime)} – {formatTime(t.endTime)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => onDelete(t.id)}
                      hitSlop={8}
                      className="p-1.5 active:opacity-60"
                      accessibilityRole="button"
                      accessibilityLabel={`Delete permanent todo ${t.task}`}
                    >
                      <Trash2 size={16} color={T.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      <View className="pt-2">
        <Button title="Close" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
