import { useState } from 'react';
import { View, Text, Pressable, FlatList, Modal, ScrollView } from 'react-native';
import { Target, Trophy, Clock, Pencil, Trash2 } from 'lucide-react-native';
import type { Goal } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, Select, DateField, SliderField, ProgressBar,
  Badge, Fab, EmptyState, Spinner, confirmDialog, useToast,
} from '../../components/ui';

type Category = Goal['category'];

const CATEGORIES: Category[] = ['Career', 'Personal', 'Health', 'Skill'];

const CATEGORY_TONE: Record<Category, 'accent' | 'green' | 'amber' | 'red'> = {
  Career: 'accent',
  Personal: 'green',
  Health: 'amber',
  Skill: 'red',
};

export default function GoalsScreen() {
  const { items: goals, loading, create, update, remove } = useCollection<Goal>(STORES.GOALS);
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (goal: Goal) => { setEditing(goal); setFormOpen(true); };

  const onDelete = async (goal: Goal) => {
    if (await confirmDialog({ title: 'Delete goal', message: `Delete “${goal.title}”?`, confirmText: 'Delete', destructive: true })) {
      remove(goal.id);
      toast.show('Goal deleted', 'info');
    }
  };

  const handleSave = (data: { title: string; category: Category; targetDate?: string; progress: number }) => {
    const progress = Math.round(data.progress);
    const targetDate = data.targetDate ?? 'No deadline';
    if (editing) {
      update({ ...editing, title: data.title, category: data.category, targetDate, progress });
      toast.show('Goal updated', 'success');
    } else {
      create({ id: newId(), title: data.title, category: data.category, targetDate, progress });
      toast.show('Goal added', 'success');
    }
    setFormOpen(false);
  };

  if (loading) return <Spinner label="Loading goals…" />;

  return (
    <Screen padded={false}>
      <AppHeader title="Goals" subtitle="Long term vision determines short term actions." />

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target size={40} color="#3B82F6" />}
          title="No goals yet"
          subtitle="Set a goal and watch your progress grow."
          ctaTitle="Set a goal"
          onCta={openAdd}
        />
      ) : (
        <FlatList
          data={goals}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <GoalRow goal={item} onEdit={() => openEdit(item)} onDelete={() => onDelete(item)} />
          )}
        />
      )}

      <Fab onPress={openAdd} />

      <GoalFormModal
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </Screen>
  );
}

function GoalRow({ goal, onEdit, onDelete }: { goal: Goal; onEdit: () => void; onDelete: () => void }) {
  const done = goal.progress >= 100;
  return (
    <Card>
      <View className="flex-row items-start">
        <View className="w-11 h-11 rounded-xl bg-midnight-lighter items-center justify-center mr-3">
          <Target size={22} color="#3B82F6" />
        </View>

        <View className="flex-1">
          <Text className="text-ink text-base font-semibold" numberOfLines={2}>{goal.title}</Text>
          <View className="flex-row items-center mt-1.5">
            <Badge label={goal.category} tone={CATEGORY_TONE[goal.category]} />
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

      <View className="flex-row items-center mt-3">
        <Clock size={13} color="#9ca3af" />
        <Text className="text-ink-muted text-xs ml-1.5">{goal.targetDate}</Text>
        {done ? <View className="ml-2"><Trophy size={14} color="#facc15" /></View> : null}
      </View>

      <View className="mt-3">
        <View className="flex-row justify-between mb-1.5">
          <Text className="text-ink-muted text-xs">Progress</Text>
          <Text className="text-ink text-xs font-semibold">{goal.progress}%</Text>
        </View>
        <ProgressBar value={goal.progress} tone={done ? 'green' : 'accent'} />
      </View>
    </Card>
  );
}

function GoalFormModal({
  visible, initial, onCancel, onSave,
}: {
  visible: boolean;
  initial: Goal | null;
  onCancel: () => void;
  onSave: (d: { title: string; category: Category; targetDate?: string; progress: number }) => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('Personal');
  const [targetDate, setTargetDate] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState(0);

  // Reset fields whenever the modal (re)opens.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setTitle(initial?.title ?? '');
      setCategory(initial?.category ?? 'Personal');
      setTargetDate(initial && initial.targetDate !== 'No deadline' ? initial.targetDate : undefined);
      setProgress(initial?.progress ?? 0);
    }
  }

  const save = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), category, targetDate, progress });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
          <Text className="text-ink text-lg font-bold mb-4">{initial ? 'Edit goal' : 'New goal'}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Input placeholder="What do you want to achieve?" value={title} onChangeText={setTitle} autoFocus className="mb-3" />
            <Select<Category>
              label="Category"
              value={category}
              onChange={setCategory}
              options={CATEGORIES.map((c) => ({ label: c, value: c }))}
              className="mb-3"
            />
            <View className="mb-3">
              <DateField label="Target date" value={targetDate} onChange={setTargetDate} placeholder="No deadline" />
            </View>
            <View className="mb-5">
              <SliderField label="Progress" value={progress} onChange={setProgress} />
            </View>
          </ScrollView>
          <View className="flex-row gap-3">
            <Pressable onPress={onCancel} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80">
              <Text className="text-ink font-semibold">Cancel</Text>
            </Pressable>
            <Pressable onPress={save} className="flex-1 items-center py-3.5 rounded-full bg-accent active:bg-accent-hover">
              <Text className="text-white font-bold">{initial ? 'Save' : 'Create'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
