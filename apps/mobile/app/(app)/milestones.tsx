import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Modal } from 'react-native';
import { CircleCheckBig, Circle, Pencil, Trash2, Milestone as MilestoneIcon } from 'lucide-react-native';
import type { Milestone } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, TextArea, DateField, Badge, Fab,
  EmptyState, Spinner, confirmDialog, useToast,
} from '../../components/ui';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const todayISO = () => new Date().toISOString().split('T')[0];

/** ISO 'YYYY-MM-DD' -> friendly label; legacy/non-ISO values pass through verbatim. */
function formatDate(d: string): string {
  if (ISO_RE.test(d)) {
    const dt = new Date(d + 'T00:00:00');
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  return d;
}

/** Sort key: chronological for ISO/parseable, otherwise sinks to epoch 0. */
function dateKey(d: string): number {
  const dt = ISO_RE.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
  const t = dt.getTime();
  return isNaN(t) ? 0 : t;
}

export default function MilestonesScreen() {
  const { items, loading, create, update, remove } = useCollection<Milestone>(STORES.MILESTONES);
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);

  // Oldest -> newest so the timeline reads top (earliest) to bottom (latest).
  const sorted = useMemo(
    () => [...items].sort((a, b) => dateKey(a.date) - dateKey(b.date)),
    [items]
  );

  const reached = items.filter((m) => m.completed).length;

  const toggle = (m: Milestone) => update({ ...m, completed: !m.completed });

  const onDelete = async (m: Milestone) => {
    if (await confirmDialog({ title: 'Delete milestone', message: `Delete “${m.title}”?`, confirmText: 'Delete', destructive: true })) {
      remove(m.id);
      toast.show('Milestone deleted', 'info');
    }
  };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (m: Milestone) => { setEditing(m); setFormOpen(true); };

  const handleSave = (d: { title: string; description: string; date: string }) => {
    if (editing) {
      update({ ...editing, title: d.title, description: d.description, date: d.date });
      toast.show('Milestone updated', 'success');
    } else {
      create({ id: newId(), title: d.title, description: d.description, date: d.date, completed: false });
      toast.show('Milestone added', 'success');
    }
    setFormOpen(false);
  };

  if (loading) return <Spinner label="Loading milestones…" />;

  return (
    <Screen padded={false}>
      <AppHeader title="Journey Milestones" subtitle={`${reached} / ${items.length} reached`} />

      {items.length === 0 ? (
        <EmptyState
          icon={<MilestoneIcon size={40} color="#3B82F6" />}
          title="No milestones yet"
          subtitle="Add your first big win and visualize how far you have come."
          ctaTitle="Add a milestone"
          onCta={openAdd}
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          renderItem={({ item, index }) => (
            <MilestoneRow
              milestone={item}
              isFirst={index === 0}
              isLast={index === sorted.length - 1}
              onToggle={() => toggle(item)}
              onEdit={() => openEdit(item)}
              onDelete={() => onDelete(item)}
            />
          )}
        />
      )}

      <Fab onPress={openAdd} />

      <MilestoneFormModal
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </Screen>
  );
}

function MilestoneRow({
  milestone, isFirst, isLast, onToggle, onEdit, onDelete,
}: {
  milestone: Milestone;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { title, description, date, completed } = milestone;
  return (
    <View className="flex-row pb-6">
      {/* Timeline rail + toggleable dot */}
      <View className="w-9 items-center">
        {!isFirst ? <View className="absolute top-0 h-[14px] w-0.5 bg-hairline" /> : null}
        {!isLast ? <View className="absolute top-[14px] bottom-0 w-0.5 bg-hairline" /> : null}
        <Pressable onPress={onToggle} hitSlop={10} className="bg-midnight rounded-full active:opacity-60 z-10">
          {completed
            ? <CircleCheckBig size={26} color="#3B82F6" />
            : <Circle size={26} color="#64748b" />}
        </Pressable>
      </View>

      {/* Milestone card */}
      <View className="flex-1 ml-1">
        <Card className={completed ? '' : 'opacity-90'}>
          <View className="flex-row items-start justify-between">
            <Text className={`text-base font-bold flex-1 mr-2 ${completed ? 'text-ink' : 'text-ink-muted'}`}>
              {title}
            </Text>
            <Badge label={formatDate(date)} tone="accent" />
          </View>

          {description ? (
            <Text className="text-ink-muted text-sm mt-2 leading-5">{description}</Text>
          ) : null}

          <View className="flex-row items-center justify-end mt-3">
            <Pressable onPress={onEdit} hitSlop={8} className="p-1.5 active:opacity-60">
              <Pencil size={18} color="#9ca3af" />
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={8} className="p-1.5 active:opacity-60">
              <Trash2 size={18} color="#9ca3af" />
            </Pressable>
          </View>
        </Card>
      </View>
    </View>
  );
}

function MilestoneFormModal({
  visible, initial, onCancel, onSave,
}: {
  visible: boolean;
  initial: Milestone | null;
  onCancel: () => void;
  onSave: (d: { title: string; description: string; date: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISO());

  // Reset fields whenever the modal (re)opens.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setTitle(initial?.title ?? '');
      setDescription(initial?.description ?? '');
      // Guard: web/legacy records store date as "Jan 2025" — feeding that to
      // DateField produces an Invalid Date. Fall back to today for non-ISO values.
      setDate(initial && ISO_RE.test(initial.date) ? initial.date : todayISO());
    }
  }

  const save = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim(), date: date || todayISO() });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
          <Text className="text-ink text-lg font-bold mb-4">{initial ? 'Edit milestone' : 'New milestone'}</Text>
          <Input placeholder="Launched my first app" value={title} onChangeText={setTitle} autoFocus className="mb-3" />
          <TextArea placeholder="Details about this milestone…" value={description} onChangeText={setDescription} minHeight={80} className="mb-4" />
          <View className="mb-5">
            <DateField label="Date" value={date} onChange={(v) => setDate(v ?? todayISO())} clearable={false} />
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
