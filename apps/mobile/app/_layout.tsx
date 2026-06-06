import '../global.css';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { isFirebaseConfigured } from '../lib/firebase';
import { configureGoogleSignin } from '../services/firebaseService';

export default function RootLayout() {
  useEffect(() => {
    if (isFirebaseConfigured()) {
      try {
        configureGoogleSignin();
      } catch {
        // Google Play Services / native module not available — handled at sign-in.
      }
    }
  }, []);

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
