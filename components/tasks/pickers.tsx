import React, { useMemo, useState } from 'react';
import { Sun, CalendarDays, Sofa, CalendarArrowUp, CalendarX, Repeat, Flag, Hash, Inbox, Tag, Plus, Clock } from 'lucide-react';
import type { Label, Project, TaskPriority, TaskRecurrence } from '../../types';
import {
  addDays, startOfWeek, toISODate, formatDueDate, formatTime, WEEKDAY_SHORT, describeRecurrence,
  RECURRENCE_PRESETS, parseQuickAdd, orderedProjects,
} from '../../shared/tasks';
import { Popover, MenuItem, cx, PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL } from './ui';
import { projectColor } from './actions';

export interface Schedule { dueDate?: string | null; dueTime?: string | null; recurrence?: TaskRecurrence | null }

interface Base { anchor: HTMLElement | null; open: boolean; onClose: () => void }

export function SchedulePicker({ anchor, open, onClose, value, onChange }: Base & { value: Schedule; onChange: (s: Schedule) => void }) {
  const [text, setText] = useState('');
  const now = new Date();
  const today = toISODate(now);
  const wd = now.getDay();
  const typed = useMemo(() => (text.trim() ? parseQuickAdd(`x ${text}`, { now: new Date() }) : null), [text]);
  const typedOk = !!typed && (!!typed.dueDate || !!typed.recurrence) && typed.title === 'x';

  const apply = (s: Schedule, close = true) => {
    onChange({ ...value, ...s });
    if (close) { setText(''); onClose(); }
  };
  const setDate = (d: string | null) => apply({ dueDate: d, dueTime: d ? value.dueTime : null, recurrence: d ? value.recurrence : null });
  const options = [
    { label: 'Today', icon: <Sun size={16} color="#16A34A" />, date: today, hint: WEEKDAY_SHORT[wd] },
    { label: 'Tomorrow', icon: <CalendarDays size={16} color="#D97706" />, date: toISODate(addDays(now, 1)), hint: WEEKDAY_SHORT[(wd + 1) % 7] },
    ...(wd >= 1 && wd <= 5 ? [{ label: 'This weekend', icon: <Sofa size={16} color="#3B82F6" />, date: toISODate(addDays(now, 6 - wd)), hint: 'Sat' }] : []),
    { label: 'Next week', icon: <CalendarArrowUp size={16} color="#8B5CF6" />, date: toISODate(addDays(startOfWeek(now), 7)), hint: `Mon ${addDays(startOfWeek(now), 7).getDate()}` },
  ];

  return (
    <Popover anchor={anchor} open={open} onClose={() => { setText(''); onClose(); }} width={300}>
      <div className="px-3 pt-1.5 pb-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && typedOk) apply({ dueDate: typed!.dueDate ?? null, dueTime: typed!.dueTime ?? null, recurrence: typed!.recurrence ?? value.recurrence ?? null });
          }}
          placeholder="Type a date: next fri 5pm, every mon…"
          className={`${cx.input} w-full`}
          aria-label="Type a date"
        />
        {text.trim() ? (
          typedOk ? (
            <button
              onClick={() => apply({ dueDate: typed!.dueDate ?? null, dueTime: typed!.dueTime ?? null, recurrence: typed!.recurrence ?? value.recurrence ?? null })}
              className="mt-2 w-full text-left text-sm px-2.5 py-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
            >
              {formatDueDate(typed!.dueDate)}{typed!.dueTime ? ` · ${formatTime(typed!.dueTime)}` : ''}{typed!.recurrence ? ` · ${describeRecurrence(typed!.recurrence)}` : ''} — press Enter
            </button>
          ) : <p className={`text-xs mt-1.5 ${cx.muted}`}>Didn’t recognise that date yet…</p>
        ) : null}
      </div>
      <div className={`border-t ${cx.border} pt-1`}>
        {options.map((o) => (
          <MenuItem key={o.label} icon={o.icon} label={o.label} hint={o.hint} selected={value.dueDate === o.date} onClick={() => setDate(o.date)} />
        ))}
        <MenuItem icon={<CalendarX size={16} color="#EF4444" />} label="No date" selected={!value.dueDate} onClick={() => setDate(null)} />
      </div>
      <div className={`border-t ${cx.border} px-3 py-2 space-y-2`}>
        <label className={`flex items-center gap-2 text-sm ${cx.muted}`}>
          <CalendarDays size={15} /> <span className="w-10">Date</span>
          <input type="date" value={value.dueDate ?? ''} onChange={(e) => apply({ dueDate: e.target.value || null }, false)} className={`${cx.input} flex-1 py-1`} />
        </label>
        <label className={`flex items-center gap-2 text-sm ${cx.muted}`}>
          <Clock size={15} /> <span className="w-10">Time</span>
          <input type="time" value={value.dueTime ?? ''} onChange={(e) => apply({ dueTime: e.target.value || null, dueDate: value.dueDate ?? today }, false)} className={`${cx.input} flex-1 py-1`} />
        </label>
        <label className={`flex items-center gap-2 text-sm ${cx.muted}`}>
          <Repeat size={15} /> <span className="w-10">Repeat</span>
          <select
            value={RECURRENCE_PRESETS.findIndex((p) => describeRecurrence(p.rule) === describeRecurrence(value.recurrence))}
            onChange={(e) => {
              const i = Number(e.target.value);
              apply(i < 0 ? { recurrence: null } : { recurrence: RECURRENCE_PRESETS[i].rule, dueDate: value.dueDate ?? today }, false);
            }}
            className={`${cx.input} flex-1 py-1`}
          >
            <option value={-1}>{value.recurrence && RECURRENCE_PRESETS.every((p) => describeRecurrence(p.rule) !== describeRecurrence(value.recurrence)) ? describeRecurrence(value.recurrence) : 'Does not repeat'}</option>
            {RECURRENCE_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
          </select>
        </label>
      </div>
    </Popover>
  );
}

