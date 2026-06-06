import React from 'react';
import { View, Text, Pressable } from 'react-native';

export interface Segment<T extends string = string> {
  label: string;
  value: T;
}

export function SegmentedControl<T extends string = string>({
  segments,
  value,
  onChange,
  className = '',
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <View className={`flex-row bg-midnight-light rounded-full p-1 border border-hairline ${className}`}>
      {segments.map((s) => {
        const sel = s.value === value;
        return (
          <Pressable
            key={s.value}
            onPress={() => onChange(s.value)}
            className={`flex-1 items-center py-2 rounded-full ${sel ? 'bg-accent' : ''} active:opacity-80`}
          >
            <Text className={`text-sm font-semibold ${sel ? 'text-white' : 'text-ink-muted'}`}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
