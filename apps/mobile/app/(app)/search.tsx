import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Search as SearchIcon, X, Tag, Hash, CircleCheck } from 'lucide-react-native';
import { searchTasks, orderedProjects } from '@clearmind/shared/tasks';
import { TaskScreen, EmptyTasks } from '../../components/tasks/TaskScreen';
import { TaskList, taskItems, type ListItem } from '../../components/tasks/TaskList';
import { useTaskUI } from '../../components/tasks/TaskUIProvider';
import { C } from '../../components/tasks/theme';
import { FILTERS } from '../../components/tasks/filters';
import { projectColor } from '../../services/taskActions';

/**
 * Search across task names, descriptions, projects and labels. With an empty
 * query it shows quick filters, projects and labels to jump to.
 */
export default function SearchScreen() {
  const ui = useTaskUI();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [withDone, setWithDone] = useState(false);
  const query = q.trim();

  const results = useMemo(
    () => (query ? searchTasks(ui.tasks, query, ui.projectMap, ui.labelMap, withDone) : []),
    [ui.tasks, ui.projectMap, ui.labelMap, query, withDone]
  );
  const items = useMemo<ListItem[]>(() => taskItems(results), [results]);

  const filterCounts = useMemo(() => new Map(FILTERS.map((f) => [f.id, f.select(ui.tasks).length])), [ui.tasks]);
  const projectHits = query ? orderedProjects(ui.projects).filter(({ project }) => project.title.toLowerCase().includes(query.toLowerCase())) : [];
  const labelHits = query ? ui.labels.filter((l) => l.name.toLowerCase().includes(query.replace(/^[@%]/, '').toLowerCase())) : [];

  return (
    <TaskScreen title="Search" fab={false}>
      <View className="px-4 pb-2">
        <View className="flex-row items-center bg-midnight-light rounded-xl border border-line px-3">
          <SearchIcon size={18} color={C.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Tasks, projects, labels…"
            placeholderTextColor="#6b7280"
            className="flex-1 text-ink text-base py-3 ml-2"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear search"><X size={18} color={C.muted} /></Pressable>
          ) : null}
        </View>
        {query ? (
          <Pressable onPress={() => setWithDone((x) => !x)} className="flex-row items-center mt-2 self-start active:opacity-60" accessibilityRole="switch" accessibilityState={{ checked: withDone }}>
            <CircleCheck size={15} color={withDone ? C.accent : C.muted} />
            <Text className={`text-[13px] ml-1.5 ${withDone ? 'text-accent' : 'text-ink-muted'}`}>Include completed</Text>
          </Pressable>
        ) : null}
      </View>

      {query ? (
        <TaskList
          items={items}
          showProject
          showParent
          bottomInset={32}
          header={
            projectHits.length || labelHits.length ? (
              <View className="flex-row flex-wrap px-4 pb-2">
                {projectHits.map(({ project }) => (
                  <Pressable key={project.id} onPress={() => router.push(`/(app)/project/${project.id}`)} className="flex-row items-center rounded-lg border border-line px-2.5 py-1.5 mr-2 mb-2 active:opacity-60">
                    <Hash size={13} color={projectColor(project)} />
                    <Text className="text-ink text-[13px] ml-1">{project.title}</Text>
                  </Pressable>
                ))}
                {labelHits.map((l) => (
                  <Pressable key={l.id} onPress={() => router.push(`/(app)/label/${l.id}`)} className="flex-row items-center rounded-lg border border-line px-2.5 py-1.5 mr-2 mb-2 active:opacity-60">
                    <Tag size={13} color={l.color} />
                    <Text className="text-ink text-[13px] ml-1">{l.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null
          }
          empty={<EmptyTasks icon={<SearchIcon size={34} color={C.muted} />} title="No matching tasks" subtitle={`Nothing found for “${query}”.`} />}
        />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          <Text className="text-ink-muted text-xs font-semibold px-4 mt-3 mb-1">FILTERS</Text>
          {FILTERS.map((f) => (
            <Pressable key={f.id} onPress={() => router.push(`/(app)/filter/${f.id}`)} className="flex-row items-center px-4 py-3 active:bg-midnight-light" style={{ minHeight: 48 }} accessibilityRole="button">
              <View className="w-8">{f.icon}</View>
              <Text className="text-ink text-[15px] flex-1">{f.title}</Text>
              <Text className="text-ink-muted text-[13px]">{filterCounts.get(f.id) || ''}</Text>
            </Pressable>
          ))}
          {ui.labels.length ? (
            <>
              <Text className="text-ink-muted text-xs font-semibold px-4 mt-5 mb-1">LABELS</Text>
              <View className="flex-row flex-wrap px-4">
                {[...ui.labels].sort((a, b) => a.name.localeCompare(b.name)).map((l) => (
                  <Pressable key={l.id} onPress={() => router.push(`/(app)/label/${l.id}`)} className="flex-row items-center rounded-lg border border-line px-2.5 py-1.5 mr-2 mb-2 active:opacity-60">
                    <Tag size={13} color={l.color} />
                    <Text className="text-ink text-[13px] ml-1">{l.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </TaskScreen>
  );
}
