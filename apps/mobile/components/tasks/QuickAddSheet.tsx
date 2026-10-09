import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CalendarDays, Flag, Hash, Tag, Inbox, ArrowUp, X, Repeat, FileText, Check, Mic, MicOff
} from 'lucide-react-native';
import type { Label, Project, TaskPriority } from '@clearmind/shared';
import { parseQuickAdd, formatDueDate, formatTime, describeRecurrence, priorityOf } from '@clearmind/shared/tasks';
import { Sheet } from '../ui/Sheet';
import { SchedulePicker, PriorityPicker, ProjectPicker, LabelPicker, type Schedule } from './pickers';
import { C, PRIORITY_COLOR, PRIORITY_SHORT, dueColor } from './theme';
import {
  createTask, resolveNames, createProject, createLabel, projectColor,
} from '../../services/taskActions';
import { T } from '../../lib/theme';

import { useVoiceInput } from './useVoiceInput';

export interface QuickAddDefaults {
  projectId?: string | null;
  /** Add into this section (kept only while the project stays the same). */
  sectionId?: string | null;
  dueDate?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  priority?: TaskPriority;
  /** Pre-filled text — used by tools that turn something into a task (rant, log, application, mind-map node…). */
  title?: string;
  description?: string;
}

type Picker = null | 'date' | 'priority' | 'project' | 'labels';

