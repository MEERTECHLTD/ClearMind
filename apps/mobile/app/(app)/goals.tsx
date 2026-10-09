import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Target, Trophy, Clock, Pencil, Trash2, Ellipsis, Plus, FolderKanban } from 'lucide-react-native';
import type { Goal, Project } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, Input, Select, DateField, SliderField, ProgressBar,
  Badge, Fab, EmptyState, Spinner, FormSheet, ActionMenu, confirmDialog, useToast,
} from '../../components/ui';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { T } from '../../lib/theme';

type Category = Goal['category'];

const CATEGORIES: Category[] = ['Career', 'Personal', 'Health', 'Skill'];

const CATEGORY_TONE: Record<Category, 'accent' | 'green' | 'amber' | 'red'> = {
  Career: 'accent',
  Personal: 'green',
  Health: 'amber',
  Skill: 'red',
};

const goalKey = (s: string) => s.trim().toLowerCase();

export default function GoalsScreen() {
  const { items: goals, loading, create, update, remove } = useCollection<Goal>(STORES.GOALS);
  const ui = useTaskUI();
  const router = useRouter();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [menuFor, setMenuFor] = useState<Goal | null>(null);

  // Projects aligned to a goal via their plan's strategic-goal alignments (matched by title).
  const projectsByGoal = useMemo(() => {
    const m = new Map<string, Project[]>();
    for (const p of ui.projects) {
      if (p.deleted) continue;
      const keys = new Set((p.alignments ?? []).map((a) => goalKey(a.strategicGoal ?? '')).filter(Boolean));
      for (const k of keys) {
        const list = m.get(k);
        if (list) list.push(p); else m.set(k, [p]);
      }
    }
    return m;
  }, [ui.projects]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (goal: Goal) => { setEditing(goal); setFormOpen(true); };
  const addNextStep = (goal: Goal) => ui.openQuickAdd({ description: `Goal: ${goal.title}` });

  const onDelete = async (goal: Goal): Promise<boolean> => {
    if (await confirmDialog({ title: 'Delete goal', message: `Delete “${goal.title}”?`, confirmText: 'Delete', destructive: true })) {
      remove(goal.id);
      toast.show('Goal deleted', 'info');
      return true;
    }
    return false;
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
          icon={<Target size={34} color={T.accent} />}
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
            <GoalRow
              goal={item}
              projects={projectsByGoal.get(goalKey(item.title)) ?? []}
              onEdit={() => openEdit(item)}
              onMenu={() => setMenuFor(item)}
              onAddStep={() => addNextStep(item)}
              onOpenProject={(id) => router.push(`/(app)/project/${id}?tab=plan`)}
            />
          )}
        />
      )}

      <Fab onPress={openAdd} label="Add goal" />

      <GoalFormSheet
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
        onDelete={editing ? async () => { if (await onDelete(editing)) setFormOpen(false); } : undefined}
      />

      <ActionMenu
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.title}
        actions={menuFor ? [
          { label: 'Add next step', icon: <Plus size={18} color={T.muted} />, onPress: () => addNextStep(menuFor) },
          { label: 'Edit goal', icon: <Pencil size={18} color={T.muted} />, onPress: () => openEdit(menuFor) },
          { label: 'Delete goal', icon: <Trash2 size={18} color={T.danger} />, destructive: true, onPress: () => { onDelete(menuFor); } },
        ] : []}
      />
    </Screen>
  );
}

function GoalRow({
  goal, projects, onEdit, onMenu, onAddStep, onOpenProject,
}: {
  goal: Goal;
  projects: Project[];
  onEdit: () => void;
  onMenu: () => void;
  onAddStep: () => void;
  onOpenProject: (id: string) => void;
}) {
  const done = goal.progress >= 100;
  return (
    <Card>
      <Pressable
        onPress={onEdit}
        onLongPress={onMenu}
        className="flex-row items-start active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={`Goal ${goal.title}, ${goal.progress}% complete. Tap to edit, long-press for options`}
      >
        <View className="w-11 h-11 rounded-xl bg-midnight-lighter items-center justify-center mr-3">
          <Target size={22} color={T.accent} />
        </View>

        <View className="flex-1">
          <Text className="text-ink text-base font-semibold" numberOfLines={2}>{goal.title}</Text>
          <View className="flex-row items-center mt-1.5">
            <Badge label={goal.category} tone={CATEGORY_TONE[goal.category]} />
          </View>
        </View>

        <Pressable
          onPress={onMenu}
          hitSlop={8}
          className="p-1.5 ml-2 -mt-1 -mr-1 rounded-full active:bg-midnight-lighter"
          accessibilityRole="button"
          accessibilityLabel={`Options for ${goal.title}`}
        >
          <Ellipsis size={18} color={T.muted} />
        </Pressable>
      </Pressable>

      <View className="flex-row items-center mt-3">
        <Clock size={13} color={T.muted} />
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

      {projects.length > 0 ? (
        <View className="mt-3">
          <Text className="text-ink-muted text-xs mb-1.5">Aligned projects</Text>
          <View className="flex-row flex-wrap" style={{ gap: 6 }}>
            {projects.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => onOpenProject(p.id)}
                className="flex-row items-center px-2.5 py-1.5 rounded-full border border-line bg-midnight active:opacity-70"
                style={{ maxWidth: '100%' }}
                accessibilityRole="button"
                accessibilityLabel={`Open project ${p.title} plan`}
              >
                <FolderKanban size={12} color={T.muted} />
                <Text className="text-ink text-xs ml-1.5 flex-shrink" numberOfLines={1}>{p.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={onAddStep}
        className="flex-row items-center self-start mt-3 py-1 active:opacity-60"
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Add next step for ${goal.title}`}
      >
        <Plus size={15} color={T.accent} />
        <Text className="text-accent text-xs font-semibold ml-1">Add next step</Text>
      </Pressable>
    </Card>
  );
}

function GoalFormSheet({
  visible, initial, onCancel, onSave, onDelete,
}: {
  visible: boolean;
  initial: Goal | null;
  onCancel: () => void;
  onSave: (d: { title: string; category: Category; targetDate?: string; progress: number }) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('Personal');
  const [targetDate, setTargetDate] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState(0);

  // Reset fields whenever the sheet (re)opens.
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
    <FormSheet
      visible={visible}
      onClose={onCancel}
      title={initial ? 'Edit goal' : 'New goal'}
      submitLabel={initial ? 'Save' : 'Create'}
      onSubmit={save}
      submitDisabled={!title.trim()}
      onDelete={onDelete}
      deleteLabel="Delete goal"
    >
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
      <View className="mb-2">
        <SliderField label="Progress" value={progress} onChange={setProgress} />
      </View>
    </FormSheet>
  );
}
