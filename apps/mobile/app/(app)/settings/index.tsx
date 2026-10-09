import { View, Text, Pressable, Image } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import {
  User, SlidersHorizontal, Palette, LayoutPanelLeft, Zap, Flame, Bell, Bot, ShieldCheck, Database, Info, LogOut, CloudOff, CloudAlert, Cloud,
} from 'lucide-react-native';
import { useAuth } from '../../../hooks/useAuth';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import { Avatar } from '../../../components/ui';
import { SettingsPage, Group, Row } from '../../../components/settings/ui';
import { confirmDialog } from '../../../components/ui';
import { T } from '../../../lib/theme';

const ICON = 20;

export default function SettingsHome() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const sync = useSyncStatus();
  const go = (h: string) => router.push(h as Href);
  const name = profile?.nickname || user?.displayName || user?.email?.split('@')[0] || 'You';
  const photo = (profile as any)?.photoURL || user?.photoURL || null;
  const version = (Constants.expoConfig?.version as string) ?? '';

  const syncLine = sync.state === 'offline' ? `Offline${sync.pending ? ` · ${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting` : ''}`
    : sync.state === 'error' ? 'Sync problem — tap to retry'
    : sync.pending ? `Syncing ${sync.pending} change${sync.pending === 1 ? '' : 's'}…`
    : sync.lastSyncedAt ? 'All changes synced' : 'Connected';
  const SyncIcon = sync.state === 'offline' ? CloudOff : sync.state === 'error' ? CloudAlert : Cloud;

  return (
    <SettingsPage title="Settings">
      <Pressable onPress={() => go('/(app)/settings/account')} className="mx-4 mt-4 flex-row items-center p-4 rounded-2xl bg-midnight-light border border-line active:opacity-80" accessibilityRole="button" accessibilityLabel={`Account: ${name}`}>
        <Avatar size={56} />
        <View className="flex-1 ml-4">
          <Text className="text-ink text-lg font-bold" numberOfLines={1}>{name}</Text>
          <Text className="text-ink-muted text-sm" numberOfLines={1}>{user?.email ?? (user?.isAnonymous ? 'Guest account' : '')}</Text>
        </View>
      </Pressable>

      <Group>
        <Row icon={<SyncIcon size={ICON} color={sync.state === 'error' ? T.danger : T.accent} />} label="Sync" detail={syncLine} onPress={() => go('/(app)/settings/data')} />
      </Group>

      <Group title="Preferences">
        <Row icon={<SlidersHorizontal size={ICON} color={T.accent} />} label="General" detail="Home view, dates, week start, swipe actions" onPress={() => go('/(app)/settings/general')} />
        <Row icon={<Palette size={ICON} color={T.accent} />} label="Appearance" detail="Theme, app icon, density" onPress={() => go('/(app)/settings/appearance')} />
        <Row icon={<LayoutPanelLeft size={ICON} color={T.accent} />} label="Navigation" detail="Choose your bottom tabs" onPress={() => go('/(app)/settings/navigation')} />
        <Row icon={<Zap size={ICON} color={T.accent} />} label="Quick Add" detail="Defaults and smart parsing" onPress={() => go('/(app)/settings/quickadd')} />
        <Row icon={<Flame size={ICON} color={T.accent} />} label="Productivity" detail="Goals, streaks, days off" onPress={() => go('/(app)/settings/productivity')} />
        <Row icon={<Bell size={ICON} color={T.accent} />} label="Reminders & notifications" onPress={() => go('/(app)/settings/notifications')} />
      </Group>

      <Group title="Connections">
        <Row icon={<Bot size={ICON} color={T.accent} />} label="Integrations & AI agents" detail="MCP, API, CLI, connected agents" onPress={() => go('/(app)/settings/integrations')} />
      </Group>

      <Group title="Account">
        <Row icon={<User size={ICON} color={T.accent} />} label="Account" detail="Profile, photo, email, delete account" onPress={() => go('/(app)/settings/account')} />
        <Row icon={<ShieldCheck size={ICON} color={T.accent} />} label="Security" detail="Sign-in, agent access, activity" onPress={() => go('/(app)/settings/security')} />
        <Row icon={<Database size={ICON} color={T.accent} />} label="Data & privacy" detail="Sync, export, local data" onPress={() => go('/(app)/settings/data')} />
      </Group>

      <Group>
        <Row icon={<Info size={ICON} color={T.muted} />} label="Diagnostics" value={version ? `v${version}` : undefined} onPress={() => go('/(app)/diagnostics')} />
        <Row
          icon={<LogOut size={ICON} color={T.danger} />}
          label="Sign out"
          danger
          onPress={async () => {
            if (await confirmDialog({ title: 'Sign out', message: sync.pending ? `${sync.pending} change(s) haven’t synced yet. They’ll be sent next time you sign in on this device.` : 'Sign out of ClearMind?', confirmText: 'Sign out', destructive: true })) {
              await signOut();
              router.replace('/(auth)/welcome');
            }
          }}
        />
      </Group>
      <Text className="text-ink-muted text-center text-xs mt-6">ClearMind {version ? `v${version}` : ''}</Text>
    </SettingsPage>
  );
}
