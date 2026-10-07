import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Flag, Hash, Inbox, Tag, Plus, Trash2, Copy, ChevronRight, Repeat, X, ListTree } from 'lucide-react';
import { formatDueDate, formatTime, describeRecurrence, priorityOf, subtasksOf, MONTH_SHORT } from '../../shared/tasks';
import { Modal, TaskCheck, cx, PRIORITY_COLOR, PRIORITY_LABEL, dueColor } from './ui';
import { SchedulePicker, PriorityPicker, ProjectPicker, LabelPicker } from './pickers';
import { updateTask, duplicateTask, createProject, createLabel, projectColor } from './actions';
import { TaskEditor } from './TaskEditor';
import { useTaskData, useTaskUI } from './TaskContext';

type Picker = null | 'date' | 'priority' | 'project' | 'labels';

const stamp = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

function SideField({ label, children, onClick, refEl }: { label: string; children: React.ReactNode; onClick: () => void; refEl: React.Ref<HTMLButtonElement> }) {
  return (
    <div className={`py-2.5 border-b ${cx.border}`}>
      <p className={`text-xs font-semibold mb-1 ${cx.muted}`}>{label}</p>
      <button ref={refEl} onClick={onClick} className={`w-full flex items-center gap-2 text-sm px-2 py-1.5 -mx-2 rounded-md ${cx.hover} ${cx.text}`}>{children}</button>
    </div>
  );
}

