/**
 * The macOS desktop shell (apps/desktop, Electron) exposes `window.clearmindDesktop`
 * from its preload script. The web app checks for it to switch off browser-only
 * plumbing (service worker, PWA install, Web Speech) and to sign in with
 * Google/GitHub through the system browser — Google refuses OAuth inside
 * embedded webviews. See docs/MACOS.md.
 */
export type DesktopOAuthResult = { providerId: 'google.com' | 'github.com'; idToken?: string; accessToken?: string };

export interface ClearMindDesktop {
  platform: 'darwin' | string;
  version: string;
  /** Opens the default browser on the loopback sign-in page and resolves with the provider credential. */
  oauthSignIn(provider: 'google' | 'github'): Promise<DesktopOAuthResult>;
}

declare global {
  interface Window { clearmindDesktop?: ClearMindDesktop }
}

export const desktop = (): ClearMindDesktop | null =>
  (typeof window !== 'undefined' && window.clearmindDesktop) || null;

export const isDesktop = (): boolean => !!desktop();
