import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Hash, Ellipsis, Pencil, Trash2, Archive, ArchiveRestore, FolderPlus, CircleCheck, ChevronRight } from 'lucide-react-native';
import { projectTasks, orderedProjects } from '@clearmind/shared/tasks';
import { TaskScreen, EmptyTasks, IconButton, useBack } from '../../../components/tasks/TaskScreen';
import { TaskList, taskItems, type ListItem } from '../../../components/tasks/TaskList';
import { useTaskUI } from '../../../components/tasks/TaskUIProvider';
import { ProjectFormSheet } from '../../../components/tasks/forms';
import { C } from '../../../components/tasks/theme';
import { ActionMenu, confirmDialog, useToast } from '../../../components/ui';
import { deleteProject, updateProject, projectColor, projectSubtree } from '../../../services/taskActions';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ui = useTaskUI();
  const router = useRouter();
  const toast = useToast();
  const goBack = useBack();
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<null | 'edit' | 'child'>(null);
  const [showDone, setShowDone] = useState(false);
  const project = ui.projectMap.get(id);

  const open = useMemo(() => projectTasks(ui.tasks, id), [ui.tasks, id]);
  const done = useMemo(() => ui.tasks.filter((t) => t.completed && !t.parentId && t.projectId === id), [ui.tasks, id]);
  const children = useMemo(
    () => orderedProjects(ui.projects).filter(({ project: p }) => p.parentId === id),
    [ui.projects, id]
  );

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [...taskItems(open)];
    out.push({ type: 'add', key: 'add', defaults: { projectId: id } });
    if (done.length) {
      out.push({
        type: 'header', key: 'h-done', title: 'Completed', subtitle: String(done.length),
        action: { label: showDone ? 'Hide' : 'Show', onPress: () => setShowDone((x) => !x) },
      });
      if (showDone) out.push(...taskItems(done, 'd-'));
    }
    return out;
  }, [open, done, showDone, id]);

  if (!project) {
    return (
      <TaskScreen title="Project" back fab={false}>
        <EmptyTasks icon={<Hash size={34} color={C.muted} />} title="This project no longer exists" />
      </TaskScreen>
    );
  }

  const color = projectColor(project);
  const onDelete = async () => {
    const ids = new Set(projectSubtree(ui.projects, project.id));
    const n = ui.tasks.filter((t) => t.projectId && ids.has(t.projectId)).length;
    const subs = ids.size - 1;
    const ok = await confirmDialog({
      title: 'Delete project',
      message: `Delete “${project.title}”${subs ? ` and ${subs} sub-project${subs === 1 ? '' : 's'}` : ''}, including ${n} task${n === 1 ? '' : 's'}? This can’t be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteProject(project.id);
    toast.show('Project deleted', 'info');
    goBack();
  };

  return (
    <TaskScreen
      title={project.title}
      titleColor={color}
      subtitle={`${open.length} open task${open.length === 1 ? '' : 's'}${project.archived ? ' · archived' : ''}`}
      back
      addDefaults={{ projectId: project.id }}
      right={<IconButton label="Project options" onPress={() => setMenu(true)}><Ellipsis size={22} color={C.ink} /></IconButton>}
    >
      <TaskList
        items={items}
        header={
          children.length ? (
            <View className="border-b border-line pb-1">
              {children.map(({ project: c }) => (
                <Pressable key={c.id} onPress={() => router.push(`/(app)/project/${c.id}`)} className="flex-row items-center px-4 py-2.5 active:bg-midnight-light" accessibilityRole="button">
                  <Hash size={16} color={projectColor(c)} />
                  <Text className="text-ink text-[15px] ml-3 flex-1">{c.title}</Text>
                  <Text className="text-ink-muted text-[13px] mr-1">{ui.tasks.filter((t) => !t.completed && t.projectId === c.id).length || ''}</Text>
                  <ChevronRight size={16} color={C.muted} />
                </Pressable>
              ))}
            </View>
          ) : null
        }
        empty={<EmptyTasks icon={<CircleCheck size={34} color={color} />} title="No tasks here yet" subtitle="Tap + to add the first one." />}
      />
      <ActionMenu
        visible={menu}
        onClose={() => setMenu(false)}
        title={project.title}
        actions={[
          { label: 'Edit project', icon: <Pencil size={18} color={C.muted} />, onPress: () => setTimeout(() => setForm('edit'), 250) },
          { label: 'Add sub-project', icon: <FolderPlus size={18} color={C.muted} />, onPress: () => setTimeout(() => setForm('child'), 250) },
          project.archived
            ? { label: 'Unarchive', icon: <ArchiveRestore size={18} color={C.muted} />, onPress: () => { updateProject(project, { archived: false }); toast.show('Project restored', 'success'); } }
            : { label: 'Archive', icon: <Archive size={18} color={C.muted} />, onPress: () => { updateProject(project, { archived: true }); toast.show('Project archived', 'info'); goBack(); } },
          { label: 'Delete project', icon: <Trash2 size={18} color={C.danger} />, destructive: true, onPress: onDelete },
        ]}
      />
      <ProjectFormSheet
        visible={form !== null}
        initial={form === 'edit' ? project : null}
        parentId={form === 'child' ? project.id : null}
        projects={ui.projects}
        onClose={() => setForm(null)}
      />
    </TaskScreen>
  );
}
