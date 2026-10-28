'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { newAuthRequest, openAuthLink, isAuthLink, AUTH_SCHEME } = require('../src/authlink.cjs');

// Same algorithm as services/desktopAuthSeal.ts (WebCrypto AES-GCM, AAD = state).
// services/desktopAuthSeal.test.ts runs the real browser module against this file.
async function seal(obj, state, key, iv = webcrypto.getRandomValues(new Uint8Array(12))) {
  const k = await webcrypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const ct = Buffer.from(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(state) }, k, Buffer.from(JSON.stringify(obj))));
  return `${AUTH_SCHEME}://auth?state=${state}&iv=${Buffer.from(iv).toString('base64url')}&ct=${ct.toString('base64url')}`;
}

test('the browser URL carries state in the query and the key only in the fragment', () => {
  const r = newAuthRequest('https://clearmind.meertech.tech/ignored/path', 'google');
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, 'https://clearmind.meertech.tech/desktop-auth');
  assert.equal(u.searchParams.get('provider'), 'google');
  assert.equal(u.searchParams.get('state'), r.state);
  assert.match(r.state, /^[0-9a-f]{48}$/);
  assert.equal(r.key.length, 32);
  assert.equal(u.hash, '#k=' + r.key.toString('base64url'));
  assert.ok(!u.search.includes(r.key.toString('base64url')));
  assert.notEqual(newAuthRequest('https://x.example', 'github').state, r.state);
  assert.throws(() => newAuthRequest('https://x.example', 'facebook'), /Unsupported/);
});

test('opens a sealed credential for the pending state', async () => {
  const r = newAuthRequest('https://x.example', 'github');
  const link = await seal({ providerId: 'github.com', accessToken: 'gho_x', extra: 'dropped' }, r.state, r.key);
  assert.ok(!link.includes('gho_x'));
  const out = openAuthLink(link, (s) => (s === r.state ? r.key : undefined));
  assert.equal(out.state, r.state);
  assert.deepEqual(out.result, { providerId: 'github.com', idToken: undefined, accessToken: 'gho_x' });
});

test('refuses unknown or expired state', async () => {
  const r = newAuthRequest('https://x.example', 'google');
  const link = await seal({ providerId: 'google.com', idToken: 'i' }, r.state, r.key);
  assert.throws(() => openAuthLink(link, () => undefined), (e) => e.code === 'expired');
});

test('refuses tampering, a wrong key, and a swapped state', async () => {
  const r = newAuthRequest('https://x.example', 'google');
  const link = await seal({ providerId: 'google.com', idToken: 'i' }, r.state, r.key);
  const u = new URL(link);
  const ct = Buffer.from(u.searchParams.get('ct'), 'base64url'); ct[0] ^= 1;
  u.searchParams.set('ct', ct.toString('base64url'));
  assert.throws(() => openAuthLink(u.toString(), () => r.key), (e) => e.code === 'tampered');
  assert.throws(() => openAuthLink(link, () => Buffer.alloc(32, 7)), (e) => e.code === 'tampered');
  const other = newAuthRequest('https://x.example', 'google');
  assert.throws(() => openAuthLink(link.replace(r.state, other.state), () => r.key), (e) => e.code === 'tampered');
});

test('refuses bad providers and empty credentials even when correctly sealed', async () => {
  const r = newAuthRequest('https://x.example', 'google');
  const keyFor = () => r.key;
  for (const body of [{ providerId: 'evil.com', idToken: 'i' }, { providerId: 'google.com' }, { providerId: 'google.com', idToken: 5 }]) {
    const link = await seal(body, r.state, r.key);
    assert.throws(() => openAuthLink(link, keyFor), (e) => e.code === 'incomplete', JSON.stringify(body));
  }
});

test('refuses other schemes, hosts and malformed links', () => {
  const keyFor = () => Buffer.alloc(32);
  for (const bad of ['https://auth?state=x', `${AUTH_SCHEME}://other?state=x`, `${AUTH_SCHEME}://auth?state=zz&iv=a&ct=b`, `${AUTH_SCHEME}://auth`, `${AUTH_SCHEME}://auth?` + 'a'.repeat(20000)]) {
    assert.throws(() => openAuthLink(bad, keyFor), bad.slice(0, 40));
  }
  assert.equal(isAuthLink('CLEARMIND-DESKTOP://auth'), true);
  assert.equal(isAuthLink('clearmind://auth'), false);
  assert.equal(isAuthLink(undefined), false);
});
