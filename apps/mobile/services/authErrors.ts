/** Sign-in error handling shared by the auth screens (pure; unit-tested). */

export type AuthMethod = 'email' | 'google' | 'apple' | 'guest';

/** The user backed out of the Google / Apple account sheet — not an error. */
export const isAuthCancel = (e: any) =>
  ['SIGN_IN_CANCELLED', '12501', '-5', 'ERR_REQUEST_CANCELED'].includes(String(e?.code ?? ''));

/**
 * Google rejected this *build* rather than the user: DEVELOPER_ERROR (10) means the
 * signing certificate's SHA-1 isn't registered on the Firebase Android app (for Play
 * installs: the Play App Signing key — see scripts/register-android-sha.sh),
 * GOOGLE_NOT_CONFIGURED means the build shipped without a web client id, and a device
 * without Google Play services can't run it at all. Retrying can't help, so the
 * screen hides the Google button for the session.
 */
export const isGoogleUnavailable = (e: any) =>
  String(e?.code ?? '') === '10' || e?.code === 'GOOGLE_NOT_CONFIGURED' || e?.code === 'PLAY_SERVICES_NOT_AVAILABLE' || /DEVELOPER_ERROR/i.test(e?.message ?? '');

// Map Firebase / Google / Apple error codes to friendly, non-sensitive messages.
export function friendlyAuthError(e: any, method: AuthMethod = 'email'): string {
  const code = String(e?.code ?? '');
  if (code === 'PLAY_SERVICES_NOT_AVAILABLE') return 'Google Play services is unavailable on this device. Use email instead.';
  if (isGoogleUnavailable(e))
    return 'Google sign-in couldn’t be verified for this copy of the app. Sign in with email or continue as guest for now.';
  if (code === '7' || code === 'NETWORK_ERROR' || code === 'auth/network-request-failed')
    return 'Network error — check your connection and try again.';
  if (code === 'IN_PROGRESS') return 'Sign-in is already in progress.';
  if (code === 'GOOGLE_NO_ID_TOKEN') return 'Google didn’t return your account details. Please try again.';
  // A Google / Apple token Firebase rejected (expired, revoked, wrong audience)
  // is not a wrong password.
  if (method !== 'email' && (code === 'auth/invalid-credential' || code === 'auth/user-token-expired'))
    return 'That sign-in expired or couldn’t be verified. Please try again.';
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong password.',
    'auth/user-not-found': 'No account with that email.',
    'auth/email-already-in-use': 'That email is already registered — sign in instead.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/user-token-expired': 'Your session expired. Please sign in again.',
    'auth/operation-not-allowed': 'This sign-in method isn’t enabled. Use email instead.',
    'auth/account-exists-with-different-credential':
      'An account with this email already exists. Sign in with the method you used before (e.g. email and password).',
  };
  return map[code] ?? (e?.message ? String(e.message) : 'Something went wrong.');
}
