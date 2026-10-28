'use strict';
/**
 * System-browser sign-in (Google, GitHub) without a local server.
 *
 *  1. The app makes a one-time `state` and a fresh 256-bit AES key, and opens
 *     the default browser on `<AUTH_ORIGIN>/desktop-auth?provider=..&state=..#k=<key>`.
 *     The key is in the URL fragment, so it is never sent to any server.
 *  2. That page (components/views/DesktopAuthBridge.tsx) runs the Firebase
 *     provider popup, seals the credential with AES-256-GCM (additional data =
 *     state) and opens `clearmind-desktop://auth?state=..&iv=..&ct=..`.
 *  3. macOS hands the link to the app (`open-url`), which looks up the key by
 *     state, decrypts, and resolves the pending sign-in once.
 *
 * Another program that registers the same URL scheme only ever sees ciphertext
 * it cannot open or forge (RFC 8252 §7.1 custom scheme, protected like PKCE).
 *
 * Pure Node (no Electron imports) so it is unit-tested with `node --test`.
 */
const crypto = require('node:crypto');

const AUTH_SCHEME = 'clearmind-desktop';
const PROVIDERS = new Set(['google.com', 'github.com']);
const MAX_LINK = 16 * 1024;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

class AuthLinkError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/** A new sign-in request: state, key and the browser URL to open. */
function newAuthRequest(authOrigin, provider) {
  if (provider !== 'google' && provider !== 'github') throw new AuthLinkError('Unsupported provider', 'provider');
  const state = crypto.randomBytes(24).toString('hex');
  const key = crypto.randomBytes(32);
  const url = `${new URL(authOrigin).origin}/desktop-auth?provider=${provider}&state=${state}#k=${b64url(key)}`;
  return { state, key, url };
}

/** True for any link meant for the sign-in callback (even a malformed one). */
const isAuthLink = (s) => typeof s === 'string' && s.toLowerCase().startsWith(`${AUTH_SCHEME}:`);

/**
 * Parse and open a callback link.
 * @param {string} link
 * @param {(state: string) => Buffer|undefined} keyFor  the key for a pending state
 * @returns {{ state: string, result: { providerId: string, idToken?: string, accessToken?: string } }}
 */
function openAuthLink(link, keyFor) {
  if (!isAuthLink(link) || link.length > MAX_LINK) throw new AuthLinkError('Not a ClearMind sign-in link', 'scheme');
  let url;
  try { url = new URL(link); } catch { throw new AuthLinkError('Malformed sign-in link', 'malformed'); }
  if (url.hostname !== 'auth') throw new AuthLinkError('Not a ClearMind sign-in link', 'scheme');
  const state = url.searchParams.get('state') ?? '';
  const iv = Buffer.from(url.searchParams.get('iv') ?? '', 'base64url');
  const ct = Buffer.from(url.searchParams.get('ct') ?? '', 'base64url');
  if (!/^[0-9a-f]{48}$/.test(state) || iv.length !== 12 || ct.length <= 16) throw new AuthLinkError('Malformed sign-in link', 'malformed');
  const key = keyFor(state);
  if (!key) throw new AuthLinkError('This sign-in request has expired. Start again from the ClearMind app.', 'expired');

  let plain;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAAD(Buffer.from(state, 'utf8'));
    d.setAuthTag(ct.subarray(ct.length - 16));
    plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8');
  } catch { throw new AuthLinkError('The sign-in link could not be verified.', 'tampered'); }

  let data;
  try { data = JSON.parse(plain); } catch { throw new AuthLinkError('The sign-in link could not be verified.', 'tampered'); }
  const str = (v) => (typeof v === 'string' && v ? v : undefined);
  const result = { providerId: data?.providerId, idToken: str(data?.idToken), accessToken: str(data?.accessToken) };
  if (!PROVIDERS.has(result.providerId) || (!result.idToken && !result.accessToken)) throw new AuthLinkError('Incomplete credential', 'incomplete');
  return { state, result };
}

module.exports = { AUTH_SCHEME, newAuthRequest, openAuthLink, isAuthLink, AuthLinkError };
