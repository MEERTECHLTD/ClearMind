import React from 'react';
import { View, Text, Pressable } from 'react-native';

/** Metric tile for Dashboard/Analytics. Tappable when onPress is given. */
export function StatCard({
  label,
  value,
  icon,
  onPress,
  className = '',
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  const Inner = (
    <>
      <View className="flex-row items-center justify-between">
        <Text className="text-ink-muted text-xs font-medium">{label}</Text>
        {icon}
      </View>
      <Text className="text-ink text-3xl font-extrabold mt-2">{value}</Text>
    </>
  );
  const cls = `rounded-2xl bg-midnight-light border border-hairline p-4 ${className}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${cls} active:opacity-80`}>
        {Inner}
      </Pressable>
    );
  }
  return <View className={cls}>{Inner}</View>;
}
