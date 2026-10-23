'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppServer, listen, resolveStatic } = require('../src/server.cjs');

let root, server, base, upstreamCalls, completed;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-web-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>ClearMind</title>');
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'app-abc.js'), 'console.log(1)');
  fs.writeFileSync(path.join(os.tmpdir(), 'cm-secret.txt'), 'nope');

  upstreamCalls = [];
  const fakeFetch = async (url, init) => {
    upstreamCalls.push({ url, init });
    return new Response(JSON.stringify({ text: 'hi' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  completed = [];
  server = createAppServer({
    webRoot: root,
    apiOrigin: 'https://api.example',
    allowedOrigins: ['http://localhost:1234'],
    fetchImpl: fakeFetch,
    onAuthComplete: (state, result) => { if (state !== 'good') return false; completed.push(result); return true; },
  });
  const port = await listen(server, 0);
  base = `http://127.0.0.1:${port}`;
});

after(() => server.close());

test('serves index.html for app routes and files with the right type', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(await r.text(), /ClearMind/);

  const route = await fetch(`${base}/desktop-auth?provider=google&state=x`);
  assert.equal(route.status, 200);
  assert.match(await route.text(), /ClearMind/);

  const js = await fetch(`${base}/assets/app-abc.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(js.headers.get('cache-control'), /immutable/);
});

test('missing assets 404 instead of falling back to index.html', async () => {
  const r = await fetch(`${base}/assets/gone-123.js`);
  assert.equal(r.status, 404);
});

test('never serves files outside the web root', async () => {
  assert.equal(resolveStatic(root, '/../cm-secret.txt'), path.join(root, 'cm-secret.txt'));
  assert.equal(resolveStatic(root, '/%2e%2e/%2e%2e/etc/passwd'), path.join(root, 'etc', 'passwd'));
  const r = await fetch(`${base}/..%2fcm-secret.txt`);
  assert.notEqual(await r.text(), 'nope');
});

test('forwards /api/v1 to the API origin with the bearer token', async () => {
  const r = await fetch(`${base}/api/v1/ai/generate`, {
    method: 'POST',
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json', Cookie: 'x=1' },
    body: JSON.stringify({ prompt: 'hello' }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: 'hi' });
  const call = upstreamCalls.at(-1);
  assert.equal(call.url, 'https://api.example/api/v1/ai/generate');
  assert.equal(call.init.headers.authorization, 'Bearer tok');
  assert.equal(call.init.headers.cookie, undefined);
  assert.equal(call.init.body.toString(), '{"prompt":"hello"}');
});

test('sign-in callback: accepts the pending state once, rejects the rest', async () => {
  const post = (body, origin = 'http://localhost:1234') =>
    fetch(`${base}/desktop-auth/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });

  assert.equal((await post({ state: 'good', providerId: 'google.com', idToken: 'id', accessToken: 'at' })).status, 200);
  assert.deepEqual(completed.at(-1), { providerId: 'google.com', idToken: 'id', accessToken: 'at' });

  assert.equal((await post({ state: 'stale', providerId: 'google.com', idToken: 'id' })).status, 410);
  assert.equal((await post({ state: 'good', providerId: 'evil.com', idToken: 'id' })).status, 400);
  assert.equal((await post({ state: 'good', providerId: 'google.com' })).status, 400);
  assert.equal((await post({ state: 'good', providerId: 'google.com', idToken: 'id' }, 'https://evil.example')).status, 403);
  assert.equal((await fetch(`${base}/desktop-auth/complete`)).status, 405);
});

test('reports a taken port clearly', async () => {
  const other = createAppServer({ webRoot: root, apiOrigin: 'x', onAuthComplete: () => false });
  await assert.rejects(listen(other, Number(new URL(base).port)), /already in use/);
});
