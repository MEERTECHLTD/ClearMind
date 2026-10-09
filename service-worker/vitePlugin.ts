/**
 * Emits dist/sw.js from service-worker/sw.js at build time, prefixed with the
 * build id and the app-shell precache list taken from the Rollup bundle:
 * index.html, the entry chunk(s), their static imports and CSS, and the PWA
 * icons. The build id is a hash of every emitted file name (+ index.html), so
 * any change to the app produces a new sw.js and the browser sees an update.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin, Rollup } from 'vite';

type OutputBundle = Rollup.OutputBundle;
type OutputChunk = Rollup.OutputChunk;

const PUBLIC_PRECACHE = [
  '/manifest.json',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/clearmindlogo-256.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
];

export function appShell(bundle: OutputBundle): string[] {
  const shell = new Set<string>();
  const visit = (fileName: string) => {
    if (shell.has(fileName)) return;
    const item = bundle[fileName];
    if (!item) return;
    shell.add(fileName);
    if (item.type === 'chunk') {
      item.imports.forEach(visit);
      const css = (item as OutputChunk & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata?.importedCss;
      css?.forEach((f) => shell.add(f));
    }
  };
  for (const item of Object.values(bundle)) {
    if (item.type === 'chunk' && item.isEntry) visit(item.fileName);
  }
  return [...shell].sort().map((f) => `/${f}`);
}

export function serviceWorkerPlugin(): Plugin {
  return {
    name: 'clearmind-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const template = fs.readFileSync(path.resolve(__dirname, 'sw.js'), 'utf8');
      const files = Object.keys(bundle).filter((f) => f !== 'sw.js').sort();
      const hash = createHash('sha256').update(files.join('\n'));
      const html = bundle['index.html'];
      if (html && html.type === 'asset') hash.update(String(html.source));
      const id = hash.digest('hex').slice(0, 12);
      const precache = ['/index.html', ...appShell(bundle), ...PUBLIC_PRECACHE];
      const header = `self.__CM_BUILD__ = ${JSON.stringify({ id, precache })};\n`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: header + template });
    },
  };
}
