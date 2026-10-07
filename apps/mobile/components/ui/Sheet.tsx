import React from 'react';
import { Modal, Pressable, View, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../lib/theme';

/**
 * Bottom sheet built on Modal: backdrop tap + Android back both close it, the
 * content lifts above the keyboard, and the bottom safe-area inset is padded.
 */
export function Sheet({
  visible,
  onClose,
  title,
  right,
  children,
  maxHeight = '88%',
  fill = false,
  padded = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: `${number}%`;
  /** Use the full max height (for long editors) instead of hugging content. */
  fill?: boolean;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: T.overlay }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View
          className="bg-midnight-light rounded-t-3xl border-t border-line"
          style={{ maxHeight, height: fill ? maxHeight : undefined, paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="items-center pt-2.5 pb-1">
            <View className="w-10 h-1 rounded-full bg-hairline" />
          </View>
          {title || right ? (
            <View className="flex-row items-center px-5 pt-1 pb-2">
              <Text className="text-ink text-lg font-bold flex-1" accessibilityRole="header">{title}</Text>
              {right}
            </View>
          ) : null}
          <View className={`${padded ? 'px-5' : ''} ${fill ? 'flex-1' : ''}`}>{children}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
