# Web caching, service worker and PWA install

How the web app (repo root, Vite) caches its files, how a new deploy reaches people who already have it open, and how to install it as a desktop app. There is an incident runbook at the end.

## 1. What a deploy changes

`vite build` gives every JS/CSS file under `/assets/` a content hash, such as `VaultView-B10m6PiI.js`. Each deploy replaces those files. Old names stop existing, and nothing is kept from earlier deploys.

A tab that is already open is still running the previous `index.html`. When it lazy-loads a view it has not opened yet (`#notes`, `#habits`, ...), it asks for a chunk name that no longer exists. Three layers handle this:

| Layer | Where | What it does |
|---|---|---|
| Hosting | `vercel.json` | A missing `/assets/*` file returns **404**. Before, it returned `index.html` with a 200, so the browser got HTML instead of JS. The SPA fallback to `index.html` now applies only to app routes (anything that is not `api/`, `.well-known/` or `assets/`). |
| App | `utils/lazyWithRetry.ts`, `components/ViewErrorBoundary.tsx` | Every lazy view retries a failed chunk load once, then reloads the page **once** to pick up the new build. A sessionStorage marker (`cm.chunkReloadFrom`, the URL of the build that triggered the reload) stops reload loops. If it still fails, the error boundary shows "A new version of ClearMind is available, Reload / Try again" instead of a blank screen. The boundary resets when the route changes. |
| Service worker | `service-worker/sw.js` | Never caches HTML (or any type that does not match the file extension) under a chunk URL. Prompts the user to reload when a new version is installed. See section 3. |

**Root cause of the "content only appears after a refresh" report (October 2026).** The Vault, and any other lazy view, failed to load in tabs opened before a deploy. Vercel returned `index.html` for the missing chunk, so the browser refused it because of its MIME type. `React.lazy` cached the rejected promise. With no error boundary, React unmounted the whole tree and the page went blank until a manual refresh. The Playwright test `e2e/web/navigation.spec.ts › after a deploy` reproduces this against the old build.

## 2. HTTP cache headers (Vercel, `vercel.json`)

