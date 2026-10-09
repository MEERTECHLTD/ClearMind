import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { ChevronLeft, WifiOff } from 'lucide-react-native';
import { T } from '../../lib/theme';

/** Go back, or to Browse when there's no history (deep link / notification / widget). */
export function useBack() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/(app)/browse'));
}

/**
 * The one page header every screen uses (task views, tools, settings):
 * optional back chevron, large title, subtitle, right-hand actions.
 */
export function PageHeader({
  title, subtitle, titleColor, right, onBack,
}: {
  title: string;
  subtitle?: string;
  titleColor?: string;
  right?: React.ReactNode;
  /** Back handler; omit for a top-level (tab) screen. */
  onBack?: (() => void) | null;
}) {
  return (
    <View className="flex-row items-center px-4 pt-2 pb-2 bg-midnight">
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} className="mr-2 -ml-1 p-1 active:opacity-60" accessibilityLabel="Back" accessibilityRole="button">
          <ChevronLeft size={26} color={T.ink} />
        </Pressable>
      ) : null}
      <View className="flex-1">
        <Text className="text-[26px] font-extrabold" style={{ color: titleColor ?? T.ink }} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text className="text-ink-muted text-[13px] mt-0.5" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
}

/** Thin banner while offline — data still works locally and syncs later. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View className="flex-row items-center justify-center bg-midnight-lighter py-1.5" accessibilityLiveRegion="polite">
      <WifiOff size={13} color={T.muted} />
      <Text className="text-ink-muted text-xs ml-2">Offline — changes are saved on this device and will sync</Text>
    </View>
  );
}

/** Round icon-only header/toolbar action. */
export function IconButton({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="p-2 rounded-full active:bg-midnight-lighter" accessibilityLabel={label} accessibilityRole="button">
      {children}
    </Pressable>
  );
}
