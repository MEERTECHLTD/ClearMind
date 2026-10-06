import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Sun, CalendarDays, Sofa, CalendarArrowUp, CalendarX, Clock, Repeat, Check, Flag, Hash, Inbox, Tag, Plus, X,
} from 'lucide-react-native';
import type { Label, Project, TaskPriority, TaskRecurrence } from '@clearmind/shared';
import {
  addDays, startOfWeek, toISODate, parseISODate, formatDueDate, formatTime, WEEKDAY_SHORT,
  describeRecurrence, RECURRENCE_PRESETS, parseQuickAdd, orderedProjects,
} from '@clearmind/shared/tasks';
import { Sheet } from '../ui/Sheet';
import { C, PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL } from './theme';
import { projectColor } from '../../services/taskActions';

const pad = (n: number) => String(n).padStart(2, '0');

export interface Schedule {
  dueDate?: string | null;
  dueTime?: string | null;
  recurrence?: TaskRecurrence | null;
}

function Row({
  icon, label, hint, onPress, selected, color = C.ink,
}: { icon: React.ReactNode; label: string; hint?: string; onPress: () => void; selected?: boolean; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center py-3 active:opacity-60"
      style={{ minHeight: 48 }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
    >
      <View className="w-8">{icon}</View>
      <Text className="flex-1 text-base" style={{ color }}>{label}</Text>
      {hint ? <Text className="text-ink-muted text-sm mr-2">{hint}</Text> : null}
      {selected ? <Check size={18} color={C.accent} /> : null}
    </Pressable>
  );
}

/**
 * Schedule sheet: type a date in plain words, or pick a quick option / calendar
 * date, a time and a repeat rule. Applies on every pick (no extra "save" tap).
 */
export function SchedulePicker({
  visible, value, onClose, onChange,
}: {
  visible: boolean;
  value: Schedule;
  onClose: () => void;
  onChange: (s: Schedule) => void;
}) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState<null | 'date' | 'time'>(null);
  const [showRepeat, setShowRepeat] = useState(false);
  const now = new Date();
  const today = toISODate(now);
  const weekday = now.getDay();

  const typed = useMemo(() => (text.trim() ? parseQuickAdd(`x ${text}`, { now }) : null), [text]);
  const typedValid = !!typed && (typed.dueDate || typed.recurrence) && typed.title === 'x';

  const apply = (s: Schedule, close = true) => {
    onChange({ ...value, ...s });
    if (close) { setText(''); setShowRepeat(false); onClose(); }
  };
  const setDate = (d: string | null) => apply({ dueDate: d, dueTime: d ? value.dueTime : null, recurrence: d ? value.recurrence : null });

  const options = [
    { label: 'Today', icon: <Sun size={20} color={C.today} />, date: today, hint: WEEKDAY_SHORT[weekday] },
    { label: 'Tomorrow', icon: <CalendarDays size={20} color={C.tomorrow} />, date: toISODate(addDays(now, 1)), hint: WEEKDAY_SHORT[(weekday + 1) % 7] },
    ...(weekday >= 1 && weekday <= 5
      ? [{ label: 'This weekend', icon: <Sofa size={20} color="#60A5FA" />, date: toISODate(addDays(now, 6 - weekday)), hint: 'Sat' }]
      : []),
    { label: 'Next week', icon: <CalendarArrowUp size={20} color={C.week} />, date: toISODate(addDays(startOfWeek(now), 7)), hint: `Mon ${addDays(startOfWeek(now), 7).getDate()}` },
  ];

  const current = value.dueDate
    ? `${formatDueDate(value.dueDate)}${value.dueTime ? ` · ${formatTime(value.dueTime)}` : ''}`
    : 'No date';
  const pickerBase = (() => {
    const d = parseISODate(value.dueDate) ?? new Date();
    if (value.dueTime) {
      const [h, m] = value.dueTime.split(':').map(Number);
      d.setHours(h || 0, m || 0);
    } else d.setHours(9, 0);
    return d;
  })();

  return (
    <Sheet visible={visible} onClose={() => { setText(''); setShowRepeat(false); onClose(); }} title="Schedule" right={<Text className="text-ink-muted text-sm">{current}</Text>}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a date: next fri 5pm, every mon…"
          placeholderTextColor="#6b7280"
          className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line"
          returnKeyType="done"
          autoCorrect={false}
          onSubmitEditing={() => {
            if (typedValid) apply({ dueDate: typed!.dueDate ?? null, dueTime: typed!.dueTime ?? null, recurrence: typed!.recurrence ?? value.recurrence ?? null });
          }}
          accessibilityLabel="Type a date"
        />
        {text.trim() ? (
          typedValid ? (
            <Pressable
              onPress={() => apply({ dueDate: typed!.dueDate ?? null, dueTime: typed!.dueTime ?? null, recurrence: typed!.recurrence ?? value.recurrence ?? null })}
              className="flex-row items-center mt-2 px-3 py-2.5 rounded-xl bg-accent/15 active:opacity-70"
            >
              <CalendarDays size={16} color={C.accent} />
              <Text className="text-accent ml-2 font-semibold flex-1">
                {formatDueDate(typed!.dueDate)}{typed!.dueTime ? ` · ${formatTime(typed!.dueTime)}` : ''}
                {typed!.recurrence ? ` · ${describeRecurrence(typed!.recurrence)}` : ''}
              </Text>
              <Text className="text-accent text-xs">Apply</Text>
            </Pressable>
          ) : (
            <Text className="text-ink-muted text-xs mt-2 ml-1">Didn’t recognise that date yet…</Text>
          )
        ) : null}

        <View className="mt-2">
          {options.map((o) => (
            <Row key={o.label} icon={o.icon} label={o.label} hint={o.hint} selected={value.dueDate === o.date} onPress={() => setDate(o.date)} />
          ))}
          <Row icon={<CalendarDays size={20} color={C.muted} />} label="Pick a date…" hint={value.dueDate ? formatDueDate(value.dueDate) : undefined} onPress={() => setPicker('date')} />
          <Row
            icon={<Clock size={20} color={C.muted} />}
            label={value.dueTime ? `Time · ${formatTime(value.dueTime)}` : 'Add time'}
            onPress={() => setPicker('time')}
          />
          <Row
            icon={<Repeat size={20} color={value.recurrence ? C.accent : C.muted} />}
            label={value.recurrence ? describeRecurrence(value.recurrence) : 'Repeat'}
            onPress={() => setShowRepeat((x) => !x)}
          />
          {showRepeat ? (
            <View className="ml-8 mb-1">
              {RECURRENCE_PRESETS.map((p) => (
                <Row
                  key={p.label}
                  icon={<View />}
                  label={p.label}
                  selected={describeRecurrence(value.recurrence) === describeRecurrence(p.rule)}
                  onPress={() => apply({ recurrence: p.rule, dueDate: value.dueDate ?? today }, false)}
                />
              ))}
              {value.recurrence ? (
                <Row icon={<View />} label="Does not repeat" color={C.danger} onPress={() => apply({ recurrence: null }, false)} />
              ) : null}
            </View>
          ) : null}
          {value.dueTime ? (
            <Row icon={<X size={20} color={C.muted} />} label="Remove time" onPress={() => apply({ dueTime: null }, false)} />
          ) : null}
          <Row icon={<CalendarX size={20} color={C.danger} />} label="No date" color={C.danger} selected={!value.dueDate} onPress={() => setDate(null)} />
        </View>
      </ScrollView>

      {picker ? (
        <DateTimePicker
          value={pickerBase}
          mode={picker}
          display={Platform.OS === 'ios' ? (picker === 'date' ? 'inline' : 'spinner') : 'default'}
          themeVariant="dark"
          onChange={(e, d) => {
            const which = picker;
            if (Platform.OS !== 'ios') setPicker(null);
            if (e.type !== 'set' || !d) return;
            if (which === 'date') apply({ dueDate: toISODate(d) }, Platform.OS !== 'ios');
            else apply({ dueTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`, dueDate: value.dueDate ?? today }, false);
          }}
        />
      ) : null}
      {picker && Platform.OS === 'ios' ? (
        <Pressable onPress={() => setPicker(null)} className="items-center py-3"><Text className="text-accent font-semibold">Done</Text></Pressable>
      ) : null}
    </Sheet>
  );
}

export function PriorityPicker({
  visible, value, onClose, onChange,
}: { visible: boolean; value: TaskPriority; onClose: () => void; onChange: (p: TaskPriority) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Priority">
      {PRIORITIES.map((p) => (
        <Row
          key={p}
          icon={<Flag size={20} color={PRIORITY_COLOR[p]} fill={p === 'None' ? 'transparent' : PRIORITY_COLOR[p]} />}
          label={PRIORITY_LABEL[p]}
          selected={value === p}
          onPress={() => { onChange(p); onClose(); }}
        />
      ))}
    </Sheet>
  );
}

export function ProjectPicker({
  visible, value, projects, onClose, onChange, onCreate,
}: {
  visible: boolean;
  value: string | null | undefined;
  projects: Project[];
  onClose: () => void;
  onChange: (id: string | null) => void;
  onCreate: (name: string) => string;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => orderedProjects(projects), [projects]);
  const filtered = q.trim() ? list.filter((p) => p.project.title.toLowerCase().includes(q.trim().toLowerCase())) : list;
  const exact = list.some((p) => p.project.title.toLowerCase() === q.trim().toLowerCase());
  const close = () => { setQ(''); onClose(); };
  return (
    <Sheet visible={visible} onClose={close} title="Move to…">
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search or create a project"
        placeholderTextColor="#6b7280"
        className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line mb-1"
        accessibilityLabel="Search projects"
      />
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
        {!q.trim() ? (
          <Row icon={<Inbox size={20} color={C.accent} />} label="Inbox" selected={!value} onPress={() => { onChange(null); close(); }} />
        ) : null}
        {filtered.map(({ project, depth }) => (
          <View key={project.id} style={{ paddingLeft: q.trim() ? 0 : depth * 18 }}>
            <Row
              icon={<Hash size={20} color={projectColor(project)} />}
              label={project.title}
              selected={value === project.id}
              onPress={() => { onChange(project.id); close(); }}
            />
          </View>
        ))}
        {q.trim() && !exact ? (
          <Row icon={<Plus size={20} color={C.accent} />} label={`Create “${q.trim()}”`} color={C.accent} onPress={() => { onChange(onCreate(q.trim())); close(); }} />
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

export function LabelPicker({
  visible, value, labels, onClose, onChange, onCreate,
}: {
  visible: boolean;
  value: string[];
  labels: Label[];
  onClose: () => void;
  onChange: (ids: string[]) => void;
  onCreate: (name: string) => string;
}) {
  const [q, setQ] = useState('');
  const sorted = useMemo(() => [...labels].sort((a, b) => a.name.localeCompare(b.name)), [labels]);
  const name = q.trim().replace(/^[@%]/, '');
  const filtered = name ? sorted.filter((l) => l.name.toLowerCase().includes(name.toLowerCase())) : sorted;
  const exact = sorted.some((l) => l.name.toLowerCase() === name.toLowerCase());
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const close = () => { setQ(''); onClose(); };
  return (
    <Sheet visible={visible} onClose={close} title="Labels" right={<Pressable onPress={close} hitSlop={10}><Text className="text-accent font-semibold">Done</Text></Pressable>}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search or create a label"
        placeholderTextColor="#6b7280"
        className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line mb-1"
        accessibilityLabel="Search labels"
        autoCapitalize="none"
      />
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
        {filtered.map((l) => (
          <Row key={l.id} icon={<Tag size={18} color={l.color} />} label={l.name} selected={value.includes(l.id)} onPress={() => toggle(l.id)} />
        ))}
        {name && !exact ? (
          <Row icon={<Plus size={20} color={C.accent} />} label={`Create “${name}”`} color={C.accent} onPress={() => { onChange([...value, onCreate(name)]); setQ(''); }} />
        ) : null}
        {!filtered.length && !name ? <Text className="text-ink-muted py-4">No labels yet — type a name to create one.</Text> : null}
      </ScrollView>
    </Sheet>
  );
}

