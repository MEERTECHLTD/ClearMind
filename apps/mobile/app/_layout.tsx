import '../global.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';

// Root layout: global providers required by the design language (gesture-handler
// for swipe rows, safe-area, bottom sheets). Dark is the default theme. The tab
// navigator + screens land in Phase 5/6 — this Stack hosts the Phase 2 placeholder.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#05050A' },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
