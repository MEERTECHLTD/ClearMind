'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppHandler, resolveStatic } = require('../src/protocol.cjs');

const ORIGIN = 'http://localhost:47815';
let root, handle, upstreamCalls, passed;

before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-proto-'));
  root = path.join(dir, 'web');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'welcome'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>ClearMind</title>');
  fs.writeFileSync(path.join(root, 'welcome', 'index.html'), '<!doctype html><title>Welcome</title>');
  fs.writeFileSync(path.join(root, 'assets', 'app-abc.js'), 'console.log(1)');
  fs.writeFileSync(path.join(root, 'assets', 'app-abc.css'), 'body{}');
  fs.writeFileSync(path.join(root, 'assets', 'f.woff2'), 'w');
  fs.writeFileSync(path.join(root, 'assets', 'mod.wasm'), 'w');
  fs.writeFileSync(path.join(root, 'manifest.webmanifest'), '{}');
  fs.writeFileSync(path.join(root, 'logo.png'), 'p');
  fs.writeFileSync(path.join(root, 'icon.svg'), '<svg/>');
  fs.writeFileSync(path.join(root, 'blob.unknownext'), 'x');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'nope'); // sibling of the web root
  fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(root, 'link.txt'));

  upstreamCalls = [];
  passed = [];
  handle = createAppHandler({
    webRoot: root,
    appOrigin: ORIGIN,
    apiOrigin: 'https://api.example',
    fetchImpl: async (url, init) => {
      upstreamCalls.push({ url, init });
      if (url.includes('/offline')) throw new Error('ENOTFOUND');
      return new Response(JSON.stringify({ text: 'hi' }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    passthrough: async (req) => { passed.push(req.url); return new Response('net', { status: 299 }); },
  });
});

const get = (p, init) => handle(new Request(ORIGIN + p, init));

test('serves index.html and files with the right MIME type', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await r.text(), /ClearMind/);

  const types = {
    '/assets/app-abc.js': /^text\/javascript/,
    '/assets/app-abc.css': /^text\/css/,
    '/assets/f.woff2': /^font\/woff2$/,
    '/assets/mod.wasm': /^application\/wasm$/,
    '/manifest.webmanifest': /^application\/manifest\+json$/,
    '/logo.png': /^image\/png$/,
    '/icon.svg': /^image\/svg\+xml$/,
    '/blob.unknownext': /^application\/octet-stream$/,
  };
  for (const [p, re] of Object.entries(types)) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-type'), re, p);
  }
  const js = await get('/assets/app-abc.js');
  assert.match(js.headers.get('cache-control'), /immutable/);
  assert.equal(js.headers.get('content-length'), String('console.log(1)'.length));
  assert.equal(await js.text(), 'console.log(1)');
});

test('SPA fallback: app routes get index.html, directories their index', async () => {
  for (const p of ['/today', '/desktop-auth?provider=google&state=x', '/projects/123/board']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /^text\/html/, p);
    assert.match(await r.text(), /<title>ClearMind/, p);
  }
  assert.match(await (await get('/welcome/')).text(), /Welcome/);
});

test('missing assets 404 instead of falling back to index.html', async () => {
  assert.equal((await get('/assets/gone-123.js')).status, 404);
  assert.equal((await get('/nope.png')).status, 404);
});

test('path traversal never leaves the web root', async () => {
  assert.equal(resolveStatic(root, '/../secret.txt'), path.join(root, 'secret.txt'));
  assert.equal(resolveStatic(root, '/%2e%2e/%2e%2e/etc/passwd'), path.join(root, 'etc', 'passwd'));
  assert.equal(resolveStatic(root, '/%E0%A4%A'), null); // bad escape
  assert.equal(resolveStatic(root, '/a%00b'), null); // NUL byte
  for (const p of ['/..%2fsecret.txt', '/%2e%2e%2fsecret.txt', '/assets/..%2f..%2fsecret.txt', '/..%5csecret.txt']) {
    const r = await get(p);
    assert.notEqual(await r.text(), 'nope', p);
  }
  // A symlink inside the build that points outside it is refused.
  const link = await get('/link.txt');
  assert.equal(link.status, 400);
  assert.notEqual(await link.text(), 'nope');
});

test('only GET and HEAD for files; HEAD has no body', async () => {
  assert.equal((await get('/', { method: 'POST', body: 'x' })).status, 405);
  assert.equal((await get('/index.html', { method: 'DELETE' })).status, 405);
  const h = await get('/assets/app-abc.js', { method: 'HEAD' });
  assert.equal(h.status, 200);
  assert.equal(await h.text(), '');
});

test('forwards /api/v1 to the API origin with only the safe headers', async () => {
  const r = await get('/api/v1/ai/generate?x=1', {
    method: 'POST',
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json', Cookie: 'x=1' },
    body: JSON.stringify({ prompt: 'hello' }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: 'hi' });
  const call = upstreamCalls.at(-1);
  assert.equal(call.url, 'https://api.example/api/v1/ai/generate?x=1');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.authorization, 'Bearer tok');
  assert.equal(call.init.headers.cookie, undefined);
  assert.equal(call.init.body.toString(), '{"prompt":"hello"}');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('API: oversized bodies are refused, offline is a clear 502', async () => {
  const big = await get('/api/v1/ai/generate', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(big.status, 413);
  const off = await get('/api/v1/offline');
  assert.equal(off.status, 502);
  assert.equal((await off.json()).error, 'offline');
});

test('other http origins go to the network untouched', async () => {
  const r = await handle(new Request('http://example.com/pic.png'));
  assert.equal(r.status, 299);
  await handle(new Request('http://localhost:9999/'));
  await handle(new Request('http://127.0.0.1:47815/'));
  assert.deepEqual(passed, ['http://example.com/pic.png', 'http://localhost:9999/', 'http://127.0.0.1:47815/']);
});
