import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

/**
 * Per-screen header (tabs run headerShown:false). Title + back + right slot.
 * Screens using this header are opened from Browse, so a back button is shown by
 * default (falls back to Browse when there's no history); pass onBack={null} to hide.
 */
export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: (() => void) | null;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const back =
    onBack === null
      ? null
      : onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(app)/browse')));
  return (
    <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-line bg-midnight">
      {back ? (
        <Pressable onPress={back} hitSlop={12} className="mr-2 -ml-1 p-1 active:opacity-60" accessibilityLabel="Back" accessibilityRole="button">
          <ChevronLeft size={26} color="#e2e8f0" />
        </Pressable>
      ) : null}
      <View className="flex-1">
        <Text className="text-ink text-2xl font-extrabold" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text className="text-ink-muted text-xs mt-0.5">{subtitle}</Text> : null}
      </View>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
}
