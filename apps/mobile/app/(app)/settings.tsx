import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { RefreshCw, LogOut, Activity, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth';
import { syncAllStores } from '../../services/syncService';
import { Screen, AppHeader, Card, Button, confirmDialog, useToast } from '../../components/ui';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  const name = profile?.nickname || user?.displayName || user?.email?.split('@')[0] || 'You';
  const email = user?.email ?? '(guest)';
  const provider = user?.providerData?.[0]?.providerId ?? (user?.isAnonymous ? 'anonymous' : '—');
  const initial = (name?.[0] ?? '?').toUpperCase();
  const version = (Constants.expoConfig?.version as string) ?? '';

  const onSync = async () => {
    setSyncing(true);
    try {
      const r = await syncAllStores();
      toast.show(r.success ? `Synced ${r.totalItemsSynced} item(s)` : `Synced with ${r.failedStores.length} error(s)`, r.success ? 'success' : 'error');
    } catch (e: any) {
      toast.show(e?.message ?? 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const onSignOut = async () => {
    if (await confirmDialog({ title: 'Sign out', message: 'Sign out of ClearMind?', confirmText: 'Sign out', destructive: true })) {
      await signOut();
      router.replace('/(auth)/welcome');
    }
  };

  return (
    <Screen scroll>
      <AppHeader title="Settings" onBack={() => router.back()} />
      <View className="pt-4">
        <Card className="flex-row items-center">
          <View className="w-14 h-14 rounded-full bg-accent items-center justify-center mr-4">
            <Text className="text-white text-xl font-extrabold">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-ink text-lg font-bold">{name}</Text>
            <Text className="text-ink-muted text-sm" numberOfLines={1}>{email}</Text>
            <Text className="text-ink-muted text-xs mt-0.5">via {provider}</Text>
          </View>
        </Card>

        <Text className="text-ink-muted text-xs font-semibold mt-6 mb-2 ml-1">DATA</Text>
        <Card>
          <Text className="text-ink-muted text-sm mb-3">
            Your data lives on this device and syncs to your ClearMind cloud account ({email}) — the same project as the web app.
          </Text>
          <Button title={syncing ? 'Syncing…' : 'Sync now'} onPress={onSync} loading={syncing} variant="secondary" icon={<RefreshCw size={18} color="#e2e8f0" />} />
        </Card>

        <Text className="text-ink-muted text-xs font-semibold mt-6 mb-2 ml-1">ADVANCED</Text>
        <Card className="p-0 overflow-hidden">
          <Pressable onPress={() => router.push('/(app)/diagnostics')} className="flex-row items-center px-4 py-3.5 active:bg-midnight-lighter">
            <Activity size={20} color="#3B82F6" />
            <Text className="text-ink text-base font-medium flex-1 ml-3">Diagnostics &amp; feature flags</Text>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>
        </Card>

        <Text className="text-ink-muted text-xs font-semibold mt-6 mb-2 ml-1">ACCOUNT</Text>
        <Card>
          <Button title="Sign out" onPress={onSignOut} variant="danger" icon={<LogOut size={18} color="#f87171" />} />
        </Card>

        {version ? <Text className="text-ink-muted text-center text-xs mt-8">ClearMind v{version}</Text> : null}
      </View>
    </Screen>
  );
}
