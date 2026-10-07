import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff, ChevronLeft, CircleAlert } from 'lucide-react-native';
import { Screen, Fab, Spinner, Button } from '../ui';
import { useTaskUI } from './TaskUIProvider';
import type { QuickAddDefaults } from './QuickAddSheet';
import { C } from './theme';

/** Thin banner while offline — data still works locally and syncs later. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View className="flex-row items-center justify-center bg-midnight-lighter py-1.5" accessibilityLiveRegion="polite">
      <WifiOff size={13} color={C.muted} />
      <Text className="text-ink-muted text-xs ml-2">Offline — changes are saved on this device and will sync</Text>
    </View>
  );
}

/** Go back, or to Browse when there's no history (deep link / notification). */
export function useBack() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/(app)/browse'));
}

/**
 * Standard task screen: large title header, offline banner, loading / error
 * states, and the Quick Add button wired with this screen's defaults.
 */
export function TaskScreen({
  title, subtitle, titleColor, right, back = false, addDefaults, children, fab = true,
}: {
  title: string;
  subtitle?: string;
  titleColor?: string;
  right?: React.ReactNode;
  back?: boolean;
  addDefaults?: QuickAddDefaults;
  children: React.ReactNode;
  fab?: boolean;
}) {
  const ui = useTaskUI();
  const goBack = useBack();
  return (
    <Screen padded={false}>
      <View className="flex-row items-center px-4 pt-2 pb-2 bg-midnight">
        {back ? (
          <Pressable onPress={goBack} hitSlop={12} className="mr-2 -ml-1 p-1 active:opacity-60" accessibilityLabel="Back" accessibilityRole="button">
            <ChevronLeft size={26} color={C.ink} />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-[26px] font-extrabold" style={{ color: titleColor ?? C.ink }} numberOfLines={1} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text className="text-ink-muted text-[13px] mt-0.5" numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View className="flex-row items-center">{right}</View> : null}
      </View>
      <OfflineBanner />
      {ui.loading ? (
        <Spinner label="Loading tasks…" />
      ) : ui.error ? (
        <View className="flex-1 items-center justify-center px-10">
          <CircleAlert size={36} color={C.danger} />
          <Text className="text-ink text-base font-semibold mt-3 text-center">Couldn’t load your tasks</Text>
          <Text className="text-ink-muted text-sm mt-1 text-center">{ui.error}</Text>
          <View className="mt-5"><Button title="Try again" onPress={() => void ui.refresh()} full={false} /></View>
        </View>
      ) : (
        <View className="flex-1">{children}</View>
      )}
      {fab && !ui.loading ? <Fab onPress={() => ui.openQuickAdd(addDefaults)} /> : null}
    </Screen>
  );
}

export function IconButton({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="p-2 rounded-full active:bg-midnight-lighter" accessibilityLabel={label} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

export function EmptyTasks({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <View className="items-center justify-center px-10 py-16">
      <View className="w-20 h-20 rounded-full bg-midnight-light items-center justify-center mb-4">{icon}</View>
      <Text className="text-ink text-lg font-semibold text-center">{title}</Text>
      {subtitle ? <Text className="text-ink-muted text-sm text-center mt-2">{subtitle}</Text> : null}
    </View>
  );
}
