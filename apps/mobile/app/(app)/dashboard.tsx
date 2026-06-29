import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ListTodo, CircleCheckBig, NotebookPen, Target, ChevronRight } from 'lucide-react-native';
import type { Task, Note, Goal, Habit } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { useCollection } from '../../hooks/useCollection';
import { useAuth } from '../../hooks/useAuth';
import { Screen, AppHeader, Card, StatCard } from '../../components/ui';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const { items: tasks } = useCollection<Task>(STORES.TASKS);
  const { items: notes } = useCollection<Note>(STORES.NOTES);
  const { items: goals } = useCollection<Goal>(STORES.GOALS);
  const { items: habits } = useCollection<Habit>(STORES.HABITS);

  const name = profile?.nickname || user?.displayName || user?.email?.split('@')[0] || 'there';
  const pending = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const completed = tasks.length - pending.length;

  return (
    <Screen padded={false}>
      <AppHeader title="ClearMind" subtitle={`${greeting()}, ${name}`} />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap -mx-1.5">
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Tasks pending" value={pending.length} icon={<ListTodo size={18} color="#3B82F6" />} onPress={() => router.push('/(app)/tasks')} />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Completed" value={completed} icon={<CircleCheckBig size={18} color="#10b981" />} onPress={() => router.push('/(app)/tasks')} />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Notes" value={notes.length} icon={<NotebookPen size={18} color="#9ca3af" />} />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Goals" value={goals.length} icon={<Target size={18} color="#f59e0b" />} />
          </View>
        </View>

        <Text className="text-ink text-lg font-bold mt-4 mb-3">Today’s tasks</Text>
        {pending.length === 0 ? (
          <Card>
            <Text className="text-ink-muted text-center py-4">Nothing pending. You’re all caught up. 🎉</Text>
          </Card>
        ) : (
          <View>
            {pending.slice(0, 5).map((t) => (
              <Pressable key={t.id} onPress={() => router.push('/(app)/tasks')}>
                <Card className="mb-2.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-ink flex-1" numberOfLines={1}>{t.title}</Text>
                    <ChevronRight size={18} color="#9ca3af" />
                  </View>
                </Card>
              </Pressable>
            ))}
            {pending.length > 5 ? (
              <Pressable onPress={() => router.push('/(app)/tasks')} className="py-2">
                <Text className="text-accent text-center font-semibold">View all {pending.length} tasks</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {habits.length > 0 ? (
          <>
            <Text className="text-ink text-lg font-bold mt-6 mb-3">Habits</Text>
            <Card><Text className="text-ink-muted">{habits.length} tracked</Text></Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
