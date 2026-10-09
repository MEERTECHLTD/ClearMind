/* ClearMind service worker — TEMPLATE.
 *
 * Built into dist/sw.js by service-worker/vitePlugin.ts, which prepends
 *   self.__CM_BUILD__ = { id: '<build id>', precache: ['/index.html', '/assets/index-….js', …] };
 * The build id changes whenever any output file changes, so every deploy ships a
 * byte-different sw.js and the browser installs it as an update.
 *
 * Strategy (docs/WEB_CACHING_AND_PWA.md):
 *   - navigations: network-first; offline falls back to the cached app shell
 *   - same-origin hashed /assets/* and icons: cache-first (immutable names)
 *   - everything else, incl. /api/* and ALL cross-origin requests (Firestore,
 *     Google APIs, fonts, user content): not touched — straight to the network
 *   - only 200 same-origin responses whose content-type matches the file
 *     extension are cached (an HTML fallback is never stored as a .js chunk)
 *   - a new version waits until the page posts SKIP_WAITING (the in-app
 *     "New version available — Reload" prompt), then claims all clients.
 */
/* global self, caches, clients */
const BUILD = self.__CM_BUILD__ || { id: 'dev', precache: [] };
const PREFIX = 'clearmind-';
const CACHE = `${PREFIX}${BUILD.id}`;
const SHELL = '/index.html';
const OPTIONAL = new Set([
  '/manifest.json', '/favicon.png', '/apple-touch-icon.png', '/clearmindlogo-256.png',
  '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png',
]);
const ICONS = new Set([...OPTIONAL].filter((p) => p.endsWith('.png') || p.endsWith('.svg')));

const EXPECTED_TYPE = {
  js: 'javascript', mjs: 'javascript', css: 'text/css', html: 'text/html', json: 'json',
  png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  woff2: 'font/woff2', woff: 'font/woff', wasm: 'application/wasm', ico: 'image/',
};

/** Only cache what we asked for: same-origin 200s whose type matches the extension. */
function isCacheable(url, res) {
  if (!res || res.status !== 200 || res.type !== 'basic' || res.redirected) return false;
  const path = new URL(url, self.location.origin).pathname;
  const ext = path === '/' ? 'html' : path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const expected = EXPECTED_TYPE[ext];
  const type = (res.headers.get('content-type') || '').toLowerCase();
  return !!expected && type.includes(expected);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(BUILD.precache.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (!isCacheable(url, res)) throw new Error(`${url}: ${res.status} ${res.headers.get('content-type')}`);
        await cache.put(url, res);
      } catch (e) {
        if (!OPTIONAL.has(url)) throw e; // app shell must be complete, icons are best-effort
      }
    }));
    // The pre-2026-10 worker ("clearmind-v4"/"clearmind-v6") served everything
    // cache-first and could pin HTML under chunk URLs. Replace it right away
    // instead of waiting for the user to accept an update.
    const keys = await caches.keys();
    if (keys.some((k) => /^clearmind-v\d+$/.test(k))) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage(BUILD.id);
});

async function networkFirstNavigation(request) {
  const url = new URL(request.url);
  try {
    const res = await fetch(request);
    if ((url.pathname === '/' || url.pathname === SHELL) && isCacheable(SHELL, res)) {
      const cache = await caches.open(CACHE);
      await cache.put(SHELL, res.clone());
    }
    return res;
  } catch (err) {
    // Offline: SPA routes get the app shell; real files (e.g. /privacy.html) don't.
    const isAppRoute = url.pathname === '/' || url.pathname === SHELL || !/\.[a-z0-9]+$/i.test(url.pathname);
    const cached = isAppRoute ? await caches.match(SHELL, { cacheName: CACHE }) : undefined;
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (isCacheable(request.url, res)) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never touch cross-origin traffic: Firestore, Firebase Auth, Gemini, Google
  // Fonts, oEmbed, user-content images… The browser's HTTP cache handles them.
  if (url.origin !== self.location.origin) return;
  // Never cache the API (authenticated, per-user) or OAuth metadata.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.well-known/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/') || ICONS.has(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // Anything else (manifest, widgets, privacy pages…): default network handling.
});

// ------------------------------------------------------------------ notifications

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  let urlToOpen = '/';
  if (data && data.url) {
    urlToOpen = data.url;
  } else if (data) {
    switch (data.type) {
      case 'task': urlToOpen = '/#today'; break;
      case 'application': urlToOpen = '/#applications'; break;
      case 'event': urlToOpen = '/#calendar'; break;
      default: urlToOpen = '/';
    }
  }
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    }),
  );
});

// Push (for future server-side push)
self.addEventListener('push', (event) => {
  let data = { title: 'ClearMind', body: 'You have a new notification' };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: data.data || {},
      requireInteraction: true,
      actions: data.actions || [],
    }),
  );
});
