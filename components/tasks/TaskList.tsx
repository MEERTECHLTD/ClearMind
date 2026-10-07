import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Task } from '../../types';
import { isOverdue } from '../../shared/tasks';
import { TaskItem } from './TaskItem';
import { TaskEditor, type AddDefaults } from './TaskEditor';
import { cx } from './ui';

const PAGE = 200; // render in pages so very long lists stay fast

/** "+ Add task" row that expands into the inline composer (Todoist web style). */
export function AddTaskRow({ defaults, label = 'Add task' }: { defaults: AddDefaults; label?: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <div className="py-2"><TaskEditor defaults={defaults} onClose={() => setOpen(false)} /></div>;
  return (
    <button onClick={() => setOpen(true)} className={`group w-full flex items-center gap-3 py-2 px-1 text-sm ${cx.muted} hover:text-blue-600 dark:hover:text-blue-400`}>
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors"><Plus size={16} /></span>
      {label}
    </button>
  );
}

export function TaskList({
  tasks, showProject, hideDate, showParent, addDefaults,
}: { tasks: Task[]; showProject?: boolean; hideDate?: boolean; showParent?: boolean; addDefaults?: AddDefaults }) {
  const [limit, setLimit] = useState(PAGE);
  return (
    <div>
      {tasks.slice(0, limit).map((t) => (
        <TaskItem key={t.id} task={t} showProject={showProject} hideDate={hideDate && !isOverdue(t)} showParent={showParent} />
      ))}
      {tasks.length > limit ? (
        <button onClick={() => setLimit((l) => l + PAGE)} className={`w-full py-2 text-sm ${cx.muted} hover:text-blue-500`}>
          Show {Math.min(PAGE, tasks.length - limit)} more ({tasks.length - limit} hidden)
        </button>
      ) : null}
      {addDefaults ? <AddTaskRow defaults={addDefaults} /> : null}
    </div>
  );
}

export function Section({ title, subtitle, color, action, children }: {
  title: string; subtitle?: string; color?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-2">
      <div className={`flex items-baseline gap-2 pb-1.5 border-b ${cx.border}`}>
        <h3 className="text-sm font-bold" style={color ? { color } : undefined}><span className={color ? '' : cx.text}>{title}</span></h3>
        {subtitle ? <span className={`text-xs ${cx.muted}`}>{subtitle}</span> : null}
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-4">{icon}</div>
      <p className={`font-semibold ${cx.text}`}>{title}</p>
      {subtitle ? <p className={`text-sm mt-1 max-w-sm ${cx.muted}`}>{subtitle}</p> : null}
    </div>
  );
}
