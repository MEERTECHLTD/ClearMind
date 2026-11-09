import { describe, it, expect, vi, afterEach } from 'vitest';

// Only the account-deletion helpers are under test; no Firebase network calls.
vi.mock('firebase/auth', async (orig) => ({
  ...(await orig<typeof import('firebase/auth')>()),
  reauthenticateWithCredential: vi.fn(async () => ({})),
  revokeAccessToken: vi.fn(async () => {}),
}));
const fa = await import('firebase/auth');
const { firebaseService, RECENT_LOGIN_MS } = await import('./firebase');

const user = (providers: string[], extra: Record<string, unknown> = {}) => ({
  isAnonymous: providers.length === 0,
  email: providers.includes('password') ? 'someone@meertech.tech' : null,
  providerData: providers.map((providerId) => ({ providerId })),
  ...extra,
}) as any;

const tokenAged = (ms: number) => ({
  getIdTokenResult: vi.fn(async () => ({ issuedAtTime: new Date(1_800_000_000_000).toUTCString(), authTime: new Date(1_800_000_000_000 - ms).toUTCString() })),
});

afterEach(() => { delete (globalThis as any).window; vi.clearAllMocks(); });

describe('account deletion: recent sign-in check', () => {
  it('asks to confirm only when the sign-in is older than the window (server clock)', async () => {
    expect(await firebaseService.needsRecentLogin(user(['password'], tokenAged(30_000)))).toBe(false);
    expect(await firebaseService.needsRecentLogin(user(['password'], tokenAged(RECENT_LOGIN_MS + 60_000)))).toBe(true);
  });

  it('forces a fresh token so authTime is compared with the server time', async () => {
    const u = user(['google.com'], tokenAged(0));
    await firebaseService.needsRecentLogin(u);
    expect(u.getIdTokenResult).toHaveBeenCalledWith(true);
  });

  it('never asks a guest (no credential to confirm with)', async () => {
    expect(await firebaseService.needsRecentLogin(user([], tokenAged(24 * 3600_000)))).toBe(false);
  });
});

describe('account deletion: how the owner confirms', () => {
  it('password first, then the provider', () => {
    expect(firebaseService.reauthMethod(user(['password', 'google.com']))).toBe('password');
    expect(firebaseService.reauthMethod(user(['google.com']))).toBe('google');
    expect(firebaseService.reauthMethod(user(['github.com']))).toBe('github');
    expect(firebaseService.reauthMethod(user([]))).toBe(null);
  });

  it('Apple only where native Sign in with Apple exists (Mac App Store build)', () => {
    expect(firebaseService.reauthMethod(user(['apple.com']))).toBe(null);
    (globalThis as any).window = { clearmindDesktop: { appleSignInAvailable: true } };
    expect(firebaseService.reauthMethod(user(['apple.com']))).toBe('apple');
  });

  it('a password account needs the password, and nothing is sent without it', async () => {
    await expect(firebaseService.reauthenticate(user(['password']))).rejects.toMatchObject({ code: 'auth/missing-password' });
    expect(fa.reauthenticateWithCredential).not.toHaveBeenCalled();
    await firebaseService.reauthenticate(user(['password']), 'pw');
    expect(fa.reauthenticateWithCredential).toHaveBeenCalledTimes(1);
  });

  it('Apple: one sheet confirms the sign-in and its code revokes the Apple token', async () => {
    const appleSignIn = vi.fn(async () => ({ idToken: 'id', rawNonce: 'n', authorizationCode: 'code-1', email: '', givenName: '', familyName: '' }));
    (globalThis as any).window = { clearmindDesktop: { appleSignInAvailable: true, appleSignIn } };
    const u = user(['apple.com']);
    const { appleAuthorizationCode } = await firebaseService.reauthenticate(u);
    expect(appleAuthorizationCode).toBe('code-1');
    expect(appleSignIn).toHaveBeenCalledWith(false);
    await firebaseService.revokeAppleIfLinked(u, appleAuthorizationCode);
    expect(appleSignIn).toHaveBeenCalledTimes(1); // the code was reused, no second sheet
    expect(fa.revokeAccessToken).toHaveBeenCalledWith(expect.anything(), 'code-1');
  });
});
