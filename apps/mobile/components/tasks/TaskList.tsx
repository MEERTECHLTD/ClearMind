import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Plus, ChevronDown, ChevronRight, Ellipsis } from 'lucide-react-native';
import { isOverdue } from '@clearmind/shared/tasks';
import type { MTask } from '../../services/taskActions';
import { TaskRow } from './TaskRow';
import { useTaskUI } from './TaskUIProvider';
import type { QuickAddDefaults } from './QuickAddSheet';
import { C } from './theme';

export type ListItem =
  | { type: 'header'; key: string; title: string; subtitle?: string; color?: string; action?: { label: string; onPress: () => void }; collapsed?: boolean; onToggle?: () => void; onMenu?: () => void }
  | { type: 'task'; key: string; task: MTask }
  | { type: 'add'; key: string; defaults: QuickAddDefaults; label?: string }
  | { type: 'note'; key: string; text: string };

export const taskItems = (tasks: MTask[], prefix = ''): ListItem[] =>
  tasks.map((t) => ({ type: 'task', key: `${prefix}${t.id}`, task: t }));

/**
 * Virtualised task list (FlashList) with section headers and inline "Add task"
 * rows. Handles thousands of tasks; pull-to-refresh triggers a cloud sync.
 */
export function TaskList({
  items, showProject = false, hideDate = false, showParent = false, header, empty, bottomInset = 96,
}: {
  items: ListItem[];
  showProject?: boolean;
  hideDate?: boolean;
  showParent?: boolean;
  header?: React.ReactElement | null;
  empty?: React.ReactElement | null;
  bottomInset?: number;
}) {
  const ui = useTaskUI();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await ui.refresh(); } finally { setRefreshing(false); }
  }, [ui]);

  const onOpen = useCallback((t: MTask) => ui.openTask(t.id), [ui]);

  const renderItem = ({ item }: { item: ListItem }) => {
    switch (item.type) {
      case 'header':
        return (
          <Pressable
            onPress={item.onToggle}
            onLongPress={item.onMenu}
            disabled={!item.onToggle && !item.onMenu}
            className="flex-row items-end px-4 pt-5 pb-2 border-b border-line bg-midnight"
            accessibilityRole="header"
            accessibilityState={item.onToggle ? { expanded: !item.collapsed } : undefined}
          >
            {item.onToggle ? <View className="mr-1.5 mb-0.5">{item.collapsed ? <ChevronRight size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}</View> : null}
            <Text className="text-ink font-bold text-[15px] flex-1" style={item.color ? { color: item.color } : undefined}>
              {item.title}
              {item.subtitle ? <Text className="text-ink-muted font-normal text-[13px]">{`  ${item.subtitle}`}</Text> : null}
            </Text>
            {item.onMenu ? (
              <Pressable onPress={item.onMenu} hitSlop={10} className="ml-2" accessibilityLabel={`${item.title} options`}>
                <Ellipsis size={16} color={C.muted} />
              </Pressable>
            ) : null}
            {item.action ? (
              <Pressable onPress={item.action.onPress} hitSlop={10} accessibilityRole="button">
                <Text className="text-accent text-[13px] font-semibold">{item.action.label}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        );
      case 'add':
        return (
          <Pressable
            onPress={() => ui.openQuickAdd(item.defaults)}
            className="flex-row items-center px-4 py-3 active:opacity-60"
            style={{ minHeight: 48 }}
            accessibilityRole="button"
            accessibilityLabel={item.label ?? 'Add task'}
          >
            <Plus size={18} color={C.accent} />
            <Text className="text-ink-muted text-[15px] ml-3">{item.label ?? 'Add task'}</Text>
          </Pressable>
        );
      case 'note':
        return <Text className="text-ink-muted text-[13px] px-4 py-3">{item.text}</Text>;
      case 'task': {
        const t = item.task;
        const parent = showParent && t.parentId ? ui.taskMap.get(t.parentId) : undefined;
        return (
          <TaskRow
            task={t}
            project={t.projectId ? ui.projectMap.get(t.projectId) ?? null : null}
            labels={(t.labelIds ?? []).map((id) => ui.labelMap.get(id)!).filter(Boolean)}
            subtaskCount={ui.subtaskCounts.get(t.id)}
            showProject={showProject}
            hideDate={hideDate && !isOverdue(t)}
            parentTitle={parent?.title}
            onToggle={ui.toggle}
            onOpen={onOpen}
            onSchedule={ui.schedule}
            onLongPress={ui.menu}
            swipeRight={ui.prefs.swipeRight}
            swipeLeft={ui.prefs.swipeLeft}
            onSwipe={ui.swipe}
            compact={ui.prefs.density === 'compact'}
            commentCount={ui.commentCounts.get(t.id)}
          />
        );
      }
    }
  };

  return (
    <FlashList
      data={items}
      keyExtractor={(i) => i.key}
      getItemType={(i) => i.type}
      renderItem={renderItem}
      estimatedItemSize={64}
      extraData={ui}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
    />
  );
}
