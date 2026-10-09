import { describe, it, expect } from 'vitest';
import { friendlyAuthError, isAuthCancel } from './authErrors';

describe('auth errors', () => {
  it('treats a closed Google account picker as a cancel, not an error', () => {
    expect(isAuthCancel({ code: 'SIGN_IN_CANCELLED' })).toBe(true);
    expect(isAuthCancel({ code: '12501' })).toBe(true);
    expect(isAuthCancel({ code: 'auth/invalid-credential' })).toBe(false);
  });

  it('maps DEVELOPER_ERROR (unregistered signing SHA-1) to an actionable message', () => {
    for (const e of [{ code: 10 }, { code: '10' }, { message: 'DEVELOPER_ERROR' }]) {
      const msg = friendlyAuthError(e);
      expect(msg).toMatch(/email or continue as guest/);
      expect(msg).not.toMatch(/SHA/);
    }
  });

  it('maps Firebase auth codes and falls back to the message', () => {
    expect(friendlyAuthError({ code: 'auth/invalid-credential' })).toBe('Wrong email or password.');
    expect(friendlyAuthError({ code: 'x', message: 'boom' })).toBe('boom');
    expect(friendlyAuthError({})).toBe('Something went wrong.');
  });
});
