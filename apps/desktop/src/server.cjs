'use strict';
/**
 * The loopback HTTP server behind the macOS app (127.0.0.1, fixed port):
 *
 *  - serves the bundled web build (SPA fallback to index.html), so the app runs
 *    with no network and on a stable `http://localhost:<port>` origin — Firebase
 *    allows localhost for OAuth, and IndexedDB/localStorage stay put between runs;
 *  - forwards /api/v1/* to the production API (server-to-server, so no CORS
 *    allowlist change is needed; the user's Firebase ID token passes through);
 *  - receives the provider credential from the /desktop-auth page that runs in
 *    the user's default browser (POST /desktop-auth/complete, one-time state).
 *
 * Pure Node — no Electron imports — so it is unit-tested with `node --test`.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const MAX_BODY = 1024 * 1024; // AI prompts carry user context; the API caps it anyway
const PROVIDERS = new Set(['google.com', 'github.com']);

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

/** Resolve a URL path to a file inside `root`, or null if it escapes it. */
function resolveStatic(root, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  const file = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  return file === root || file.startsWith(root + path.sep) ? file : null;
}

function serveStatic(root, req, res) {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  let file = resolveStatic(root, urlPath);
  if (!file) return send(res, 400, 'Bad path');
  let stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat?.isDirectory()) { file = path.join(file, 'index.html'); stat = fs.statSync(file, { throwIfNoEntry: false }); }
  if (!stat) {
    // Unknown asset → 404 (a missing chunk must fail loudly, see lazyWithRetry);
    // any other path is an app route → index.html.
    if (path.extname(urlPath)) return send(res, 404, 'Not found');
    file = path.join(root, 'index.html');
    stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) return send(res, 500, 'Web build missing. Run `npm run build:web -w apps/desktop`.');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    // Hashed assets never change; HTML is re-read so a new app version shows at once.
    'Cache-Control': urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

async function proxyApi(apiOrigin, req, res, fetchImpl) {
  const headers = {};
  for (const h of ['authorization', 'content-type', 'accept']) if (req.headers[h]) headers[h] = req.headers[h];
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
  try {
    const upstream = await fetchImpl(apiOrigin + req.url, { method: req.method, headers, body });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  } catch (e) {
    send(res, 502, JSON.stringify({ error: 'offline', message: `Could not reach ${apiOrigin}: ${e?.message ?? e}` }), 'application/json');
  }
}

/**
 * @param {object} opts
 * @param {string|null} opts.webRoot  directory with the built web app (null in dev: Vite serves it)
 * @param {string} opts.apiOrigin     e.g. https://clearmind.meertech.tech
 * @param {(state: string, result: object) => boolean} opts.onAuthComplete  true if the state was pending
 * @param {string[]} [opts.allowedOrigins] browser origins allowed to POST the credential
 * @param {typeof fetch} [opts.fetchImpl]
 */
function createAppServer({ webRoot, apiOrigin, onAuthComplete, allowedOrigins = [], fetchImpl = fetch }) {
  const root = webRoot ? path.resolve(webRoot) : null;
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/v1/')) return await proxyApi(apiOrigin, req, res, fetchImpl);
      if (pathname === '/desktop-auth/complete') {
        if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
        const origin = req.headers.origin;
        if (origin && !allowedOrigins.includes(origin)) return send(res, 403, 'Origin not allowed');
        let data;
        try { data = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')); } catch { return send(res, 400, 'Invalid JSON'); }
        const { state, providerId, idToken, accessToken } = data ?? {};
        if (typeof state !== 'string' || !PROVIDERS.has(providerId) || (!idToken && !accessToken)) return send(res, 400, 'Incomplete credential');
        const str = (v) => (typeof v === 'string' ? v : undefined);
        const ok = onAuthComplete(state, { providerId, idToken: str(idToken), accessToken: str(accessToken) });
        return ok ? send(res, 200, 'ok') : send(res, 410, 'This sign-in request has expired. Start again from the ClearMind app.');
      }
      if (!root) return send(res, 404, 'Not found');
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(root, req, res);
    } catch (e) {
      if (!res.headersSent) send(res, e?.status ?? 500, e?.message ?? 'Server error');
      else res.destroy();
    }
  });
}

/** Listen on 127.0.0.1:<port>; rejects with a readable error if the port is taken. */
function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', (e) => reject(e.code === 'EADDRINUSE' ? new Error(`Port ${port} is already in use by another program.`) : e));
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

module.exports = { createAppServer, listen, resolveStatic };
