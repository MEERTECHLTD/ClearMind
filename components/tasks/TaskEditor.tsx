import React, { useMemo, useRef, useState } from 'react';
import { CalendarDays, Flag, Tag, Hash, Inbox, Repeat, X, Bell, Timer } from 'lucide-react';
import type { TaskPriority } from '../../types';
import { parseQuickAdd, formatDueDate, formatTime, describeRecurrence } from '../../shared/tasks';
import { SchedulePicker, PriorityPicker, ProjectPicker, LabelPicker, relativeReminderLabel, describeDuration, type Schedule } from './pickers';
import { cx, PRIORITY_COLOR, PRIORITY_SHORT, dueColor } from './ui';
import { createTask, resolveNames, createProject, createLabel, projectColor } from './actions';
import { useTaskData } from './TaskContext';

export interface AddDefaults {
  projectId?: string | null;
  /** Section within `projectId` (dropped if the user picks another project). */
  sectionId?: string | null;
  dueDate?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  priority?: TaskPriority;
  /** Prefilled task name / description (e.g. "Turn into task" from a Journal entry). Parsed like typed text. */
  title?: string;
  description?: string;
}

type Picker = null | 'date' | 'priority' | 'project' | 'labels';

function Chip({ children, onClick, onClear, active, color, refEl, label }: {
  children: React.ReactNode; onClick: () => void; onClear?: () => void; active?: boolean; color?: string;
  refEl?: React.Ref<HTMLButtonElement>; label: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-md border ${cx.border} text-xs ${active ? '' : cx.muted}`} style={active && color ? { color } : undefined}>
      <button ref={refEl} type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${cx.hover}`} aria-label={label}>
        {children}
      </button>
      {onClear ? (
        <button type="button" onClick={onClear} className={`pr-1.5 ${cx.faint} hover:text-gray-700 dark:hover:text-gray-200`} aria-label={`Remove ${label}`}><X size={12} /></button>
      ) : null}
    </span>
  );
}

/**
 * Inline task composer. Natural language in the title is parsed live
 * ("Pay rent every month p1 #Home @bills"); recognised parts become chips —
 * clear a chip to keep that word as text. Stays open after adding for rapid
 * entry (Esc / Cancel closes).
 */
