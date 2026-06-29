import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { firebaseService } from '../../services/firebaseService';
import { Input } from '../../components/ui';

const ACCENT = '#3B82F6';

// Map Firebase / Google error codes to friendly messages.
function friendlyError(e: any): string {
  const code = e?.code ?? '';
  if (String(code) === '10' || /DEVELOPER_ERROR/i.test(e?.message ?? ''))
    return 'Google sign-in config error (SHA-1 not registered for this build).';
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong password.',
    'auth/user-not-found': 'No account with that email.',
    'auth/email-already-in-use': 'That email is already registered — sign in instead.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/network-request-failed': 'Network error — check your connection.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
  };
  return map[code] ?? (e?.message ? String(e.message) : 'Something went wrong.');
}

export default function Welcome() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'google' | 'guest'>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = useCallback(async (which: 'email' | 'google' | 'guest', fn: () => Promise<any>) => {
    setError(''); setNotice(''); setBusy(which);
    try { await fn(); } catch (e: any) { setError(friendlyError(e)); } finally { setBusy(null); }
  }, []);

  const submitEmail = () =>
    run('email', async () => {
      if (!email || !password) throw { message: 'Enter your email and password.' };
      if (mode === 'signup')
        await firebaseService.signUpWithEmail(email.trim(), password, nickname.trim() || email.split('@')[0]);
      else await firebaseService.signInWithEmail(email.trim(), password);
    });

  const reset = () =>
    run('email', async () => {
      if (!email) throw { message: 'Enter your email first.' };
      await firebaseService.resetPassword(email.trim());
      setNotice('Password reset email sent.');
    });

  return (
    <SafeAreaView className="flex-1 bg-midnight">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
          <Text className="text-accent text-4xl font-extrabold text-center">ClearMind</Text>
          <Text className="text-ink-muted text-center mt-1 mb-8">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </Text>

          {mode === 'signup' && (
            <Input placeholder="Nickname" value={nickname} onChangeText={setNickname} autoCapitalize="words" className="mb-3" />
          )}
          <Input placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" className="mb-3" />
          <Input placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry className="mb-1" />

          {!!error && <Text className="text-red-400 text-sm mt-1 mb-1">{error}</Text>}
          {!!notice && <Text className="text-emerald-400 text-sm mt-1 mb-1">{notice}</Text>}

          <Pressable onPress={submitEmail} disabled={busy !== null} className="bg-accent rounded-full py-4 items-center mt-3 active:opacity-80">
            {busy === 'email' ? <ActivityIndicator color="white" /> : (
              <Text className="text-white font-bold text-base">{mode === 'signin' ? 'Sign in' : 'Sign up'}</Text>
            )}
          </Pressable>

          {mode === 'signin' && (
            <Pressable onPress={reset} className="items-center mt-3">
              <Text className="text-ink-muted text-sm">Forgot password?</Text>
            </Pressable>
          )}

          <View className="flex-row items-center my-6">
            <View className="flex-1 h-px bg-hairline" />
            <Text className="text-ink-muted mx-3 text-xs">or</Text>
            <View className="flex-1 h-px bg-hairline" />
          </View>

          <Pressable
            onPress={() => run('google', () => firebaseService.signInWithGoogle())}
            disabled={busy !== null}
            className="flex-row items-center justify-center bg-white rounded-full py-4 active:opacity-80"
          >
            {busy === 'google' ? <ActivityIndicator color={ACCENT} /> : (
              <>
                <GoogleG />
                <Text className="text-[#1f1f1f] font-semibold text-base ml-3">Continue with Google</Text>
              </>
            )}
          </Pressable>

          <Pressable onPress={() => run('guest', () => firebaseService.signInAnonymously())} disabled={busy !== null} className="items-center mt-5">
            <Text className="text-ink-muted text-sm">{busy === 'guest' ? 'Please wait…' : 'Continue as guest'}</Text>
          </Pressable>

          <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} className="items-center mt-8">
            <Text className="text-ink-muted text-sm">
              {mode === 'signin' ? 'No account? ' : 'Have an account? '}
              <Text className="text-accent font-semibold">{mode === 'signin' ? 'Sign up' : 'Sign in'}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function GoogleG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.6 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.3 5.2C41.1 36.2 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </Svg>
  );
}
