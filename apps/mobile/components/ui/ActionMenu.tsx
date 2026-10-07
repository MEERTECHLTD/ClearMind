import React from 'react';
import { Pressable, Text, View, ScrollView } from 'react-native';
import { Sheet } from './Sheet';

export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  hint?: string;
}

/** Long-press / overflow menu presented as a bottom sheet. */
export function ActionMenu({
  visible, onClose, title, actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: MenuAction[];
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} padded={false}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => { onClose(); a.onPress(); }}
            className="flex-row items-center px-5 py-3.5 active:bg-midnight-lighter"
            style={{ minHeight: 52 }}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            {a.icon ? <View className="w-7">{a.icon}</View> : null}
            <Text className={`flex-1 text-base ${a.destructive ? 'text-red-400' : 'text-ink'}`}>{a.label}</Text>
            {a.hint ? <Text className="text-ink-muted text-sm">{a.hint}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}
