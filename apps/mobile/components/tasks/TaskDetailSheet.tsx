import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import {
  CalendarDays, Flag, Hash, Inbox, Tag, Plus, Trash2, Copy, Ellipsis, X, ChevronLeft, Repeat, ListTree,
} from 'lucide-react-native';
import type { Label, Project } from '@clearmind/shared';
import {
  formatDueDate, formatTime, describeRecurrence, priorityOf, subtasksOf, MONTH_SHORT,
} from '@clearmind/shared/tasks';
import { Sheet } from '../ui/Sheet';
import { ActionMenu } from '../ui/ActionMenu';
import { SchedulePicker, PriorityPicker, ProjectPicker, LabelPicker } from './pickers';
import { TaskCheckbox } from './TaskRow';
import { C, PRIORITY_COLOR, PRIORITY_LABEL, dueColor } from './theme';
import {
  updateTask, createTask, createProject, createLabel, projectColor, type MTask,
} from '../../services/taskActions';

type Picker = null | 'date' | 'priority' | 'project' | 'labels' | 'menu';

function Field({ icon, label, value, color = C.ink, onPress, a11y }: {
  icon: React.ReactNode; label: string; value?: string; color?: string; onPress: () => void; a11y?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center py-3 border-b border-line active:opacity-60"
      style={{ minHeight: 50 }}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? `${label}${value ? `: ${value}` : ''}`}
    >
      <View className="w-8">{icon}</View>
      <Text className="flex-1 text-[15px]" style={{ color: value ? color : C.muted }} numberOfLines={1}>{value || label}</Text>
    </Pressable>
  );
}

