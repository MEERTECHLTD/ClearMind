import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Modal, ScrollView } from 'react-native';
import {
  Flame, Check, Calendar, Pencil, Trash2, ChevronLeft, ChevronRight, X, CalendarCheck,
} from 'lucide-react-native';
import type { Habit } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, TextArea, Select, StatCard, Fab,
  EmptyState, Spinner, confirmDialog, useToast,
} from '../../components/ui';

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isSameDay = (date: Date) => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

export default function HabitsScreen() {
  const { items: habits, loading, create, update, remove } = useCollection<Habit>(STORES.HABITS);
  const toast = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);

  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [monthlyViewDate, setMonthlyViewDate] = useState(new Date());

  // --- business logic (ported verbatim from web HabitsView) ---
  const toggleToday = (id: string) => {
    const habit = habits.find((h) => h.id === id);
    if (!habit) return;
    const today = new Date().toISOString().split('T')[0];
    const newMonthlyHistory = { ...(habit.monthlyHistory || {}), [today]: !habit.completedToday };
    update({
      ...habit,
      completedToday: !habit.completedToday,
      streak: !habit.completedToday ? habit.streak + 1 : Math.max(0, habit.streak - 1),
      history: [...habit.history.slice(1), !habit.completedToday],
      monthlyHistory: newMonthlyHistory,
    });
  };

  const toggleMonthlyDay = (habitId: string, dateStr: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    const currentValue = habit.monthlyHistory?.[dateStr] || false;
    update({
      ...habit,
      monthlyHistory: { ...(habit.monthlyHistory || {}), [dateStr]: !currentValue },
    });
  };

  const daysInMonth = useMemo(() => {
    const year = monthlyViewDate.getFullYear();
    const month = monthlyViewDate.getMonth();
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
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  }, [monthlyViewDate]);

  const navigateMonth = (direction: number) => {
    setMonthlyViewDate(new Date(monthlyViewDate.getFullYear(), monthlyViewDate.getMonth() + direction, 1));
  };

  const completionRate = useMemo(() => {
    if (habits.length === 0) return 0;
    const completed = habits.filter((h) => h.completedToday).length;
    return Math.round((completed / habits.length) * 100);
  }, [habits]);

  const longestStreak = habits.length > 0 ? Math.max(...habits.map((h) => h.streak)) : 0;
  const selectedHabit = habits.find((h) => h.id === selectedHabitId);

  // --- handlers ---
  const onDelete = async (habit: Habit) => {
    if (await confirmDialog({ title: 'Delete habit', message: `Delete “${habit.name}”?`, confirmText: 'Delete', destructive: true })) {
      remove(habit.id);
      toast.show('Habit deleted', 'info');
    }
  };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (habit: Habit) => { setEditing(habit); setFormOpen(true); };

  const openMonthly = (habitId: string | null) => {
    setSelectedHabitId(habitId ?? (habits[0]?.id ?? null));
    setMonthlyViewDate(new Date());
    setMonthlyOpen(true);
  };

  const handleSave = (data: { name: string; description: string; color: string }) => {
    if (editing) {
      update({ ...editing, name: data.name, description: data.description || undefined, color: data.color });
      toast.show('Habit updated', 'success');
    } else {
      create({
        id: newId(),
        name: data.name,
        description: data.description || undefined,
        color: data.color,
        streak: 0,
        completedToday: false,
        history: [false, false, false, false, false, false, false],
        monthlyHistory: {},
        createdAt: new Date().toISOString(),
      });
      toast.show('Habit added', 'success');
    }
    setFormOpen(false);
  };

  if (loading) return <Spinner label="Loading habits…" />;

  return (
    <Screen padded={false}>
      <AppHeader
        title="Habit Tracker"
        subtitle="Consistency is the key to mastery."
        right={
          <Pressable onPress={() => openMonthly(null)} hitSlop={8} className="p-2 active:opacity-60">
            <Calendar size={22} color="#3B82F6" />
          </Pressable>
        }
      />

      {habits.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={40} color="#3B82F6" />}
          title="No habits tracked yet"
          subtitle="Build momentum one day at a time."
          ctaTitle="Add a habit"
          onCta={openAdd}
        />
      ) : (
        <FlatList
          data={habits}
          keyExtractor={(h) => h.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListHeaderComponent={
            <View className="flex-row gap-3 mb-4">
              <StatCard label="Today" value={`${completionRate}%`} className="flex-1" />
              <StatCard label="Active" value={habits.length} className="flex-1" />
              <StatCard label="Best streak" value={longestStreak} className="flex-1" />
            </View>
          }
          renderItem={({ item }) => (
            <HabitRow
              habit={item}
              onToggle={() => toggleToday(item.id)}
              onMonthly={() => openMonthly(item.id)}
              onEdit={() => openEdit(item)}
              onDelete={() => onDelete(item)}
            />
          )}
        />
      )}

      <Fab onPress={openAdd} />

      <HabitFormModal
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />

      <MonthlyModal
        visible={monthlyOpen}
        habits={habits}
        selectedHabit={selectedHabit}
        selectedHabitId={selectedHabitId}
        onSelectHabit={setSelectedHabitId}
        monthlyViewDate={monthlyViewDate}
        days={daysInMonth}
        onNavigate={navigateMonth}
        onToggleDay={toggleMonthlyDay}
        onClose={() => setMonthlyOpen(false)}
      />
    </Screen>
  );
}

