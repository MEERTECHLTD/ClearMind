import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Label, Project, Task } from '../../types';
import { formatDueDate } from '../../shared/tasks';
import { STORES } from '../../services/db';
import { useStore } from './store';
import { toggleTask, deleteTask } from './actions';
import { Modal, TaskToastProvider, useTaskToast } from './ui';
import { TaskEditor, type AddDefaults } from './TaskEditor';
import { TaskDetailModal } from './TaskDetailModal';

interface TaskData {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  taskMap: Map<string, Task>;
  projectMap: Map<string, Project>;
  labelMap: Map<string, Label>;
  subtaskCounts: Map<string, { done: number; total: number }>;
  loading: boolean;
}

interface TaskUI {
  openQuickAdd: (d?: AddDefaults) => void;
  openTask: (id: string) => void;
  toggle: (t: Task) => void;
  remove: (t: Task) => void;
}

const DataCtx = createContext<TaskData | null>(null);
const UICtx = createContext<TaskUI | null>(null);

export function useTaskData(): TaskData {
  const v = useContext(DataCtx);
  if (!v) throw new Error('useTaskData must be used inside TaskProvider');
  return v;
}
export function useTaskUI(): TaskUI {
  const v = useContext(UICtx);
  if (!v) throw new Error('useTaskUI must be used inside TaskProvider');
  return v;
}

function DataProvider({ children }: { children: React.ReactNode }) {
  const t = useStore<Task>(STORES.TASKS);
  const p = useStore<Project>(STORES.PROJECTS);
  const l = useStore<Label>(STORES.LABELS);
  const value = useMemo<TaskData>(() => {
    const subtaskCounts = new Map<string, { done: number; total: number }>();
    for (const x of t.items) {
      if (!x.parentId) continue;
      const c = subtaskCounts.get(x.parentId) ?? { done: 0, total: 0 };
      c.total++;
      if (x.completed) c.done++;
      subtaskCounts.set(x.parentId, c);
    }
    return {
      tasks: t.items, projects: p.items, labels: l.items,
      taskMap: new Map(t.items.map((x) => [x.id, x])),
      projectMap: new Map(p.items.map((x) => [x.id, x])),
      labelMap: new Map(l.items.map((x) => [x.id, x])),
      subtaskCounts,
      loading: !t.loaded || !p.loaded || !l.loaded,
    };
  }, [t, p, l]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

function UIProvider({ children }: { children: React.ReactNode }) {
  const toast = useTaskToast();
  const [quickAdd, setQuickAdd] = useState<AddDefaults | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const toggle = useCallback((t: Task) => {
    const r = toggleTask(t);
    if (r.nextDueDate) toast(`Done — next: ${formatDueDate(r.nextDueDate)}`, { label: 'Undo', onClick: r.undo });
    else if (r.completed) toast('1 task completed', { label: 'Undo', onClick: r.undo });
    else toast('Task restored');
  }, [toast]);

  const remove = useCallback((t: Task) => {
    setDetailId((id) => (id === t.id ? null : id));
    const undo = deleteTask(t);
    toast('Task deleted', { label: 'Undo', onClick: undo });
  }, [toast]);

  // Global shortcut: Q opens Quick Add (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); setQuickAdd({}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo<TaskUI>(() => ({
    openQuickAdd: (d) => setQuickAdd(d ?? {}),
    openTask: setDetailId,
    toggle,
    remove,
  }), [toggle, remove]);

  return (
    <UICtx.Provider value={value}>
      {children}
      <Modal open={!!quickAdd} onClose={() => setQuickAdd(null)} title="Quick add">
        <div className="p-4">
          {quickAdd ? <TaskEditor defaults={quickAdd} onClose={() => setQuickAdd(null)} compact /> : null}
          <p className="text-xs text-gray-400 mt-3">Press <kbd className="px-1 rounded bg-gray-100 dark:bg-white/10">Enter</kbd> to add and keep going · <kbd className="px-1 rounded bg-gray-100 dark:bg-white/10">Esc</kbd> to close · <kbd className="px-1 rounded bg-gray-100 dark:bg-white/10">Q</kbd> opens this anywhere</p>
        </div>
      </Modal>
      <TaskDetailModal taskId={detailId} onClose={() => setDetailId(null)} onOpenTask={setDetailId} />
    </UICtx.Provider>
  );
}

/** Wrap the app shell: shared task data + Quick Add / detail modals + undo toasts. */
export function TaskProvider({ children }: { children: React.ReactNode }) {
  return (
    <TaskToastProvider>
      <DataProvider>
        <UIProvider>{children}</UIProvider>
      </DataProvider>
    </TaskToastProvider>
  );
}
