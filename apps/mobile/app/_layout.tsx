import '../global.css';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/ui';
import { AuthProvider } from '../hooks/useAuth';
import { installCrashHandler, loadLogs } from '../lib/logger';
import { loadFlags } from '../lib/flags';
import { T, DARK, LIGHT, themeVars, useScheme, loadThemePref } from '../lib/theme';
import { loadClientId } from '../services/sync';

// Boot-time, before any screen renders: capture global JS crashes and restore
// persisted flags, crash log, theme preference and the device's sync client id.
installCrashHandler();
loadFlags();
loadLogs();
const themeReady = loadThemePref();
void loadClientId();

const VARS = { dark: themeVars(DARK), light: themeVars(LIGHT) };

// Root shell: global providers + ErrorBoundary. Routing/auth gating lives in the
// (auth) and (app) group layouts. The themed subtree is keyed on the colour
// scheme so every screen re-renders with the new palette (Light/Dark/System);
// auth state lives above the key and survives a theme switch.
export default function RootLayout() {
  const scheme = useScheme();
  const [ready, setReady] = useState(false);
  useEffect(() => { void themeReady.then(() => setReady(true)); }, []);
  useEffect(() => { void SystemUI.setBackgroundColorAsync(T.bg).catch(() => {}); }, [scheme]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: T.bg }} />;
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <View key={scheme} style={[{ flex: 1, backgroundColor: T.bg }, VARS[scheme]]}>
              <ToastProvider>
                <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }} />
              </ToastProvider>
            </View>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
