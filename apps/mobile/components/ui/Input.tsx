import React from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { T } from '../../lib/theme';

export function Input({
  label,
  className = '',
  ...props
}: TextInputProps & { label?: string; className?: string }) {
  return (
    <View className={className}>
      {label ? <Text className="text-ink-muted text-xs mb-1.5 ml-1">{label}</Text> : null}
      <TextInput
        placeholderTextColor={T.faint}
        className="bg-midnight-light text-ink rounded-2xl px-4 py-3.5 text-base border border-line"
        {...props}
      />
    </View>
  );
}