function HabitRow({
  habit, onToggle, onMonthly, onEdit, onDelete,
}: {
  habit: Habit;
  onToggle: () => void;
  onMonthly: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color = habit.color || '#3B82F6';
  return (
    <Card>
      <View className="flex-row items-start">
        <Pressable
          onPress={onToggle}
          hitSlop={8}
          className="mr-3 mt-0.5 w-7 h-7 rounded-full items-center justify-center active:opacity-60"
          style={{
            backgroundColor: habit.completedToday ? '#10B981' : 'transparent',
            borderWidth: 1,
            borderColor: habit.completedToday ? '#10B981' : '#4b5563',
          }}
        >
          {habit.completedToday ? <Check size={16} color="#ffffff" /> : null}
        </Pressable>

        <View className="flex-1">
          <Text className="text-base font-semibold" numberOfLines={1} style={{ color }}>
            {habit.name}
          </Text>
          {habit.description ? (
            <Text className="text-ink-muted text-xs mt-0.5" numberOfLines={2}>{habit.description}</Text>
          ) : null}

          {/* 7-day history dots */}
          <View className="flex-row items-center mt-2.5">
            {habit.history.map((done, idx) => (
              <View
                key={idx}
                className="w-3.5 h-3.5 rounded-sm mr-1.5"
                style={{ backgroundColor: done ? color : '#374151' }}
              />
            ))}
            <View className="flex-row items-center ml-1">
              <Flame size={15} color={habit.streak > 0 ? '#f97316' : '#6b7280'} />
              <Text className={`ml-1 text-sm font-bold ${habit.streak > 0 ? 'text-orange-500' : 'text-ink-muted'}`}>
                {habit.streak}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-center ml-2">
          <Pressable onPress={onMonthly} hitSlop={6} className="p-1.5 active:opacity-60">
            <Calendar size={17} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={onEdit} hitSlop={6} className="p-1.5 active:opacity-60">
            <Pencil size={17} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={6} className="p-1.5 active:opacity-60">
            <Trash2 size={17} color="#9ca3af" />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

function HabitFormModal({
  visible, initial, onCancel, onSave,
}: {
  visible: boolean;
  initial: Habit | null;
  onCancel: () => void;
  onSave: (d: { name: string; description: string; color: string }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3B82F6');

  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setColor(initial?.color ?? '#3B82F6');
    }
  }

  const save = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), color });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
          <Text className="text-ink text-lg font-bold mb-4">{initial ? 'Edit habit' : 'New habit'}</Text>
          <Input placeholder="Read for 30 minutes" value={name} onChangeText={setName} autoFocus className="mb-3" />
          <TextArea placeholder="Optional notes about this habit…" value={description} onChangeText={setDescription} minHeight={70} className="mb-4" />

          <Text className="text-ink-muted text-xs mb-2 ml-1">Color</Text>
          <View className="flex-row flex-wrap gap-3 mb-5">
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                className="w-9 h-9 rounded-full active:opacity-80"
                style={{
                  backgroundColor: c,
                  borderWidth: color === c ? 3 : 0,
                  borderColor: '#ffffff',
                }}
              />
            ))}
          </View>

          <View className="flex-row gap-3">
            <Pressable onPress={onCancel} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80">
              <Text className="text-ink font-semibold">Cancel</Text>
            </Pressable>
            <Pressable onPress={save} className="flex-1 items-center py-3.5 rounded-full bg-accent active:bg-accent-hover">
              <Text className="text-white font-bold">{initial ? 'Save' : 'Add'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MonthlyModal({
  visible, habits, selectedHabit, selectedHabitId, onSelectHabit,
  monthlyViewDate, days, onNavigate, onToggleDay, onClose,
}: {
  visible: boolean;
  habits: Habit[];
  selectedHabit: Habit | undefined;
  selectedHabitId: string | null;
  onSelectHabit: (id: string) => void;
  monthlyViewDate: Date;
  days: { date: Date; isCurrentMonth: boolean }[];
  onNavigate: (dir: number) => void;
  onToggleDay: (habitId: string, dateStr: string) => void;
  onClose: () => void;
}) {
  const color = selectedHabit?.color || '#3B82F6';
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen padded={false}>
        <AppHeader
          title="Monthly Tracker"
          subtitle="Tap a day to toggle completion"
          right={
            <Pressable onPress={onClose} hitSlop={8} className="p-2 active:opacity-60">
              <X size={22} color="#e2e8f0" />
            </Pressable>
          }
        />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {habits.length > 0 ? (
            <Select
              label="Habit"
              value={selectedHabitId ?? ''}
              onChange={(v) => onSelectHabit(v)}
              options={habits.map((h) => ({ label: h.name, value: h.id }))}
              className="mb-4"
            />
          ) : null}

          <View className="flex-row items-center justify-between mb-4">
            <Pressable onPress={() => onNavigate(-1)} hitSlop={8} className="p-2 rounded-xl bg-midnight-light active:opacity-70">
              <ChevronLeft size={20} color="#9ca3af" />
            </Pressable>
            <Text className="text-ink text-base font-semibold">
              {MONTH_NAMES[monthlyViewDate.getMonth()]} {monthlyViewDate.getFullYear()}
            </Text>
            <Pressable onPress={() => onNavigate(1)} hitSlop={8} className="p-2 rounded-xl bg-midnight-light active:opacity-70">
              <ChevronRight size={20} color="#9ca3af" />
            </Pressable>
          </View>

          {selectedHabit ? (
            <>
              <View className="flex-row flex-wrap">
                {WEEK_DAYS.map((d) => (
                  <View key={d} className="w-[14.2857%] items-center py-1.5">
                    <Text className="text-ink-muted text-[10px] font-semibold uppercase">{d}</Text>
                  </View>
                ))}
              </View>

              <View className="flex-row flex-wrap">
                {days.map(({ date, isCurrentMonth }, index) => {
                  const dateStr = date.toISOString().split('T')[0];
                  const isCompleted = selectedHabit.monthlyHistory?.[dateStr] || false;
                  const isPast = date < new Date() && !isSameDay(date);
                  const today = isSameDay(date);
                  return (
                    <View key={index} className="w-[14.2857%] aspect-square p-0.5">
                      <Pressable
                        onPress={() => isCurrentMonth && onToggleDay(selectedHabit.id, dateStr)}
                        disabled={!isCurrentMonth}
                        className="flex-1 rounded-xl items-center justify-center active:opacity-80"
                        style={{
                          opacity: isCurrentMonth ? 1 : 0.3,
                          backgroundColor: isCompleted
                            ? color
                            : isPast
                              ? 'rgba(239,68,68,0.18)'
                              : '#1f2937',
                          borderWidth: today ? 2 : 0,
                          borderColor: '#3B82F6',
                        }}
                      >
                        <Text className={`text-sm font-medium ${isCompleted ? 'text-white' : 'text-ink'}`}>
                          {date.getDate()}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              {/* Legend */}
              <View className="flex-row gap-5 mt-5">
                <View className="flex-row items-center">
                  <View className="w-4 h-4 rounded mr-2" style={{ backgroundColor: color }} />
                  <Text className="text-ink-muted text-sm">Completed</Text>
                </View>
                <View className="flex-row items-center">
                  <View className="w-4 h-4 rounded mr-2" style={{ backgroundColor: 'rgba(239,68,68,0.18)' }} />
                  <Text className="text-ink-muted text-sm">Missed</Text>
                </View>
              </View>
            </>
          ) : (
            <View className="items-center py-16">
              <Calendar size={48} color="#475569" />
              <Text className="text-ink-muted text-sm mt-3">Select a habit to view monthly progress</Text>
            </View>
          )}
        </ScrollView>
      </Screen>
    </Modal>
  );
}