export function TaskDetailModal({ taskId, onClose, onOpenTask }: { taskId: string | null; onClose: () => void; onOpenTask: (id: string) => void }) {
  const { tasks, taskMap, projects, labels, projectMap, labelMap } = useTaskData();
  const ui = useTaskUI();
  const task = taskId ? taskMap.get(taskId) ?? null : null;
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const [addingSub, setAddingSub] = useState(false);
  const refs = { date: useRef<HTMLButtonElement>(null), priority: useRef<HTMLButtonElement>(null), project: useRef<HTMLButtonElement>(null), labels: useRef<HTMLButtonElement>(null) };

  // Load editable text when switching tasks — not on every store update.
  useEffect(() => {
    setTitle(task?.title ?? '');
    setDesc(task?.description ?? '');
    setAddingSub(false);
    setPicker(null);
  }, [taskId]);

  // Deleted elsewhere while open.
  useEffect(() => { if (taskId && !task) onClose(); }, [taskId, task, onClose]);

  const subtasks = useMemo(() => (task ? subtasksOf(tasks, task.id) : []), [tasks, task]);
  if (!task) return null;

  const commit = () => {
    const t = title.trim();
    if (!t) { setTitle(task.title); return; }
    if (t !== task.title || desc.trim() !== (task.description ?? '')) updateTask(task, { title: t, description: desc.trim() || undefined });
  };
  const close = () => { commit(); onClose(); };

  const parent = task.parentId ? taskMap.get(task.parentId) : null;
  const project = task.projectId ? projectMap.get(task.projectId) : null;
  const p = priorityOf(task);
  const taskLabels = (task.labelIds ?? []).map((id) => labelMap.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof labelMap.get>>[];

  return (
    <Modal open onClose={close} wide>
      <div className={`flex items-center gap-2 px-5 py-3 border-b ${cx.border} text-sm`}>
        {project ? <Hash size={15} color={projectColor(project)} /> : <Inbox size={15} className="text-blue-500" />}
        <span className={cx.muted}>{project?.title ?? 'Inbox'}</span>
        {parent ? (
          <>
            <ChevronRight size={14} className={cx.faint} />
            <button onClick={() => { commit(); onOpenTask(parent.id); }} className={`truncate hover:underline ${cx.muted}`}>{parent.title}</button>
          </>
        ) : null}
        <div className="flex-1" />
        <button onClick={() => { duplicateTask(task); }} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} title="Duplicate" aria-label="Duplicate task"><Copy size={16} /></button>
        <button onClick={() => ui.remove(task)} className={`p-1.5 rounded-md ${cx.hover} text-red-500`} title="Delete" aria-label="Delete task"><Trash2 size={16} /></button>
        <button onClick={close} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Close"><X size={18} /></button>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto">
        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start gap-3">
            <div className="pt-1.5"><TaskCheck task={task} checked={task.completed} onToggle={() => ui.toggle(task)} size={20} /></div>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
              rows={1}
              className={`flex-1 resize-none bg-transparent outline-none text-xl font-semibold ${task.completed ? 'line-through text-gray-400' : cx.text}`}
              aria-label="Task name"
            />
          </div>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={commit}
            placeholder="Description"
            rows={3}
            className={`w-full mt-2 pl-8 resize-y bg-transparent outline-none text-sm ${cx.muted} placeholder:text-gray-400`}
            aria-label="Description"
          />

          <div className="mt-5 pl-8">
            <div className={`flex items-center gap-2 text-sm font-semibold mb-1 ${cx.text}`}>
              <ListTree size={15} /> Sub-tasks
              {subtasks.length ? <span className={`font-normal ${cx.muted}`}>{subtasks.filter((s) => s.completed).length}/{subtasks.length}</span> : null}
            </div>
            {subtasks.map((s) => (
              <div key={s.id} onClick={() => { commit(); onOpenTask(s.id); }} className={`flex items-center gap-3 py-2 border-b ${cx.border} cursor-pointer ${cx.hover} -mx-2 px-2 rounded`}>
                <TaskCheck task={s} checked={s.completed} onToggle={() => ui.toggle(s)} />
                <span className={`flex-1 text-sm ${s.completed ? 'line-through text-gray-400' : cx.text}`}>{s.title}</span>
                {s.dueDate ? <span className="text-xs" style={{ color: dueColor(s) }}>{formatDueDate(s.dueDate)}</span> : null}
              </div>
            ))}
            <div className="mt-2">
              {addingSub ? (
                <TaskEditor defaults={{ parentId: task.id, projectId: task.projectId ?? null }} onClose={() => setAddingSub(false)} submitLabel="Add sub-task" compact />
              ) : (
                <button onClick={() => setAddingSub(true)} className={`flex items-center gap-2 text-sm py-1.5 ${cx.muted} hover:text-blue-500`}><Plus size={16} className="text-blue-500" /> Add sub-task</button>
              )}
            </div>
          </div>
        </div>

        <aside className={`md:w-64 shrink-0 px-5 pb-5 md:pt-3 md:border-l ${cx.border} bg-gray-50/60 dark:bg-white/[0.02]`}>
          <SideField label="Project" refEl={refs.project} onClick={() => setPicker('project')}>
            {project ? <Hash size={15} color={projectColor(project)} /> : <Inbox size={15} className="text-blue-500" />}
            <span className="truncate">{project?.title ?? 'Inbox'}</span>
          </SideField>
          <SideField label="Date" refEl={refs.date} onClick={() => setPicker('date')}>
            {task.recurrence ? <Repeat size={15} color={dueColor(task)} /> : <CalendarDays size={15} color={task.dueDate ? dueColor(task) : undefined} />}
            <span style={task.dueDate ? { color: dueColor(task) } : undefined} className={task.dueDate ? '' : cx.muted}>
              {task.dueDate ? `${formatDueDate(task.dueDate)}${task.dueTime ? ` ${formatTime(task.dueTime)}` : ''}` : 'No date'}
            </span>
          </SideField>
          {task.recurrence ? <p className={`text-xs -mt-1 pb-2 ${cx.muted}`}>{describeRecurrence(task.recurrence)}</p> : null}
          <SideField label="Priority" refEl={refs.priority} onClick={() => setPicker('priority')}>
            <Flag size={15} color={PRIORITY_COLOR[p]} fill={p === 'None' ? 'none' : PRIORITY_COLOR[p]} />
            <span>{PRIORITY_LABEL[p]}</span>
          </SideField>
          <SideField label="Labels" refEl={refs.labels} onClick={() => setPicker('labels')}>
            <Tag size={15} />
            {taskLabels.length ? (
              <span className="flex flex-wrap gap-1">{taskLabels.map((l) => <span key={l.id} className="text-xs px-1.5 py-0.5 rounded" style={{ color: l.color, background: `${l.color}1A` }}>{l.name}</span>)}</span>
            ) : <span className={cx.muted}>Add labels</span>}
          </SideField>
          <p className={`text-xs mt-3 ${cx.faint}`}>
            {task.createdAt ? `Created ${stamp(task.createdAt)}` : ''}
            {task.completed && task.completedAt ? ` · Completed ${stamp(task.completedAt)}` : ''}
          </p>
        </aside>
      </div>

      <SchedulePicker anchor={refs.date.current} open={picker === 'date'} onClose={() => setPicker(null)}
        value={{ dueDate: task.dueDate, dueTime: task.dueTime, recurrence: task.recurrence }}
        onChange={(s) => updateTask(task, { dueDate: s.dueDate ?? undefined, dueTime: s.dueTime ?? undefined, recurrence: s.recurrence ?? null })} />
      <PriorityPicker anchor={refs.priority.current} open={picker === 'priority'} onClose={() => setPicker(null)} value={p} onChange={(np) => updateTask(task, { priority: np })} />
      <ProjectPicker anchor={refs.project.current} open={picker === 'project'} onClose={() => setPicker(null)} value={task.projectId} projects={projects}
        onChange={(id) => updateTask(task, { projectId: id })} onCreate={(name) => createProject({ title: name }).id} />
      <LabelPicker anchor={refs.labels.current} open={picker === 'labels'} onClose={() => setPicker(null)} value={task.labelIds ?? []} labels={labels}
        onChange={(ids) => updateTask(task, { labelIds: ids })} onCreate={(name) => createLabel({ name }).id} />
    </Modal>
  );
}

