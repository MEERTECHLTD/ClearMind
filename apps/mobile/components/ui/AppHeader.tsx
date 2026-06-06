import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';

/** Per-screen header (tabs run headerShown:false). Title + optional back + right slot. */
export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-hairline bg-midnight">
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} className="mr-2 -ml-1 p-1 active:opacity-60">
          <ChevronLeft size={26} color="#e2e8f0" />
        </Pressable>
      ) : null}
      <View className="flex-1">
        <Text className="text-ink text-2xl font-extrabold" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text className="text-ink-muted text-xs mt-0.5">{subtitle}</Text> : null}
      </View>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
}
