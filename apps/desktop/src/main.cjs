'use strict';
/**
 * ClearMind for macOS — Electron main process. Wraps the existing web app (the
 * same React build as clearmind.meertech.tech) in a native window with macOS
 * menus, window-state memory and system-browser OAuth. See docs/MACOS.md.
 */
const { app, BrowserWindow, ipcMain, shell, nativeTheme, session, net } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createAppHandler } = require('./protocol.cjs');
const { AUTH_SCHEME, newAuthRequest, openAuthLink, isAuthLink } = require('./authlink.cjs');
const { buildMenu } = require('./menu.cjs');

// Native Sign in with Apple (native/apple_signin.mm). Only usable in a build
// signed with the Sign in with Apple entitlement — the Mac App Store build
// (process.mas) or a development build made with `npm run build:mas-dev`.
let appleAddon = null;
try { appleAddon = require('../native/build/apple_signin.node'); } catch { /* not built: no Apple button */ }
const APPLE_SIGN_IN = !!appleAddon?.isAvailable() && (!!process.mas || process.env.CLEARMIND_APPLE_SIGNIN === '1');

const DEV_URL = process.env.CLEARMIND_DEV_URL; // set by `npm run dev:mac` (Vite on :3000)
// The app origin. Nothing listens on this port: protocol.cjs answers it inside
// the process (no network.server entitlement). It stays the 1.0.0 origin
// because IndexedDB, localStorage and the Firebase session are stored per
// origin, so existing local data carries over untouched.
const PORT = Number(process.env.CLEARMIND_PORT ?? 47815);
const API_ORIGIN = process.env.CLEARMIND_API_ORIGIN ?? 'https://clearmind.meertech.tech';
// Where the system-browser sign-in page runs (the deployed web app). Dev: Vite.
const AUTH_ORIGIN = process.env.CLEARMIND_AUTH_ORIGIN ?? (DEV_URL ? new URL(DEV_URL).origin : API_ORIGIN);
const APP_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : `http://localhost:${PORT}`;
const WEB_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'build', 'web');
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

let mainWindow = null;
let quitting = false;
const pendingAuth = new Map(); // state -> { key, resolve, reject, timer }

// ------------------------------------------------------------------ window state

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadBounds() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
}
function saveBounds(win) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch { /* not fatal */ }
}

// ------------------------------------------------------------------ window

const isAppUrl = (url) => { try { return new URL(url).origin === APP_ORIGIN; } catch { return false; } };
function openExternal(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') shell.openExternal(url);
  } catch { /* ignore malformed */ }
}

function createWindow() {
  const saved = loadBounds();
  const win = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 820,
    x: saved?.x,
    y: saved?.y,
    minWidth: 900,
    minHeight: 600,
    title: 'ClearMind',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#05050A' : '#F3F4F6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      additionalArguments: [`--clearmind-version=${app.getVersion()}`, `--clearmind-apple=${APPLE_SIGN_IN ? 1 : 0}`],
    },
  });
  if (saved?.maximized) win.maximize();

  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    saveBounds(win);
    // macOS: closing the window keeps the app (and its state) alive in the Dock.
    // Windows has no Dock to reopen from, so closing the window quits there.
    if (!quitting && process.platform === 'darwin') { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { mainWindow = null; });

  // Links leave the app for the default browser; the app itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); openExternal(url); } });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3) return; // aborted (e.g. a hash change)
    win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage(desc, url))}`);
  });

  win.loadURL(`${APP_ORIGIN}/#today`);
  return win;
}

function errorPage(desc, url) {
  return `<!doctype html><meta charset="utf-8"><title>ClearMind</title>
<body style="font:15px -apple-system,system-ui;background:#05050A;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:420px;text-align:center"><h1 style="font-size:20px">ClearMind couldn't load</h1>
<p style="color:#9ca3af">${String(desc).replace(/[<>&]/g, '')} (${String(url).replace(/[<>&]/g, '')})</p>
<p style="color:#9ca3af">Choose View › Reload (⌘R) to try again.</p></div>`;
}

function showMainWindow() {
  if (!mainWindow) mainWindow = createWindow();
  else { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); }
  mainWindow.focus();
  return mainWindow;
}

// Run JavaScript in the page (menu actions drive the web app's own hash routes).
function inPage(js) {
  const win = showMainWindow();
  win.webContents.executeJavaScript(js).catch(() => {});
}

// ------------------------------------------------------------------ system-browser OAuth

