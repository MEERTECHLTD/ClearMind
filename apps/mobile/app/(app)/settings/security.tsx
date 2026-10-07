import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { KeyRound, LogIn, Clock3, Bot, ShieldOff, Smartphone } from 'lucide-react-native';
import { revokeAllAgentTokens, subscribeAgentTokens } from '@clearmind/shared/data/agentTokens';
import type { AgentToken } from '@clearmind/shared';
import { useAuth } from '../../../hooks/useAuth';
import { SettingsPage, Group, Row } from '../../../components/settings/ui';
import { confirmDialog, useToast } from '../../../components/ui';
import { auth, db } from '../../../lib/firebase';
import { engine } from '../../../services/sync';
import { T } from '../../../lib/theme';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—');

export default function SecuritySettings() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  useEffect(() => (user ? subscribeAgentTokens(db, user.uid, setTokens) : undefined), [user]);
  if (!user) return null;
  const active = tokens.filter((t) => !t.revoked);
  const methods = user.isAnonymous ? 'Guest (no password)' : user.providerData.map((p) => (p.providerId === 'password' ? 'Email & password' : p.providerId === 'google.com' ? 'Google' : p.providerId)).join(', ');

  return (
    <SettingsPage title="Security">
      <Group title="Sign-in">
        <Row icon={<LogIn size={20} color={T.accent} />} label="Sign-in method" value={methods} />
        {user.providerData.some((p) => p.providerId === 'password') && user.email ? (
          <Row icon={<KeyRound size={20} color={T.accent} />} label="Reset password" detail="Sends a secure link to your email" onPress={async () => {
            try { await sendPasswordResetEmail(auth, user.email!); toast.show('Reset link sent', 'success'); } catch (e: any) { toast.show(e?.message ?? 'Couldn’t send', 'error'); }
          }} />
        ) : null}
      </Group>
      <Group title="Login activity">
        <Row icon={<Clock3 size={20} color={T.accent} />} label="Last sign-in" value={fmt(user.metadata.lastSignInTime)} />
        <Row icon={<Clock3 size={20} color={T.muted} />} label="Account created" value={fmt(user.metadata.creationTime)} />
        <Row icon={<Smartphone size={20} color={T.accent} />} label="This device" detail={`Sync id ${(engine as any).opts?.clientId ?? ''}`} />
      </Group>
      <Group title="AI agent access" footer="Revoking takes effect on the agent’s very next request.">
        <Row icon={<Bot size={20} color={T.accent} />} label="Connected agents" value={String(active.length)} onPress={() => router.push('/(app)/settings/integrations')} />
        {active.length ? (
          <Row icon={<ShieldOff size={20} color={T.danger} />} label="Revoke all agent access" danger onPress={async () => {
            if (await confirmDialog({ title: 'Revoke all agents', message: `Disconnect all ${active.length} agent(s) immediately?`, confirmText: 'Revoke all', destructive: true })) {
              const n = await revokeAllAgentTokens(db, user.uid);
              toast.show(`Revoked ${n} token(s)`, 'info');
            }
          }} />
        ) : null}
      </Group>
    </SettingsPage>
  );
}
