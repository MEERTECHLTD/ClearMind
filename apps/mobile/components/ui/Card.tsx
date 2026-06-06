import React from 'react';
import { View, Pressable } from 'react-native';

/** Themed surface. Pass onPress to make it tappable. */
export function Card({
  children,
  onPress,
  className = '',
}: {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  const cls = `rounded-2xl bg-midnight-light border border-hairline p-4 ${className}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${cls} active:opacity-80`}>
        {children}
      </Pressable>
    );
  }
  return <View className={cls}>{children}</View>;
}
