/**
 * TaskUIProvider — the task layer's shared state + the sheets every screen uses
 * (Quick Add, task details, swipe-to-schedule, long-press menu). Hosting them
 * once here means any screen can open them, and every screen reads the same
 * live task/project/label data.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CalendarDays, Flag, Hash, Copy, Trash2, Pencil, CircleCheck, Undo2 } from 'lucide-react-native';
import type { Label, Project } from '@clearmind/shared';
import { formatDueDate, priorityOf } from '@clearmind/shared/tasks';
import { STORES } from '../../services/db';
import { syncStore } from '../../services/syncService';
import { isFirebaseConfigured } from '../../services/firebaseService';
import { getStore } from '../../lib/collectionStore';
import { useCollection } from '../../hooks/useCollection';
import { useToast } from '../ui/Toast';
import { ActionMenu } from '../ui/ActionMenu';
import { QuickAddSheet, type QuickAddDefaults } from './QuickAddSheet';
import { TaskDetailSheet } from './TaskDetailSheet';
import { SchedulePicker, PriorityPicker, ProjectPicker } from './pickers';
import { C, PRIORITY_COLOR } from './theme';
import {
  toggleTask, deleteTask, duplicateTask, updateTask, createProject, type MTask,
} from '../../services/taskActions';

interface TaskUI {
  tasks: MTask[];
  projects: Project[];
  labels: Label[];
  projectMap: Map<string, Project>;
  labelMap: Map<string, Label>;
  taskMap: Map<string, MTask>;
  subtaskCounts: Map<string, { done: number; total: number }>;
  loading: boolean;
  error: string | null;
  openQuickAdd: (defaults?: QuickAddDefaults) => void;
  openTask: (id: string) => void;
  toggle: (t: MTask) => void;
  schedule: (t: MTask) => void;
  menu: (t: MTask) => void;
  remove: (t: MTask) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<TaskUI | null>(null);

export function useTaskUI(): TaskUI {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTaskUI must be used inside TaskUIProvider');
  return v;
}

type Overlay =
  | { kind: 'none' }
  | { kind: 'schedule' | 'menu' | 'priority' | 'project'; id: string };

export function TaskUIProvider({ children }: { children: React.ReactNode }) {
  const tasksC = useCollection<MTask>(STORES.TASKS);
  const projectsC = useCollection<Project>(STORES.PROJECTS);
  const labelsC = useCollection<Label>(STORES.LABELS);
  const toast = useToast();

  const [quickAdd, setQuickAdd] = useState<QuickAddDefaults | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });

  const tasks = tasksC.items;
  const projects = projectsC.items;
  const labels = labelsC.items;
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const subtaskCounts = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const t of tasks) {
      if (!t.parentId) continue;
      const c = m.get(t.parentId) ?? { done: 0, total: 0 };
      c.total++;
      if (t.completed) c.done++;
      m.set(t.parentId, c);
    }
    return m;
  }, [tasks]);

  // Latest values for stable callbacks (keeps memoised rows from re-rendering).
  const latest = useRef({ taskMap });
  latest.current = { taskMap };

  const toggle = useCallback(async (t: MTask) => {
    const fresh = latest.current.taskMap.get(t.id) ?? t;
    const r = await toggleTask(fresh);
    if (r.nextDueDate) toast.show(`Done — next: ${formatDueDate(r.nextDueDate)}`, 'info', { label: 'Undo', onPress: r.undo });
    else if (r.completed) toast.show('Task completed', 'info', { label: 'Undo', onPress: r.undo });
    else toast.show('Task restored', 'info');
  }, [toast]);

  const remove = useCallback(async (t: MTask) => {
    setDetailId((id) => (id === t.id ? null : id));
    const undo = await deleteTask(t);
    toast.show('Task deleted', 'info', { label: 'Undo', onPress: undo });
  }, [toast]);

  const refresh = useCallback(async () => {
    if (isFirebaseConfigured()) {
      const results = await Promise.all([STORES.TASKS, STORES.PROJECTS, STORES.LABELS].map((s) => syncStore(s)));
      const failed = results.filter((r) => !r.success);
      if (failed.length) toast.show('Couldn’t reach the cloud — showing what’s on this device', 'error');
    }
    await Promise.all([STORES.TASKS, STORES.PROJECTS, STORES.LABELS].map((s) => getStore(s).load()));
  }, [toast]);

  const value = useMemo<TaskUI>(() => ({
    tasks, projects, labels, projectMap, labelMap, taskMap, subtaskCounts,
    loading: tasksC.loading || projectsC.loading || labelsC.loading,
    error: tasksC.error ?? projectsC.error ?? labelsC.error,
    openQuickAdd: (d) => setQuickAdd(d ?? {}),
    openTask: (id) => setDetailId(id),
    toggle,
    schedule: (t) => setOverlay({ kind: 'schedule', id: t.id }),
    menu: (t) => setOverlay({ kind: 'menu', id: t.id }),
    remove,
    refresh,
  }), [tasks, projects, labels, projectMap, labelMap, taskMap, subtaskCounts, tasksC.loading, projectsC.loading, labelsC.loading,
    tasksC.error, projectsC.error, labelsC.error, toggle, remove, refresh]);

  const closeDetail = useCallback(() => setDetailId(null), []);
  const target = overlay.kind !== 'none' ? taskMap.get(overlay.id) : undefined;
  const closeOverlay = () => setOverlay({ kind: 'none' });

  return (
    <Ctx.Provider value={value}>
      {children}

      <QuickAddSheet
        visible={!!quickAdd}
        defaults={quickAdd ?? {}}
        projects={projects}
        labels={labels}
        onClose={() => setQuickAdd(null)}
      />

      <TaskDetailSheet
        taskId={detailId}
        tasks={tasks}
        projects={projects}
        labels={labels}
        onClose={closeDetail}
        onOpenTask={setDetailId}
        onToggle={toggle}
        onDelete={remove}
        onDuplicate={(t) => { void duplicateTask(t); toast.show('Task duplicated', 'success'); }}
      />

      {target ? (
        <>
          <SchedulePicker
            visible={overlay.kind === 'schedule'}
            value={{ dueDate: target.dueDate, dueTime: target.dueTime, recurrence: target.recurrence }}
            onClose={closeOverlay}
            onChange={(s) => updateTask(target, { dueDate: s.dueDate ?? undefined, dueTime: s.dueTime ?? undefined, recurrence: s.recurrence ?? null })}
          />
          <PriorityPicker
            visible={overlay.kind === 'priority'}
            value={priorityOf(target)}
            onClose={closeOverlay}
            onChange={(p) => updateTask(target, { priority: p })}
          />
          <ProjectPicker
            visible={overlay.kind === 'project'}
            value={target.projectId}
            projects={projects}
            onClose={closeOverlay}
            onChange={(id) => updateTask(target, { projectId: id })}
            onCreate={(name) => createProject({ title: name }).id}
          />
          <ActionMenu
            visible={overlay.kind === 'menu'}
            onClose={closeOverlay}
            title={target.title}
            actions={[
              target.completed
                ? { label: 'Mark as not done', icon: <Undo2 size={18} color={C.muted} />, onPress: () => toggle(target) }
                : { label: 'Complete', icon: <CircleCheck size={18} color={C.success} />, onPress: () => toggle(target) },
              { label: 'Edit', icon: <Pencil size={18} color={C.muted} />, onPress: () => setDetailId(target.id) },
              // Open the follow-up sheet after this one has dismissed.
              { label: 'Schedule', icon: <CalendarDays size={18} color={C.week} />, onPress: () => setTimeout(() => setOverlay({ kind: 'schedule', id: target.id }), 250) },
              { label: 'Priority', icon: <Flag size={18} color={PRIORITY_COLOR[priorityOf(target)]} />, onPress: () => setTimeout(() => setOverlay({ kind: 'priority', id: target.id }), 250) },
              { label: 'Move to project', icon: <Hash size={18} color={C.muted} />, onPress: () => setTimeout(() => setOverlay({ kind: 'project', id: target.id }), 250) },
              { label: 'Duplicate', icon: <Copy size={18} color={C.muted} />, onPress: () => { void duplicateTask(target); toast.show('Task duplicated', 'success'); } },
              { label: 'Delete', icon: <Trash2 size={18} color={C.danger} />, destructive: true, onPress: () => remove(target) },
            ]}
          />
        </>
      ) : null}
    </Ctx.Provider>
  );
}
