import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';

export function Spinner({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-midnight">
      <ActivityIndicator color="#3B82F6" />
      {label ? <Text className="text-ink-muted mt-3">{label}</Text> : null}
    </View>
  );
}
