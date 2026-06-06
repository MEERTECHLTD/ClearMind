import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Modal } from 'react-native';
import { CircleCheckBig, Circle, Pencil, Trash2, ArrowUpDown, SquareCheckBig } from 'lucide-react-native';
import type { Task } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, TextArea, SegmentedControl, Badge, Fab, Select,
  EmptyState, Spinner, confirmDialog, useToast,
} from '../../components/ui';

type Priority = 'High' | 'Medium' | 'Low';
type SortKey = 'default' | 'priority-high' | 'priority-low';

const PRIORITY_TONE = { High: 'red', Medium: 'green', Low: 'accent' } as const;
const PRIORITY_DOT = { High: 'bg-red-500', Medium: 'bg-emerald-500', Low: 'bg-accent' } as const;
const PVAL = { High: 3, Medium: 2, Low: 1 } as const;

export default function TasksScreen() {
  const { items: tasks, loading, create, update, remove } = useCollection<Task>(STORES.TASKS);
  const toast = useToast();
  const [sortBy, setSortBy] = useState<SortKey>('default');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const sorted = useMemo(() => {
    const arr = [...tasks];
    const byDone = (a: Task, b: Task) => Number(a.completed) - Number(b.completed);
    if (sortBy === 'priority-high')
      return arr.sort((a, b) => byDone(a, b) || PVAL[b.priority] - PVAL[a.priority]);
    if (sortBy === 'priority-low')
      return arr.sort((a, b) => byDone(a, b) || PVAL[a.priority] - PVAL[b.priority]);
    return arr.sort(byDone);
  }, [tasks, sortBy]);

  const doneCount = tasks.filter((t) => t.completed).length;

  const toggle = (task: Task) => update({ ...task, completed: !task.completed });

  const onDelete = async (task: Task) => {
    if (await confirmDialog({ title: 'Delete task', message: `Delete “${task.title}”?`, confirmText: 'Delete', destructive: true })) {
      remove(task.id);
      toast.show('Task deleted', 'info');
    }
  };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (task: Task) => { setEditing(task); setFormOpen(true); };

  const handleSave = (data: { title: string; description: string; priority: Priority }) => {
    if (editing) {
      update({ ...editing, title: data.title, description: data.description || undefined, priority: data.priority });
      toast.show('Task updated', 'success');
    } else {
      const nextNumber = tasks.reduce((m, t) => Math.max(m, t.taskNumber || 0), 0) + 1;
      create({
        id: Date.now().toString(),
        title: data.title,
        completed: false,
        priority: data.priority,
        description: data.description || undefined,
        taskNumber: nextNumber,
        notified: false,
      });
      toast.show('Task added', 'success');
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

      <TaskFormModal
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </Screen>
  );
}

function TaskRow({ task, onToggle, onEdit, onDelete }: { task: Task; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
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
            <Text className={`text-base flex-shrink ${task.completed ? 'line-through text-ink-muted' : 'text-ink font-medium'}`}>
              {task.title}
            </Text>
          </View>
          {task.description ? <Text className="text-ink-muted text-sm mt-1" numberOfLines={2}>{task.description}</Text> : null}
          <View className="flex-row items-center mt-2">
            <Badge label={task.priority} tone={PRIORITY_TONE[task.priority]} />
          </View>
        </View>

        <View className="flex-row items-center ml-2">
          <Pressable onPress={onEdit} hitSlop={8} className="p-1.5 active:opacity-60">
            <Pencil size={18} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} className="p-1.5 active:opacity-60">
            <Trash2 size={18} color="#9ca3af" />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

function TaskFormModal({
  visible, initial, onCancel, onSave,
}: {
  visible: boolean;
  initial: Task | null;
  onCancel: () => void;
  onSave: (d: { title: string; description: string; priority: Priority }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');

  // Reset fields whenever the modal (re)opens.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setTitle(initial?.title ?? '');
      setDescription(initial?.description ?? '');
      setPriority(initial?.priority ?? 'Medium');
    }
  }

  const save = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim(), priority });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
          <Text className="text-ink text-lg font-bold mb-4">{initial ? 'Edit task' : 'New task'}</Text>
          <Input placeholder="Task title" value={title} onChangeText={setTitle} autoFocus className="mb-3" />
          <TextArea placeholder="Description (optional)" value={description} onChangeText={setDescription} minHeight={80} className="mb-4" />
          <Text className="text-ink-muted text-xs mb-1.5 ml-1">Priority</Text>
          <SegmentedControl<Priority>
            value={priority}
            onChange={setPriority}
            segments={[{ label: 'High', value: 'High' }, { label: 'Medium', value: 'Medium' }, { label: 'Low', value: 'Low' }]}
            className="mb-5"
          />
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
