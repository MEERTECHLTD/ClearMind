import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { keyFromHash, sealDesktopCredential, DESKTOP_AUTH_SCHEME } from './desktopAuthSeal';

// The real app half (CommonJS, Node crypto): proves the browser and the app agree.
const require = createRequire(import.meta.url);
const { newAuthRequest, openAuthLink, AUTH_SCHEME } = require('../apps/desktop/src/authlink.cjs');

describe('desktop sign-in seal (browser half) against the app half', () => {
  it('uses the scheme the app registers', () => {
    expect(DESKTOP_AUTH_SCHEME).toBe(AUTH_SCHEME);
  });

  it('round-trips: the app opens what the page seals', async () => {
    const req = newAuthRequest('https://clearmind.meertech.tech', 'google');
    const hash = new URL(req.url).hash;
    const key = keyFromHash(hash)!;
    expect(Buffer.from(key).equals(req.key)).toBe(true);
    const link = await sealDesktopCredential({ providerId: 'google.com', idToken: 'id-tok', accessToken: 'acc-tok' }, req.state, key);
    expect(link.startsWith('clearmind-desktop://auth?')).toBe(true);
    expect(link).not.toContain('id-tok');
    const { state, result } = openAuthLink(link, (s: string) => (s === req.state ? req.key : undefined));
    expect(state).toBe(req.state);
    expect(result).toEqual({ providerId: 'google.com', idToken: 'id-tok', accessToken: 'acc-tok' });
  });

  it('a link sealed for one state cannot be replayed under another', async () => {
    const a = newAuthRequest('https://clearmind.meertech.tech', 'github');
    const b = newAuthRequest('https://clearmind.meertech.tech', 'github');
    const link = await sealDesktopCredential({ providerId: 'github.com', accessToken: 'gh' }, a.state, a.key);
    const swapped = link.replace(a.state, b.state);
    expect(() => openAuthLink(swapped, (s: string) => (s === b.state ? a.key : undefined))).toThrow(/could not be verified/);
  });

  it('rejects missing or malformed keys in the fragment', () => {
    expect(keyFromHash('')).toBeNull();
    expect(keyFromHash('#k=short')).toBeNull();
    expect(keyFromHash('#k=' + 'A'.repeat(43))).not.toBeNull();
  });
});
