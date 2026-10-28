// Launches the real Electron app (unpackaged, or the built .app with
// CLEARMIND_APP=dist/mac-universal/ClearMind.app) and drives it with Playwright.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { _electron as electron } from 'playwright';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = '47899';
const profile = mkdtempSync(path.join(tmpdir(), 'cm-desktop-e2e-'));
let app, page;

before(async () => {
  const env = { ...process.env, CLEARMIND_PORT: PORT, CLEARMIND_USER_DATA: profile, CLEARMIND_NO_SCHEME: '1' };
  delete env.CLEARMIND_DEV_URL;
  const packaged = process.env.CLEARMIND_APP;
  app = packaged
    ? await electron.launch({ executablePath: path.join(path.resolve(desktop, packaged), 'Contents/MacOS/ClearMind'), env })
    : await electron.launch({ args: [desktop], cwd: desktop, env });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

after(async () => {
  await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  rmSync(profile, { recursive: true, force: true });
});

test('opens a sized, titled window on the local origin', async () => {
  const info = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const [minW, minH] = w.getMinimumSize();
    return { title: w.getTitle(), minW, minH, bounds: w.getBounds() };
  });
  assert.equal(info.minW, 900);
  assert.equal(info.minH, 600);
  assert.ok(info.bounds.width >= 900 && info.bounds.height >= 600);
  assert.equal(new URL(page.url()).origin, `http://localhost:${PORT}`);
  assert.match(await page.title(), /ClearMind/);
});

test('exposes only the desktop bridge (no Node in the page)', async () => {
  const r = await page.evaluate(() => ({
    bridge: typeof window.clearmindDesktop?.oauthSignIn,
    platform: window.clearmindDesktop?.platform,
    version: window.clearmindDesktop?.version,
    require: typeof window.require,
    process: typeof window.process,
  }));
  assert.equal(r.bridge, 'function');
  assert.equal(r.platform, 'darwin');
  assert.match(r.version, /^\d+\.\d+\.\d+/);
  assert.equal(r.require, 'undefined');
  assert.equal(r.process, 'undefined');
});

test('renders the app (sign-in or onboarding) with no page errors', async () => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await page.waitForSelector('#root *', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const text = await page.locator('body').innerText();
  assert.match(text, /ClearMind|Sign in|Welcome|Continue/i);
  assert.deepEqual(errors, []);
  const sw = await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0);
  assert.equal(sw, 0, 'no service worker in the desktop app');
});

test('Go menu and ⌘-shortcuts drive the hash routes', async () => {
  const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label));
  for (const l of ['File', 'Edit', 'Go', 'View', 'Window', 'Help']) assert.ok(labels.includes(l), `menu has ${l}`);
  await app.evaluate(({ Menu }) => {
    const go = Menu.getApplicationMenu().items.find((i) => i.label === 'Go');
    go.submenu.items.find((i) => i.label === 'Calendar').click();
  });
  await page.waitForFunction(() => location.hash === '#calendar');
  const accel = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().items.find((i) => i.label === 'Go').submenu.items.find((i) => i.label === 'Today').accelerator);
  assert.equal(accel, 'CmdOrCtrl+1');
});

test('nothing listens on a socket (no network.server needed)', async () => {
  const pids = [app.process().pid];
  let out = '';
  try {
    out = execFileSync('/usr/sbin/lsof', ['-nP', '-a', '-p', pids.join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
  } catch (e) { out = e.stdout ?? ''; } // lsof exits 1 when nothing matches
  // Playwright itself opens the Node inspector and the DevTools port to drive the
  // app; both answer /json/version. Any other listener would be the app's own.
  const ports = [...out.matchAll(/TCP [^:]+:(\d+) \(LISTEN\)/g)].map((m) => m[1]);
  for (const p of ports) {
    const ok = await fetch(`http://127.0.0.1:${p}/json/version`).then((r) => r.ok, () => false);
    assert.ok(ok, `port ${p} is not a debugger endpoint, so the app opened it:\n${out}`);
  }
  assert.ok(ports.length <= 2, out);
  // And the port is free on the machine: the origin is answered in-process.
  let port = '';
  try { port = execFileSync('/usr/sbin/lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' }); } catch (e) { port = e.stdout ?? ''; }
  assert.equal(port.trim(), '');
});

test('in-process handler forwards the API to production', async () => {
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/v1/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return { status: res.status, body: await res.text() };
  });
  // Unauthenticated → the real API answers 401 (proves the round trip, no fake data).
  assert.equal(r.status, 401, r.body);
});

test('the system-browser sign-in page is served and wired to Firebase', async () => {
  // In real use this page opens in Safari/Chrome; here a second window loads it.
  const opened = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }, url) => { new BrowserWindow({ show: false }).loadURL(url); },
    `http://localhost:${PORT}/desktop-auth?provider=google&state=${'a'.repeat(48)}#k=${'A'.repeat(43)}`);
  const p = await opened;
  const button = p.getByRole('button', { name: /Continue with Google/ });
  await button.waitFor({ timeout: 15000 });
  assert.equal(await button.isEnabled(), true);
  await p.close();
});

test('system-browser sign-in: browser URL out, sealed clearmind-desktop:// link back', async () => {
  // Stand in for the browser: capture the URL the app opens instead of opening it.
  await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
  const pending = page.evaluate(() => window.clearmindDesktop.oauthSignIn('github'));
  let opened;
  for (let i = 0; i < 50 && !opened; i++) { opened = (await app.evaluate(() => globalThis.__opened))[0]; if (!opened) await new Promise((r) => setTimeout(r, 100)); }
  const u = new URL(opened);
  assert.equal(u.origin + u.pathname, 'https://clearmind.meertech.tech/desktop-auth');
  const state = u.searchParams.get('state');
  const key = Buffer.from(u.hash.slice(3), 'base64url');

  const seal = async (obj, st) => {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const k = await webcrypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
    const ct = Buffer.from(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(st) }, k, Buffer.from(JSON.stringify(obj))));
    return `clearmind-desktop://auth?state=${st}&iv=${Buffer.from(iv).toString('base64url')}&ct=${ct.toString('base64url')}`;
  };
  const emit = (link) => app.evaluate(({ app }, l) => app.emit('open-url', { preventDefault() {} }, l), link);
  await emit(await seal({ providerId: 'github.com', accessToken: 'forged' }, 'b'.repeat(48))); // unknown state: ignored
  await emit(await seal({ providerId: 'github.com', accessToken: 'gho_test' }, state));
  assert.deepEqual(await pending, { providerId: 'github.com', idToken: undefined, accessToken: 'gho_test' });
  // One use only: a replay of the same state is refused (the promise already settled).
  const pending2 = page.evaluate(() => window.clearmindDesktop.oauthSignIn('google').then(() => 'resolved', (e) => e.message));
  await emit(await seal({ providerId: 'github.com', accessToken: 'again' }, state));
  const raced = await Promise.race([pending2, new Promise((r) => setTimeout(() => r('still pending'), 500))]);
  assert.equal(raced, 'still pending');
});

test('closing the window keeps the app alive; activate reopens it', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  const hidden = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.isVisible()));
  assert.deepEqual(hidden, [false]);
  await app.evaluate(({ app }) => app.emit('activate'));
  const shown = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
  assert.equal(shown, true);
});
