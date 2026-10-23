// Launches the real Electron app (unpackaged, or the built .app with
// CLEARMIND_APP=dist/mac-universal/ClearMind.app) and drives it with Playwright.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = '47899';
const profile = mkdtempSync(path.join(tmpdir(), 'cm-desktop-e2e-'));
let app, page;

before(async () => {
  const env = { ...process.env, CLEARMIND_PORT: PORT, CLEARMIND_USER_DATA: profile };
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

test('local server forwards the API to production', async () => {
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
    `http://localhost:${PORT}/desktop-auth?provider=google&state=test`);
  const p = await opened;
  await p.getByRole('button', { name: /Continue with Google/ }).waitFor({ timeout: 15000 });
  await p.close();
});

test('closing the window keeps the app alive; activate reopens it', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  const hidden = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.isVisible()));
  assert.deepEqual(hidden, [false]);
  await app.evaluate(({ app }) => app.emit('activate'));
  const shown = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
  assert.equal(shown, true);
});
