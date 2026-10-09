/** Sign-in error handling shared by the auth screens (pure; unit-tested). */

/** The user backed out of the Google account picker — not an error. */
export const isAuthCancel = (e: any) => ['SIGN_IN_CANCELLED', '12501', '-5'].includes(String(e?.code ?? ''));

// Map Firebase / Google error codes to friendly messages.
export function friendlyAuthError(e: any): string {
  const code = e?.code ?? '';
  // DEVELOPER_ERROR (10): this build's signing certificate SHA-1 isn't registered
  // on the Firebase Android app (for Play installs: the Play App Signing key).
  // The detail goes to Diagnostics; users get something actionable.
  if (String(code) === '10' || /DEVELOPER_ERROR/i.test(e?.message ?? ''))
    return 'Google sign-in isn’t available in this version yet. Use email or continue as guest — your data syncs once you sign in.';
  if (String(code) === '7' || code === 'NETWORK_ERROR') return 'Network error — check your connection.';
  if (code === 'PLAY_SERVICES_NOT_AVAILABLE') return 'Google Play services is unavailable on this device. Use email instead.';
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
