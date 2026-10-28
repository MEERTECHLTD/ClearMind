// `npm run dev:mac`: Vite (hot reload) on :3000 + Electron pointed at it.
// No local server: the sign-in page runs on Vite and returns via clearmind-desktop://.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(desktop, '../..');
const URL = 'http://localhost:3000';
const env = { ...process.env, CLEARMIND_DESKTOP_DEV: '1' };

const vite = spawn('npx', ['vite', '--port', '3000', '--strictPort'], { cwd: repo, env, stdio: 'inherit' });

async function waitForVite() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(URL)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite did not start on :3000');
}

await waitForVite();
const electron = spawn('npx', ['electron', '.'], { cwd: desktop, env: { ...env, CLEARMIND_DEV_URL: URL }, stdio: 'inherit' });
const stop = () => { vite.kill(); electron.kill(); };
electron.on('exit', (code) => { vite.kill(); process.exit(code ?? 0); });
vite.on('exit', (code) => { electron.kill(); process.exit(code ?? 1); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
