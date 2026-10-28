'use strict';
// Guards the fix for the Mac App Store rejection of 24 Oct 2026 (guideline 2.4.5):
// the app must not ask for, or need, the incoming-network entitlement.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AUTH_SCHEME } = require('../src/authlink.cjs');

const desktop = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(desktop, p), 'utf8');
const stripComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '');

/** Top-level <key>…</key><true/> entries of a plist (all these plists are flat dicts). */
function trueKeys(xml) {
  const out = new Set();
  for (const m of stripComments(xml).matchAll(/<key>([^<]+)<\/key>\s*<true\s*\/>/g)) out.add(m[1].trim());
  return out;
}
const allKeys = (xml) => new Set([...stripComments(xml).matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1].trim()));

const PLISTS = ['build/entitlements.mas.plist', 'build/entitlements.mas.inherit.plist', 'build/entitlements.mac.plist'];

test('no entitlements file asks for network.server', () => {
  for (const p of PLISTS) {
    assert.ok(!allKeys(read(p)).has('com.apple.security.network.server'), `${p} must not contain com.apple.security.network.server`);
  }
});

test('the MAS app keeps the sandbox, outgoing network and its other entitlements', () => {
  const mas = trueKeys(read('build/entitlements.mas.plist'));
  for (const k of ['com.apple.security.app-sandbox', 'com.apple.security.network.client', 'com.apple.security.files.user-selected.read-write']) {
    assert.ok(mas.has(k), `MAS entitlements keep ${k}`);
  }
  assert.ok(allKeys(read('build/entitlements.mas.plist')).has('com.apple.developer.applesignin'));
  const inherit = trueKeys(read('build/entitlements.mas.inherit.plist'));
  assert.deepEqual([...inherit].sort(), ['com.apple.security.app-sandbox', 'com.apple.security.inherit']);
});

test('electron-builder points the MAS targets at these files and registers the sign-in scheme', () => {
  const yml = read('electron-builder.yml');
  for (const target of ['mas', 'masDev']) {
    const block = yml.split(new RegExp(`^${target}:\\s*$`, 'm'))[1]?.split(/^\S/m)[0] ?? '';
    assert.match(block, /entitlements: build\/entitlements\.mas\.plist/, `${target} entitlements`);
    assert.match(block, /entitlementsInherit: build\/entitlements\.mas\.inherit\.plist/, `${target} inherit`);
  }
  assert.match(yml, new RegExp(`^protocols:[\\s\\S]*?schemes:[\\s\\S]*?- ${AUTH_SCHEME}\\b`, 'm'));
});

test('the app code opens no listening socket', () => {
  const src = path.join(desktop, 'src');
  for (const f of fs.readdirSync(src)) {
    const code = fs.readFileSync(path.join(src, f), 'utf8');
    assert.doesNotMatch(code, /require\(['"](node:)?(http|https|net|dgram|http2)['"]\)/, `${f} imports a server module`);
    assert.doesNotMatch(code, /\b(createServer|\.listen\()/, `${f} starts a server`);
  }
  assert.ok(!fs.existsSync(path.join(src, 'server.cjs')), 'the loopback server is gone');
});
