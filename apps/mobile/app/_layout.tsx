import '../global.css';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/ui';
import { AuthProvider } from '../hooks/useAuth';
import { installCrashHandler, loadLogs } from '../lib/logger';
import { loadFlags } from '../lib/flags';

// Boot-time, before any screen renders: capture global JS crashes and restore
// persisted flags + the crash log. installCrashHandler only sets a handler (safe
// at module load); loadFlags/loadLogs are fire-and-forget.
installCrashHandler();
loadFlags();
loadLogs();

// Root shell: global providers + ErrorBoundary. Routing/auth gating lives in the
// (auth) and (app) group layouts (each guards itself), and app/index.tsx is a
// thin redirect gate. Firebase init is guarded in lib/firebase + AuthProvider.
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#05050A' },
                }}
              />
            </ToastProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