const fmtStamp = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export function TaskDetailSheet({
  taskId, tasks, projects, labels, onClose, onOpenTask, onToggle, onDelete, onDuplicate,
}: {
  taskId: string | null;
  tasks: MTask[];
  projects: Project[];
  labels: Label[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onToggle: (t: MTask) => void;
  onDelete: (t: MTask) => void;
  onDuplicate: (t: MTask) => void;
}) {
  const task = useMemo(() => tasks.find((t) => t.id === taskId) ?? null, [tasks, taskId]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const [subText, setSubText] = useState('');
  const [addingSub, setAddingSub] = useState(false);

  // Load editable text when switching tasks (not on every store update, which
  // would clobber what the user is typing).
  useEffect(() => {
    setTitle(task?.title ?? '');
    setDesc(task?.description ?? '');
    setAddingSub(false);
    setSubText('');
    setPicker(null);
  }, [taskId]);

  // Deleted elsewhere (or on another device) while open → close.
  useEffect(() => {
    if (taskId && !task) onClose();
  }, [taskId, task, onClose]);

  const subtasks = useMemo(() => (task ? subtasksOf(tasks, task.id) : []), [tasks, task]);
  const parent = task?.parentId ? tasks.find((t) => t.id === task.parentId) : null;
  const project = task?.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const commitText = () => {
    if (!task) return;
    const t = title.trim();
    const d = desc.trim();
    if (!t) { setTitle(task.title); return; }
    if (t !== task.title || d !== (task.description ?? '')) updateTask(task, { title: t, description: d || undefined });
  };

  const close = () => { commitText(); onClose(); };

  const addSub = () => {
    const t = subText.trim();
    if (!task || !t) return;
    createTask({ title: t, parentId: task.id, projectId: task.projectId ?? null, priority: 'None' });
    setSubText('');
  };

  if (!task) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;
  const p = priorityOf(task);
  const dateValue = task.dueDate
    ? `${formatDueDate(task.dueDate)}${task.dueTime ? ` ${formatTime(task.dueTime)}` : ''}${task.recurrence ? ` · ${describeRecurrence(task.recurrence)}` : ''}`
    : '';
  const taskLabels = (task.labelIds ?? []).map((id) => labelMap.get(id)).filter(Boolean) as Label[];

  return (
    <Sheet visible={!!taskId} onClose={close} fill maxHeight="92%">
      {/* Header: parent breadcrumb / project, overflow menu, close */}
      <View className="flex-row items-center mb-2">
        {parent ? (
          <Pressable onPress={() => { commitText(); onOpenTask(parent.id); }} className="flex-row items-center flex-1 active:opacity-60" accessibilityLabel={`Back to ${parent.title}`}>
            <ChevronLeft size={18} color={C.muted} />
            <Text className="text-ink-muted text-sm flex-1" numberOfLines={1}>{parent.title}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setPicker('project')} className="flex-row items-center flex-1 active:opacity-60" accessibilityLabel="Change project">
            {project ? <Hash size={15} color={projectColor(project)} /> : <Inbox size={15} color={C.muted} />}
            <Text className="text-ink-muted text-sm ml-1.5" numberOfLines={1}>{project?.title ?? 'Inbox'}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setPicker('menu')} hitSlop={10} className="p-1.5 mr-1" accessibilityLabel="More actions">
          <Ellipsis size={20} color={C.muted} />
        </Pressable>
        <Pressable onPress={close} hitSlop={10} className="p-1.5" accessibilityLabel="Close">
          <X size={20} color={C.muted} />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} className="flex-1">
        <View className="flex-row items-start">
          <View className="pt-2.5 mr-3">
            <TaskCheckbox task={task} checked={task.completed} onPress={() => onToggle(task)} size={24} />
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={commitText}
            multiline
            blurOnSubmit
            returnKeyType="done"
            className={`flex-1 text-[19px] font-semibold py-1.5 ${task.completed ? 'text-ink-muted line-through' : 'text-ink'}`}
            placeholder="Task name"
            placeholderTextColor="#6b7280"
            accessibilityLabel="Task name"
          />
        </View>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          onBlur={commitText}
          multiline
          placeholder="Description"
          placeholderTextColor="#6b7280"
          className="text-ink-muted text-[15px] ml-9 mb-3"
          style={{ minHeight: 36 }}
          accessibilityLabel="Description"
        />

        <Field
          icon={task.recurrence ? <Repeat size={18} color={dueColor(task)} /> : <CalendarDays size={18} color={task.dueDate ? dueColor(task) : C.muted} />}
          label="Date"
          value={dateValue}
          color={dueColor(task)}
          onPress={() => setPicker('date')}
        />
        <Field
          icon={<Flag size={18} color={PRIORITY_COLOR[p]} fill={p === 'None' ? 'transparent' : PRIORITY_COLOR[p]} />}
          label="Priority"
          value={PRIORITY_LABEL[p]}
          color={p === 'None' ? C.ink : PRIORITY_COLOR[p]}
          onPress={() => setPicker('priority')}
        />
        <Field
          icon={<Tag size={18} color={C.muted} />}
          label="Labels"
          value={taskLabels.map((l) => l.name).join(', ')}
          onPress={() => setPicker('labels')}
        />

        {/* Subtasks */}
        <View className="flex-row items-center mt-5 mb-1">
          <ListTree size={16} color={C.muted} />
          <Text className="text-ink-muted text-xs font-semibold ml-2 flex-1">
            SUB-TASKS{subtasks.length ? `  ${subtasks.filter((s) => s.completed).length}/${subtasks.length}` : ''}
          </Text>
        </View>
        {subtasks.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => { commitText(); onOpenTask(s.id); }}
            className="flex-row items-center py-2.5 border-b border-line active:opacity-60"
            style={{ minHeight: 48 }}
            accessibilityLabel={`Sub-task ${s.title}`}
          >
            <View className="mr-3"><TaskCheckbox task={s} checked={s.completed} onPress={() => onToggle(s)} size={20} /></View>
            <View className="flex-1">
              <Text className={`text-[15px] ${s.completed ? 'text-ink-muted line-through' : 'text-ink'}`} numberOfLines={2}>{s.title}</Text>
              {s.dueDate ? (
                <Text style={{ color: dueColor(s) }} className="text-xs mt-0.5">{formatDueDate(s.dueDate)}{s.dueTime ? ` ${formatTime(s.dueTime)}` : ''}</Text>
              ) : null}
            </View>
          </Pressable>
        ))}
        {addingSub ? (
          <View className="flex-row items-center py-1.5">
            <TextInput
              value={subText}
              onChangeText={setSubText}
              autoFocus
              placeholder="Sub-task name"
              placeholderTextColor="#6b7280"
              className="flex-1 text-ink text-[15px] py-2"
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={addSub}
              onBlur={() => { if (!subText.trim()) setAddingSub(false); }}
              accessibilityLabel="New sub-task name"
            />
            <Pressable onPress={addSub} disabled={!subText.trim()} className="px-3 py-2 active:opacity-60" accessibilityLabel="Add sub-task">
              <Text className={subText.trim() ? 'text-accent font-semibold' : 'text-ink-muted'}>Add</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setAddingSub(true)} className="flex-row items-center py-3 active:opacity-60" accessibilityRole="button">
            <Plus size={18} color={C.accent} />
            <Text className="text-accent text-[15px] ml-2">Add sub-task</Text>
          </Pressable>
        )}

        <Text className="text-ink-muted text-xs mt-6 mb-4">
          {task.createdAt ? `Created ${fmtStamp(task.createdAt)}` : ''}
          {task.completed && task.completedAt ? ` · Completed ${fmtStamp(task.completedAt)}` : ''}
          {task.taskNumber ? `  · #${task.taskNumber}` : ''}
        </Text>
      </ScrollView>

      <SchedulePicker
        visible={picker === 'date'}
        value={{ dueDate: task.dueDate, dueTime: task.dueTime, recurrence: task.recurrence }}
        onClose={() => setPicker(null)}
        onChange={(s) => updateTask(task, {
          dueDate: s.dueDate ?? undefined,
          dueTime: s.dueTime ?? undefined,
          recurrence: s.recurrence ?? null,
        })}
      />
      <PriorityPicker visible={picker === 'priority'} value={p} onClose={() => setPicker(null)} onChange={(np) => updateTask(task, { priority: np })} />
      <ProjectPicker
        visible={picker === 'project'}
        value={task.projectId}
        projects={projects}
        onClose={() => setPicker(null)}
        onChange={(id) => updateTask(task, { projectId: id })}
        onCreate={(name) => createProject({ title: name }).id}
      />
      <LabelPicker
        visible={picker === 'labels'}
        value={task.labelIds ?? []}
        labels={labels}
        onClose={() => setPicker(null)}
        onChange={(ids) => updateTask(task, { labelIds: ids })}
        onCreate={(name) => createLabel({ name }).id}
      />
      <ActionMenu
        visible={picker === 'menu'}
        onClose={() => setPicker(null)}
        actions={[
          { label: 'Duplicate', icon: <Copy size={18} color={C.muted} />, onPress: () => onDuplicate(task) },
          { label: 'Delete task', icon: <Trash2 size={18} color={C.danger} />, destructive: true, onPress: () => onDelete(task) },
        ]}
      />
    </Sheet>
  );
}

