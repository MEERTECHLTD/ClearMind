import { useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Tag, Ellipsis, Pencil, Trash2 } from 'lucide-react-native';
import { labelTasks } from '@clearmind/shared/tasks';
import { TaskScreen, EmptyTasks, IconButton, useBack } from '../../../components/tasks/TaskScreen';
import { TaskList, taskItems } from '../../../components/tasks/TaskList';
import { useTaskUI } from '../../../components/tasks/TaskUIProvider';
import { LabelFormSheet } from '../../../components/tasks/forms';
import { C } from '../../../components/tasks/theme';
import { ActionMenu, confirmDialog, useToast } from '../../../components/ui';
import { deleteLabel } from '../../../services/taskActions';

export default function LabelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ui = useTaskUI();
  const toast = useToast();
  const goBack = useBack();
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const label = ui.labelMap.get(id);
  const tasks = useMemo(() => labelTasks(ui.tasks, id), [ui.tasks, id]);
  const items = useMemo(() => taskItems(tasks), [tasks]);

  if (!label) {
    return (
      <TaskScreen title="Label" back fab={false}>
        <EmptyTasks icon={<Tag size={34} color={C.muted} />} title="This label no longer exists" />
      </TaskScreen>
    );
  }

  const onDelete = async () => {
    const ok = await confirmDialog({
      title: 'Delete label',
      message: `Delete “${label.name}”? It will be removed from ${tasks.length} task${tasks.length === 1 ? '' : 's'}; the tasks stay.`,
      confirmText: 'Delete', destructive: true,
    });
    if (!ok) return;
    deleteLabel(label.id);
    toast.show('Label deleted', 'info');
    goBack();
  };

  return (
    <TaskScreen
      title={label.name}
      titleColor={label.color}
      subtitle={`${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
      back
      addDefaults={{ labelIds: [label.id] }}
      right={<IconButton label="Label options" onPress={() => setMenu(true)}><Ellipsis size={22} color={C.ink} /></IconButton>}
    >
      <TaskList items={items} showProject showParent empty={<EmptyTasks icon={<Tag size={34} color={label.color} />} title="No open tasks with this label" />} />
      <ActionMenu
        visible={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: 'Edit label', icon: <Pencil size={18} color={C.muted} />, onPress: () => setTimeout(() => setEdit(true), 250) },
          { label: 'Delete label', icon: <Trash2 size={18} color={C.danger} />, destructive: true, onPress: onDelete },
        ]}
      />
      <LabelFormSheet visible={edit} initial={label} labels={ui.labels} onClose={() => setEdit(false)} />
    </TaskScreen>
  );
}
