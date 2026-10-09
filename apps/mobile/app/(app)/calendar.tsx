import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronLeft, ChevronRight, Clock, MapPin, Trash2, Pencil, Ellipsis,
  Calendar as CalendarIcon, Bell, CheckSquare,
} from 'lucide-react-native';
import type { CalendarEvent, DailyMapperEntry } from '@clearmind/shared';
import { isOverdue } from '@clearmind/shared/tasks';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, TextArea, DateField, TimeField,
  EmptyState, Spinner, Fab, FormSheet, ActionMenu, IconButton, confirmDialog, useToast,
} from '../../components/ui';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { TaskRow } from '../../components/tasks/TaskRow';
import type { MTask } from '../../services/taskActions';
import { T } from '../../lib/theme';

const COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const COMPLETED_LABEL: Record<DailyMapperEntry['completed'], string> = { yes: 'Done', partial: 'Partial', no: '' };

const pad = (n: number) => String(n).padStart(2, '0');
// Local YYYY-MM-DD (matches DateField output; avoids UTC off-by-one from toISOString).
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a: Date, b: Date) => toDateStr(a) === toDateStr(b);
const longDate = (d: Date) => `${WEEK_DAYS_LONG[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

function formatTime(time?: string) {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

type EventForm = {
  title: string; description: string; date: string;
  startTime: string; endTime: string; location: string;
  color: string; reminder: boolean;
};

export default function CalendarScreen() {
  const { items: events, loading, create, update, remove } = useCollection<CalendarEvent>(STORES.EVENTS);
  const { items: blocks } = useCollection<DailyMapperEntry>(STORES.DAILY_MAPPER);
  const ui = useTaskUI();
  const router = useRouter();
  const toast = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [presetDate, setPresetDate] = useState<string>(toDateStr(new Date()));
  const [menuFor, setMenuFor] = useState<CalendarEvent | null>(null);

  // 6-week (42 cell) grid for the visible month.
  const weeks = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInCurrentMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthLastDay - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    const rows: { date: Date; isCurrentMonth: boolean }[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [currentDate]);

  const getEventsForDate = (date: Date) => {
    const key = toDateStr(date);
    return events.filter((e) => e.date === key);
  };

  // Open, top-level tasks bucketed by due day (task layer).
  const tasksByDay = useMemo(() => {
    const m = new Map<string, MTask[]>();
    for (const t of ui.tasks) {
      if (t.completed || t.parentId || t.deleted || !t.dueDate) continue;
      const list = m.get(t.dueDate);
      if (list) list.push(t); else m.set(t.dueDate, [t]);
    }
    return m;
  }, [ui.tasks]);

  const isToday = (date: Date) => sameDay(date, new Date());

  const navigateMonth = (direction: number) =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));

  const openAdd = (date?: Date) => {
    setPresetDate(toDateStr(date ?? selectedDate ?? new Date()));
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (event: CalendarEvent) => {
    setEditing(event);
    setFormOpen(true);
  };

  const handleSave = (form: EventForm) => {
    if (!form.title.trim() || !form.date) return;
    const data: CalendarEvent = {
      id: editing?.id ?? newId(),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      date: form.date,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      location: form.location.trim() || undefined,
      color: form.color,
      reminder: form.reminder,
      notified: editing?.notified || false,
    };
    if (editing) {
      update(data);
      toast.show('Event updated', 'success');
    } else {
      create(data);
      toast.show('Event added', 'success');
    }
    setFormOpen(false);
    setSelectedDate(new Date(form.date + 'T00:00:00'));
  };

  const onDelete = async (event: CalendarEvent): Promise<boolean> => {
    if (await confirmDialog({
      title: 'Delete event',
      message: `Delete “${event.title}”?`,
      confirmText: 'Delete',
      destructive: true,
    })) {
      remove(event.id);
      toast.show('Event deleted', 'info');
      return true;
    }
    return false;
  };

  const onOpenTask = useCallback((t: MTask) => ui.openTask(t.id), [ui]);

  const selectedKey = toDateStr(selectedDate);
  const selectedEvents = getEventsForDate(selectedDate);
  const selectedTasks = tasksByDay.get(selectedKey) ?? [];
  const selectedBlocks = useMemo(
    () => blocks.filter((b) => b.date === selectedKey).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [blocks, selectedKey],
  );
  const dayIsEmpty = selectedEvents.length === 0 && selectedTasks.length === 0 && selectedBlocks.length === 0;

  if (loading) return <Spinner label="Loading calendar…" />;

  return (
    <Screen padded={false}>
      <AppHeader title="Calendar" subtitle="Plan your events and stay organized." />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Month grid */}
        <Card className="p-4">
          <View className="flex-row items-center justify-between mb-4">
            <IconButton onPress={() => navigateMonth(-1)} label="Previous month">
              <ChevronLeft size={22} color={T.muted} />
            </IconButton>
            <Text className="text-ink text-lg font-bold">
              {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </Text>
            <IconButton onPress={() => navigateMonth(1)} label="Next month">
              <ChevronRight size={22} color={T.muted} />
            </IconButton>
          </View>

          {/* Weekday header */}
          <View className="flex-row mb-1">
            {WEEK_DAYS.map((d) => (
              <View key={d} className="flex-1 items-center py-1">
                <Text className="text-ink-muted text-[11px] font-semibold uppercase">{d}</Text>
              </View>
            ))}
          </View>

          {/* Week rows */}
          {weeks.map((row, ri) => (
            <View key={ri} className="flex-row">
              {row.map(({ date, isCurrentMonth }, ci) => {
                const dayEvents = getEventsForDate(date);
                const dayTaskCount = tasksByDay.get(toDateStr(date))?.length ?? 0;
                const selected = sameDay(date, selectedDate);
                const today = isToday(date);
                const a11y = [
                  longDate(date),
                  dayEvents.length ? `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : '',
                  dayTaskCount ? `${dayTaskCount} task${dayTaskCount === 1 ? '' : 's'} due` : '',
                ].filter(Boolean).join(', ');
                return (
                  <Pressable
                    key={ci}
                    onPress={() => setSelectedDate(date)}
                    style={{ minHeight: 52 }}
                    accessibilityRole="button"
                    accessibilityLabel={a11y}
                    accessibilityState={{ selected }}
                    className={`flex-1 m-0.5 rounded-xl items-center pt-1.5 pb-1 border ${
                      selected
                        ? 'border-accent bg-accent/15'
                        : today
                          ? 'border-accent bg-transparent'
                          : 'border-transparent bg-midnight'
                    } ${isCurrentMonth ? '' : 'opacity-40'} active:opacity-70`}
                  >
                    <Text
                      className={`text-[13px] ${
                        today ? 'text-accent font-bold' : isCurrentMonth ? 'text-ink font-medium' : 'text-ink-muted'
                      }`}
                    >
                      {date.getDate()}
                    </Text>
                    {dayEvents.length > 0 ? (
                      <View className="flex-row flex-wrap justify-center mt-1" style={{ maxWidth: 28 }}>
                        {dayEvents.slice(0, 3).map((e) => (
                          <View
                            key={e.id}
                            style={{ backgroundColor: e.color, width: 5, height: 5, borderRadius: 3, margin: 1 }}
                          />
                        ))}
                      </View>
                    ) : null}
                    {/* Due tasks: a thin muted bar, distinct from the round event dots. */}
                    {dayTaskCount > 0 ? (
                      <View style={{ backgroundColor: T.muted, width: 12, height: 2, borderRadius: 1, marginTop: 3, opacity: 0.8 }} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Card>

        {/* Selected day */}
        {/* Day actions sit left-aligned under the date so the FAB (bottom-right) never covers them. */}
        <View className="mt-5 mb-3 px-1">
          <View className="flex-row items-center mb-2">
            <CalendarIcon size={18} color={T.accent} />
            <Text className="text-ink font-bold ml-2 flex-shrink" numberOfLines={1}>{longDate(selectedDate)}</Text>
          </View>
          <View className="flex-row items-center">
          <Pressable
            onPress={() => ui.openQuickAdd({ dueDate: selectedKey })}
            hitSlop={8}
            className="px-3 py-1.5 mr-2 rounded-full bg-midnight-lighter active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={`Add task due ${longDate(selectedDate)}`}
          >
            <Text className="text-ink text-xs font-semibold">+ Task</Text>
          </Pressable>
          <Pressable
            onPress={() => openAdd(selectedDate)}
            hitSlop={8}
            className="px-3 py-1.5 rounded-full bg-accent active:bg-accent-hover"
            accessibilityRole="button"
            accessibilityLabel={`Add event on ${longDate(selectedDate)}`}
          >
            <Text className="text-white text-xs font-semibold">+ Event</Text>
          </Pressable>
          </View>
        </View>

        {dayIsEmpty ? (
          <EmptyState
            fill={false}
            icon={<CalendarIcon size={34} color={T.accent} />}
            title="Nothing on this day"
            subtitle="Tap a date, then add an event or a task."
            ctaTitle="Add an event"
            onCta={() => openAdd(selectedDate)}
          />
        ) : (
          <View>
            {selectedEvents.length > 0 ? (
              <>
                <SectionLabel title="Events" count={selectedEvents.length} />
                {selectedEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEdit={() => openEdit(event)}
                    onMenu={() => setMenuFor(event)}
                  />
                ))}
              </>
            ) : null}

            {selectedTasks.length > 0 ? (
              <>
                <SectionLabel title="Tasks due" count={selectedTasks.length} />
                <View className="rounded-2xl overflow-hidden border border-line mb-3">
                  {selectedTasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      project={t.projectId ? ui.projectMap.get(t.projectId) ?? null : null}
                      labels={(t.labelIds ?? []).map((id) => ui.labelMap.get(id)!).filter(Boolean)}
                      subtaskCount={ui.subtaskCounts.get(t.id)}
                      showProject
                      hideDate={!isOverdue(t)}
                      onToggle={ui.toggle}
                      onOpen={onOpenTask}
                      onSchedule={ui.schedule}
                      onLongPress={ui.menu}
                      swipeRight={ui.prefs.swipeRight}
                      swipeLeft={ui.prefs.swipeLeft}
                      onSwipe={ui.swipe}
                      compact={ui.prefs.density === 'compact'}
                      commentCount={ui.commentCounts.get(t.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {selectedBlocks.length > 0 ? (
              <>
                <SectionLabel title="Daily Mapper" count={selectedBlocks.length} />
                {selectedBlocks.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => router.push('/(app)/dailymapper')}
                    className="flex-row items-center bg-midnight-light border border-line rounded-2xl px-3 py-2.5 mb-2 active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={`Time block ${formatTime(b.startTime)} to ${formatTime(b.endTime)}: ${b.task}. Open Daily Mapper`}
                  >
                    <View className="w-1 h-8 rounded-full mr-3" style={{ backgroundColor: b.color || T.accent }} />
                    <Text className="text-ink-muted text-xs w-[118px]">
                      {formatTime(b.startTime)} – {formatTime(b.endTime)}
                    </Text>
                    <Text
                      className={`text-sm flex-1 ${b.completed === 'yes' ? 'text-ink-muted line-through' : 'text-ink'}`}
                      numberOfLines={1}
                    >
                      {b.task}
                    </Text>
                    {COMPLETED_LABEL[b.completed] ? (
                      <Text className="text-ink-muted text-[11px] ml-2">{COMPLETED_LABEL[b.completed]}</Text>
                    ) : null}
                    <ChevronRight size={16} color={T.faint} />
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Fab onPress={() => openAdd()} label="Add event" />

      <EventFormSheet
        visible={formOpen}
        initial={editing}
        presetDate={presetDate}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
        onDelete={editing ? async () => { if (await onDelete(editing)) setFormOpen(false); } : undefined}
      />

      <ActionMenu
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.title}
        actions={menuFor ? [
          { label: 'Edit event', icon: <Pencil size={18} color={T.muted} />, onPress: () => openEdit(menuFor) },
          {
            label: 'Add task for this day',
            icon: <CheckSquare size={18} color={T.muted} />,
            onPress: () => ui.openQuickAdd({ title: menuFor.title, dueDate: menuFor.date }),
          },
          { label: 'Delete event', icon: <Trash2 size={18} color={T.danger} />, destructive: true, onPress: () => { onDelete(menuFor); } },
        ] : []}
      />
    </Screen>
  );
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <Text className="text-ink-muted text-xs font-semibold uppercase mb-2 mt-1 ml-1" accessibilityRole="header">
      {title}  <Text className="font-normal">{count}</Text>
    </Text>
  );
}

function EventCard({ event, onEdit, onMenu }: { event: CalendarEvent; onEdit: () => void; onMenu: () => void }) {
  const hasTime = event.startTime || event.endTime;
  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onMenu}
      className="active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`Event ${event.title}. Tap to edit, long-press for options`}
    >
      <Card className="mb-3">
        <View style={{ borderLeftColor: event.color, borderLeftWidth: 4, paddingLeft: 12 }}>
          <View className="flex-row items-start justify-between">
            <Text className="text-ink font-semibold flex-1 pr-2">{event.title}</Text>
            <Pressable
              onPress={onMenu}
              hitSlop={8}
              className="p-1.5 -mt-1 -mr-1 rounded-full active:bg-midnight-lighter"
              accessibilityRole="button"
              accessibilityLabel={`Options for ${event.title}`}
            >
              <Ellipsis size={16} color={T.muted} />
            </Pressable>
          </View>

          {hasTime ? (
            <View className="flex-row items-center mt-1">
              <Clock size={12} color={T.muted} />
              <Text className="text-ink-muted text-xs ml-1.5">
                {formatTime(event.startTime)}{event.endTime ? ` - ${formatTime(event.endTime)}` : ''}
              </Text>
            </View>
          ) : null}

          {event.location ? (
            <View className="flex-row items-center mt-1">
              <MapPin size={12} color={T.muted} />
              <Text className="text-ink-muted text-xs ml-1.5 flex-1">{event.location}</Text>
            </View>
          ) : null}

          {event.reminder ? (
            <View className="flex-row items-center mt-1">
              <Bell size={12} color={T.accent} />
              <Text className="text-accent text-xs ml-1.5">Reminder on</Text>
            </View>
          ) : null}

          {event.description ? <Text className="text-ink-muted text-sm mt-2">{event.description}</Text> : null}
        </View>
      </Card>
    </Pressable>
  );
}

function EventFormSheet({
  visible, initial, presetDate, onCancel, onSave, onDelete,
}: {
  visible: boolean;
  initial: CalendarEvent | null;
  presetDate: string;
  onCancel: () => void;
  onSave: (form: EventForm) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<string>(presetDate);
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [location, setLocation] = useState('');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [reminder, setReminder] = useState(false);

  // Reset fields whenever the sheet (re)opens.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setTitle(initial?.title ?? '');
      setDescription(initial?.description ?? '');
      setDate(initial?.date ?? presetDate);
      setStartTime(initial?.startTime ?? '');
      setEndTime(initial?.endTime ?? '');
      setLocation(initial?.location ?? '');
      setColor(initial?.color ?? COLORS[0]);
      setReminder(initial?.reminder ?? false);
    }
  }

  const canSave = title.trim().length > 0 && !!date;
  const save = () => {
    if (!canSave) return;
    onSave({ title, description, date, startTime, endTime, location, color, reminder });
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onCancel}
      title={initial ? 'Edit event' : 'New event'}
      submitLabel={initial ? 'Save' : 'Create'}
      onSubmit={save}
      submitDisabled={!canSave}
      onDelete={onDelete}
      deleteLabel="Delete event"
    >
      <Input
        label="Event title *"
        placeholder="Meeting, Birthday, etc."
        value={title}
        onChangeText={setTitle}
        className="mb-3"
      />

      <View className="mb-3">
        <DateField label="Date *" value={date} onChange={(v) => setDate(v ?? '')} clearable={false} />
      </View>

      <View className="flex-row gap-3 mb-3">
        <View className="flex-1">
          <TimeField label="Start time" value={startTime} onChange={(v) => setStartTime(v ?? '')} />
        </View>
        <View className="flex-1">
          <TimeField label="End time" value={endTime} onChange={(v) => setEndTime(v ?? '')} />
        </View>
      </View>

      <Input
        label="Location"
        placeholder="Office, Zoom, etc."
        value={location}
        onChangeText={setLocation}
        className="mb-3"
      />

      <TextArea
        label="Description"
        placeholder="Add details…"
        value={description}
        onChangeText={setDescription}
        minHeight={70}
        className="mb-3"
      />

      <Text className="text-ink-muted text-xs mb-2 ml-1">Color</Text>
      <View className="flex-row flex-wrap mb-3">
        {COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            accessibilityRole="button"
            accessibilityLabel={`Colour ${c}`}
            accessibilityState={{ selected: color === c }}
            style={{
              backgroundColor: c,
              width: 34, height: 34, borderRadius: 17, marginRight: 10, marginBottom: 8,
              borderWidth: color === c ? 3 : 0, borderColor: T.ink,
            }}
          />
        ))}
      </View>

      <Pressable
        onPress={() => setReminder((r) => !r)}
        accessibilityRole="switch"
        accessibilityState={{ checked: reminder }}
        accessibilityLabel="Reminder"
        className={`flex-row items-center self-start gap-2 px-3 py-2.5 rounded-2xl border mb-1 ${
          reminder ? 'border-accent bg-accent/10' : 'border-line'
        }`}
      >
        <Bell size={16} color={reminder ? T.accent : T.muted} />
        <Text className={`text-sm ${reminder ? 'text-accent' : 'text-ink-muted'}`}>Reminder</Text>
      </Pressable>
    </FormSheet>
  );
}
