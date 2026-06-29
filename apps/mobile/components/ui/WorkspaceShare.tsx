import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Share2, Crown, Globe, Lock, Users, X, Plus, Check, UserPlus, Mail } from 'lucide-react-native';
import type { Workspace } from '@clearmind/shared';
import { Input } from './Input';

// Reusable mobile collaboration UI (switcher + banner + new-workspace + members
// sheets), shared by the Applications and Projects screens. The parent owns the
// data + the item noun ("project" / "application"); these are presentational.

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function WsChip({ active, label, icon, onPress }: { active: boolean; label: string; icon: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`flex-row items-center rounded-full px-3 py-1.5 border ${active ? 'bg-accent border-accent' : 'border-hairline'} active:opacity-80`}>
      {icon}
      <Text className={`text-xs ml-1 ${active ? 'text-white font-semibold' : 'text-ink-muted'}`} numberOfLines={1} style={{ maxWidth: 150 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function WorkspaceBar({
  workspaces,
  activeWsId,
  personalLabel,
  onSelect,
  onShareNew,
}: {
  workspaces: Workspace[];
  activeWsId: string | null;
  personalLabel: string;
  onSelect: (id: string | null) => void;
  onShareNew: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
      <WsChip active={!activeWsId} label={personalLabel} icon={<Lock size={12} color={!activeWsId ? '#fff' : '#9ca3af'} />} onPress={() => onSelect(null)} />
      {workspaces.map((ws) => (
        <WsChip key={ws.id} active={activeWsId === ws.id} label={ws.name} icon={<Users size={12} color={activeWsId === ws.id ? '#fff' : '#9ca3af'} />} onPress={() => onSelect(ws.id)} />
      ))}
      <Pressable onPress={onShareNew} className="flex-row items-center rounded-full px-3 py-1.5 border border-dashed border-hairline active:opacity-70">
        <Share2 size={12} color="#60a5fa" />
        <Text className="text-accent text-xs ml-1">Share / New</Text>
      </Pressable>
    </ScrollView>
  );
}

export function WorkspaceBanner({ workspace, isOwner, onMembers }: { workspace: Workspace; isOwner: boolean; onMembers: () => void }) {
  return (
    <View className="mx-4 mt-3 rounded-2xl border border-blue-500/30 p-3 flex-row items-center justify-between" style={{ backgroundColor: 'rgba(59,130,246,0.08)' }}>
      <View className="flex-row items-center flex-1 mr-2">
        <View className="w-8 h-8 rounded-lg items-center justify-center mr-2" style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}>
          <Share2 size={15} color="#60a5fa" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-ink text-sm font-semibold" numberOfLines={1}>{workspace.name}</Text>
            {isOwner ? <Crown size={11} color="#fbbf24" style={{ marginLeft: 6 }} /> : null}
            <Globe size={11} color="#34d399" style={{ marginLeft: 6 }} />
          </View>
          <Text className="text-ink-muted text-xs">
            {workspace.memberEmails.length} member{workspace.memberEmails.length !== 1 ? 's' : ''} · everyone can edit
          </Text>
        </View>
      </View>
      <Pressable onPress={onMembers} className="px-3 py-2 rounded-lg bg-midnight-lighter active:opacity-80">
        <Text className="text-ink text-xs font-medium">Members</Text>
      </Pressable>
    </View>
  );
}

export function NewWorkspaceModal({
  visible,
  supported,
  seedCount,
  seedNoun,
  onCancel,
  onCreate,
}: {
  visible: boolean;
  supported: boolean;
  seedCount: number;
  seedNoun: string;
  onCancel: () => void;
  onCreate: (name: string, emails: string[], seed: boolean) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setName('');
      setEmails([]);
      setEmailDraft('');
      setSeed(true);
      setBusy(false);
      setError(null);
    }
  }

  const addEmail = () => {
    const e = emailDraft.trim().toLowerCase();
    if (e && EMAIL_RE.test(e) && !emails.includes(e)) setEmails([...emails, e]);
    setEmailDraft('');
  };
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), emails, seed);
    } catch (e: any) {
      setError(e?.message || 'Could not create workspace');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
          <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8" style={{ maxHeight: '92%' }} onPress={() => {}}>
            <View className="flex-row items-center mb-4">
              <Share2 size={18} color="#60a5fa" />
              <Text className="text-ink text-lg font-bold ml-2">Share a workspace</Text>
            </View>
            {!supported ? (
              <View style={{ gap: 16 }}>
                <Text className="text-ink-muted text-sm">Sign in with an email or Google account to create a shared workspace others can join and collaborate in.</Text>
                <Pressable onPress={onCancel} className="items-center py-3.5 rounded-full bg-accent active:bg-accent-hover">
                  <Text className="text-white font-bold">Got it</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Input label="Workspace name" placeholder="e.g. Q3 Initiatives" value={name} onChangeText={setName} className="mb-3" />
                <Text className="text-ink-muted text-xs mb-1.5 ml-1">Invite by email (optional)</Text>
                {emails.length ? (
                  <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
                    {emails.map((e) => (
                      <Pressable key={e} onPress={() => setEmails(emails.filter((x) => x !== e))} className="flex-row items-center rounded-full px-2.5 py-1 active:opacity-70" style={{ backgroundColor: 'rgba(59,130,246,0.18)' }}>
                        <Text className="text-accent text-xs mr-1">{e}</Text>
                        <X size={11} color="#60a5fa" />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View className="flex-row items-center mb-1" style={{ gap: 8 }}>
                  <View className="flex-1">
                    <Input placeholder="name@example.com" value={emailDraft} onChangeText={setEmailDraft} onSubmitEditing={addEmail} autoCapitalize="none" keyboardType="email-address" returnKeyType="done" />
                  </View>
                  <Pressable onPress={addEmail} className="px-4 py-3 rounded-2xl bg-midnight-lighter active:opacity-80">
                    <Plus size={18} color="#e5e7eb" />
                  </Pressable>
                </View>
                <Text className="text-ink-muted text-xs mb-3 ml-1">They'll see this workspace next time they open ClearMind signed in with that email.</Text>
                <Pressable onPress={() => setSeed(!seed)} className="flex-row items-center mb-4 active:opacity-70">
                  <View className={`w-5 h-5 rounded mr-2 items-center justify-center ${seed ? 'bg-accent' : 'border border-hairline'}`}>
                    {seed ? <Check size={14} color="#fff" /> : null}
                  </View>
                  <Text className="text-ink text-sm">Copy my {seedCount} current {seedNoun}{seedCount !== 1 ? 's' : ''} into it</Text>
                </Pressable>
                {error ? <Text className="text-red-400 text-sm mb-3">{error}</Text> : null}
                <View className="flex-row" style={{ gap: 12 }}>
                  <Pressable onPress={onCancel} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80">
                    <Text className="text-ink font-semibold">Cancel</Text>
                  </Pressable>
                  <Pressable onPress={submit} disabled={!name.trim() || busy} className={`flex-1 items-center py-3.5 rounded-full ${name.trim() && !busy ? 'bg-accent active:bg-accent-hover' : 'bg-midnight-lighter'}`}>
                    <Text className={`font-bold ${name.trim() && !busy ? 'text-white' : 'text-ink-muted'}`}>{busy ? 'Creating…' : 'Create & share'}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function MembersModal({
  workspace,
  isOwner,
  currentEmail,
  onCancel,
  onSave,
  onDelete,
}: {
  workspace: Workspace | null;
  isOwner: boolean;
  currentEmail: string | null;
  onCancel: () => void;
  onSave: (emails: string[]) => Promise<void>;
  onDelete: () => void;
}) {
  const [invitees, setInvitees] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsId = workspace?.id ?? null;
  const [lastWs, setLastWs] = useState<string | null>(null);
  if (wsId !== lastWs) {
    setLastWs(wsId);
    setInvitees(workspace ? workspace.memberEmails.filter((e) => e !== workspace.ownerEmail) : []);
    setEmailDraft('');
    setBusy(false);
    setError(null);
  }

  const addEmail = () => {
    if (!workspace) return;
    const e = emailDraft.trim().toLowerCase();
    if (e && EMAIL_RE.test(e) && e !== workspace.ownerEmail && !invitees.includes(e)) setInvitees([...invitees, e]);
    setEmailDraft('');
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(invitees);
      onCancel();
    } catch (e: any) {
      setError(e?.message || 'Could not update members');
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!workspace} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
          <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8" style={{ maxHeight: '90%' }} onPress={() => {}}>
            {workspace ? (
              <>
                <View className="flex-row items-center mb-1">
                  <Users size={18} color="#60a5fa" />
                  <Text className="text-ink text-lg font-bold ml-2">Members</Text>
                </View>
                <Text className="text-ink-muted text-xs mb-4">{workspace.name} · everyone listed can view and edit everything in it.</Text>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                  <View className="flex-row items-center justify-between rounded-xl px-3 py-2.5 mb-2" style={{ backgroundColor: 'rgba(148,163,184,0.12)' }}>
                    <Text className="text-ink text-sm flex-1 mr-2" numberOfLines={1}>{workspace.ownerEmail}{currentEmail === workspace.ownerEmail ? ' · you' : ''}</Text>
                    <View className="flex-row items-center">
                      <Crown size={12} color="#fbbf24" />
                      <Text className="text-amber-400 text-xs ml-1">owner</Text>
                    </View>
                  </View>
                  {invitees.map((e) => (
                    <View key={e} className="flex-row items-center justify-between rounded-xl px-3 py-2.5 mb-2" style={{ backgroundColor: 'rgba(148,163,184,0.06)' }}>
                      <Text className="text-ink text-sm flex-1 mr-2" numberOfLines={1}>{e}{currentEmail === e ? ' · you' : ''}</Text>
                      {isOwner ? (
                        <Pressable onPress={() => setInvitees(invitees.filter((x) => x !== e))} hitSlop={8} className="active:opacity-60">
                          <X size={15} color="#9ca3af" />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>

                {isOwner ? (
                  <>
                    <View className="flex-row items-center mt-2 mb-3" style={{ gap: 8 }}>
                      <View className="flex-1">
                        <Input placeholder="Invite by email" value={emailDraft} onChangeText={setEmailDraft} onSubmitEditing={addEmail} autoCapitalize="none" keyboardType="email-address" returnKeyType="done" />
                      </View>
                      <Pressable onPress={addEmail} className="px-4 py-3 rounded-2xl bg-midnight-lighter active:opacity-80">
                        <UserPlus size={18} color="#e5e7eb" />
                      </Pressable>
                    </View>
                    {error ? <Text className="text-red-400 text-sm mb-3">{error}</Text> : null}
                    <View className="flex-row mb-2" style={{ gap: 12 }}>
                      <Pressable onPress={onCancel} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80">
                        <Text className="text-ink font-semibold">Cancel</Text>
                      </Pressable>
                      <Pressable onPress={save} disabled={busy} className="flex-1 items-center py-3.5 rounded-full bg-accent active:bg-accent-hover">
                        <Text className="text-white font-bold">{busy ? 'Saving…' : 'Save'}</Text>
                      </Pressable>
                    </View>
                    <Pressable onPress={onDelete} className="items-center py-3 active:opacity-70">
                      <Text className="text-red-400 text-sm font-medium">Delete workspace</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable onPress={onCancel} className="items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80 mt-2">
                    <Text className="text-ink font-semibold">Close</Text>
                  </Pressable>
                )}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
