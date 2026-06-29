import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, RefreshCw, Trash2, Activity } from 'lucide-react-native';
import { Screen, AppHeader, Card, useToast } from '../../components/ui';
import { useFlags, FLAG_LABELS, type FlagKey } from '../../lib/flags';
import { useLogs, clearLogs, uptimeMs, appStartMs } from '../../lib/logger';
import { sendTestNotification, getPermissionStatus } from '../../services/notifications';
import { syncAllStores } from '../../services/syncService';
import { dbService, STORES } from '../../services/db';

/**
 * On-device validation harness: crash log, startup trace, storage stats, feature
 * flags (staged activation), and one-tap tests for the risky native surfaces
 * (notifications, sync). This is how runtime features are validated on the phone
 * without halting development of the rest.
 */
export default function DiagnosticsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { flags, setFlag } = useFlags();
  const logs = useLogs();
  const [counts, setCounts] = useState<{ store: string; n: number }[]>([]);
  const [perm, setPerm] = useState<string>('…');
  const [busy, setBusy] = useState<string | null>(null);

  const refreshStats = async () => {
    const rows = await Promise.all(
      Object.values(STORES).map(async (s) => ({ store: s, n: (await dbService.getAllIncludingDeleted(s)).length }))
    );
    setCounts(rows.filter((r) => r.n > 0));
    setPerm(await getPermissionStatus());
  };
  useEffect(() => { refreshStats(); }, []);

  const testNotif = async () => {
    setBusy('notif');
    const ok = await sendTestNotification();
    toast.show(ok ? 'Test notification scheduled (2s)' : 'Notifications not permitted', ok ? 'success' : 'error');
    setPerm(await getPermissionStatus());
    setBusy(null);
  };

  const forceSync = async () => {
    setBusy('sync');
    try {
      const r = await syncAllStores();
      toast.show(r.success ? `Synced ${r.totalItemsSynced} item(s)` : `Sync: ${r.failedStores.length} failed`, r.success ? 'success' : 'error');
    } catch (e: any) {
      toast.show(e?.message ?? 'Sync failed', 'error');
    }
    await refreshStats();
    setBusy(null);
  };

  const bootAt = new Date(appStartMs).toLocaleTimeString();

  return (
    <Screen scroll>
      <AppHeader title="Diagnostics" onBack={() => router.back()} />
      <View className="pt-4">
        {/* Runtime */}
        <Text className="text-ink-muted text-xs font-semibold mb-2 ml-1">RUNTIME</Text>
        <Card>
          <Row label="JS uptime" value={`${Math.round(uptimeMs() / 1000)}s`} />
          <Row label="Session start" value={bootAt} />
          <Row label="Notification permission" value={perm} />
          <Row label="Logged events" value={String(logs.length)} />
        </Card>

        {/* Tests */}
        <Text className="text-ink-muted text-xs font-semibold mt-6 mb-2 ml-1">VALIDATION TESTS</Text>
        <Card>
          <TestBtn icon={<Bell size={18} color="#3B82F6" />} label="Send test notification" onPress={testNotif} busy={busy === 'notif'} />
          <View className="h-px bg-hairline my-1" />
          <TestBtn icon={<RefreshCw size={18} color="#3B82F6" />} label="Force full cloud sync" onPress={forceSync} busy={busy === 'sync'} />
        </Card>

        {/* Feature flags */}
        <Text className="text-ink-muted text-xs font-semibold mt-6 mb-2 ml-1">FEATURE FLAGS (STAGED ACTIVATION)</Text>
        <Card>
          {(Object.keys(FLAG_LABELS) as FlagKey[]).map((k, i) => (
            <View key={k} className={`flex-row items-center justify-between py-2.5 ${i > 0 ? 'border-t border-hairline' : ''}`}>
              <Text className="text-ink text-sm flex-1 mr-3">{FLAG_LABELS[k]}</Text>
              <Switch
                value={flags[k]}
                onValueChange={(v) => setFlag(k, v)}
                trackColor={{ true: '#3B82F6', false: '#1f2937' }}
                thumbColor="#e2e8f0"
              />
            </View>
          ))}
        </Card>

        {/* Storage */}
        <Text className="text-ink-muted text-xs font-semibold mt-6 mb-2 ml-1">LOCAL STORAGE (incl. tombstones)</Text>
        <Card>
          {counts.length === 0 ? (
            <Text className="text-ink-muted text-sm">No records yet.</Text>
          ) : (
            counts.map((c) => <Row key={c.store} label={c.store} value={String(c.n)} />)
          )}
        </Card>

        {/* Crash / event log */}
        <View className="flex-row items-center justify-between mt-6 mb-2">
          <Text className="text-ink-muted text-xs font-semibold ml-1">EVENT &amp; CRASH LOG</Text>
          <Pressable onPress={() => { clearLogs(); toast.show('Log cleared', 'info'); }} className="flex-row items-center active:opacity-60">
            <Trash2 size={14} color="#9ca3af" />
            <Text className="text-ink-muted text-xs ml-1">Clear</Text>
          </Pressable>
        </View>
        <Card>
          {logs.length === 0 ? (
            <View className="flex-row items-center">
              <Activity size={16} color="#10b981" />
              <Text className="text-ink-muted text-sm ml-2">No errors logged. 🎉</Text>
            </View>
          ) : (
            logs.slice(0, 40).map((l, i) => (
              <View key={i} className={`py-2 ${i > 0 ? 'border-t border-hairline' : ''}`}>
                <Text className={`text-xs font-semibold ${l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400' : 'text-ink-muted'}`}>
                  {l.level.toUpperCase()} · {new Date(l.ts).toLocaleTimeString()}
                </Text>
                <Text className="text-ink text-xs mt-0.5">{l.msg}</Text>
              </View>
            ))
          )}
        </Card>
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-ink-muted text-sm">{label}</Text>
      <Text className="text-ink text-sm font-medium">{value}</Text>
    </View>
  );
}

function TestBtn({ icon, label, onPress, busy }: { icon: React.ReactNode; label: string; onPress: () => void; busy: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} className="flex-row items-center py-2.5 active:opacity-70">
      {icon}
      <Text className="text-ink text-sm flex-1 ml-3">{label}</Text>
      <Text className="text-accent text-xs font-semibold">{busy ? 'Running…' : 'Run'}</Text>
    </Pressable>
  );
}
