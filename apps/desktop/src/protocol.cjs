'use strict';
/**
 * In-process request handler behind the macOS app. It replaces the old loopback
 * HTTP server: nothing listens on a socket, so the sandboxed Mac App Store build
 * needs no `com.apple.security.network.server` entitlement (guideline 2.4.5).
 *
 * main.cjs installs it with `protocol.handle('http', ...)` on the app's session.
 * Requests for the app origin (`http://localhost:47815`) never leave the
 * process; every other http URL is passed through to the network unchanged.
 * Keeping the exact origin of the 1.0.0 build means IndexedDB, localStorage and
 * the Firebase session carry over with no migration, and Firebase still sees
 * an http(s) origin.
 *
 *  - serves the bundled web build (SPA fallback to index.html);
 *  - forwards /api/v1/* to the production API (server-to-server, so no CORS
 *    allowlist change is needed; the user's Firebase ID token passes through).
 *
 * Pure (WHATWG Request in, Response out, no Electron imports) so it is
 * unit-tested with `node --test`.
 */
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
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const MAX_BODY = 1024 * 1024; // AI prompts carry user context; the API caps it anyway
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept'];

function text(status, body, type = 'text/plain; charset=utf-8') {
  return new Response(body, {
    status,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Resolve a URL path to a file inside `root`, or null if it escapes it. */
function resolveStatic(root, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const file = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  return file === root || file.startsWith(root + path.sep) ? file : null;
}

async function serveStatic(root, request, pathname) {
  let file = resolveStatic(root, pathname);
  if (!file) return text(400, 'Bad path');
  let stat = await fs.promises.stat(file).catch(() => null);
  if (stat?.isDirectory()) { file = path.join(file, 'index.html'); stat = await fs.promises.stat(file).catch(() => null); }
  if (!stat?.isFile()) {
    // Unknown asset → 404 (a missing chunk must fail loudly, see lazyWithRetry);
    // any other path is an app route → index.html.
    if (path.extname(pathname)) return text(404, 'Not found');
    file = path.join(root, 'index.html');
    stat = await fs.promises.stat(file).catch(() => null);
    if (!stat) return text(500, 'Web build missing. Run `npm run build:web -w apps/desktop`.');
  }
  // Symlinks inside the build must not lead outside it either.
  const real = await fs.promises.realpath(file).catch(() => null);
  const realRoot = await fs.promises.realpath(root).catch(() => root);
  if (!real || !(real === realRoot || real.startsWith(realRoot + path.sep))) return text(400, 'Bad path');

  const ext = path.extname(file).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': String(stat.size),
    // Hashed assets never change; HTML is re-read so a new app version shows at once.
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  return new Response(await fs.promises.readFile(real), { status: 200, headers });
}

async function proxyApi(apiOrigin, request, url, fetchImpl) {
  const headers = {};
  for (const h of FORWARD_HEADERS) { const v = request.headers.get(h); if (v) headers[h] = v; }
  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.length > MAX_BODY) return text(413, 'Payload too large');
    body = buf;
  }
  try {
    const upstream = await fetchImpl(apiOrigin + url.pathname + url.search, { method: request.method, headers, body, redirect: 'manual' });
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new Response(request.method === 'HEAD' ? null : buf, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return text(502, JSON.stringify({ error: 'offline', message: `Could not reach ${apiOrigin}: ${e?.message ?? e}` }), 'application/json');
  }
}

/**
 * @param {object} opts
 * @param {string} opts.webRoot       directory with the built web app
 * @param {string} opts.appOrigin     e.g. http://localhost:47815 (the only origin served from disk)
 * @param {string} opts.apiOrigin     e.g. https://clearmind.meertech.tech
 * @param {(req: Request) => Promise<Response>} opts.passthrough  any other http request (net.fetch, bypassing this handler)
 * @param {typeof fetch} [opts.fetchImpl]  upstream fetch for /api/v1
 * @returns {(req: Request) => Promise<Response>}
 */
function createAppHandler({ webRoot, appOrigin, apiOrigin, passthrough, fetchImpl = fetch }) {
  const root = path.resolve(webRoot);
  const origin = new URL(appOrigin).origin;
  return async function handle(request) {
    let url;
    try { url = new URL(request.url); } catch { return text(400, 'Bad URL'); }
    if (url.origin !== origin) return passthrough(request);
    try {
      if (url.pathname.startsWith('/api/v1/')) return await proxyApi(apiOrigin, request, url, fetchImpl);
      if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Method not allowed');
      return await serveStatic(root, request, url.pathname);
    } catch (e) {
      return text(500, e?.message ?? 'Server error');
    }
  };
}

module.exports = { createAppHandler, resolveStatic, MIME };
