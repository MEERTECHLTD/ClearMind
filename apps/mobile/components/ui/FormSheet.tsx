import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { T } from '../../lib/theme';

/**
 * Create/edit form in a bottom sheet — the one pattern for every form in the
 * app: title, scrollable fields, then Cancel / primary action. Backdrop tap and
 * Android back cancel; the keyboard lifts the sheet; optional delete in the header.
 */
export function FormSheet({
  visible,
  onClose,
  title,
  submitLabel = 'Save',
  onSubmit,
  submitDisabled = false,
  loading = false,
  onDelete,
  deleteLabel = 'Delete',
  fill = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  submitLabel?: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  loading?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  /** Use the full sheet height (long forms). */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      fill={fill}
      right={onDelete ? (
        <Pressable onPress={onDelete} hitSlop={10} className="p-1.5 rounded-full active:bg-midnight-lighter" accessibilityLabel={deleteLabel} accessibilityRole="button">
          <Trash2 size={20} color={T.danger} />
        </Pressable>
      ) : undefined}
    >
      <ScrollView
        style={fill ? { flex: 1 } : { flexGrow: 0 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 12 }}
      >
        {children}
      </ScrollView>
      <View className="flex-row gap-3 pt-2">
        <View className="flex-1"><Button title="Cancel" variant="secondary" onPress={onClose} /></View>
        <View className="flex-1"><Button title={submitLabel} onPress={onSubmit} disabled={submitDisabled} loading={loading} /></View>
      </View>
    </Sheet>
  );
}
