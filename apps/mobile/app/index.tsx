import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HOME_VIEW_KEY } from '../hooks/usePreferences';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from '../components/ui';

// Thin gate: redirect to the app (signed in) or auth (signed out). Cloud config
// is embedded in this build, so ConfigMissing should never show — it's a safety net.
// Settings → General → Home view decides where the app opens (cached locally
// so the redirect is instant; the synced preference keeps it up to date).
const HOME_ROUTES: Record<string, Href> = {
  today: '/(app)/today', inbox: '/(app)/inbox', upcoming: '/(app)/upcoming', search: '/(app)/search', browse: '/(app)/browse', productivity: '/(app)/productivity',
};

export default function Index() {
  const { user, checking, configured } = useAuth();
  const [home, setHome] = useState<Href | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(HOME_VIEW_KEY)
      .then((v) => setHome(v?.startsWith('project:') ? (`/(app)/project/${v.slice(8)}` as Href) : HOME_ROUTES[v ?? 'today'] ?? HOME_ROUTES.today))
      .catch(() => setHome(HOME_ROUTES.today));
  }, []);
  if (!configured) return <ConfigMissing />;
  if (checking || !home) return <Spinner label="Starting…" />;
  return <Redirect href={user ? home : '/(auth)/welcome'} />;
}

function ConfigMissing() {
  return (
    <View className="flex-1 bg-midnight items-center justify-center px-8">
      <Text className="text-accent text-2xl font-extrabold">ClearMind</Text>
      <Text className="text-ink mt-3 text-center">Firebase isn’t configured in this build.</Text>
      <Text className="text-ink-muted mt-2 text-center text-xs">
        Rebuild with the EXPO_PUBLIC_FIREBASE_* values present at prebuild time.
      </Text>
    </View>
  );
}
