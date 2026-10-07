import React, { memo, useRef, useState } from 'react';
import { CalendarDays, Repeat, Tag, Hash, Inbox, ListTree, MoreHorizontal, Pencil, Flag, Copy, Trash2, FolderInput, AlignLeft, Bell, MessageSquare } from 'lucide-react';
import type { Task } from '../../types';
import { formatDueDate, formatTime, priorityOf } from '../../shared/tasks';
import { TaskCheck, Popover, MenuItem, cx, PRIORITY_COLOR, PRIORITY_LABEL, dueColor } from './ui';
import { SchedulePicker, PriorityPicker, ProjectPicker } from './pickers';
import { updateTask, duplicateTask, createProject, projectColor } from './actions';
import { useTaskData, useTaskUI } from './TaskContext';

type Open = null | 'menu' | 'date' | 'priority' | 'project';

function TaskItemImpl({ task, showProject, hideDate, showParent }: { task: Task; showProject?: boolean; hideDate?: boolean; showParent?: boolean }) {
  const { projects, projectMap, labelMap, taskMap, subtaskCounts, commentCounts } = useTaskData();
  const ui = useTaskUI();
  const [open, setOpen] = useState<Open>(null);
  const [ticking, setTicking] = useState(false);
  const dateRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const checked = task.completed || ticking;
  const toggle = () => {
    if (ticking) return;
    if (task.completed) return ui.toggle(task);
    setTicking(true);
    window.setTimeout(() => { ui.toggle(task); setTicking(false); }, 250);
  };

  const project = task.projectId ? projectMap.get(task.projectId) : null;
  const parent = showParent && task.parentId ? taskMap.get(task.parentId) : null;
  const labels = (task.labelIds ?? []).map((id) => labelMap.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof labelMap.get>>[];
  const subs = subtaskCounts.get(task.id);
  const nComments = commentCounts.get(task.id) ?? 0;
  const nReminders = task.reminders?.length ?? 0;
  const showDate = !!task.dueDate && !hideDate;
  const due = showDate ? `${formatDueDate(task.dueDate)}${task.dueTime ? ` ${formatTime(task.dueTime)}` : ''}` : hideDate && task.dueTime ? formatTime(task.dueTime) : '';
  const p = priorityOf(task);

  return (
    <div
      className={`group relative flex items-start gap-3 py-2.5 px-1 border-b ${cx.border} cursor-pointer`}
      onClick={() => ui.openTask(task.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) ui.openTask(task.id); }}
      tabIndex={0}
      role="button"
      aria-label={`${task.title}${due ? `, due ${due}` : ''}, ${PRIORITY_LABEL[p]}`}
    >
      <div className="pt-0.5"><TaskCheck task={task} checked={checked} onToggle={toggle} /></div>
      <div className="flex-1 min-w-0">
        {parent ? <p className={`text-[11px] ${cx.faint} truncate`}>↳ {parent.title}</p> : null}
        <p className={`text-sm leading-5 ${checked ? 'line-through text-gray-400' : cx.text}`}>{task.title}</p>
        {task.description ? <p className={`text-xs mt-0.5 truncate ${cx.muted}`}>{task.description}</p> : null}
        {(due || task.recurrence || subs || labels.length || showProject || nComments || nReminders) ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs">
            {due ? (
              <span className="inline-flex items-center gap-1" style={{ color: dueColor(task) }}>
                {task.recurrence ? <Repeat size={12} /> : <CalendarDays size={12} />}{due}
              </span>
            ) : task.recurrence ? <span className={`inline-flex items-center gap-1 ${cx.muted}`}><Repeat size={12} />Repeats</span> : null}
            {subs ? <span className={`inline-flex items-center gap-1 ${cx.muted}`}><ListTree size={12} />{subs.done}/{subs.total}</span> : null}
            {nComments ? <span className={`inline-flex items-center gap-1 ${cx.muted}`} title={`${nComments} comment${nComments === 1 ? '' : 's'}`} aria-label={`${nComments} comment${nComments === 1 ? '' : 's'}`}><MessageSquare size={12} />{nComments}</span> : null}
            {nReminders ? <span className={`inline-flex items-center ${cx.muted}`} title={`${nReminders} reminder${nReminders === 1 ? '' : 's'}`} aria-label={`${nReminders} reminder${nReminders === 1 ? '' : 's'}`}><Bell size={12} /></span> : null}
            {task.description && !due ? <AlignLeft size={12} className={cx.faint} /> : null}
            {labels.map((l) => <span key={l.id} className="inline-flex items-center gap-1" style={{ color: l.color }}><Tag size={11} />{l.name}</span>)}
            {showProject ? (
              <span className={`ml-auto inline-flex items-center gap-1 ${cx.muted}`}>
                {project ? <><span>{project.title}</span><Hash size={11} color={projectColor(project)} /></> : <><span>Inbox</span><Inbox size={11} /></>}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Hover actions (always visible on touch screens) */}
      <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => ui.openTask(task.id)} className={`hidden md:block p-1.5 rounded-md ${cx.hover} ${cx.muted}`} title="Edit" aria-label="Edit task"><Pencil size={15} /></button>
        <button ref={dateRef} onClick={() => setOpen('date')} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} title="Schedule" aria-label="Schedule"><CalendarDays size={15} /></button>
        <button ref={moreRef} onClick={() => setOpen('menu')} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} title="More actions" aria-label="More actions"><MoreHorizontal size={15} /></button>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <Popover anchor={moreRef.current} open={open === 'menu'} onClose={() => setOpen(null)} width={220}>
          <MenuItem icon={<Pencil size={15} />} label="Edit" onClick={() => { setOpen(null); ui.openTask(task.id); }} />
          <MenuItem icon={<CalendarDays size={15} />} label="Schedule…" onClick={() => setOpen('date')} />
          <MenuItem icon={<Flag size={15} color={PRIORITY_COLOR[p]} />} label="Priority…" hint={p === 'None' ? '' : PRIORITY_LABEL[p].replace('Priority ', 'P')} onClick={() => setOpen('priority')} />
          <MenuItem icon={<FolderInput size={15} />} label="Move to…" onClick={() => setOpen('project')} />
          <MenuItem icon={<Copy size={15} />} label="Duplicate" onClick={() => { setOpen(null); duplicateTask(task); }} />
          <MenuItem icon={<Trash2 size={15} />} label="Delete" danger onClick={() => { setOpen(null); ui.remove(task); }} />
        </Popover>
        <SchedulePicker anchor={dateRef.current} open={open === 'date'} onClose={() => setOpen(null)}
          value={{ dueDate: task.dueDate, dueTime: task.dueTime, recurrence: task.recurrence }}
          onChange={(s) => updateTask(task, { dueDate: s.dueDate ?? undefined, dueTime: s.dueTime ?? undefined, recurrence: s.recurrence ?? null })} />
        <PriorityPicker anchor={moreRef.current} open={open === 'priority'} onClose={() => setOpen(null)} value={p} onChange={(np) => updateTask(task, { priority: np })} />
        <ProjectPicker anchor={moreRef.current} open={open === 'project'} onClose={() => setOpen(null)} value={task.projectId} projects={projects}
          onChange={(id) => updateTask(task, { projectId: id })} onCreate={(name) => createProject({ title: name }).id} />
      </div>
    </div>
  );
}

export const TaskItem = memo(TaskItemImpl);
