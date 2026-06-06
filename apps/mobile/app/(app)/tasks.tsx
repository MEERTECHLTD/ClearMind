import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Modal, ScrollView } from 'react-native';
import { CircleCheckBig, Circle, Pencil, Trash2, SquareCheckBig, CalendarClock } from 'lucide-react-native';
import type { Task } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { getFlag } from '../../lib/flags';
import { scheduleReminder, cancelReminder, toDateTime } from '../../services/notifications';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, TextArea, SegmentedControl, Badge, Fab, Select,
  DateField, TimeField, EmptyState, Spinner, confirmDialog, useToast,
} from '../../components/ui';

type Priority = 'High' | 'Medium' | 'Low';
type SortKey = 'default' | 'priority-high' | 'priority-low' | 'date';
// Tasks carry the scheduled local-notification id so we can cancel/reschedule it.
type MTask = Task & { reminderId?: string };

const PRIORITY_TONE = { High: 'red', Medium: 'green', Low: 'accent' } as const;
const PRIORITY_DOT = { High: 'bg-red-500', Medium: 'bg-emerald-500', Low: 'bg-accent' } as const;
const PVAL = { High: 3, Medium: 2, Low: 1 } as const;

const fmtTime = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
};

type FormData = { title: string; description: string; priority: Priority; dueDate?: string; dueTime?: string };

export default function TasksScreen() {
  const { items: tasks, loading, create, update, remove } = useCollection<MTask>(STORES.TASKS);
  const toast = useToast();
  const [sortBy, setSortBy] = useState<SortKey>('default');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MTask | null>(null);

  const sorted = useMemo(() => {
    const arr = [...tasks];
    const byDone = (a: MTask, b: MTask) => Number(a.completed) - Number(b.completed);
    if (sortBy === 'priority-high') return arr.sort((a, b) => byDone(a, b) || PVAL[b.priority] - PVAL[a.priority]);
    if (sortBy === 'priority-low') return arr.sort((a, b) => byDone(a, b) || PVAL[a.priority] - PVAL[b.priority]);
    if (sortBy === 'date')
      return arr.sort((a, b) => byDone(a, b) || (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity));
    return arr.sort(byDone);
  }, [tasks, sortBy]);

  const doneCount = tasks.filter((t) => t.completed).length;

  const toggle = async (task: MTask) => {
    const nowDone = !task.completed;
    if (nowDone) await cancelReminder(task.reminderId);
    update({ ...task, completed: nowDone, reminderId: nowDone ? undefined : task.reminderId });
  };

  const onDelete = async (task: MTask) => {
    if (await confirmDialog({ title: 'Delete task', message: `Delete “${task.title}”?`, confirmText: 'Delete', destructive: true })) {
      await cancelReminder(task.reminderId);
      remove(task.id);
      toast.show('Task deleted', 'info');
    }
  };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (task: MTask) => { setEditing(task); setFormOpen(true); };

  const scheduleIfDue = async (title: string, dueDate?: string, dueTime?: string, completed?: boolean): Promise<string | undefined> => {
    if (!getFlag('reminders') || !dueDate || completed) return undefined;
    const when = toDateTime(dueDate, dueTime);
    if (!when) return undefined;
    return (await scheduleReminder('Task due', title, when)) ?? undefined;
  };

  const handleSave = async (data: FormData) => {
    if (editing) {
      await cancelReminder(editing.reminderId);
      const reminderId = await scheduleIfDue(data.title, data.dueDate, data.dueTime, editing.completed);
      update({
        ...editing, title: data.title, description: data.description || undefined, priority: data.priority,
        dueDate: data.dueDate || undefined, dueTime: data.dueTime || undefined, reminderId,
      });
      toast.show('Task updated', 'success');
    } else {
      const nextNumber = tasks.reduce((m, t) => Math.max(m, t.taskNumber || 0), 0) + 1;
      const reminderId = await scheduleIfDue(data.title, data.dueDate, data.dueTime, false);
      create({
        id: newId(), title: data.title, completed: false, priority: data.priority,
        description: data.description || undefined, dueDate: data.dueDate || undefined, dueTime: data.dueTime || undefined,
        taskNumber: nextNumber, notified: false, reminderId,
      });
      toast.show(reminderId ? 'Task added · reminder set' : 'Task added', 'success');
    }
    setFormOpen(false);
  };

  if (loading) return <Spinner label="Loading tasks…" />;

  return (
    <Screen padded={false}>
      <AppHeader
        title="Tasks"
        subtitle={`${doneCount} / ${tasks.length} completed`}
        right={
          <Select<SortKey>
            value={sortBy}
            onChange={setSortBy}
            options={[
              { label: 'Default', value: 'default' },
              { label: 'Priority ↓', value: 'priority-high' },
              { label: 'Priority ↑', value: 'priority-low' },
              { label: 'Due date', value: 'date' },
            ]}
            className="w-36"
          />
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={<SquareCheckBig size={40} color="#3B82F6" />}
          title="No tasks yet"
          subtitle="Enjoy your freedom — or add some work."
          ctaTitle="Add a task"
          onCta={openAdd}
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <TaskRow task={item} onToggle={() => toggle(item)} onEdit={() => openEdit(item)} onDelete={() => onDelete(item)} />
          )}
        />
      )}

      <Fab onPress={openAdd} />
      <TaskFormModal visible={formOpen} initial={editing} onCancel={() => setFormOpen(false)} onSave={handleSave} />
    </Screen>
  );
}