// The browser page returns the credential sealed in a clearmind-desktop:// link
// (src/authlink.cjs); no local server is involved.
function startOAuth(provider) {
  let req;
  try { req = newAuthRequest(AUTH_ORIGIN, provider); } catch (e) { return Promise.reject(e); }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAuth.delete(req.state);
      reject(new Error('Sign-in timed out. Try again.'));
    }, OAUTH_TIMEOUT_MS);
    pendingAuth.set(req.state, { key: req.key, resolve, reject, timer });
    shell.openExternal(req.url).catch((e) => {
      clearTimeout(timer);
      pendingAuth.delete(req.state);
      reject(new Error(`Could not open your browser: ${e?.message ?? e}`));
    });
  });
}

function handleAuthLink(link) {
  try {
    const { state, result } = openAuthLink(link, (s) => pendingAuth.get(s)?.key);
    const p = pendingAuth.get(state);
    pendingAuth.delete(state); // one use only
    clearTimeout(p.timer);
    p.resolve(result);
  } catch (e) {
    console.warn(`[clearmind] sign-in link refused: ${e?.code ?? e?.message ?? e}`);
  }
  if (app.isReady()) showMainWindow(); // bring ClearMind back in front of the browser
}

// ------------------------------------------------------------------ app lifecycle

// Tests run against a throwaway profile.
if (process.env.CLEARMIND_USER_DATA) app.setPath('userData', process.env.CLEARMIND_USER_DATA);

// Packaged builds declare the scheme in Info.plist (electron-builder `protocols`).
// An unpackaged `electron .` registers itself so `npm run dev:mac` can sign in.
if (!app.isPackaged && !process.env.CLEARMIND_NO_SCHEME) {
  app.setAsDefaultProtocolClient(AUTH_SCHEME, process.execPath, [path.resolve(process.argv[1] ?? '.')]);
}
// macOS delivers the sign-in link here, also when it is what launches the app.
app.on('open-url', (e, url) => { if (isAuthLink(url)) { e.preventDefault(); handleAuthLink(url); } });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName('ClearMind');
  app.setAboutPanelOptions({
    applicationName: 'ClearMind',
    copyright: 'Built and licensed by Meertech LTD · meertech.tech',
    website: 'https://meertech.tech',
    iconPath: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.png'),
  });
  // Windows passes the sign-in link to a second instance on its command line.
  app.on('second-instance', (_e, argv) => {
    const link = argv.find(isAuthLink);
    if (link) handleAuthLink(link); else showMainWindow();
  });

  app.whenReady().then(async () => {
    if (!DEV_URL) {
      // Answer the app origin in-process (no socket). Every other http URL goes
      // to the network as before; https is not intercepted at all.
      const handler = createAppHandler({
        webRoot: WEB_ROOT,
        appOrigin: APP_ORIGIN,
        apiOrigin: API_ORIGIN,
        fetchImpl: (url, init) => net.fetch(url, { ...init, bypassCustomProtocolHandlers: true }),
        passthrough: (req) => net.fetch(req, { bypassCustomProtocolHandlers: true }),
      });
      session.defaultSession.protocol.handle('http', handler);
    }

    // Only what the web app uses: notifications and clipboard. No camera/mic/location.
    const allowed = new Set(['notifications', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen']);
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(isAppUrl(wc.getURL()) && allowed.has(perm)));
    session.defaultSession.setPermissionCheckHandler((wc, perm) => !!wc && isAppUrl(wc.getURL()) && allowed.has(perm));

    ipcMain.handle('clearmind:oauth', (_e, provider) => startOAuth(provider));
    ipcMain.handle('clearmind:apple', async (e, scopes) => {
      if (!APPLE_SIGN_IN) throw new Error('Sign in with Apple is not available in this build');
      const win = BrowserWindow.fromWebContents(e.sender) ?? showMainWindow();
      const rawNonce = crypto.randomBytes(32).toString('hex');
      const hashed = crypto.createHash('sha256').update(rawNonce).digest('hex');
      const r = await appleAddon.signIn(win.getNativeWindowHandle(), hashed, scopes !== false);
      return { idToken: r.identityToken, rawNonce, authorizationCode: r.authorizationCode, email: r.email, givenName: r.givenName, familyName: r.familyName };
    });

    buildMenu({
      navigate: (hash) => inPage(`location.hash = ${JSON.stringify(hash)}`),
      quickAdd: () => inPage(`window.dispatchEvent(new CustomEvent('clearmind:quick-add'))`),
      openExternal,
      apiOrigin: API_ORIGIN,
    });

    mainWindow = createWindow();
    app.on('activate', () => showMainWindow()); // Dock click / reopen
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (ev) => ev.preventDefault()); // no <webview> tags
  });
}
