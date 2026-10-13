import { describe, it, expect, vi, beforeEach } from 'vitest';

// The Google sign-in flow in firebaseService, with the native module and Firebase mocked.
const g = vi.hoisted(() => ({
  configure: vi.fn(), hasPlayServices: vi.fn(), signIn: vi.fn(),
  signInWithCredential: vi.fn(), credential: vi.fn((t: string) => ({ providerId: 'google.com', idToken: t })),
  getDoc: vi.fn(), setDoc: vi.fn(), webClientId: 'web-client.apps.googleusercontent.com', os: 'android',
}));

vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: g.configure, hasPlayServices: g.hasPlayServices, signIn: g.signIn },
}));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: g.credential }, OAuthProvider: vi.fn(),
  signInWithCredential: g.signInWithCredential, onAuthStateChanged: vi.fn(), createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(), sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(),
  signInAnonymously: vi.fn(), revokeAccessToken: vi.fn(), signOut: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), getDoc: g.getDoc, setDoc: g.setDoc, serverTimestamp: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { get OS() { return g.os; } } }));
vi.mock('expo-apple-authentication', () => ({}));
vi.mock('expo-crypto', () => ({}));
vi.mock('@clearmind/shared/data/firestore', () => ({}));
vi.mock('../lib/firebase', () => ({ auth: {}, db: {}, isFirebaseConfigured: true }));
vi.mock('../lib/config', () => ({ get googleWebClientId() { return g.webClientId; } }));

const user = { uid: 'u1', email: 'a@b.com', displayName: 'Ada', photoURL: null };

describe('signInWithGoogle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    g.os = 'android';
    g.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'tok', user: {} } });
    g.signInWithCredential.mockResolvedValue({ user });
    g.getDoc.mockResolvedValue({ exists: () => false });
  });
  const load = async () => (await import('./firebaseService')).firebaseService;

  it('exchanges the Google ID token with Firebase and creates the profile for a new user', async () => {
    const fs = await load();
    const res = await fs.signInWithGoogle();
    expect(g.configure).toHaveBeenCalledWith(expect.objectContaining({ webClientId: g.webClientId }));
    expect(g.hasPlayServices).toHaveBeenCalled();
    expect(g.credential).toHaveBeenCalledWith('tok');
    expect(g.signInWithCredential).toHaveBeenCalledWith({}, { providerId: 'google.com', idToken: 'tok' });
    expect(g.setDoc).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ uid: 'u1', provider: 'google' });
  });

  it('keeps an existing user profile', async () => {
    g.getDoc.mockResolvedValue({ exists: () => true });
    await (await load()).signInWithGoogle();
    expect(g.setDoc).not.toHaveBeenCalled();
  });

  it('skips the Play services check on iOS', async () => {
    g.os = 'ios';
    await (await load()).signInWithGoogle();
    expect(g.hasPlayServices).not.toHaveBeenCalled();
  });

  it('reports a closed account picker as a cancel and never touches Firebase', async () => {
    g.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    await expect((await load()).signInWithGoogle()).rejects.toMatchObject({ code: 'SIGN_IN_CANCELLED' });
    expect(g.signInWithCredential).not.toHaveBeenCalled();
  });

  it('fails clearly when Google returns no ID token', async () => {
    g.signIn.mockResolvedValue({ type: 'success', data: { idToken: null } });
    await expect((await load()).signInWithGoogle()).rejects.toMatchObject({ code: 'GOOGLE_NO_ID_TOKEN' });
    expect(g.signInWithCredential).not.toHaveBeenCalled();
  });

  it('propagates a Firebase rejection of the token (expired / invalid) without creating a profile', async () => {
    g.signInWithCredential.mockRejectedValue(Object.assign(new Error('bad'), { code: 'auth/invalid-credential' }));
    await expect((await load()).signInWithGoogle()).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(g.setDoc).not.toHaveBeenCalled();
  });

  it('propagates DEVELOPER_ERROR from the native module', async () => {
    g.signIn.mockRejectedValue(Object.assign(new Error('DEVELOPER_ERROR'), { code: '10' }));
    await expect((await load()).signInWithGoogle()).rejects.toMatchObject({ code: '10' });
  });

  it('refuses to start without a web client id', async () => {
    g.webClientId = '';
    try {
      await expect((await load()).signInWithGoogle()).rejects.toMatchObject({ code: 'GOOGLE_NOT_CONFIGURED' });
      expect(g.signIn).not.toHaveBeenCalled();
    } finally { g.webClientId = 'web-client.apps.googleusercontent.com'; }
  });
});