| Path | `Cache-Control` | Why |
|---|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` | Content-hashed, so the URL changes when the content does |
| `/`, `/index.html` | `no-cache` | Always revalidate, so new deploys are picked up immediately |
| `/sw.js` | `no-cache` | Lets the browser see a new service worker on every check |
| `/manifest.json` | `no-cache` | Small file, and install metadata should stay current |
| SPA routes (rewritten to `index.html`) | Vercel default (`public, max-age=0, must-revalidate`) | Same effect as `no-cache` |

Vercel already sends `Strict-Transport-Security: max-age=63072000` on `clearmind.meertech.tech`. We don't override it.

Security headers on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb, serial, hid and bluetooth all off), and a **report-only** Content-Security-Policy.

**CSP status.** The policy runs as `Content-Security-Policy-Report-Only`, so the browser only logs violations to the console and blocks nothing. It allows:
- Firebase Auth: `apis.google.com` and `*.firebaseapp.com` for scripts and frames
- Firestore, Storage, Identity Toolkit, Secure Token and Gemini: `*.googleapis.com`
- Google Fonts
- oEmbed lookups (noembed, YouTube, Vimeo, TED)
- `https:` images, media and frames, because notes embed user content

The OAuth consent page (`/oauth/authorize`) is a top-level page that redirects with `location.assign`, so `frame-ancestors 'none'` doesn't affect it.

Before switching to an enforcing `Content-Security-Policy`:
1. Do a Google sign-in (popup and redirect), an email sign-in, a Firestore sync, an attachment upload, an Iris (Gemini) chat, a Learning Vault link preview, a canvas web-page card and the MCP OAuth connector flow in production with DevTools open.
2. Confirm there are no `[Report Only]` messages.
3. Rename the header key.

The e2e suite already checks that local (guest) flows produce no violations.

## 3. Service worker

The source is `service-worker/sw.js`. At build time, `service-worker/vitePlugin.ts` emits `dist/sw.js` with a header added:

```js
self.__CM_BUILD__ = { id: '<12-hex build id>', precache: ['/index.html', '/assets/index-….js', …] };
```

- **Versioned per build.** The id is a hash of every emitted file name plus `index.html`, so any app change produces a byte-different `sw.js`. Each build uses one cache, `clearmind-<id>`. On activate, older `clearmind-*` caches are deleted, including the legacy `clearmind-v4`/`clearmind-v6` caches.
- **Precache.** The app shell: `index.html`, the entry chunk, its static imports and CSS (taken from the Rollup bundle), plus the manifest and icons. Icons are best-effort, but the shell must be complete or the install fails.
- **Navigations** are network-first. A successful `/` or `/index.html` response refreshes the cached shell. When offline, app routes get the cached shell.
- **Cache-first** applies only to same-origin `/assets/*` and the icons.
- **Never touched:** anything cross-origin (Firestore, Firebase Auth, Gemini, Google Fonts, oEmbed, user images), `/api/*` and `/.well-known/*`. These go straight to the network and the browser's HTTP cache.
- **Never cached:** non-200 responses, redirects, opaque or cross-origin responses, and any response whose `content-type` doesn't match the extension. HTML can never be stored as `.js`.
- **Update flow.** A new worker installs and then **waits**. `services/pwa.ts` notices the waiting worker and shows a small "New version available, Reload" bar (`components/PwaPrompts.tsx`). Clicking Reload posts `SKIP_WAITING`. The worker activates, calls `clients.claim()`, and the tab reloads on `controllerchange`. Other tabs keep running and switch on their next navigation, or through the chunk-error path. Update checks run on page load, when the tab becomes visible again, and hourly.
- **Legacy takeover.** If the old cache-everything worker is present, the new worker skips waiting immediately instead of prompting.
- **Production only.** `registerServiceWorker()` does nothing in `vite dev`.

## 4. Installing the web app (PWA)

The manifest is `public/manifest.json`:
- `id` and `start_url` are `/`, `scope` is `/`, `display` is `standalone`, and theme and background colours are `#05050A`.
- Icons are 192 and 512 px plus maskable versions. They are generated from the mobile branding with `node scripts/generate-web-icons.mjs`.
- There are shortcuts for Today and Notes.

`index.html` links `apple-touch-icon.png` (180 px) for Safari.

The top-bar install button (`services/pwa.ts → detectInstallMode`) does the following:

| Browser | Install button | How to install |
|---|---|---|
| Chrome / Edge (desktop: macOS, Windows, Linux, ChromeOS) | **Install App**, shown once the browser fires `beforeinstallprompt` | The button opens the native install dialog. Alternatively, use the install icon in the address bar, or the ⋮ menu → *Cast, save and share → Install page as app* (Edge: *Apps → Install this site as an app*). |
| Safari 17+ on macOS (Sonoma and later) | **Install App** opens the instructions | Safari menu bar → **File → Add to Dock…** → Add. The app opens in its own window from the Dock, Launchpad and Spotlight. |
| Safari on iPhone / iPad | **Install App** opens the instructions | Share → **Add to Home Screen** |
| Android (any browser) | **Get the App** opens the Play Store listing (`tech.meertech.clearmind`) | The native app is preferred over the web app on Android |
| Firefox desktop | Hidden | Firefox desktop can't install web apps. Use Chrome, Edge or Safari. |
| Already installed (running standalone) | Hidden | |

Hash routing (`/#today`, `/#notes/<id>`) and Firebase auth (IndexedDB persistence plus popup sign-in) behave the same in the installed window. `display_override: window-controls-overlay` is deliberately **not** used, because the top bar isn't laid out for it.

## 5. `clearmind.expo.app` (EAS Hosting) gap

`npm run deploy:web` uploads the same `dist/` to EAS Hosting, which **does not read `vercel.json`**. As observed on 2026-10-09:
- A missing `/assets/*.js` returns **200 `text/html`** (SPA fallback).
- Static assets, including `sw.js` and `manifest.json`, are sent with `Cache-Control: public, max-age=3600` and an ETag.
- `index.html` has no `Cache-Control`.
- None of our security or CSP headers are sent.

The Expo docs say global headers (the `expo-router` plugin `headers` option, SDK 54+, needs expo-server) apply only to HTML and API responses, not to static assets. There is no documented way to change the asset `Cache-Control` or to make missing assets return 404.

What still protects `expo.app` users:
- `lazyWithRetry` treats the MIME-type failure as a chunk error and reloads once.
- The service worker never caches the HTML-as-JS response.
- The service worker is registered with `updateViaCache: 'none'`, so the 1-hour cache on `sw.js` doesn't delay updates.

What doesn't: the immutable caching, the 404 behaviour and the security headers. **Treat `clearmind.meertech.tech` (Vercel) as the canonical web host.**

## 6. Runbook: users stuck on a stale bundle

**Symptoms:** a view (often Notes/Vault) stays blank or shows "A new version of ClearMind is available", it only works after a refresh, or the console shows `Failed to fetch dynamically imported module` or `Expected a JavaScript module script but the server responded with a MIME type of "text/html"`.

1. **Check that hosting returns 404 for missing chunks.**
   `curl -sI https://clearmind.meertech.tech/assets/does-not-exist.js` must return `404`. If it returns `200 text/html`, the catch-all rewrite in `vercel.json` lost its `assets/` exclusion. Fix it and redeploy.
2. **Check the immutable headers.**
   `curl -sI https://clearmind.meertech.tech/assets/<a real chunk>` should show `cache-control: public, max-age=31536000, immutable`, and `curl -sI https://clearmind.meertech.tech/` should show `cache-control: no-cache`.
3. **Check which service worker is live.**
   `curl -s https://clearmind.meertech.tech/sw.js | head -1` shows `self.__CM_BUILD__ = {"id":…}`. That id should change with every deploy.
4. **For a single affected user:** have them click **Reload** on the in-app bar or the error screen.
   - If that doesn't work: DevTools → Application → Service workers → *Unregister*, then Storage → *Clear site data* (cloud data is safe; local-only workspaces live in IndexedDB, so warn them first), then reload.
   - In an installed app: close every ClearMind window and reopen.
5. **If many users are affected right after a deploy:** redeploy the **previous** build from the Vercel dashboard (Deployments → ⋯ → *Promote to Production*). That restores the old chunk names for old tabs. Then roll forward again once the cause is fixed.
6. **Reproduce locally:** run `npm run test:e2e:web`. The `after a deploy` tests simulate a redeploy, renaming every hashed asset, against the production bundle served with the real `vercel.json` rules.

## 7. Tests

- `npm run test:e2e:web` builds the production bundle and runs Playwright (`e2e/web/`) against `e2e/web/server.mjs`. That server applies `vercel.json` (filesystem first, then rewrites, then 404, plus headers, with gzip) and can simulate deploys (`POST /__e2e/deploy`).
- It covers lazy-view navigation, refresh, back/forward, nested hash URLs, navigation after a deploy, the service worker's cache contents, the update prompt, offline shell, headers, CSP report-only violations, manifest and icons, and the install button per platform.
- The first run needs `npx playwright install chromium`.
- Unit tests (`npm test`) cover `detectInstallMode` and `lazyWithRetry`.
