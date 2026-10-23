'use strict';
/**
 * ClearMind for macOS — Electron main process. Wraps the existing web app (the
 * same React build as clearmind.meertech.tech) in a native window with macOS
 * menus, window-state memory and system-browser OAuth. See docs/MACOS.md.
 */
const { app, BrowserWindow, ipcMain, shell, nativeTheme, dialog, session } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createAppServer, listen } = require('./server.cjs');
const { buildMenu } = require('./menu.cjs');

const DEV_URL = process.env.CLEARMIND_DEV_URL; // set by `npm run dev:mac` (Vite on :3000)
// Fixed ports: the origin (and with it the local data and Firebase session) must
// not change between launches. Dev uses its own port so both can run at once.
const PORT = Number(process.env.CLEARMIND_PORT ?? (DEV_URL ? 47816 : 47815));
const API_ORIGIN = process.env.CLEARMIND_API_ORIGIN ?? 'https://clearmind.meertech.tech';
const APP_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : `http://localhost:${PORT}`;
const WEB_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'build', 'web');
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

let mainWindow = null;
let quitting = false;
const pendingAuth = new Map(); // state -> { resolve, reject, timer }

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
      additionalArguments: [`--clearmind-version=${app.getVersion()}`],
    },
  });
  if (saved?.maximized) win.maximize();

  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    saveBounds(win);
    // macOS: closing the window keeps the app (and its state) alive in the Dock.
    if (!quitting) { e.preventDefault(); win.hide(); }
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
<p style="color:#9ca3af">${String(desc).replace(/[<>&]/g, '')} — ${String(url).replace(/[<>&]/g, '')}</p>
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

function startOAuth(provider) {
  if (provider !== 'google' && provider !== 'github') return Promise.reject(new Error('Unsupported provider'));
  const state = crypto.randomBytes(24).toString('hex');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAuth.delete(state);
      reject(new Error('Sign-in timed out. Try again.'));
    }, OAUTH_TIMEOUT_MS);
    pendingAuth.set(state, { resolve, reject, timer });
    shell.openExternal(`${APP_ORIGIN}/desktop-auth?provider=${provider}&state=${state}`);
  });
}

function completeOAuth(state, result) {
  const p = pendingAuth.get(state);
  if (!p) return false;
  pendingAuth.delete(state);
  clearTimeout(p.timer);
  p.resolve(result);
  showMainWindow(); // bring ClearMind back in front of the browser
  return true;
}

// ------------------------------------------------------------------ app lifecycle

// Tests run against a throwaway profile.
if (process.env.CLEARMIND_USER_DATA) app.setPath('userData', process.env.CLEARMIND_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName('ClearMind');
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(async () => {
    const server = createAppServer({
      webRoot: DEV_URL ? null : WEB_ROOT,
      apiOrigin: API_ORIGIN,
      onAuthComplete: completeOAuth,
      allowedOrigins: [APP_ORIGIN],
    });
    try {
      await listen(server, PORT);
    } catch (e) {
      dialog.showErrorBox('ClearMind could not start', `${e.message}\n\nClearMind keeps its data on http://localhost:${PORT}. Quit the other program using that port and open ClearMind again.`);
      app.exit(1);
      return;
    }

    // Only what the web app uses: notifications and clipboard. No camera/mic/location.
    const allowed = new Set(['notifications', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen']);
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(isAppUrl(wc.getURL()) && allowed.has(perm)));
    session.defaultSession.setPermissionCheckHandler((wc, perm) => !!wc && isAppUrl(wc.getURL()) && allowed.has(perm));

    ipcMain.handle('clearmind:oauth', (_e, provider) => startOAuth(provider));

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