export function PriorityPicker({ anchor, open, onClose, value, onChange }: Base & { value: TaskPriority; onChange: (p: TaskPriority) => void }) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} width={200}>
      {PRIORITIES.map((p) => (
        <MenuItem
          key={p}
          icon={<Flag size={16} color={PRIORITY_COLOR[p]} fill={p === 'None' ? 'none' : PRIORITY_COLOR[p]} />}
          label={PRIORITY_LABEL[p]}
          selected={value === p}
          onClick={() => { onChange(p); onClose(); }}
        />
      ))}
    </Popover>
  );
}

export function ProjectPicker({
  anchor, open, onClose, value, projects, onChange, onCreate,
}: Base & { value: string | null | undefined; projects: Project[]; onChange: (id: string | null) => void; onCreate: (name: string) => string }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => orderedProjects(projects), [projects]);
  const query = q.trim().toLowerCase();
  const filtered = query ? list.filter((p) => p.project.title.toLowerCase().includes(query)) : list;
  const exact = list.some((p) => p.project.title.toLowerCase() === query);
  const close = () => { setQ(''); onClose(); };
  return (
    <Popover anchor={anchor} open={open} onClose={close} width={260}>
      <div className="px-3 pb-1.5 pt-1">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a project name" className={`${cx.input} w-full`} aria-label="Search projects" />
      </div>
      {!query ? <MenuItem icon={<Inbox size={16} className="text-blue-500" />} label="Inbox" selected={!value} onClick={() => { onChange(null); close(); }} /> : null}
      {filtered.map(({ project, depth }) => (
        <div key={project.id} style={{ paddingLeft: query ? 0 : depth * 14 }}>
          <MenuItem icon={<Hash size={16} color={projectColor(project)} />} label={project.title} selected={value === project.id} onClick={() => { onChange(project.id); close(); }} />
        </div>
      ))}
      {query && !exact ? (
        <MenuItem icon={<Plus size={16} className="text-blue-500" />} label={`Create “${q.trim()}”`} onClick={() => { onChange(onCreate(q.trim())); close(); }} />
      ) : null}
    </Popover>
  );
}

export function LabelPicker({
  anchor, open, onClose, value, labels, onChange, onCreate,
}: Base & { value: string[]; labels: Label[]; onChange: (ids: string[]) => void; onCreate: (name: string) => string }) {
  const [q, setQ] = useState('');
  const name = q.trim().replace(/^[@%]/, '');
  const sorted = useMemo(() => [...labels].sort((a, b) => a.name.localeCompare(b.name)), [labels]);
  const filtered = name ? sorted.filter((l) => l.name.toLowerCase().includes(name.toLowerCase())) : sorted;
  const exact = sorted.some((l) => l.name.toLowerCase() === name.toLowerCase());
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <Popover anchor={anchor} open={open} onClose={() => { setQ(''); onClose(); }} width={240}>
      <div className="px-3 pb-1.5 pt-1">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a label" className={`${cx.input} w-full`} aria-label="Search labels"
          onKeyDown={(e) => { if (e.key === 'Enter' && name && !exact) { onChange([...value, onCreate(name)]); setQ(''); } }} />
      </div>
      {filtered.map((l) => (
        <MenuItem key={l.id} icon={<Tag size={15} color={l.color} />} label={l.name} selected={value.includes(l.id)} onClick={() => toggle(l.id)} />
      ))}
      {name && !exact ? <MenuItem icon={<Plus size={16} className="text-blue-500" />} label={`Create “${name}”`} onClick={() => { onChange([...value, onCreate(name)]); setQ(''); }} /> : null}
      {!filtered.length && !name ? <p className={`px-3 py-2 text-sm ${cx.muted}`}>No labels yet — type to create one.</p> : null}
    </Popover>
  );
}
