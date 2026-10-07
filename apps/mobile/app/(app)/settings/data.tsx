import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { RefreshCw, Download, CloudOff, Cloud, CloudAlert, DatabaseZap, Trash2, Clock3 } from 'lucide-react-native';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import { SettingsPage, Group, Row } from '../../../components/settings/ui';
import { confirmDialog, useToast } from '../../../components/ui';
import { dbService, getSyncableStores } from '../../../services/db';
import { syncNow, stopSync, startSync } from '../../../services/sync';
import { resetAllStores } from '../../../lib/collectionStore';
import { T } from '../../../lib/theme';

export default function DataSettings() {
  const router = useRouter();
  const toast = useToast();
  const s = useSyncStatus();
  const [busy, setBusy] = useState<null | 'sync' | 'export' | 'rebuild'>(null);
  const StateIcon = s.state === 'offline' ? CloudOff : s.state === 'error' ? CloudAlert : Cloud;
  const stateText = s.state === 'offline' ? 'Offline — changes are saved on this device' : s.state === 'error' ? `Problem: ${s.error ?? 'unknown'}` : s.state === 'syncing' ? 'Syncing…' : 'Up to date';

  return (
    <SettingsPage title="Data & privacy">
      <Group title="Sync" footer="ClearMind keeps a full copy on this device and syncs field-by-field in real time. Changes made offline are queued and sent automatically when you reconnect.">
        <Row icon={<StateIcon size={20} color={s.state === 'error' ? T.danger : T.accent} />} label="Status" detail={stateText} />
        <Row icon={<DatabaseZap size={20} color={T.accent} />} label="Waiting to upload" value={String(s.pending)} />
        <Row icon={<Clock3 size={20} color={T.muted} />} label="Last synced" value={s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString() : '—'} />
        <Row icon={<RefreshCw size={20} color={T.accent} />} label={busy === 'sync' ? 'Syncing…' : 'Sync now'} detail="Full check of every item in both directions" onPress={busy ? undefined : async () => {
          setBusy('sync');
          try { const r = await syncNow(); toast.show(r.failed.length ? `Synced with ${r.failed.length} problem(s)` : `Checked ${r.pulled} items`, r.failed.length ? 'error' : 'success'); }
          catch (e: any) { toast.show(e?.message ?? 'Sync failed', 'error'); }
          finally { setBusy(null); }
        }} />
      </Group>

      <Group title="Your data" footer="The export includes every collection (tasks, projects, notes, habits, …) as JSON.">
        <Row icon={<Download size={20} color={T.accent} />} label={busy === 'export' ? 'Preparing…' : 'Export my data'} onPress={busy ? undefined : async () => {
          setBusy('export');
          try {
            const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), format: 'clearmind-export-v1' };
            for (const st of getSyncableStores()) out[st] = await dbService.getAll(st);
            const path = `${FileSystem.cacheDirectory}clearmind-export-${new Date().toISOString().slice(0, 10)}.json`;
            await FileSystem.writeAsStringAsync(path, JSON.stringify(out, null, 2));
            if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Export ClearMind data' });
            else toast.show('Saved to ' + path, 'info');
          } catch (e: any) { toast.show(e?.message ?? 'Export failed', 'error'); }
          finally { setBusy(null); }
        }} />
        <Row icon={<DatabaseZap size={20} color={T.accent} />} label={busy === 'rebuild' ? 'Rebuilding…' : 'Rebuild local data'} detail="Re-download everything from the cloud (keeps unsent changes)" onPress={busy ? undefined : async () => {
          if (s.pending && !(await confirmDialog({ title: 'Unsent changes', message: `${s.pending} change(s) haven’t uploaded yet. Rebuild anyway? They stay queued.`, confirmText: 'Rebuild' }))) return;
          setBusy('rebuild');
          try {
            stopSync();
            for (const st of getSyncableStores()) await dbService.setMeta(`cursor:${st}`, '0');
            await startSync();
            await syncNow();
            resetAllStores();
            toast.show('Local data rebuilt', 'success');
          } catch (e: any) { toast.show(e?.message ?? 'Rebuild failed', 'error'); }
          finally { setBusy(null); }
        }} />
      </Group>

      <Group title="Privacy" footer="Your data is stored in your private ClearMind cloud space and on your devices. AI agents only get access through tokens you create, with the permissions you choose.">
        <Row icon={<Trash2 size={20} color={T.danger} />} label="Delete account…" danger onPress={() => router.push('/(app)/settings/account')} />
      </Group>
      <Text className="text-ink-muted text-xs text-center mt-6 mx-8">Removed items are kept as hidden markers so other devices learn about the deletion.</Text>
    </SettingsPage>
  );
}
