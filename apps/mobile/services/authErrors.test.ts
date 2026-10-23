import { describe, it, expect } from 'vitest';
import { friendlyAuthError, isAuthCancel, isGoogleUnavailable } from './authErrors';

describe('auth errors', () => {
  it('treats a closed Google / Apple account sheet as a cancel, not an error', () => {
    expect(isAuthCancel({ code: 'SIGN_IN_CANCELLED' })).toBe(true);
    expect(isAuthCancel({ code: '12501' })).toBe(true);
    expect(isAuthCancel({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
    expect(isAuthCancel({ code: 'auth/invalid-credential' })).toBe(false);
  });

  it('flags build-level Google failures (unregistered SHA-1, missing client id) as unavailable', () => {
    for (const e of [{ code: 10 }, { code: '10' }, { message: 'DEVELOPER_ERROR' }, { code: 'GOOGLE_NOT_CONFIGURED' }]) {
      expect(isGoogleUnavailable(e)).toBe(true);
      const msg = friendlyAuthError(e, 'google');
      expect(msg).toMatch(/email or continue as guest/);
      expect(msg).not.toMatch(/SHA|version yet/);
    }
    expect(isGoogleUnavailable({ code: 'PLAY_SERVICES_NOT_AVAILABLE' })).toBe(true);
    expect(friendlyAuthError({ code: 'PLAY_SERVICES_NOT_AVAILABLE' }, 'google')).toMatch(/Play services/);
    expect(isGoogleUnavailable({ code: 'SIGN_IN_CANCELLED' })).toBe(false);
    expect(isGoogleUnavailable({ code: 'auth/network-request-failed' })).toBe(false);
  });

  it('does not report a rejected / expired Google token as a wrong password', () => {
    expect(friendlyAuthError({ code: 'auth/invalid-credential' }, 'google')).toMatch(/expired or couldn’t be verified/);
    expect(friendlyAuthError({ code: 'auth/user-token-expired' }, 'google')).toMatch(/expired/);
    expect(friendlyAuthError({ code: 'auth/invalid-credential' }, 'email')).toBe('Wrong email or password.');
  });

  it('explains account-linking conflicts and backend / network failures', () => {
    expect(friendlyAuthError({ code: 'auth/account-exists-with-different-credential' }, 'google')).toMatch(/already exists/);
    expect(friendlyAuthError({ code: 'auth/network-request-failed' }, 'google')).toMatch(/Network error/);
    expect(friendlyAuthError({ code: 'auth/user-disabled' }, 'google')).toMatch(/disabled/);
    expect(friendlyAuthError({ code: 'GOOGLE_NO_ID_TOKEN' }, 'google')).toMatch(/try again/);
  });

  it('maps Firebase auth codes and falls back to the message', () => {
    expect(friendlyAuthError({ code: 'x', message: 'boom' })).toBe('boom');
    expect(friendlyAuthError({})).toBe('Something went wrong.');
  });
});
