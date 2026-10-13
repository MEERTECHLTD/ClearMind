import { useState } from 'react';
import { View, Text, Image, TextInput, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProfile, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { Camera, ImagePlus, Trash2, Mail, KeyRound, UserRound, Link2, AlertTriangle } from 'lucide-react-native';
import { deleteAccountData, updateProfileDoc } from '@clearmind/shared/data/account';
import { firebaseService } from '../../../services/firebaseService';
import { useAuth } from '../../../hooks/useAuth';
import { SettingsPage, Group, Row } from '../../../components/settings/ui';
import { Sheet, Button, ActionMenu, useToast } from '../../../components/ui';
import { auth, db } from '../../../lib/firebase';
import { dbService, getSyncableStores, getFirestoreCollectionName } from '../../../services/db';
import { stopSync } from '../../../services/sync';
import { cancelAllOwn } from '../../../services/notifications';
import { clearWidgets } from '../../../services/widgetData';
import { resetAllStores } from '../../../lib/collectionStore';
import { T } from '../../../lib/theme';
import { logWarn } from '../../../lib/logger';

const PROVIDER_LABEL: Record<string, string> = { password: 'Email & password', 'google.com': 'Google', 'github.com': 'GitHub', anonymous: 'Guest' };

export default function AccountSettings() {
  const router = useRouter();
  const toast = useToast();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState('');
  const [photoMenu, setPhotoMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [progress, setProgress] = useState('');

  if (!user) return null;
  const displayName = profile?.nickname || user.displayName || user.email?.split('@')[0] || 'You';
  const photo = (profile as any)?.photoURL || user.photoURL || null;
  const providers = user.isAnonymous ? ['anonymous'] : user.providerData.map((p) => p.providerId);

  const saveName = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await updateProfileDoc(db, user.uid, { nickname: n });
      await updateProfile(user, { displayName: n }).catch(() => {});
      await refreshProfile();
      setEditName(false);
      toast.show('Name updated', 'success');
    } catch (e: any) {
      toast.show(e?.message ?? 'Couldn’t update your name', 'error');
    } finally { setBusy(false); }
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    setPhotoMenu(false);
    try {
      // The system photo picker needs no permission; only the camera does.
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { toast.show('Camera access is needed to take a photo', 'error'); return; }
      }
      const r = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (r.canceled || !r.assets?.[0]) return;
      setBusy(true);
      // Small, square JPEG stored with the profile — shows on web and mobile.
      const out = await ImageManipulator.manipulateAsync(r.assets[0].uri, [{ resize: { width: 256, height: 256 } }], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!out.base64) throw new Error('image processing failed');
      await updateProfileDoc(db, user.uid, { photoURL: `data:image/jpeg;base64,${out.base64}` });
      await refreshProfile();
      toast.show('Photo updated', 'success');
    } catch (e: any) {
      logWarn('avatar: ' + String(e));
      toast.show('Couldn’t update your photo', 'error');
    } finally { setBusy(false); }
  };

  const removePhoto = async () => {
    setPhotoMenu(false);
    setBusy(true);
    try { await updateProfileDoc(db, user.uid, { photoURL: null }); await refreshProfile(); toast.show('Photo removed', 'info'); }
    catch { toast.show('Couldn’t remove the photo', 'error'); }
    finally { setBusy(false); }
  };

  const resetPassword = async () => {
    if (!user.email) return;
    try { await sendPasswordResetEmail(auth, user.email); toast.show(`Password reset link sent to ${user.email}`, 'success'); }
    catch (e: any) { toast.show(e?.message ?? 'Couldn’t send the reset email', 'error'); }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      stopSync();
      await deleteAccountData(db, user.uid, getSyncableStores().map(getFirestoreCollectionName), setProgress);
      setProgress('Removing sign-in…');
      // Sign in with Apple accounts: revoke Apple's token too (Apple requirement).
      await firebaseService.revokeAppleIfLinked(user);
      try {
        await deleteUser(user);
      } catch (e: any) {
        if (e?.code === 'auth/requires-recent-login') {
          await signOut();
          toast.show('Your data was deleted. For security, sign in once more and delete again to remove the login itself.', 'info');
          router.replace('/(auth)/welcome');
          return;
        }
        throw e;
      }
      await cancelAllOwn();
      await clearWidgets();
      await dbService.wipeAll();
      await AsyncStorage.multiRemove(['clearmind:localOwnerUid', 'clearmind:homeView']).catch(() => {});
      resetAllStores();
      toast.show('Your account and data were deleted', 'info');
      router.replace('/(auth)/welcome');
    } catch (e: any) {
      toast.show(e?.message ?? 'Deletion failed — nothing more was removed. Try again.', 'error');
    } finally { setBusy(false); setDeleting(false); setProgress(''); }
  };

  return (
    <SettingsPage title="Account">
      <View className="items-center mt-6">
        <Pressable onPress={() => setPhotoMenu(true)} accessibilityRole="button" accessibilityLabel="Change profile photo">
          {photo ? <Image source={{ uri: photo }} style={{ width: 96, height: 96, borderRadius: 48 }} /> : (
            <View className="w-24 h-24 rounded-full bg-accent items-center justify-center"><Text className="text-white text-3xl font-extrabold">{displayName[0]?.toUpperCase()}</Text></View>
          )}
          <View style={{ position: 'absolute', right: 0, bottom: 0, backgroundColor: T.accent, borderRadius: 16, padding: 7, borderWidth: 2, borderColor: T.bg }}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={16} color="#fff" />}
          </View>
        </Pressable>
        <Text className="text-ink text-xl font-bold mt-3">{displayName}</Text>
        {user.email ? <Text className="text-ink-muted text-sm mt-0.5">{user.email}</Text> : null}
      </View>

      <Group title="Profile">
        <Row icon={<UserRound size={20} color={T.accent} />} label="Name" value={displayName} onPress={() => { setName(displayName); setEditName(true); }} />
        <Row icon={<Mail size={20} color={T.accent} />} label="Email" value={user.email ?? 'Not set (guest)'} />
        <Row icon={<ImagePlus size={20} color={T.accent} />} label="Profile photo" value={photo ? 'Set' : 'Not set'} onPress={() => setPhotoMenu(true)} />
      </Group>

      <Group title="Sign-in" footer={user.isAnonymous ? 'Guest accounts can’t be recovered on another device. Sign up with email or Google to keep your data safe.' : undefined}>
        {providers.map((p) => <Row key={p} icon={<Link2 size={20} color={T.accent} />} label="Connected" value={PROVIDER_LABEL[p] ?? p} />)}
        {providers.includes('password') ? <Row icon={<KeyRound size={20} color={T.accent} />} label="Change password" detail="We’ll email you a secure link" onPress={resetPassword} /> : null}
      </Group>

      <Group title="Danger zone" footer="Deleting your account permanently removes all tasks, projects, notes and every other item, your profile, agent access and shared workspaces you own — on every device. This can’t be undone.">
        <Row icon={<Trash2 size={20} color={T.danger} />} label="Delete account" danger onPress={() => { setConfirmText(''); setDeleting(true); }} />
      </Group>

      <ActionMenu
        visible={photoMenu}
        onClose={() => setPhotoMenu(false)}
        title="Profile photo"
        actions={[
          { label: 'Take a photo', icon: <Camera size={18} color={T.muted} />, onPress: () => setTimeout(() => pickPhoto('camera'), 300) },
          { label: 'Choose from library', icon: <ImagePlus size={18} color={T.muted} />, onPress: () => setTimeout(() => pickPhoto('library'), 300) },
          ...(photo ? [{ label: 'Remove photo', icon: <Trash2 size={18} color={T.danger} />, destructive: true, onPress: removePhoto }] : []),
        ]}
      />

      <Sheet visible={editName} onClose={() => setEditName(false)} title="Your name">
        <TextInput value={name} onChangeText={setName} autoFocus maxLength={60} className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line" placeholderTextColor={T.faint} placeholder="Name" returnKeyType="done" onSubmitEditing={saveName} accessibilityLabel="Name" />
        <View className="mt-4 mb-1"><Button title="Save" onPress={saveName} loading={busy} disabled={!name.trim()} /></View>
      </Sheet>

      <Sheet visible={deleting} onClose={() => !busy && setDeleting(false)} title="Delete account">
        <View className="flex-row items-start mb-3">
          <AlertTriangle size={20} color={T.danger} />
          <Text className="text-ink-muted text-sm ml-2 flex-1 leading-5">This permanently deletes everything in your ClearMind account on all devices. Type DELETE to confirm.</Text>
        </View>
        <TextInput value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" placeholder="DELETE" placeholderTextColor={T.faint} className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line" editable={!busy} accessibilityLabel="Type DELETE to confirm" />
        {progress ? <Text className="text-ink-muted text-xs mt-2">{progress}</Text> : null}
        <View className="mt-4 mb-1">
          <Button title="Delete my account" variant="danger" onPress={deleteAccount} disabled={confirmText.trim() !== 'DELETE'} loading={busy} />
        </View>
      </Sheet>
      {Platform.OS === 'ios' ? <View style={{ height: 24 }} /> : null}
    </SettingsPage>
  );
}
