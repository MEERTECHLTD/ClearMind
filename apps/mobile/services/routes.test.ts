/**
 * Navigation integrity: every in-app link ('/(app)/…') must resolve to a real
 * expo-router route file, and every (app) route must be registered with the
 * tab navigator (as a tab or hidden), so a refactor can't leave a dead button
 * or an orphaned screen.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app', '(app)');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

/** Route names relative to app/(app), e.g. 'today', 'project/[id]', 'settings/index'. */
const routes = walk(APP)
  .filter((f) => !f.endsWith('_layout.tsx'))
  .map((f) => path.relative(APP, f).replace(/\.(tsx?|jsx?)$/, '').split(path.sep).join('/'));

function resolves(href: string): boolean {
  // An interpolation glued to a segment ('activity${q}') only adds a query string.
  const clean = href.replace(/([^/])\$\{.*$/, '$1').split('?')[0].replace(/\/$/, '');
  const segs = clean.split('/').filter(Boolean);
  return routes.some((r) => {
    const rs = r.split('/');
    const cand = rs[rs.length - 1] === 'index' ? rs.slice(0, -1) : rs;
    if (cand.length !== segs.length) return false;
    return cand.every((s, i) => s === segs[i] || /^\[.+\]$/.test(s) || segs[i].startsWith('${'));
  });
}

describe('mobile navigation', () => {
  const sources = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'services')), ...walk(path.join(ROOT, 'widgets'))];
  const links = new Set<string>();
  for (const f of sources) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/['"`]\/\(app\)\/([^'"`]*)['"`]/g)) links.add(m[1]);
  }

  it('finds links to check', () => {
    expect(links.size).toBeGreaterThan(20);
  });

  it('every /(app)/… link resolves to a route file', () => {
    const dead = [...links].filter((l) => l && !resolves(l));
    expect(dead).toEqual([]);
  });

  it('every (app) route is registered with the tab navigator', () => {
    const layout = fs.readFileSync(path.join(APP, '_layout.tsx'), 'utf8');
    const registered = new Set([
      ...[...layout.matchAll(/'([a-z0-9\-/[\]]+)'/gi)].map((m) => m[1]),
      ...[...layout.matchAll(/^\s+([a-z]+): \{ title:/gim)].map((m) => m[1]), // TAB_DEFS keys
    ]);
    const missing = routes.filter((r) => !registered.has(r));
    expect(missing).toEqual([]);
  });
});
