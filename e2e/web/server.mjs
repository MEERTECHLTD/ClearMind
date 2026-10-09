/**
 * Tiny static server for the web e2e suite that behaves like Vercel does for
 * this project:
 *
 *   1. a file that exists in the build output is served as-is (filesystem first);
 *   2. otherwise the `rewrites` from vercel.json are applied in order (only
 *      rewrites to static files are emulated; /api/* functions return 501);
 *   3. otherwise 404;
 *   4. the `headers` rules from vercel.json are applied to every response.
 *
 * It can also simulate a deploy: `POST /__e2e/deploy` renames every hashed file
 * under /assets (and rewrites all references to it), exactly like a new build
 * with new chunk hashes. Old chunk URLs then stop existing, which is what an
 * already-open tab experiences after a real deploy. `POST /__e2e/reset` goes
 * back to the original build.
 *
 * Env: E2E_DIST (default ./dist), E2E_VERCEL_JSON (default ./vercel.json),
 *      E2E_PORT (default 4173).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const root = process.cwd();
const distDir = path.resolve(root, process.env.E2E_DIST || 'dist');
const vercelPath = path.resolve(root, process.env.E2E_VERCEL_JSON || 'vercel.json');
const port = Number(process.env.E2E_PORT || 4173);

const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.map', '.txt']);

/** Vercel `source` (path-to-regexp) -> RegExp, for the subset this repo uses. */
function toRegExp(source) {
  const body = source
    .replace(/:(\w+)\*/g, '(.*)')
    .replace(/:(\w+)/g, '([^/]+)');
  return new RegExp(`^${body}$`);
}
const rewrites = (vercel.rewrites || []).map((r) => ({ ...r, re: toRegExp(r.source) }));
const headerRules = (vercel.headers || []).map((h) => ({ ...h, re: toRegExp(h.source) }));

// ---------------------------------------------------------------- build files
function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${base}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}
const original = new Map(walk(distDir).map((p) => [p, fs.readFileSync(path.join(distDir, p))]));

let generation = 0;
let files = original;

/** Build the file table for a simulated deploy: every /assets/* file gets a new name. */
function buildGeneration(gen) {
  if (gen === 0) return original;
  const renames = new Map();
  for (const p of original.keys()) {
    if (!p.startsWith('/assets/')) continue;
    const base = p.slice('/assets/'.length);
    const dot = base.indexOf('.');
    renames.set(base, `${base.slice(0, dot)}g${gen}${base.slice(dot)}`);
  }
  const names = [...renames.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(names.join('|'), 'g');
  const next = new Map();
  for (const [p, buf] of original) {
    const ext = path.extname(p);
    let body = TEXT.has(ext) ? Buffer.from(buf.toString('utf8').replace(re, (m) => renames.get(m))) : buf;
    // A real new build also gets a new service-worker build id (see service-worker/vitePlugin.ts).
    if (p === '/sw.js') {
      body = Buffer.from(body.toString('utf8').replace(/("id":")([0-9a-f]{12})(")/, (_, a, id, b) => a + createHash('sha256').update(`${id}:${gen}`).digest('hex').slice(0, 12) + b));
    }
    const np = p.startsWith('/assets/') ? `/assets/${renames.get(p.slice('/assets/'.length))}` : p;
    next.set(np, body);
  }
  return next;
}

const gzipCache = new WeakMap();
/** gzip text responses like Vercel does, so timings/sizes are realistic. */
function compress(req, body, type, headers) {
  if (!/gzip/.test(req.headers['accept-encoding'] || '') || !/text|javascript|json|svg/.test(type) || body.length < 1024) return body;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  let gz = gzipCache.get(buf);
  if (!gz) { gz = zlib.gzipSync(buf, { level: 6 }); gzipCache.set(buf, gz); }
  headers['content-encoding'] = 'gzip';
  headers.vary = 'Accept-Encoding';
  return gz;
}

function send(res, reqPath, status, body, type) {
  const headers = { 'content-type': type };
  for (const rule of headerRules) {
    if (rule.re.test(reqPath)) for (const { key, value } of rule.headers) headers[key.toLowerCase()] = value;
  }
  const out = compress(res.req, body, type, headers);
  res.writeHead(status, headers);
  res.end(out);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);

  if (p === '/__e2e/deploy') {
    generation += 1;
    files = buildGeneration(generation);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ generation }));
  }
  if (p === '/__e2e/reset') {
    generation = 0;
    files = original;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ generation }));
  }

  // 1. filesystem
  const direct = p.endsWith('/') ? `${p}index.html` : p;
  if (files.has(direct)) {
    return send(res, p, 200, files.get(direct), TYPES[path.extname(direct)] || 'application/octet-stream');
  }
  // 2. rewrites
  for (const r of rewrites) {
    if (!r.re.test(p)) continue;
    const dest = r.destination.split('?')[0];
    if (dest.startsWith('/api/')) {
      return send(res, p, 501, 'serverless function not emulated', 'text/plain; charset=utf-8');
    }
    if (files.has(dest)) {
      return send(res, p, 200, files.get(dest), TYPES[path.extname(dest)] || 'application/octet-stream');
    }
  }
  if (p.startsWith('/api/')) return send(res, p, 501, 'serverless function not emulated', 'text/plain; charset=utf-8');
  // 3. not found
  return send(res, p, 404, 'The page could not be found\n\nNOT_FOUND\n', 'text/plain; charset=utf-8');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[e2e] serving ${distDir} with ${path.basename(vercelPath)} on http://127.0.0.1:${port}`);
});
