import { useCallback, useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { View, Text, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { firebaseService } from '../../services/firebaseService';
import { Input } from '../../components/ui';
import { logWarn } from '../../lib/logger';
import { friendlyAuthError as friendlyError, isAuthCancel as isCancel, isGoogleUnavailable, type AuthMethod } from '../../services/authErrors';
import { T, useScheme } from '../../lib/theme';

// Brand mark on a transparent background, so it sits on both light and dark themes.
const LOGO = require('../../assets/branding/adaptive-foreground.png');

export default function Welcome() {
  const isDark = useScheme() === 'dark'; // re-render on theme change (T is the live palette)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState<null | AuthMethod>(null);
  // Sign in with Apple (iOS only; App Store guideline 4.8 when Google sign-in is offered).
  const [appleOk, setAppleOk] = useState(false);
  useEffect(() => { firebaseService.appleAvailable().then(setAppleOk).catch(() => {}); }, []);
  // Only offer Google when this build can actually use it: configured at build time,
  // and not rejected by Google for this signing certificate (DEVELOPER_ERROR).
  const [googleOk, setGoogleOk] = useState(firebaseService.googleConfigured);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = useCallback(async (which: AuthMethod, fn: () => Promise<any>) => {
    setError(''); setNotice(''); setBusy(which);
    try { await fn(); } catch (e: any) {
      if (isCancel(e)) return;
      logWarn(`sign-in (${which}) failed: code=${String(e?.code ?? '')} ${String(e?.message ?? e)}`);
      if (which === 'google' && isGoogleUnavailable(e)) setGoogleOk(false);
      setError(friendlyError(e, which));
    } finally { setBusy(null); }
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

  const signin = mode === 'signin';
  const disabled = busy !== null;

  return (
    <SafeAreaView className="flex-1 bg-midnight">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            {/* Brand header: official mark + gradient wordmark (matches the web logo). */}
            <View className="items-center" accessible accessibilityRole="header" accessibilityLabel="ClearMind">
              <Image source={LOGO} style={{ width: 132, height: 132, marginVertical: -14 }} resizeMode="contain" />
              <Wordmark />
              <Text className="text-ink-muted text-sm mt-1">Tasks, notes &amp; AI — one clear place</Text>
            </View>

            <View className="mt-9 mb-5">
              <Text className="text-ink text-2xl font-bold">{signin ? 'Welcome back' : 'Create your account'}</Text>
              <Text className="text-ink-muted text-sm mt-1">
                {signin ? 'Sign in to sync your work across devices.' : 'Free, and your data syncs everywhere you sign in.'}
              </Text>
            </View>

            {mode === 'signup' && (
              <Input label="Nickname" placeholder="What should we call you?" value={nickname} onChangeText={setNickname}
                autoCapitalize="words" textContentType="nickname" accessibilityLabel="Nickname" className="mb-3" />
            )}
            <Input label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress"
              accessibilityLabel="Email" className="mb-3" />
            <View>
              <Input label="Password" placeholder={signin ? 'Your password' : 'At least 6 characters'} value={password}
                onChangeText={setPassword} secureTextEntry={!showPassword}
                autoComplete={signin ? 'current-password' : 'new-password'} textContentType={signin ? 'password' : 'newPassword'}
                accessibilityLabel="Password" onSubmitEditing={submitEmail} returnKeyType="go" style={{ paddingRight: 64 }} />
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}
                accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 bottom-0 h-[50px] px-3 justify-center">
                <Text className="text-accent text-sm font-semibold">{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>

            {signin && (
              <Pressable onPress={reset} disabled={disabled} accessibilityRole="button" hitSlop={6} className="self-end py-2.5">
                <Text className="text-accent text-sm font-medium">Forgot password?</Text>
              </Pressable>
            )}

            {!!error && (
              <View accessibilityRole="alert" accessibilityLiveRegion="polite"
                className="rounded-xl px-3.5 py-3 mt-2" style={{ backgroundColor: `${T.danger}1A`, borderWidth: 1, borderColor: `${T.danger}55` }}>
                <Text style={{ color: T.danger }} className="text-sm leading-5">{error}</Text>
              </View>
            )}
            {!!notice && (
              <View accessibilityLiveRegion="polite" className="rounded-xl px-3.5 py-3 mt-2"
                style={{ backgroundColor: `${T.success}1A`, borderWidth: 1, borderColor: `${T.success}55` }}>
                <Text style={{ color: T.success }} className="text-sm leading-5">{notice}</Text>
              </View>
            )}

            <Pressable onPress={submitEmail} disabled={disabled} accessibilityRole="button"
              accessibilityLabel={signin ? 'Sign in with email' : 'Create account'} accessibilityState={{ busy: busy === 'email', disabled }}
              className={`bg-accent rounded-2xl h-[52px] items-center justify-center mt-4 active:opacity-85 ${disabled && busy !== 'email' ? 'opacity-60' : ''}`}>
              {busy === 'email' ? <ActivityIndicator color="white" /> : (
                <Text className="text-white font-bold text-base">{signin ? 'Sign in' : 'Create account'}</Text>
              )}
            </Pressable>

            {(googleOk || appleOk) && (
              <View className="flex-row items-center my-6">
                <View className="flex-1 h-px bg-line" />
                <Text className="text-ink-muted mx-3 text-xs">or continue with</Text>
                <View className="flex-1 h-px bg-line" />
              </View>
            )}

            {googleOk && (
              // Google identity branding: white surface, official four-colour "G", Roboto-weight label.
              <Pressable onPress={() => run('google', () => firebaseService.signInWithGoogle())} disabled={disabled}
                accessibilityRole="button" accessibilityLabel="Continue with Google" accessibilityState={{ busy: busy === 'google', disabled }}
                className={`flex-row items-center justify-center bg-white rounded-2xl h-[52px] active:opacity-85 ${disabled && busy !== 'google' ? 'opacity-60' : ''}`}
                style={{ borderWidth: 1, borderColor: isDark ? '#FFFFFF' : '#747775' }}>
                {busy === 'google' ? <ActivityIndicator color="#1F1F1F" /> : (
                  <>
                    <GoogleG />
                    <Text className="text-[#1F1F1F] font-semibold text-base ml-3">Continue with Google</Text>
                  </>
                )}
              </Pressable>
            )}

            {appleOk ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={16}
                style={{ height: 52, marginTop: googleOk ? 12 : 0, opacity: disabled ? 0.6 : 1 }}
                onPress={() => { if (!disabled) run('apple', () => firebaseService.signInWithApple()); }}
              />
            ) : null}

            <Pressable onPress={() => run('guest', () => firebaseService.signInAnonymously())} disabled={disabled}
              accessibilityRole="button" accessibilityLabel="Continue as guest" accessibilityHint="Use ClearMind without an account. Sign in later to sync."
              className="items-center justify-center h-12 mt-4">
              {busy === 'guest' ? <ActivityIndicator color={T.muted} /> : (
                <Text className="text-ink-muted text-sm font-medium">Continue as guest</Text>
              )}
            </Pressable>

            <View className="h-px bg-line mt-4" />
            <Pressable onPress={() => { setMode(signin ? 'signup' : 'signin'); setError(''); setNotice(''); }}
              accessibilityRole="button" className="items-center justify-center h-12 mt-2">
              <Text className="text-ink-muted text-sm">
                {signin ? 'New to ClearMind? ' : 'Already have an account? '}
                <Text className="text-accent font-semibold">{signin ? 'Create an account' : 'Sign in'}</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "ClearMind" in the logo's blue→violet gradient (same treatment as clearmindlogo.png). */
function Wordmark() {
  return (
    <Svg width={210} height={46} viewBox="0 0 210 46" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="cmWordmark" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#1E9BEF" />
          <Stop offset="1" stopColor="#7C3AED" />
        </LinearGradient>
      </Defs>
      <SvgText x="105" y="36" textAnchor="middle" fontSize="38" fontWeight="800" letterSpacing="-0.5" fill="url(#cmWordmark)">
        ClearMind
      </SvgText>
    </Svg>
  );
}

/** Official Google "G" mark (Google Identity branding guidelines). */
function GoogleG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}
