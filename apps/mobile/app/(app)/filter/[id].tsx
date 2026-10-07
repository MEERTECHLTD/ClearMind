import { useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Filter as FilterIcon, Pencil } from 'lucide-react-native';
import type { SavedFilter, Section } from '@clearmind/shared';
import { runFilter } from '@clearmind/shared/domain';
import { priorityFromLevel, todayISO } from '@clearmind/shared/tasks';
import { TaskScreen, EmptyTasks, IconButton } from '../../../components/tasks/TaskScreen';
import { TaskList, taskItems } from '../../../components/tasks/TaskList';
import { useTaskUI } from '../../../components/tasks/TaskUIProvider';
import { FILTERS } from '../../../components/tasks/filters';
import { SavedFilterSheet } from '../../../components/tasks/SavedFilterSheet';
import { useCollection } from '../../../hooks/useCollection';
import { STORES } from '../../../services/db';
import { C } from '../../../components/tasks/theme';

export default function FilterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ui = useTaskUI();
  const { items: saved } = useCollection<SavedFilter>(STORES.FILTERS);
  const { items: sections } = useCollection<Section>(STORES.SECTIONS);
  const [edit, setEdit] = useState(false);
  const savedFilter = id?.startsWith('saved:') ? saved.find((f) => f.id === id.slice(6) && !f.deleted) : undefined;
  const builtIn = savedFilter ? undefined : FILTERS.find((f) => f.id === id) ?? FILTERS[0];

  const tasks = useMemo(() => {
    if (savedFilter) {
      try { return runFilter(ui.tasks, savedFilter.query, { projects: ui.projects, labels: ui.labels, sections, weekStart: ui.prefs.weekStart }); } catch { return []; }
    }
    return builtIn!.select(ui.tasks);
  }, [savedFilter, builtIn, ui.tasks, ui.projects, ui.labels, sections, ui.prefs.weekStart]);
  const items = useMemo(() => taskItems(tasks), [tasks]);

  if (savedFilter) {
    return (
      <TaskScreen title={savedFilter.name} subtitle={savedFilter.query} back right={<IconButton label="Edit filter" onPress={() => setEdit(true)}><Pencil size={20} color={C.ink} /></IconButton>}>
        <TaskList items={items} showProject showParent empty={<EmptyTasks icon={<FilterIcon size={32} color={C.muted} />} title="Nothing matches right now" />} />
        <SavedFilterSheet visible={edit} initial={savedFilter} onClose={() => setEdit(false)} />
      </TaskScreen>
    );
  }
  const filter = builtIn!;
  const pLevel = /^p([1-3])$/.exec(filter.id);
  const addDefaults = pLevel ? { priority: priorityFromLevel(Number(pLevel[1])) } : filter.id === 'next7' ? { dueDate: todayISO() } : {};
  return (
    <TaskScreen title={filter.title} subtitle={tasks.length ? `${tasks.length} task${tasks.length === 1 ? '' : 's'}` : undefined} back addDefaults={addDefaults}>
      <TaskList items={items} showProject showParent empty={<EmptyTasks icon={filter.icon} title={filter.emptyText} />} />
    </TaskScreen>
  );
}
