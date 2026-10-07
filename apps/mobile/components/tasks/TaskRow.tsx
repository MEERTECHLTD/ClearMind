import React, { memo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import * as Haptics from 'expo-haptics';
import { Check, CalendarDays, Repeat, Tag, ListTree, Hash, Inbox } from 'lucide-react-native';
import type { Label, Project } from '@clearmind/shared';
import { formatDueDate, formatTime, priorityOf } from '@clearmind/shared/tasks';
import type { MTask } from '../../services/taskActions';
import { projectColor } from '../../services/taskActions';
import { PRIORITY_COLOR, PRIORITY_LABEL, C, dueColor } from './theme';

export interface TaskRowProps {
  task: MTask;
  project?: Project | null;
  labels?: Label[];
  subtaskCount?: { done: number; total: number };
  /** Show the project chip (on for cross-project views like Today/Search). */
  showProject?: boolean;
  /** Hide the date chip (e.g. inside a day group in Upcoming). */
  hideDate?: boolean;
  parentTitle?: string;
  onToggle: (t: MTask) => void;
  onOpen: (t: MTask) => void;
  onSchedule: (t: MTask) => void;
  onLongPress: (t: MTask) => void;
}

/** Round checkbox: priority-coloured ring, tinted fill, check on completion. */
export function TaskCheckbox({ task, checked, onPress, size = 22 }: { task: MTask; checked: boolean; onPress: () => void; size?: number }) {
  const color = PRIORITY_COLOR[priorityOf(task)];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={checked ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
      style={{
        width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color,
        backgroundColor: checked ? color : `${color}1F`, alignItems: 'center', justifyContent: 'center',
      }}
    >
      {checked ? <Check size={size - 8} color="#fff" strokeWidth={3} /> : null}
    </Pressable>
  );
}

function Meta({ icon, text, color = C.muted }: { icon?: React.ReactNode; text: string; color?: string }) {
  return (
    <View className="flex-row items-center mr-3 mt-1">
      {icon}
      <Text style={{ color }} className="text-xs ml-1" numberOfLines={1}>{text}</Text>
    </View>
  );
}

function TaskRowImpl(props: TaskRowProps) {
  const { task, project, labels, subtaskCount, showProject, hideDate, parentTitle } = props;
  const swipe = useRef<SwipeableMethods>(null);
  // Show the tick briefly before the row leaves the list.
  const [ticking, setTicking] = useState(false);
  const checked = task.completed || ticking;

  const toggle = () => {
    if (ticking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (task.completed) return props.onToggle(task);
    setTicking(true);
    setTimeout(() => {
      props.onToggle(task);
      setTicking(false);
    }, 220);
  };

  const hasDate = !!task.dueDate && !hideDate;
  const dueText = hasDate ? `${formatDueDate(task.dueDate)}${task.dueTime ? ` ${formatTime(task.dueTime)}` : ''}` : hideDate && task.dueTime ? formatTime(task.dueTime) : '';

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.6}
      leftThreshold={72}
      rightThreshold={72}
      overshootFriction={8}
      renderLeftActions={() => (
        <View className="flex-1 justify-center pl-6" style={{ backgroundColor: C.success }}>
          <Check size={24} color="#fff" />
        </View>
      )}
      renderRightActions={() => (
        <View className="flex-1 items-end justify-center pr-6" style={{ backgroundColor: '#7C3AED' }}>
          <CalendarDays size={24} color="#fff" />
        </View>
      )}
      onSwipeableWillOpen={(dir) => {
        swipe.current?.close();
        if (dir === 'right') toggle();
        else props.onSchedule(task);
      }}
    >
      <Pressable
        onPress={() => props.onOpen(task)}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          props.onLongPress(task);
        }}
        delayLongPress={350}
        className="flex-row px-4 py-3 bg-midnight active:bg-midnight-light border-b border-line"
        style={{ minHeight: 56 }}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}${dueText ? `, due ${dueText}` : ''}, ${PRIORITY_LABEL[priorityOf(task)]}`}
        accessibilityHint="Opens task details. Swipe right to complete, left to reschedule."
      >
        <View className="pt-0.5 mr-3">
          <TaskCheckbox task={task} checked={checked} onPress={toggle} />
        </View>
        <View className="flex-1">
          {parentTitle ? (
            <Text className="text-ink-muted text-[11px] mb-0.5" numberOfLines={1}>↳ {parentTitle}</Text>
          ) : null}
          <Text
            className={`text-[15px] leading-5 ${checked ? 'text-ink-muted line-through' : 'text-ink'}`}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          {task.description ? (
            <Text className="text-ink-muted text-[13px] mt-0.5" numberOfLines={1}>{task.description}</Text>
          ) : null}
          {(dueText || task.recurrence || subtaskCount?.total || labels?.length || (showProject)) ? (
            <View className="flex-row flex-wrap items-center">
              {dueText ? (
                <Meta
                  icon={task.recurrence ? <Repeat size={12} color={dueColor(task)} /> : <CalendarDays size={12} color={dueColor(task)} />}
                  text={dueText}
                  color={dueColor(task)}
                />
              ) : task.recurrence ? <Meta icon={<Repeat size={12} color={C.muted} />} text="Repeats" /> : null}
              {subtaskCount?.total ? (
                <Meta icon={<ListTree size={12} color={C.muted} />} text={`${subtaskCount.done}/${subtaskCount.total}`} />
              ) : null}
              {labels?.map((l) => (
                <Meta key={l.id} icon={<Tag size={11} color={l.color} />} text={l.name} color={l.color} />
              ))}
              <View className="flex-1" />
              {showProject ? (
                project ? (
                  <Meta icon={<Hash size={11} color={projectColor(project)} />} text={project.title} />
                ) : (
                  <Meta icon={<Inbox size={11} color={C.muted} />} text="Inbox" />
                )
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export const TaskRow = memo(TaskRowImpl);
