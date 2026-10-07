import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { History, Bot, Smartphone, Globe, Terminal, Bell, LayoutGrid } from 'lucide-react-native';
import type { Activity } from '@clearmind/shared';
import { useCollection } from '../../hooks/useCollection';
import { STORES } from '../../services/db';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { TaskScreen, EmptyTasks } from '../../components/tasks/TaskScreen';
import { Segments } from '../../components/settings/ui';
import { T } from '../../lib/theme';

const VERB: Record<string, string> = {
  created: 'created', completed: 'completed', reopened: 'reopened', deleted: 'deleted', restored: 'restored', moved: 'moved',
  priority: 'changed priority of', rescheduled: 'rescheduled', renamed: 'renamed', commented: 'commented on', archived: 'archived', unarchived: 'unarchived',
};
const SRC: Record<string, { label: string; Icon: typeof Bot }> = {
  android: { label: 'Android', Icon: Smartphone }, ios: { label: 'iPhone', Icon: Smartphone }, web: { label: 'Web', Icon: Globe },
  mcp: { label: 'MCP', Icon: Bot }, api: { label: 'API', Icon: Bot }, cli: { label: 'CLI', Icon: Terminal }, widget: { label: 'Widget', Icon: LayoutGrid }, notification: { label: 'Notification', Icon: Bell },
};

function describe(a: Activity, projectName?: string) {
  const d = (a.details ?? {}) as Record<string, any>;
  const what = a.entity === 'project' ? `project “${a.title}”` : a.entity === 'section' ? `section “${a.title}”` : `“${a.title ?? 'task'}”`;
  let extra = '';
  if (a.action === 'priority') extra = ` ${d.from} → ${d.to}`;
  if (a.action === 'rescheduled') extra = d.to ? ` to ${d.to}` : ' (no date)';
  if (a.action === 'completed' && d.next) extra = ` · next ${d.next}`;
  if (a.action === 'commented' && d.text) extra = `: ${d.text}`;
  return `${VERB[a.action] ?? a.action} ${what}${extra}${projectName && a.entity !== 'project' ? ` in ${projectName}` : ''}`;
}

/** History of meaningful changes across devices and agents. */
export default function ActivityScreen() {
  const { project } = useLocalSearchParams<{ project?: string }>();
  const ui = useTaskUI();
  const { items, loading } = useCollection<Activity>(STORES.ACTIVITY);
  const [filter, setFilter] = useState<'all' | 'agents' | 'mine'>('all');
  const list = useMemo(() => items
    .filter((a) => !a.deleted && (!project || a.projectId === project))
    .filter((a) => filter === 'all' || (filter === 'agents' ? ['mcp', 'api', 'cli'].includes(a.source ?? '') : !['mcp', 'api', 'cli'].includes(a.source ?? '')))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 400), [items, project, filter]);
  const proj = project ? ui.projectMap.get(project) : null;
  return (
    <TaskScreen title="Activity" subtitle={proj ? proj.title : 'All changes, from every device and agent'} back fab={false}>
      <Segments value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Me' }, { value: 'agents', label: 'Agents' }]} />
      {loading ? null : list.length ? (
        <FlashList
          data={list}
          estimatedItemSize={64}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: a }) => {
            const s = SRC[a.source ?? ''] ?? { label: a.source ?? '', Icon: History };
            return (
              <View className="flex-row px-4 py-3 border-b border-line">
                <View className="w-8 pt-0.5"><s.Icon size={16} color={['mcp', 'api', 'cli'].includes(a.source ?? '') ? T.accent : T.muted} /></View>
                <View className="flex-1">
                  <Text className="text-ink text-[14px]">{a.agent ? <Text className="font-semibold">{a.agent} </Text> : null}{describe(a, a.projectId && !project ? ui.projectMap.get(a.projectId)?.title : undefined)}</Text>
                  <Text className="text-ink-muted text-xs mt-0.5">{new Date(a.at).toLocaleString()} · {s.label}</Text>
                </View>
              </View>
            );
          }}
        />
      ) : <EmptyTasks icon={<History size={32} color={T.muted} />} title="No activity yet" subtitle="Changes from your devices and connected agents appear here." />}
    </TaskScreen>
  );
}
