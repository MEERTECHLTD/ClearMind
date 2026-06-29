import React from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';

export function Input({
  label,
  className = '',
  ...props
}: TextInputProps & { label?: string; className?: string }) {
  return (
    <View className={className}>
      {label ? <Text className="text-ink-muted text-xs mb-1.5 ml-1">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#6b7280"
        className="bg-midnight-light text-ink rounded-2xl px-4 py-3.5 text-base border border-hairline"
        {...props}
      />
    </View>
  );
}
