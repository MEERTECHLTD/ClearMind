/**
 * The macOS desktop shell (apps/desktop, Electron) exposes `window.clearmindDesktop`
 * from its preload script. The web app checks for it to switch off browser-only
 * plumbing (service worker, PWA install, Web Speech) and to sign in with
 * Google/GitHub through the system browser — Google refuses OAuth inside
 * embedded webviews. See docs/MACOS.md.
 */
export type DesktopOAuthResult = { providerId: 'google.com' | 'github.com'; idToken?: string; accessToken?: string };
/** Native Sign in with Apple (AuthenticationServices) — App Store build only. */
export type DesktopAppleResult = { idToken: string; rawNonce: string; authorizationCode: string; email: string; givenName: string; familyName: string };

export interface ClearMindDesktop {
  platform: 'darwin' | string;
  version: string;
  /** Opens the default browser on the loopback sign-in page and resolves with the provider credential. */
  oauthSignIn(provider: 'google' | 'github'): Promise<DesktopOAuthResult>;
  /** True when this build can run native Sign in with Apple (signed with the entitlement). */
  appleSignInAvailable: boolean;
  /** `scopes: false` re-authorizes without asking for name/email (used before revoking). */
  appleSignIn(scopes?: boolean): Promise<DesktopAppleResult>;
}

declare global {
  interface Window { clearmindDesktop?: ClearMindDesktop }
}

export const desktop = (): ClearMindDesktop | null =>
  (typeof window !== 'undefined' && window.clearmindDesktop) || null;

export const isDesktop = (): boolean => !!desktop();