function TaskRow({ task, onToggle, onEdit, onDelete }: { task: MTask; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className={task.completed ? 'opacity-60' : ''}>
      <View className="flex-row items-start">
        <Pressable onPress={onToggle} hitSlop={8} className="mr-3 mt-0.5 active:opacity-60">
          {task.completed ? <CircleCheckBig size={24} color="#10b981" /> : <Circle size={24} color="#9ca3af" />}
        </Pressable>

        <View className="flex-1">
          <View className="flex-row items-center flex-wrap">
            {task.taskNumber ? <Text className="text-ink-muted text-xs font-mono mr-2">#{task.taskNumber}</Text> : null}
            <View className={`w-2.5 h-2.5 rounded-full mr-2 ${PRIORITY_DOT[task.priority]}`} />
            <Text className={`text-base flex-shrink ${task.completed ? 'line-through text-ink-muted' : 'text-ink font-medium'}`}>{task.title}</Text>
          </View>
          {task.description ? <Text className="text-ink-muted text-sm mt-1" numberOfLines={2}>{task.description}</Text> : null}
          <View className="flex-row items-center mt-2">
            <Badge label={task.priority} tone={PRIORITY_TONE[task.priority]} />
            {task.dueDate ? (
              <View className="flex-row items-center ml-2">
                <CalendarClock size={13} color="#9ca3af" />
                <Text className="text-ink-muted text-xs ml-1">{task.dueDate}{task.dueTime ? ` · ${fmtTime(task.dueTime)}` : ''}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center ml-2">
          <Pressable onPress={onEdit} hitSlop={8} className="p-1.5 active:opacity-60"><Pencil size={18} color="#9ca3af" /></Pressable>
          <Pressable onPress={onDelete} hitSlop={8} className="p-1.5 active:opacity-60"><Trash2 size={18} color="#9ca3af" /></Pressable>
        </View>
      </View>
    </Card>
  );
}

function TaskFormModal({
  visible, initial, onCancel, onSave,
}: {
  visible: boolean;
  initial: MTask | null;
  onCancel: () => void;
  onSave: (d: FormData) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const [dueTime, setDueTime] = useState<string | undefined>(undefined);

  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setTitle(initial?.title ?? '');
      setDescription(initial?.description ?? '');
      setPriority(initial?.priority ?? 'Medium');
      setDueDate(initial?.dueDate);
      setDueTime(initial?.dueTime);
    }
  }

  const save = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim(), priority, dueDate, dueTime });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8" style={{ maxHeight: '90%' }}>
          <Text className="text-ink text-lg font-bold mb-4">{initial ? 'Edit task' : 'New task'}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Input placeholder="Task title" value={title} onChangeText={setTitle} autoFocus className="mb-3" />
            <TextArea placeholder="Description (optional)" value={description} onChangeText={setDescription} minHeight={70} className="mb-4" />
            <Text className="text-ink-muted text-xs mb-1.5 ml-1">Priority</Text>
            <SegmentedControl<Priority>
              value={priority}
              onChange={setPriority}
              segments={[{ label: 'High', value: 'High' }, { label: 'Medium', value: 'Medium' }, { label: 'Low', value: 'Low' }]}
              className="mb-4"
            />
            <DateField label="Due date (optional)" value={dueDate} onChange={setDueDate} />
            <View className="h-3" />
            <TimeField label="Due time (optional)" value={dueTime} onChange={setDueTime} />
          </ScrollView>
          <View className="flex-row gap-3 mt-5">
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
