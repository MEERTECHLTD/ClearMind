'use strict';
// The only surface the web app sees: window.clearmindDesktop (services/desktop.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clearmindDesktop', {
  platform: process.platform,
  version: (process.argv.find((a) => a.startsWith('--clearmind-version=')) ?? '').split('=')[1] ?? '',
  oauthSignIn: (provider) => ipcRenderer.invoke('clearmind:oauth', provider),
});
