import React from 'react';
import { View, Text } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { Screen, Fab, Spinner, Button, PageHeader, OfflineBanner, IconButton, useBack, EmptyState } from '../ui';
import { useTaskUI } from './TaskUIProvider';
import type { QuickAddDefaults } from './QuickAddSheet';
import { C } from './theme';

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
      <PageHeader title={title} subtitle={subtitle} titleColor={titleColor} right={right} onBack={back ? goBack : null} />
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

// Shared kit re-exports (task screens import these from here).
export { OfflineBanner, IconButton, useBack };

export function EmptyTasks({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return <EmptyState icon={icon} title={title} subtitle={subtitle} fill={false} />;
}
