import React, { useMemo, useState } from 'react';
import { Sun, CalendarDays, Sofa, CalendarArrowUp, CalendarX, Repeat, Flag, Hash, Inbox, Tag, Plus, Clock, X, Rows3, Bell, Timer } from 'lucide-react';
import type { Label, Project, TaskPriority, TaskRecurrence, TaskReminder } from '../../types';
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

// ------------------------------------------------------------------ section / reminders / duration

export function SectionPicker({
  anchor, open, onClose, value, sections, onChange,
}: Base & { value: string | null | undefined; sections: { id: string; name: string }[]; onChange: (id: string | null) => void }) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} width={240}>
      <MenuItem icon={<X size={15} className={cx.muted} />} label="No section" selected={!value} onClick={() => { onChange(null); onClose(); }} />
      {sections.map((s) => (
        <MenuItem key={s.id} icon={<Rows3 size={15} className={cx.muted} />} label={s.name} selected={value === s.id} onClick={() => { onChange(s.id); onClose(); }} />
      ))}
    </Popover>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const REL_PRESETS = [0, 10, 30, 60, 1440];
const MAX_REMINDERS = 10;

export function relativeReminderLabel(m: number): string {
  if (m === 0) return 'At due time';
  if (m < 60) return `${m} min before`;
  if (m < 1440) return `${+(m / 60).toFixed(1)} h before`;
  const d = +(m / 1440).toFixed(1);
  return `${d} day${d === 1 ? '' : 's'} before`;
}

/** Human description of a reminder ("30 min before", "Oct 9 9:00 AM"). */
export function describeReminder(r: TaskReminder): string {
  if (r.type === 'relative') return relativeReminderLabel(r.minutesBefore ?? 0);
  if (!r.at) return 'Reminder';
  const [d, t] = r.at.split('T');
  return `${formatDueDate(d)}${t ? ` ${formatTime(t.slice(0, 5))}` : ''}`;
}

const sameReminder = (a: TaskReminder, b: TaskReminder) =>
  a.type === b.type && (a.type === 'relative' ? (a.minutesBefore ?? 0) === (b.minutesBefore ?? 0) : a.at === b.at);

const reminderId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Reminder list + add. "Before" reminders are relative to the due date/time,
 * so they need a due time; absolute reminders can be any local date-time.
 */
export function RemindersPicker({
  anchor, open, onClose, value, dueDate, dueTime, onChange,
}: Base & { value: TaskReminder[]; dueDate?: string | null; dueTime?: string | null; onChange: (r: TaskReminder[]) => void }) {
  const now = new Date();
  const defaultAt = `${dueDate ?? toISODate(now)}T${dueTime ?? `${pad2(Math.min(23, now.getHours() + 1))}:00`}`;
  const [at, setAt] = useState('');
  const full = value.length >= MAX_REMINDERS;
  const add = (r: TaskReminder) => {
    if (full || value.some((x) => sameReminder(x, r))) return;
    onChange([...value, r]);
  };
  const close = () => { setAt(''); onClose(); };
  return (
    <Popover anchor={anchor} open={open} onClose={close} width={280}>
      <p className={`px-3 pt-1 pb-1 text-xs font-semibold ${cx.muted}`}>Reminders</p>
      {value.length ? (
        <ul aria-label="Current reminders">
          {value.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm ${cx.text}`}>
              <Bell size={14} className="text-blue-500 shrink-0" />
              <span className="flex-1 truncate">{describeReminder(r)}</span>
              <button onClick={() => onChange(value.filter((x) => x.id !== r.id))} className={`p-1 rounded ${cx.hover} ${cx.muted}`} aria-label={`Remove reminder: ${describeReminder(r)}`}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className={`px-3 py-1.5 text-sm ${cx.muted}`}>No reminders yet.</p>}

      <div className={`border-t ${cx.border} mt-1 pt-1`}>
        {dueDate && dueTime ? (
          REL_PRESETS.map((m) => (
            <MenuItem key={m} icon={<Plus size={15} className={cx.muted} />} label={relativeReminderLabel(m)}
              selected={value.some((x) => x.type === 'relative' && (x.minutesBefore ?? 0) === m)}
              onClick={() => add({ id: reminderId(), type: 'relative', minutesBefore: m })} />
          ))
        ) : (
          <p className={`px-3 py-1.5 text-xs ${cx.muted}`}>
            {dueDate ? 'Add a due time to use “before” reminders.' : 'Set a due date and time to use “before” reminders.'}
          </p>
        )}
      </div>
      <form
        className={`border-t ${cx.border} px-3 py-2 flex items-center gap-2`}
        onSubmit={(e) => {
          e.preventDefault();
          const v = at || defaultAt;
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return;
          add({ id: reminderId(), type: 'absolute', at: v.slice(0, 16) });
          setAt('');
        }}
      >
        <input type="datetime-local" value={at || defaultAt} onChange={(e) => setAt(e.target.value)} className={`${cx.input} flex-1 min-w-0 py-1`} aria-label="Custom reminder date and time" />
        <button type="submit" disabled={full} className={cx.btnPrimary}>Add</button>
      </form>
      {full ? <p className={`px-3 pb-1 text-xs ${cx.muted}`}>Maximum of {MAX_REMINDERS} reminders.</p> : null}
    </Popover>
  );
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

export function describeDuration(m?: number | null): string {
  if (!m) return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function DurationPicker({
  anchor, open, onClose, value, onChange,
}: Base & { value?: number | null; onChange: (m: number | null) => void }) {
  const [custom, setCustom] = useState('');
  const close = () => { setCustom(''); onClose(); };
  const n = Math.round(Number(custom));
  const customOk = custom.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= 24 * 60 * 14;
  return (
    <Popover anchor={anchor} open={open} onClose={close} width={220}>
      {DURATION_PRESETS.map((m) => (
        <MenuItem key={m} icon={<Timer size={15} className={cx.muted} />} label={describeDuration(m)} selected={value === m} onClick={() => { onChange(m); close(); }} />
      ))}
      <form className={`border-t ${cx.border} mt-1 px-3 py-2 flex items-center gap-2`} onSubmit={(e) => { e.preventDefault(); if (customOk) { onChange(n); close(); } }}>
        <input type="number" min={1} max={20160} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom" className={`${cx.input} w-full py-1`} aria-label="Custom duration in minutes" />
        <span className={`text-xs ${cx.muted}`}>min</span>
        <button type="submit" disabled={!customOk} className={cx.btnPrimary}>Set</button>
      </form>
      {value ? <MenuItem icon={<X size={15} className="text-red-500" />} label="No duration" danger onClick={() => { onChange(null); close(); }} /> : null}
    </Popover>
  );
}
