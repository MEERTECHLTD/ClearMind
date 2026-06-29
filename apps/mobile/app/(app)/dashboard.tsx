import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ListTodo, CircleCheckBig, NotebookPen, Target, ChevronRight, Briefcase, FolderKanban, CalendarClock } from 'lucide-react-native';
import type { Task, Note, Goal, Habit, Application, Project } from '@clearmind/shared';
import { applicationDeadline, relativeDeadline, isDeadlineSoon, REMINDER_SKIP_STATUSES } from '@clearmind/shared/applications';
import { STORES } from '../../services/db';
import { useCollection } from '../../hooks/useCollection';
import { useAuth } from '../../hooks/useAuth';
import { Screen, AppHeader, Card, StatCard, ProgressBar } from '../../components/ui';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const CLOSED_PROJECT = ['Completed', 'Cancelled'];

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const { items: tasks } = useCollection<Task>(STORES.TASKS);
  const { items: notes } = useCollection<Note>(STORES.NOTES);
  const { items: goals } = useCollection<Goal>(STORES.GOALS);
  const { items: habits } = useCollection<Habit>(STORES.HABITS);
  const { items: applications } = useCollection<Application>(STORES.APPLICATIONS);
  const { items: projects } = useCollection<Project>(STORES.PROJECTS);

  const name = profile?.nickname || user?.displayName || user?.email?.split('@')[0] || 'there';
  const pending = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const completed = tasks.length - pending.length;

  // Applications a user still needs to act on, and the soonest deadlines.
  const activeApps = useMemo(
    () => applications.filter((a) => !REMINDER_SKIP_STATUSES.includes(a.status) || a.status === 'submitted'),
    [applications],
  );
  const upcomingApps = useMemo(
    () =>
      applications
        .map((a) => ({ a, d: applicationDeadline(a) }))
        .filter((x) => x.d && new Date(x.d!).getTime() >= Date.now() - 86400000)
        .sort((x, y) => new Date(x.d!).getTime() - new Date(y.d!).getTime())
        .slice(0, 3),
    [applications],
  );

  const activeProjects = useMemo(
    () => projects.filter((p) => !CLOSED_PROJECT.includes(p.status)).sort((a, b) => (b.progress || 0) - (a.progress || 0)),
    [projects],
  );

  return (
    <Screen padded={false}>
      <AppHeader title="ClearMind" subtitle={`${greeting()}, ${name}`} />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* At-a-glance — Applications & Projects lead (core features) */}
        <View className="flex-row flex-wrap -mx-1.5">
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Applications" value={activeApps.length} icon={<Briefcase size={18} color="#3B82F6" />} onPress={() => router.push('/(app)/applications')} />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Projects" value={activeProjects.length} icon={<FolderKanban size={18} color="#a855f7" />} onPress={() => router.push('/(app)/projects')} />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Tasks pending" value={pending.length} icon={<ListTodo size={18} color="#f59e0b" />} onPress={() => router.push('/(app)/tasks')} />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Completed" value={completed} icon={<CircleCheckBig size={18} color="#10b981" />} onPress={() => router.push('/(app)/tasks')} />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Goals" value={goals.length} icon={<Target size={18} color="#34d399" />} onPress={() => router.push('/(app)/goals')} />
          </View>
          <View className="w-1/2 px-1.5 mb-3">
            <StatCard label="Notes" value={notes.length} icon={<NotebookPen size={18} color="#9ca3af" />} onPress={() => router.push('/(app)/notes')} />
          </View>
        </View>

        {/* Applications — upcoming deadlines (core feature, surfaced) */}
        <SectionHeader title="Application deadlines" actionLabel={applications.length ? 'All' : undefined} onAction={() => router.push('/(app)/applications')} />
        {upcomingApps.length === 0 ? (
          <Card>
            <Text className="text-ink-muted text-center py-4">
              {applications.length ? 'No upcoming deadlines.' : 'Track jobs, grants & scholarships — tap to add your first.'}
            </Text>
          </Card>
        ) : (
          <View>
            {upcomingApps.map(({ a, d }) => {
              const soon = isDeadlineSoon(d);
              return (
                <Pressable key={a.id} onPress={() => router.push('/(app)/applications')}>
                  <Card className="mb-2.5">
                    <View className="flex-row items-center">
                      <Briefcase size={16} color="#3B82F6" />
                      <View className="flex-1 ml-2.5">
                        <Text className="text-ink font-medium" numberOfLines={1}>{a.name}</Text>
                        {a.organization ? <Text className="text-ink-muted text-xs" numberOfLines={1}>{a.organization}</Text> : null}
                      </View>
                      <View className="flex-row items-center">
                        <CalendarClock size={13} color={soon ? '#f97316' : '#9ca3af'} />
                        <Text className={`text-xs ml-1 ${soon ? 'text-orange-400 font-semibold' : 'text-ink-muted'}`}>{relativeDeadline(d)}</Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Projects — active with progress */}
        {activeProjects.length > 0 ? (
          <>
            <SectionHeader title="Active projects" actionLabel="All" onAction={() => router.push('/(app)/projects')} />
            {activeProjects.slice(0, 3).map((p) => (
              <Pressable key={p.id} onPress={() => router.push('/(app)/projects')}>
                <Card className="mb-2.5">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-ink font-medium flex-1 mr-2" numberOfLines={1}>{p.title}</Text>
                    <Text className="text-ink-muted text-xs">{p.progress || 0}%</Text>
                  </View>
                  <ProgressBar value={p.progress || 0} />
                </Card>
              </Pressable>
            ))}
          </>
        ) : null}

        {/* Today's tasks */}
        <SectionHeader title="Today’s tasks" actionLabel={pending.length > 5 ? `All ${pending.length}` : undefined} onAction={() => router.push('/(app)/tasks')} />
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
          </View>
        )}

        {habits.length > 0 ? (
          <>
            <SectionHeader title="Habits" actionLabel="All" onAction={() => router.push('/(app)/habits')} />
            <Card><Text className="text-ink-muted">{habits.length} tracked</Text></Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View className="flex-row items-center justify-between mt-6 mb-3">
      <Text className="text-ink text-lg font-bold">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} className="flex-row items-center active:opacity-60">
          <Text className="text-accent text-sm font-semibold">{actionLabel}</Text>
          <ChevronRight size={16} color="#3B82F6" />
        </Pressable>
      ) : null}
    </View>
  );
}