function Chip({ icon, text, color = C.muted, onPress, onRemove, label }: {
  icon: React.ReactNode; text: string; color?: string; onPress?: () => void; onRemove?: () => void; label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-lg border border-line px-2.5 py-1.5 mr-2 mb-2 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={label ?? text}
    >
      {icon}
      <Text style={{ color }} className="text-[13px] ml-1.5" numberOfLines={1}>{text}</Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} className="ml-1.5" accessibilityLabel={`Remove ${text}`}>
          <X size={12} color={C.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/**
 * Quick Add: one line of natural language ("Pay rent every month p1 #Home")
 * with live-parsed chips. Tapping a parsed chip un-parses that word. Stays open
 * after adding so several tasks can be entered in a row.
 */
export function QuickAddSheet({
  visible, defaults, projects, labels, onClose, prefs,
}: {
  visible: boolean;
  defaults: QuickAddDefaults;
  projects: Project[];
  labels: Label[];
  onClose: () => void;
  /** Settings → Quick Add / General (parsing, defaults, date interpretation). */
  prefs?: { quickAddParse?: boolean; smartDates?: boolean; nextWeek?: 'monday' | 'plus7'; weekend?: 'saturday' | 'sunday'; quickAddPriority?: TaskPriority; quickAddProjectId?: string | null };
}) {
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  const [ignore, setIgnore] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined);
  const [labelIds, setLabelIds] = useState<string[] | null>(null); // null = not hand-picked
  const [picker, setPicker] = useState<Picker>(null);
  const [added, setAdded] = useState<string | null>(null);
  const submitting = useRef(false);
  const input = useRef<TextInput>(null);
  // Voice: text before the mic was tapped + the live transcript.
  const voiceBase = useRef('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voice = useVoiceInput(
    (t) => setText(voiceBase.current ? `${voiceBase.current} ${t}` : t),
    setVoiceError,
  );
  const toggleVoice = () => {
    setVoiceError(null);
    if (voice.state === 'listening') { voice.stop(); return; }
    voiceBase.current = text.trim();
    void voice.start();
  };

  // Reset when (re)opened.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setText(defaults.title ?? ''); setDescription(defaults.description ?? ''); setShowDesc(!!defaults.description); setIgnore([]); setSchedule(null);
      setPriority(null); setProjectId(undefined); setLabelIds(null); setAdded(null);
    }
  }

  const projectRefs = useMemo(() => projects.filter((p) => !p.archived).map((p) => ({ id: p.id, title: p.title })), [projects]);
  const parseOn = prefs?.quickAddParse !== false;
  const parsed = useMemo(() => {
    if (!parseOn) return { title: text.trim(), labels: [], reminders: [], tokens: [] } as ReturnType<typeof parseQuickAdd>;
    return parseQuickAdd(text, { projects: projectRefs, labels, ignore, smartDates: prefs?.smartDates !== false, nextWeek: prefs?.nextWeek, weekend: prefs?.weekend });
  }, [text, projectRefs, labels, ignore, parseOn, prefs?.smartDates, prefs?.nextWeek, prefs?.weekend]);
  const defaultProjectId = defaults.projectId !== undefined ? defaults.projectId : prefs?.quickAddProjectId && projects.some((p) => p.id === prefs.quickAddProjectId && !p.archived) ? prefs.quickAddProjectId : null;
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  // Effective values: explicit picks > parsed text > screen defaults.
  const eff = {
    dueDate: schedule ? schedule.dueDate ?? null : parsed.dueDate ?? defaults.dueDate ?? null,
    dueTime: schedule ? schedule.dueTime ?? null : parsed.dueTime ?? null,
    recurrence: schedule ? schedule.recurrence ?? null : parsed.recurrence ?? null,
    priority: priority ?? parsed.priority ?? defaults.priority ?? prefs?.quickAddPriority ?? 'None',
    projectId: projectId !== undefined ? projectId : parsed.projectId ?? (parsed.projectName ? undefined : defaultProjectId ?? null),
  };
  const newProjectName = projectId === undefined && !parsed.projectId ? parsed.projectName : undefined;
  const effLabelIds = labelIds ?? [...new Set([...(defaults.labelIds ?? []), ...parsed.labels.filter((l) => l.id).map((l) => l.id!)])];
  const newLabelNames = labelIds ? [] : parsed.labels.filter((l) => !l.id).map((l) => l.name);

  const canSubmit = parsed.title.length > 0;

  const submit = async () => {
    if (!canSubmit || submitting.current) return;
    submitting.current = true; // guards double-taps → no duplicate tasks
    try {
      const resolved = resolveNames(newProjectName, eff.projectId ?? undefined, [
        ...effLabelIds.map((id) => ({ id, name: '' })),
        ...newLabelNames.map((name) => ({ name })),
      ]);
      await createTask({
        title: parsed.title,
        description: description.trim() || undefined,
        dueDate: eff.dueDate,
        dueTime: eff.dueTime,
        recurrence: eff.recurrence,
        priority: eff.priority,
        projectId: resolved.projectId,
        parentId: defaults.parentId ?? null,
        sectionId: defaults.sectionId && resolved.projectId === defaults.projectId ? defaults.sectionId : null,
        labelIds: resolved.labelIds,
        duration: parsed.duration ?? null,
        reminders: parsed.reminders.length && eff.dueDate
          ? parsed.reminders.map((r, i) => (r.minutesBefore != null ? { id: `q${i}`, type: 'relative' as const, minutesBefore: r.minutesBefore } : { id: `q${i}`, type: 'absolute' as const, at: `${eff.dueDate}T${r.time}` }))
          : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const where = resolved.projectId ? projectById.get(resolved.projectId)?.title ?? newProjectName ?? 'project' : 'Inbox';
      setAdded(`Added “${parsed.title}” to ${defaults.parentId ? 'subtasks' : where}`);
      setText(defaults.title ?? ''); setDescription(defaults.description ?? ''); setShowDesc(!!defaults.description); setIgnore([]); setSchedule(null);
      setPriority(null); setProjectId(undefined); setLabelIds(null);
      input.current?.focus();
    } finally {
      submitting.current = false;
    }
  };

  const tokenText = (type: string) => parsed.tokens.find((t) => t.type === type)?.text;
  const unparse = (type: string) => {
    const tt = parsed.tokens.filter((t) => t.type === type).map((t) => t.text.toLowerCase());
    if (tt.length) setIgnore((x) => [...x, ...tt]);
  };

  const project = eff.projectId ? projectById.get(eff.projectId) : null;
  const dateText = eff.dueDate
    ? `${formatDueDate(eff.dueDate)}${eff.dueTime ? ` ${formatTime(eff.dueTime)}` : ''}`
    : 'Date';

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="flex-row items-center">
        <View className="flex-1">
        <TextInput
          ref={input}
          value={text}
          onChangeText={(v) => { setText(v); if (added) setAdded(null); }}
          placeholder={defaults.parentId ? 'Subtask name' : 'e.g. Call Sam tomorrow 4pm p1 #Work'}
          placeholderTextColor={T.faint}
          className="text-ink text-[17px] py-2"
          autoFocus
          multiline={false}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={submit}
          accessibilityLabel="Task name"
        />
        </View>
        {voice.state !== 'unavailable' ? (
          <Pressable
            onPress={toggleVoice}
            hitSlop={8}
            className={`ml-2 w-10 h-10 rounded-full items-center justify-center ${voice.state === 'listening' ? 'bg-red-500' : 'bg-midnight-lighter'} active:opacity-80`}
            accessibilityRole="button"
            accessibilityLabel={voice.state === 'listening' ? 'Stop voice input' : 'Add by voice'}
            accessibilityState={{ selected: voice.state === 'listening' }}
          >
            {voice.state === 'listening' ? <MicOff size={18} color="#fff" /> : <Mic size={18} color={C.accent} />}
          </Pressable>
        ) : null}
      </View>
      {voice.state === 'listening' ? (
        <Text className="text-xs mb-1" style={{ color: C.danger }} accessibilityLiveRegion="polite">Listening… try “remind me to call Sam tomorrow at 5pm”</Text>
      ) : voiceError ? (
        <Text className="text-xs mb-1" style={{ color: C.danger }} accessibilityLiveRegion="polite">{voiceError}</Text>
      ) : null}
      {showDesc ? (
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description"
          placeholderTextColor={T.faint}
          className="text-ink-muted text-[15px] pb-2"
          multiline
          style={{ maxHeight: 120 }}
          accessibilityLabel="Description"
        />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" className="mt-1">
        <View className="flex-row flex-wrap">
          <Chip
            icon={eff.recurrence ? <Repeat size={14} color={eff.dueDate ? dueColor({ dueDate: eff.dueDate }) : C.muted} /> : <CalendarDays size={14} color={eff.dueDate ? dueColor({ dueDate: eff.dueDate }) : C.muted} />}
            text={eff.recurrence ? `${dateText} · ${describeRecurrence(eff.recurrence)}` : dateText}
            color={eff.dueDate ? dueColor({ dueDate: eff.dueDate }) : C.muted}
            onPress={() => setPicker('date')}
            onRemove={eff.dueDate ? () => { unparse('date'); unparse('time'); unparse('recurrence'); setSchedule({ dueDate: null, dueTime: null, recurrence: null }); } : undefined}
            label={`Due date: ${dateText}`}
          />
          <Chip
            icon={<Flag size={14} color={PRIORITY_COLOR[eff.priority]} fill={eff.priority === 'None' ? 'transparent' : PRIORITY_COLOR[eff.priority]} />}
            text={eff.priority === 'None' ? 'Priority' : PRIORITY_SHORT[eff.priority]}
            color={eff.priority === 'None' ? C.muted : PRIORITY_COLOR[eff.priority]}
            onPress={() => setPicker('priority')}
            label={`Priority ${PRIORITY_SHORT[priorityOf({ priority: eff.priority })]}`}
          />
          {!defaults.parentId ? (
            <Chip
              icon={project ? <Hash size={14} color={projectColor(project)} /> : newProjectName ? <Hash size={14} color={C.accent} /> : <Inbox size={14} color={C.muted} />}
              text={project?.title ?? (newProjectName ? `${newProjectName} (new)` : 'Inbox')}
              color={newProjectName ? C.accent : C.ink}
              onPress={() => setPicker('project')}
              onRemove={tokenText('project') ? () => unparse('project') : undefined}
              label="Project"
            />
          ) : null}
          <Chip
            icon={<Tag size={14} color={C.muted} />}
            text={
              effLabelIds.length + newLabelNames.length
                ? [...effLabelIds.map((id) => labelById.get(id)?.name ?? ''), ...newLabelNames.map((n) => `${n} (new)`)].filter(Boolean).join(', ')
                : 'Labels'
            }
            onPress={() => setPicker('labels')}
            onRemove={tokenText('label') ? () => unparse('label') : undefined}
            label="Labels"
          />
          {!showDesc ? (
            <Chip icon={<FileText size={14} color={C.muted} />} text="Description" onPress={() => setShowDesc(true)} />
          ) : null}
        </View>
      </ScrollView>

      {parsed.tokens.length ? (
        <Text className="text-ink-muted text-[11px] mb-1">
          Recognised: {parsed.tokens.map((t) => `“${t.text}”`).join(' ')} — tap ✕ on a chip to keep it as text
        </Text>
      ) : null}

      <View className="flex-row items-center justify-between border-t border-line pt-3 mt-1">
        <View className="flex-row items-center flex-1 mr-3">
          {added ? (
            <>
              <Check size={14} color={C.success} />
              <Text className="text-emerald-400 text-xs ml-1 flex-1" numberOfLines={1}>{added}</Text>
            </>
          ) : (
            <Text className="text-ink-muted text-xs" numberOfLines={1}>Try “every weekday 9am”, “p1”, “#Project”, “@label”</Text>
          )}
        </View>
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          className={`w-10 h-10 rounded-full items-center justify-center ${canSubmit ? 'bg-accent active:bg-accent-hover' : 'bg-midnight-lighter'}`}
          accessibilityRole="button"
          accessibilityLabel="Add task"
          accessibilityState={{ disabled: !canSubmit }}
        >
          <ArrowUp size={20} color={canSubmit ? '#fff' : C.faint} />
        </Pressable>
      </View>

      {/* Nested so they stack above this sheet on iOS. */}
      <SchedulePicker
        visible={picker === 'date'}
        value={{ dueDate: eff.dueDate, dueTime: eff.dueTime, recurrence: eff.recurrence }}
        onClose={() => setPicker(null)}
        onChange={(s) => { unparse('date'); unparse('time'); unparse('recurrence'); setSchedule(s); }}
      />
      <PriorityPicker visible={picker === 'priority'} value={eff.priority} onClose={() => setPicker(null)} onChange={(p) => { unparse('priority'); setPriority(p); }} />
      <ProjectPicker
        visible={picker === 'project'}
        value={eff.projectId}
        projects={projects}
        onClose={() => setPicker(null)}
        onChange={(id) => { unparse('project'); setProjectId(id); }}
        onCreate={(name) => createProject({ title: name }).id}
      />
      <LabelPicker
        visible={picker === 'labels'}
        value={effLabelIds}
        labels={labels}
        onClose={() => setPicker(null)}
        onChange={setLabelIds}
        onCreate={(name) => createLabel({ name }).id}
      />
    </Sheet>
  );
}