export function TaskEditor({
  defaults = {}, onClose, autoFocus = true, submitLabel = 'Add task', compact = false,
}: { defaults?: AddDefaults; onClose: () => void; autoFocus?: boolean; submitLabel?: string; compact?: boolean }) {
  const { projects, labels, projectMap, labelMap } = useTaskData();
  const [text, setText] = useState(defaults.title ?? '');
  const [desc, setDesc] = useState(defaults.description ?? '');
  const [ignore, setIgnore] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined);
  const [labelIds, setLabelIds] = useState<string[] | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const refs = { date: useRef<HTMLButtonElement>(null), priority: useRef<HTMLButtonElement>(null), project: useRef<HTMLButtonElement>(null), labels: useRef<HTMLButtonElement>(null) };
  const input = useRef<HTMLInputElement>(null);

  const projectRefs = useMemo(() => projects.filter((p) => !p.archived).map((p) => ({ id: p.id, title: p.title })), [projects]);
  const parsed = useMemo(() => parseQuickAdd(text, { projects: projectRefs, labels, ignore }), [text, projectRefs, labels, ignore]);

  const eff = {
    dueDate: schedule ? schedule.dueDate ?? null : parsed.dueDate ?? defaults.dueDate ?? null,
    dueTime: schedule ? schedule.dueTime ?? null : parsed.dueTime ?? null,
    recurrence: schedule ? schedule.recurrence ?? null : parsed.recurrence ?? null,
    priority: priority ?? parsed.priority ?? defaults.priority ?? ('None' as TaskPriority),
    projectId: projectId !== undefined ? projectId : parsed.projectId ?? (parsed.projectName ? undefined : defaults.projectId ?? null),
  };
  const newProject = projectId === undefined && !parsed.projectId ? parsed.projectName : undefined;
  const effLabels = labelIds ?? [...new Set([...(defaults.labelIds ?? []), ...parsed.labels.filter((l) => l.id).map((l) => l.id!)])];
  const newLabels = labelIds ? [] : parsed.labels.filter((l) => !l.id).map((l) => l.name);
  const canSubmit = parsed.title.length > 0;
  // "!30m" / "!9am" reminders: relative ones fire before the due time, absolute ones on the due date.
  const reminders = eff.dueDate && parsed.reminders.length
    ? parsed.reminders.map((r, i) => (r.minutesBefore != null
      ? { id: `q${i}`, type: 'relative' as const, minutesBefore: r.minutesBefore }
      : { id: `q${i}`, type: 'absolute' as const, at: `${eff.dueDate}T${r.time}` }))
    : undefined;
  const reminderText = parsed.reminders.map((r) => (r.minutesBefore != null ? relativeReminderLabel(r.minutesBefore) : `At ${formatTime(r.time)}`)).join(', ');

  const unparse = (...types: string[]) => {
    const words = parsed.tokens.filter((t) => types.includes(t.type)).map((t) => t.text.toLowerCase());
    if (words.length) setIgnore((x) => [...x, ...words]);
  };

  const reset = () => {
    setText(''); setDesc(''); setIgnore([]); setSchedule(null); setPriority(null); setProjectId(undefined); setLabelIds(null);
  };

  const submit = () => {
    if (!canSubmit) return;
    const resolved = resolveNames(newProject, eff.projectId, [...effLabels.map((id) => ({ id, name: '' })), ...newLabels.map((name) => ({ name }))]);
    createTask({
      title: parsed.title, description: desc, dueDate: eff.dueDate, dueTime: eff.dueTime, recurrence: eff.recurrence,
      priority: eff.priority, projectId: resolved.projectId,
      sectionId: resolved.projectId && resolved.projectId === defaults.projectId ? defaults.sectionId ?? null : null,
      parentId: defaults.parentId ?? null, labelIds: resolved.labelIds,
      duration: parsed.duration ?? null, reminders,
    });
    reset();
    input.current?.focus();
  };

  const project = eff.projectId ? projectMap.get(eff.projectId) : null;
  const dateText = eff.dueDate ? `${formatDueDate(eff.dueDate)}${eff.dueTime ? ` ${formatTime(eff.dueTime)}` : ''}` : 'Date';

  return (
    <div
      className={`rounded-xl border ${cx.border} ${cx.card} ${compact ? '' : 'shadow-sm'} focus-within:border-gray-400 dark:focus-within:border-gray-600`}
      onKeyDown={(e) => { if (e.key === 'Escape' && !picker) { e.stopPropagation(); onClose(); } }}
    >
      <div className="px-3 pt-2.5">
        <input
          ref={input}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={defaults.parentId ? 'Sub-task name' : 'Task name — try “Pay rent every month p1 #Home @bills”'}
          className={`w-full bg-transparent outline-none text-[15px] font-medium ${cx.text} placeholder:text-gray-400 placeholder:font-normal`}
          aria-label="Task name"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Description"
          className={`w-full bg-transparent outline-none text-[13px] mt-1 ${cx.muted} placeholder:text-gray-400`}
          aria-label="Description"
        />
        {parsed.tokens.length ? (
          <p className={`text-[11px] mt-1 ${cx.faint}`}>
            Recognised {parsed.tokens.map((t) => <mark key={t.start} className="bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded px-1 mx-0.5">{t.text}</mark>)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5 py-2">
          <Chip refEl={refs.date} label={`Due date: ${dateText}`} onClick={() => setPicker('date')} active={!!eff.dueDate} color={eff.dueDate ? dueColor({ dueDate: eff.dueDate }) : undefined}
            onClear={eff.dueDate ? () => { unparse('date', 'time', 'recurrence'); setSchedule({ dueDate: null, dueTime: null, recurrence: null }); } : undefined}>
            {eff.recurrence ? <Repeat size={13} /> : <CalendarDays size={13} />}
            {eff.recurrence ? `${dateText} · ${describeRecurrence(eff.recurrence)}` : dateText}
          </Chip>
          <Chip refEl={refs.priority} label="Priority" onClick={() => setPicker('priority')} active={eff.priority !== 'None'} color={PRIORITY_COLOR[eff.priority]}>
            <Flag size={13} fill={eff.priority === 'None' ? 'none' : PRIORITY_COLOR[eff.priority]} color={eff.priority === 'None' ? undefined : PRIORITY_COLOR[eff.priority]} />
            {eff.priority === 'None' ? 'Priority' : PRIORITY_SHORT[eff.priority]}
          </Chip>
          <Chip refEl={refs.labels} label="Labels" onClick={() => setPicker('labels')} active={effLabels.length + newLabels.length > 0}
            onClear={labelIds === null && parsed.labels.length ? () => unparse('label') : undefined}>
            <Tag size={13} />
            {effLabels.length + newLabels.length
              ? [...effLabels.map((id) => labelMap.get(id)?.name ?? ''), ...newLabels.map((n) => `${n} (new)`)].filter(Boolean).join(', ')
              : 'Labels'}
          </Chip>
          {parsed.duration ? (
            <Chip label={`Duration: ${describeDuration(parsed.duration)}`} onClick={() => {}} active onClear={() => unparse('duration')}>
              <Timer size={13} />{describeDuration(parsed.duration)}
            </Chip>
          ) : null}
          {parsed.reminders.length ? (
            <Chip label={`Reminders: ${reminderText}`} onClick={() => {}} active={!!eff.dueDate} onClear={() => unparse('reminder')}>
              <Bell size={13} />{reminderText}{eff.dueDate ? '' : ' (needs a date)'}
            </Chip>
          ) : null}
        </div>
      </div>
      <div className={`flex items-center gap-2 px-3 py-2 border-t ${cx.border}`}>
        {!defaults.parentId ? (
          <Chip refEl={refs.project} label="Project" onClick={() => setPicker('project')} active={!!project || !!newProject}
            onClear={parsed.tokens.some((t) => t.type === 'project') && projectId === undefined ? () => unparse('project') : undefined}>
            {project ? <Hash size={13} color={projectColor(project)} /> : newProject ? <Hash size={13} className="text-blue-500" /> : <Inbox size={13} />}
            <span className={cx.text}>{project?.title ?? (newProject ? `${newProject} (new)` : 'Inbox')}</span>
          </Chip>
        ) : null}
        <div className="flex-1" />
        <button type="button" onClick={onClose} className={cx.btnGhost}>Cancel</button>
        <button type="button" onClick={submit} disabled={!canSubmit} className={cx.btnPrimary}>{submitLabel}</button>
      </div>

      <SchedulePicker anchor={refs.date.current} open={picker === 'date'} onClose={() => setPicker(null)}
        value={{ dueDate: eff.dueDate, dueTime: eff.dueTime, recurrence: eff.recurrence }}
        onChange={(s) => { unparse('date', 'time', 'recurrence'); setSchedule(s); }} />
      <PriorityPicker anchor={refs.priority.current} open={picker === 'priority'} onClose={() => setPicker(null)} value={eff.priority}
        onChange={(p) => { unparse('priority'); setPriority(p); }} />
      <ProjectPicker anchor={refs.project.current} open={picker === 'project'} onClose={() => setPicker(null)} value={eff.projectId} projects={projects}
        onChange={(id) => { unparse('project'); setProjectId(id); }} onCreate={(name) => createProject({ title: name }).id} />
      <LabelPicker anchor={refs.labels.current} open={picker === 'labels'} onClose={() => setPicker(null)} value={effLabels} labels={labels}
        onChange={setLabelIds} onCreate={(name) => createLabel({ name }).id} />
    </div>
  );
}
