import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { Bot, Plus, KeyRound, Copy, ShieldAlert, CheckCircle2, XCircle, Terminal, Globe, Cpu, Check, TriangleAlert } from 'lucide-react-native';
import type { AgentScope, AgentToken, AgentAudit } from '@clearmind/shared';
import { SCOPES, SCOPE_PRESETS } from '@clearmind/shared/agents/tokens';
import { createAgentToken, revokeAgentToken, subscribeAgentTokens, subscribeAgentAudit, connectionSnippets } from '@clearmind/shared/data/agentTokens';
import { useAuth } from '../../../hooks/useAuth';
import { SettingsPage, Group, Row } from '../../../components/settings/ui';
import { Sheet, Button, confirmDialog, useToast } from '../../../components/ui';
import { db } from '../../../lib/firebase';
import { T } from '../../../lib/theme';

const ago = (iso?: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const crypto = {
  sha256: (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s),
  randomBytes: (n: number) => Crypto.getRandomBytes(n),
};

function Snippet({ title, icon, text }: { title: string; icon: React.ReactNode; text: string }) {
  const toast = useToast();
  return (
    <View className="mt-3">
      <View className="flex-row items-center mb-1">{icon}<Text className="text-ink text-sm font-semibold ml-2 flex-1">{title}</Text>
        <Pressable onPress={async () => { await Clipboard.setStringAsync(text); toast.show('Copied', 'success'); }} hitSlop={8} accessibilityLabel={`Copy ${title}`}><Copy size={16} color={T.accent} /></Pressable>
      </View>
      <Text selectable className="text-ink-muted text-xs bg-midnight rounded-lg p-2.5 border border-line" style={{ fontFamily: 'monospace' }}>{text}</Text>
    </View>
  );
}

export default function IntegrationsSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [audit, setAudit] = useState<AgentAudit[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Claude Code');
  const [scopes, setScopes] = useState<AgentScope[]>(SCOPE_PRESETS[1].scopes);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentToken | null>(null);

  useEffect(() => {
    if (!user) return;
    const a = subscribeAgentTokens(db, user.uid, setTokens);
    const b = subscribeAgentAudit(db, user.uid, setAudit, 40);
    return () => { a(); b(); };
  }, [user]);

  const active = tokens.filter((t) => !t.revoked);
  const revoked = tokens.filter((t) => t.revoked);
  const snippets = useMemo(() => (issued ? connectionSnippets(issued) : null), [issued]);

  const create = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const r = await createAgentToken(db, user.uid, { name, scopes }, crypto);
      setCreating(false);
      setIssued(r.token);
    } catch (e: any) {
      toast.show(e?.message ?? 'Couldn’t create the token', 'error');
    } finally { setBusy(false); }
  };

  const revoke = async (t: AgentToken) => {
    if (!user) return;
    if (await confirmDialog({ title: 'Revoke access', message: `“${t.name}” will immediately lose access to your ClearMind data.`, confirmText: 'Revoke', destructive: true })) {
      await revokeAgentToken(db, user.uid, t.id);
      setSelected(null);
      toast.show('Access revoked', 'info');
    }
  };

  return (
    <SettingsPage title="Integrations & AI agents">
      <View className="mx-4 mt-4 p-4 rounded-2xl bg-midnight-light border border-line">
        <View className="flex-row items-center"><Bot size={22} color={T.accent} /><Text className="text-ink font-semibold text-base ml-2">Let AI agents work with your tasks</Text></View>
        <Text className="text-ink-muted text-sm mt-2 leading-5">Connect Claude Code, Codex or any MCP-compatible agent. Each connection gets its own token with only the permissions you choose. Everything an agent does is logged and appears here, and you can revoke access any time.</Text>
      </View>

      <Group title="Connected agents" footer={active.length ? undefined : 'No agents connected yet.'}>
        {active.map((t) => (
          <Row key={t.id} icon={<KeyRound size={20} color={T.accent} />} label={t.name} detail={`${t.scopes.length} permission${t.scopes.length === 1 ? '' : 's'} · last used ${ago(t.lastUsedAt)}`} onPress={() => setSelected(t)} />
        ))}
        <Row icon={<Plus size={20} color={T.accent} />} label="Connect an agent" onPress={() => { setName('Claude Code'); setScopes(SCOPE_PRESETS[1].scopes); setCreating(true); }} />
      </Group>

      {audit.length ? (
        <Group title="Recent agent activity">
          {audit.slice(0, 15).map((a) => (
            <Row key={a.id} icon={a.ok ? <CheckCircle2 size={18} color={T.success} /> : <XCircle size={18} color={T.danger} />} label={`${a.agent} · ${a.tool.replace(/_/g, ' ')}`} detail={`${a.summary ?? a.error ?? ''}${a.summary || a.error ? ' · ' : ''}${ago(a.at)} · ${a.source}`} />
          ))}
        </Group>
      ) : null}

      {revoked.length ? (
        <Group title="Revoked">
          {revoked.slice(0, 10).map((t) => <Row key={t.id} label={t.name} detail={`Revoked ${ago(t.revokedAt)}`} />)}
        </Group>
      ) : null}

      <Group title="Other ways in" footer="The REST API and CLI use the same tokens and permissions as MCP.">
        <Row icon={<Globe size={20} color={T.accent} />} label="REST API" detail="clearmind.meertech.tech/api/v1" />
        <Row icon={<Terminal size={20} color={T.accent} />} label="Command line" detail="clearmind add “Call Ahmed tomorrow 9am p1”" />
      </Group>

      <Sheet visible={creating} onClose={() => setCreating(false)} title="Connect an agent" fill maxHeight="90%">
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text className="text-ink-muted text-xs mb-1.5 ml-1">Name</Text>
          <TextInput value={name} onChangeText={setName} maxLength={60} className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line" placeholder="e.g. Claude Code on my laptop" placeholderTextColor={T.faint} accessibilityLabel="Agent name" />
          <Text className="text-ink-muted text-xs mt-4 mb-1.5 ml-1">Access level</Text>
          <View className="flex-row flex-wrap">
            {SCOPE_PRESETS.map((p) => {
              const on = p.scopes.length === scopes.length && p.scopes.every((s) => scopes.includes(s));
              return (
                <Pressable key={p.id} onPress={() => setScopes(p.scopes)} className={`px-3 py-2 rounded-full mr-2 mb-2 border ${on ? 'bg-accent border-accent' : 'border-line'}`} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text className={on ? 'text-white font-semibold text-sm' : 'text-ink text-sm'}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-ink-muted text-xs mt-3 mb-1.5 ml-1">Permissions</Text>
          {SCOPES.map((s) => {
            const on = scopes.includes(s.scope);
            return (
              <Pressable key={s.scope} onPress={() => setScopes(on ? scopes.filter((x) => x !== s.scope) : [...scopes, s.scope])} className="flex-row items-center py-2.5" accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? T.accent : T.line, backgroundColor: on ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center"><Text className="text-ink text-[15px]">{s.label}</Text>{s.risky ? <TriangleAlert size={14} color="#F59E0B" style={{ marginLeft: 6 }} accessibilityLabel="Higher risk" /> : null}</View>
                  <Text className="text-ink-muted text-xs">{s.detail}</Text>
                </View>
              </Pressable>
            );
          })}
          <View className="mt-4 mb-2"><Button title="Create token" onPress={create} loading={busy} disabled={!name.trim() || !scopes.length} /></View>
        </ScrollView>
      </Sheet>

      <Sheet visible={!!issued} onClose={() => setIssued(null)} title="Your new token" fill maxHeight="92%">
        <ScrollView>
          <View className="flex-row items-start p-3 rounded-xl" style={{ backgroundColor: `${T.danger}18` }}>
            <ShieldAlert size={18} color={T.danger} />
            <Text className="text-ink text-sm ml-2 flex-1">Copy it now — for your security it won’t be shown again. Anyone with this token can act with the permissions you chose.</Text>
          </View>
          {issued ? <Snippet title="Token" icon={<KeyRound size={16} color={T.accent} />} text={issued} /> : null}
          {snippets ? (
            <>
              <Snippet title="Claude Code (hosted)" icon={<Bot size={16} color={T.accent} />} text={snippets.claudeCodeHttp} />
              <Snippet title="Claude Code (local)" icon={<Cpu size={16} color={T.accent} />} text={snippets.claudeCodeLocal} />
              <Snippet title="Codex (~/.codex/config.toml)" icon={<Cpu size={16} color={T.accent} />} text={snippets.codexToml} />
              <Snippet title="CLI" icon={<Terminal size={16} color={T.accent} />} text={snippets.cli} />
              <Snippet title="REST (curl)" icon={<Globe size={16} color={T.accent} />} text={snippets.curl} />
            </>
          ) : null}
          <View className="mt-4 mb-2"><Button title="Share securely…" variant="secondary" onPress={() => issued && Share.share({ message: issued })} /></View>
        </ScrollView>
      </Sheet>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        {selected ? (
          <View>
            <Text className="text-ink-muted text-sm">Token {selected.prefix} · created {ago(selected.createdAt)} · last used {ago(selected.lastUsedAt)} · {selected.rateLimit ?? 60} requests/min</Text>
            <Text className="text-ink-muted text-xs mt-3 mb-1 font-semibold">PERMISSIONS</Text>
            {selected.scopes.map((s) => <Text key={s} className="text-ink text-sm py-0.5">• {SCOPES.find((x) => x.scope === s)?.label ?? s}</Text>)}
            <View className="mt-5 mb-1"><Button title="Revoke access" variant="danger" onPress={() => revoke(selected)} /></View>
          </View>
        ) : null}
      </Sheet>
    </SettingsPage>
  );
}
