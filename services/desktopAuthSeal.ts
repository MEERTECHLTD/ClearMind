/**
 * Browser half of the macOS app's system-browser sign-in (the app half is
 * apps/desktop/src/authlink.cjs). The desktop app opens /desktop-auth with a
 * one-time `state` and an AES-256 key in the URL fragment (never sent to a
 * server). After the provider popup, the credential is sealed with AES-256-GCM
 * (additional data = state) and handed back on a clearmind-desktop:// link, so
 * any other program registered for that scheme sees only ciphertext.
 */
export const DESKTOP_AUTH_SCHEME = 'clearmind-desktop';

export type DesktopCredential = { providerId: string; idToken?: string; accessToken?: string };

const b64urlToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const bytesToB64url = (b: Uint8Array): string => {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The key from the page's `#k=` fragment, or null if missing/invalid. */
export function keyFromHash(hash: string): Uint8Array | null {
  const k = new URLSearchParams(hash.replace(/^#/, '')).get('k');
  if (!k || !/^[A-Za-z0-9_-]{43}$/.test(k)) return null;
  const bytes = b64urlToBytes(k);
  return bytes.length === 32 ? bytes : null;
}

/** Seal the credential into the clearmind-desktop:// link the app accepts. */
export async function sealDesktopCredential(
  cred: DesktopCredential,
  state: string,
  key: Uint8Array,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
  iv: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(12)),
): Promise<string> {
  const k = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const body = new TextEncoder().encode(JSON.stringify({ providerId: cred.providerId, idToken: cred.idToken, accessToken: cred.accessToken }));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(state) }, k, body));
  const q = new URLSearchParams({ state, iv: bytesToB64url(iv), ct: bytesToB64url(ct) });
  return `${DESKTOP_AUTH_SCHEME}://auth?${q.toString()}`;
}
