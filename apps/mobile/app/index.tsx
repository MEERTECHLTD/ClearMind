import { Redirect } from 'expo-router';
import { View, Text } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from '../components/ui';

// Thin gate: redirect to the app (signed in) or auth (signed out). Cloud config
// is embedded in this build, so ConfigMissing should never show — it's a safety net.
export default function Index() {
  const { user, checking, configured } = useAuth();
  if (!configured) return <ConfigMissing />;
  if (checking) return <Spinner label="Starting…" />;
  return <Redirect href={user ? '/(app)/dashboard' : '/(auth)/welcome'} />;
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
