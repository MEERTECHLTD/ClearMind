import '../global.css';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/ui';
import { AuthProvider } from '../hooks/useAuth';

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
