import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import {
  ChevronLeft, ChevronRight, X, Clock, MapPin, Trash2, Pencil,
  Calendar as CalendarIcon, Bell,
} from 'lucide-react-native';
import type { CalendarEvent } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, TextArea, DateField, TimeField,
  EmptyState, Spinner, Fab, confirmDialog, useToast,
} from '../../components/ui';

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

export default function CalendarScreen() {
  const { items: events, loading, create, update, remove } = useCollection<CalendarEvent>(STORES.EVENTS);
  const toast = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [presetDate, setPresetDate] = useState<string>(toDateStr(new Date()));

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

  const handleSave = (form: {
    title: string; description: string; date: string;
    startTime: string; endTime: string; location: string;
    color: string; reminder: boolean;
  }) => {
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

  const onDelete = async (event: CalendarEvent) => {
    if (await confirmDialog({
      title: 'Delete event',
      message: `Delete “${event.title}”?`,
      confirmText: 'Delete',
      destructive: true,
    })) {
      remove(event.id);
      toast.show('Event deleted', 'info');
    }
  };

  const selectedEvents = getEventsForDate(selectedDate);

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
            <Pressable onPress={() => navigateMonth(-1)} hitSlop={10} className="p-2 rounded-full active:bg-midnight-lighter">
              <ChevronLeft size={22} color="#9ca3af" />
            </Pressable>
            <Text className="text-ink text-lg font-bold">
              {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </Text>
            <Pressable onPress={() => navigateMonth(1)} hitSlop={10} className="p-2 rounded-full active:bg-midnight-lighter">
              <ChevronRight size={22} color="#9ca3af" />
            </Pressable>
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
                const selected = sameDay(date, selectedDate);
                const today = isToday(date);
                return (
                  <Pressable
                    key={ci}
                    onPress={() => setSelectedDate(date)}
                    style={{ minHeight: 52 }}
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
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Card>

        {/* Selected day */}
        <View className="flex-row items-center justify-between mt-5 mb-3 px-1">
          <View className="flex-row items-center flex-1 pr-2">
            <CalendarIcon size={18} color="#3B82F6" />
            <Text className="text-ink font-bold ml-2 flex-shrink" numberOfLines={1}>{longDate(selectedDate)}</Text>
          </View>
          <Pressable onPress={() => openAdd(selectedDate)} hitSlop={8} className="px-3 py-1.5 rounded-full bg-accent active:bg-accent-hover">
            <Text className="text-white text-xs font-semibold">+ Add</Text>
          </Pressable>
        </View>

        {selectedEvents.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={40} color="#3B82F6" />}
            title="No events on this day"
            subtitle="Tap a date or use Add to plan something."
            ctaTitle="Add an event"
            onCta={() => openAdd(selectedDate)}
          />
        ) : (
          <View>
            {selectedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={() => openEdit(event)}
                onDelete={() => onDelete(event)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Fab onPress={() => openAdd()} />

      <EventFormModal
        visible={formOpen}
        initial={editing}
        presetDate={presetDate}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </Screen>
  );
}

function EventCard({ event, onEdit, onDelete }: { event: CalendarEvent; onEdit: () => void; onDelete: () => void }) {
  const hasTime = event.startTime || event.endTime;
  return (
    <Card className="mb-3" >
      <View style={{ borderLeftColor: event.color, borderLeftWidth: 4, paddingLeft: 12 }}>
        <View className="flex-row items-start justify-between">
          <Text className="text-ink font-semibold flex-1 pr-2">{event.title}</Text>
          <View className="flex-row items-center">
            <Pressable onPress={onEdit} hitSlop={8} className="p-1.5 active:opacity-60">
              <Pencil size={16} color="#9ca3af" />
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={8} className="p-1.5 active:opacity-60">
              <Trash2 size={16} color="#9ca3af" />
            </Pressable>
          </View>
        </View>

        {hasTime ? (
          <View className="flex-row items-center mt-1">
            <Clock size={12} color="#9ca3af" />
            <Text className="text-ink-muted text-xs ml-1.5">
              {formatTime(event.startTime)}{event.endTime ? ` - ${formatTime(event.endTime)}` : ''}
            </Text>
          </View>
        ) : null}

        {event.location ? (
          <View className="flex-row items-center mt-1">
            <MapPin size={12} color="#9ca3af" />
            <Text className="text-ink-muted text-xs ml-1.5 flex-1">{event.location}</Text>
          </View>
        ) : null}

        {event.reminder ? (
          <View className="flex-row items-center mt-1">
            <Bell size={12} color="#3B82F6" />
            <Text className="text-accent text-xs ml-1.5">Reminder on</Text>
          </View>
        ) : null}

        {event.description ? <Text className="text-ink-muted text-sm mt-2">{event.description}</Text> : null}
      </View>
    </Card>
  );
}

function EventFormModal({
  visible, initial, presetDate, onCancel, onSave,
}: {
  visible: boolean;
  initial: CalendarEvent | null;
  presetDate: string;
  onCancel: () => void;
  onSave: (form: {
    title: string; description: string; date: string;
    startTime: string; endTime: string; location: string;
    color: string; reminder: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<string>(presetDate);
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [location, setLocation] = useState('');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [reminder, setReminder] = useState(false);

  // Reset fields whenever the modal (re)opens.
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8" onPress={() => {}}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-ink text-lg font-bold">{initial ? 'Edit event' : 'New event'}</Text>
            <Pressable onPress={onCancel} hitSlop={8} className="p-1 active:opacity-60">
              <X size={22} color="#9ca3af" />
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: 460 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
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
                  style={{
                    backgroundColor: c,
                    width: 34, height: 34, borderRadius: 17, marginRight: 10, marginBottom: 8,
                    borderWidth: color === c ? 3 : 0, borderColor: '#ffffff',
                  }}
                />
              ))}
            </View>

            <Pressable
              onPress={() => setReminder((r) => !r)}
              className={`flex-row items-center self-start gap-2 px-3 py-2.5 rounded-2xl border mb-1 ${
                reminder ? 'border-accent bg-accent/10' : 'border-hairline'
              }`}
            >
              <Bell size={16} color={reminder ? '#3B82F6' : '#9ca3af'} />
              <Text className={`text-sm ${reminder ? 'text-accent' : 'text-ink-muted'}`}>Reminder</Text>
            </Pressable>
          </ScrollView>

          <View className="flex-row gap-3 mt-5">
            <Pressable onPress={onCancel} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80">
              <Text className="text-ink font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!canSave}
              className={`flex-1 items-center py-3.5 rounded-full ${canSave ? 'bg-accent active:bg-accent-hover' : 'bg-accent opacity-50'}`}
            >
              <Text className="text-white font-bold">{initial ? 'Save' : 'Create'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
