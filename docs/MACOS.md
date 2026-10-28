# ClearMind for macOS

ClearMind on the Mac is the existing web app (React 19 + Vite, the same build
as clearmind.meertech.tech) in an **Electron** shell (`apps/desktop`). It uses the
same Firebase project, Firestore data, sign-in methods and AI proxy as web,
Android and iOS. There is no second frontend, no second auth system and no new
backend.

## Why Electron (and not the alternatives)

| Option | Verdict |
| --- | --- |
| iOS app on Apple Silicon ("Designed for iPhone") / Mac Catalyst | The Expo app is iPhone-only and portrait. On a Mac it would be a phone-sized window, which is the "enlarged mobile UI" this work avoids. |
| SwiftUI rewrite | That would be a third UI to maintain, with every feature rebuilt. Nothing here needs native-only APIs. |
| Tauri | Lighter, but it needs a Rust toolchain (not installed) and uses WKWebView. The web app is tested in Chromium (Playwright), and Firebase popups and service-worker behaviour differ in WKWebView. |
| **Electron** | The same Chromium engine the web app is tested in. The existing web UI already has a desktop layout (sidebar, multi-pane Notes, ⌘ shortcuts). Builds a universal `.app`, `.dmg` and `.zip` with no extra toolchain. |

The trade-off is size: 515 MB for the universal `.app` (232 MB DMG), because Chromium is bundled. The arm64-only build skips the Intel slice and is smaller.

## How it works

```
ClearMind.app
 ├─ main process (src/main.cjs)
 │   ├─ in-process handler for http://localhost:47815 (src/protocol.cjs, protocol.handle('http'))
 │   │    /            → bundled web build (Contents/Resources/web), SPA fallback
 │   │    /api/v1/*    → forwarded to https://clearmind.meertech.tech (Firebase ID token passes through)
 │   │    other http   → passed to the network unchanged (https is not intercepted)
 │   ├─ clearmind-desktop:// sign-in links (src/authlink.cjs, open-url)
 │   ├─ native menus (src/menu.cjs), window state, Dock reopen
 │   └─ IPC: clearmind:oauth, clearmind:apple
 └─ renderer = the web app, sandboxed, contextIsolation, no Node
      window.clearmindDesktop (src/preload.cjs) → services/desktop.ts
```

**Nothing listens on a socket.** Requests for the app origin are answered inside
the Electron process and never reach the network stack, so the sandboxed Mac App
Store build has no `com.apple.security.network.server` entitlement (see
"Mac App Store rejection 2.4.5" below).

* **Fixed localhost origin, no port.** The window loads `http://localhost:47815`,
  the same origin as 1.0.0. IndexedDB (`ClearMindDB`, attachments, the Firebase
  session), localStorage and preferences are stored per origin, so existing data
  carries over with no migration step. The port number is only part of the
  name: no server is bound to it, and another program using 47815 does not
  affect the app. Dev (`npm run dev:mac`) loads Vite on `http://localhost:3000`.
* **Sign-in.** Email/password and anonymous sign-in run in the app unchanged
  (Firebase Auth REST calls from the app origin, as in a browser). Sign in with
  Apple is native (`native/apple_signin.mm`, App Store build) and ends in
  `signInWithCredential`. Google and GitHub open the default browser, because
  Google blocks OAuth inside embedded webviews:
  1. The app makes a one-time `state` and a fresh 256-bit key and opens
     `https://clearmind.meertech.tech/desktop-auth?provider=…&state=…#k=<key>`.
     The key is in the URL fragment, which browsers never send to a server.
  2. That page (`components/views/DesktopAuthBridge.tsx`) runs the provider popup in a
     separate, in-memory Firebase instance, so a web session in that browser is
     left alone and nothing is stored there.
  3. It seals the provider credential with AES-256-GCM (additional data = state;
     `services/desktopAuthSeal.ts`) and opens
     `clearmind-desktop://auth?state=…&iv=…&ct=…`. The browser asks to open
     ClearMind, and an "Open ClearMind" button repeats the link if needed.
  4. macOS hands the link to the app (`open-url`; Windows: the second-instance
     command line). The app decrypts it with the key for that state, uses it
     once, and calls `signInWithCredential`. The result is the same Firebase user
     as on web and mobile.

  Another program that registers `clearmind-desktop` sees only ciphertext it
  cannot open or forge (RFC 8252 section 7.1 custom scheme, protected like PKCE).
  The scheme is declared in `Info.plist` by electron-builder `protocols`; it is
  not `clearmind` because the iOS app uses that one.
* **AI.** The app calls `/api/v1/ai/generate` on the same origin, and the
  in-process handler forwards it server-to-server (`net.fetch`). No CORS
  allowlist change is needed and no key ships in the app (see docs/SECURITY.md S1).
* **Web-only plumbing is off.** No service worker (the build ships inside the
  app), no "Install App" prompt, and no Web Speech mic (Electron has no speech
  backend).
* **Links.** External links and `target=_blank` open in the default browser.
  The window never navigates away from the app.
* **Permissions.** Only notifications and clipboard are granted. Camera,
  microphone and location are denied.

### Desktop behaviour

* Window: 1280×820 by default, minimum 900×600. Size, position and maximised
  state are remembered (`~/Library/Application Support/ClearMind/window-state.json`).
* Closing the window keeps ClearMind in the Dock, and clicking the Dock icon brings it
  back. ⌘Q quits. Only one instance runs at a time.
* Menus: ClearMind (About, Settings… ⌘,), File (New Task… ⌘N), Edit, Go (Today
  ⌘1, Inbox ⌘2, Upcoming ⌘3, Projects ⌘4, Notes ⌘5, Calendar ⌘6, Journal ⌘7,
  Iris ⌘8, Insights ⌘9, the other tools, Search ⇧⌘F), View (reload, zoom,
  full screen, developer tools), Window, Help (web, support, privacy).
  If the page handles a key itself, that wins. For example, ⌘N in Notes creates a
  note, and ⌘, in Notes opens Notes settings.
* Light, dark and system themes follow the existing in-app setting.
* File pickers (`<input type=file>`, e.g. Excel import) use the native open
  panel, downloads use the native save panel, and drag-and-drop works as on web.
  Reminders use macOS notifications.

## Prerequisites

* macOS 12 or later, with Node 20+ (tested on Node 24.14) and npm.
* A root `.env.local` with the Firebase **web** config (public client config,
  gitignored):
  ```sh
  firebase apps:sdkconfig WEB 1:1026200124634:web:9c7b3cd494a3b3c89cf9e3
  # copy apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId
  # into VITE_FIREBASE_* (see .env.example)
  ```
  Without it the app still builds and runs, but in local-only mode.

## Commands (from the repo root)

| What | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Dev mode (Vite hot reload + Electron) | `npm run dev:mac` |
| Run the production web build in Electron (unpackaged) | `npm run start:mac` |
| Production build, universal (Intel + Apple Silicon) | `npm run build:mac` |
| Production build, Apple Silicon only (smaller; writes to the same `dist/ClearMind.dmg`) | `npm run build:arm64 -w apps/desktop` |
| Unit tests (in-process handler, sign-in link, MAS entitlements) | `npm run test:mac` |
| End-to-end tests (launches the real app via Playwright) | `npm run test:e2e:mac` |
| End-to-end tests against the packaged app | `CLEARMIND_APP=dist/mac-universal/ClearMind.app npm run test:e2e:mac` |
| Regenerate the app icon | `npm run icon -w apps/desktop` |

`build:mac` runs `vite build` into `apps/desktop/build/web`, then electron-builder.

### Artifacts

| File | Path |
| --- | --- |
| App bundle | `apps/desktop/dist/mac-universal/ClearMind.app` (`mac-arm64/` for the arm64 build) |
| Disk image | `apps/desktop/dist/ClearMind.dmg` |
| Zip | `apps/desktop/dist/ClearMind-1.0.0-mac.zip` |

## Install on your Mac

1. Open `apps/desktop/dist/ClearMind.dmg` and drag **ClearMind** onto **Applications**
   (or copy `ClearMind.app` to `/Applications`).
2. Launch it from Launchpad, Spotlight or Finder, and keep it in the Dock.

Local builds (`npm run build:mac`) have an **ad-hoc signature**. A build made on
your own Mac is not quarantined, so it opens directly; copied to another Mac it
would need System Settings › Privacy & Security › **Open Anyway**.

The published download (GitHub Release `desktop-v1.0.0`, linked from the landing
page) is the **Developer ID** build: signed by MEERTECH LTD (7N86K8Q433),
hardened runtime, notarized and stapled, so it opens with no warning.

## Architectures

The `build:mac` output is a universal binary (`lipo -archs` → `x86_64 arm64`).
There are no native Node modules, so both slices are complete. The minimum macOS
version is 12.0 (Electron 44's floor). The app has been verified on Apple Silicon
(macOS 26.7). The Intel slice is built but has not been run on Intel hardware.

## Tests (run on 2026-10-28, macOS 26.7.2 arm64, Node 24.14)

* `npm run test:mac`: 18/18 pass (also in CI on Linux). In-process handler: MIME
  types, SPA fallback, missing assets 404, path traversal (encoded, NUL,
  backslash, symlink out of the build), GET/HEAD only, `/api/v1` forwarding without
  cookies, 413 and offline 502, other http passed through. Sign-in link: key only
  in the fragment, round trip, expired state, tampering, wrong key, swapped
  state, bad provider, malformed links. Entitlements guard: no `network.server`
  in any plist, the MAS plist keeps sandbox and `network.client`, and nothing in
  `src/` opens a listening socket.
* `npx vitest run`: 37 files / 347 tests. `services/desktopAuthSeal.test.ts`
  runs the browser seal against the real app module.
* `npm run test:e2e:mac` (Playwright, unpackaged Electron): 9/9. Covered: window
  limits, origin `http://localhost:<port>`, the bridge is the only exposed API, the
  app renders with no page errors and no service worker, Go menu routes, no
  listening socket apart from Playwright's own debugger ports, `/api/v1` reaches
  the real production API (401 signed out), the sign-in page renders, the full
  sign-in loop (browser URL out, sealed link back, forged and replayed links
  refused), and close-to-Dock then reopen.
* By hand:
  * Data carry-over: the 1.0.0 build (loopback server) wrote localStorage and an
    IndexedDB record; this build read both back from the same profile.
  * Email sign-in from the app origin reaches Firebase Auth, which answers
    `INVALID_LOGIN_CREDENTIALS` for a probe account (so no referrer or CORS block).
  * In Chromium, the new `/desktop-auth` page opens the real accounts.google.com
    and github.com popups. Finishing a Google/GitHub/Apple sign-in needs a person
    with an account and has not been automated.
  * The sandboxed `mas-dev` build (same entitlements as the store build) runs:
    the page loads from the bundled build, `lsof` shows no listening socket, and
    only outgoing 443 connections. In that sandbox even Playwright's debugger
    port fails with `bind() failed: Operation not permitted`, which confirms the
    sandbox blocks listening without `network.server`. Playwright cannot drive a
    sandboxed build for the same reason.
  * A distribution-signed `mas` build does not start outside the App Store
    (its profile lists no devices); use `build:mas-dev` to test locally.

## Mac App Store rejection 2.4.5 (24 Oct 2026) and the fix

App Store review rejected macOS 1.0.0 build 1 under guideline 2.4.5: the build
had `com.apple.security.network.server`, and Apple saw no server feature. That
entitlement existed only for the loopback HTTP server (`src/server.cjs`) that
served the bundled web build and received the Google/GitHub credential.

The fix removes the server instead of explaining it:

| Old (1.0.0) | Now |
| --- | --- |
| `http.createServer` on 127.0.0.1:47815 serves the web build | `protocol.handle('http')` answers `http://localhost:47815` in-process (`src/protocol.cjs`) |
| `/api/v1` proxied by the server | proxied by the same handler with `net.fetch` |
| Browser POSTs the credential to `localhost:47815/desktop-auth/complete` | Browser opens an encrypted `clearmind-desktop://` link (`src/authlink.cjs`) |
| Sign-in page served by the app on localhost | Sign-in page on the deployed web app (`clearmind.meertech.tech/desktop-auth`) |
| "Port 47815 is already in use" stops the app | No port is bound; nothing can conflict |

Decisions:

* **Same origin, not a custom `app://` scheme.** A custom scheme would move every
  user's IndexedDB/localStorage to a new origin (a data migration, with blobs in
  the attachments store), and Firebase refuses popup/redirect sign-in on
  non-http(s) origins. Intercepting `http` for the one fixed origin keeps both
  unchanged. Proven by test: data written by the 1.0.0 build is read by the new
  build from the same profile.
* **No backend change.** The ClearMind API is still called server-to-server, so its
  CORS allowlist is unchanged. Firebase Authorized domains need `localhost` (for the
  dev bridge) and `clearmind.meertech.tech` (production bridge), which are already there.
* **Deploy order.** The new desktop build opens the bridge on the production web
  app, so the web app must be deployed from this change before the Mac App Store
  build is released. Older desktop builds use their own bundled loopback page and
  are not affected by the web deploy.
* `test/entitlements.test.cjs` fails if `network.server` returns to any entitlements
  file, or if any file in `src/` opens a listening socket.

## Security notes

* No secrets ship in the app. The Firebase web config is public by design
  (enforced by Firestore rules), and AI keys stay on the server.
* The renderer is sandboxed with context isolation and no Node integration. `<webview>` is
  blocked, and navigation is limited to the app origin.
* The Firebase session is stored in the app's own Chromium profile
  (`~/Library/Application Support/ClearMind`), as in a browser. It is not
  shared with Safari/Chrome. It is **not** in the Keychain, because the Firebase JS SDK
  has no supported Keychain persistence. Moving it would need a custom persistence
  layer on `safeStorage`.
* Nothing listens on a socket. The in-process handler serves only files inside
  the bundled web build (path traversal and symlinks out of it are refused),
  answers only `GET`/`HEAD` for files, and forwards `/api/v1` with the caller's
  own token (only `Authorization`, `Content-Type` and `Accept`; no cookies).
* The sign-in link is encrypted and bound to a one-time state that expires after
  5 minutes; the key never leaves the app except in the URL fragment given to
  the default browser.

## Distribution

### Direct download (Developer ID + notarization), done for 1.0.0

Signing assets (never committed) live in `~/.appstoreconnect/certs`: the
Developer ID Application certificate and key (created 2026-10-23 by the Account
Holder from a CSR made here; valid to 2027-11-22). Notarization uses the App
Store Connect API key in `~/.appstoreconnect/private_keys`.

```sh
APPLE_API_KEY=~/.appstoreconnect/private_keys/AuthKey_324J96Z6R5.p8 \
APPLE_API_KEY_ID=324J96Z6R5 APPLE_API_ISSUER=<issuer id> \
npm run release:mac -w apps/desktop
```

`scripts/release-mac.sh` builds the universal app with the hardened runtime,
lets electron-builder notarize and staple it, then signs, notarizes and staples
the DMG and checks both with `spctl` (expect "source=Notarized Developer ID").
Signing every file with a secure timestamp takes about 15 minutes; Apple's
notarization took about 40 minutes for the first submission.
Upload with `gh release upload desktop-v<version> dist/ClearMind.dmg dist/ClearMind-<version>-mac.zip --clobber`.

Sign in with Apple is **not** in the direct download: Apple's Developer ID
provisioning profile does not carry that entitlement, so the button only
appears in the Mac App Store build (`process.mas`). Guideline 4.8 applies only
to App Store apps.

### Mac App Store

* **Identity:** `tech.meertech.clearmind` (Universal Purchase with iOS), version 1.0.0 (`apps/desktop/package.json`),
  category Productivity. To share one App Store record and Universal Purchase
  with iOS, switch to `tech.meertech.clearmind` before the first submission.
* **Target:** add an electron-builder `mas` target with a "Apple Distribution" cert,
  "Mac Installer Distribution" cert and a provisioning profile
  (`build/embedded.provisionprofile`).
* **Sandbox entitlements (`build/entitlements.mas.plist`):** `com.apple.security.app-sandbox`,
  `com.apple.security.network.client` (Firebase/API), Sign in with Apple, the
  application group, and `com.apple.security.files.user-selected.read-write` /
  `downloads.read-write` (Excel import/export, attachments). No `network.server`
  (see the 2.4.5 section above).
* **Build number:** `npm run build:mas` takes `CLEARMIND_BUILD_NUMBER` (default 2;
  build 1 was rejected). Every upload needs a higher number.
* **Review risks:**
  * Guideline 4.2 (minimum functionality / web wrappers): the bundled
    offline build, menus and Dock behaviour help.
  * Guideline 4.8: Sign in with Apple, because Google sign-in is offered. iOS already has it, but the
    web/desktop flow does not yet, so Apple would have to be added as a Firebase OAuth provider on web
    with a Services ID.
  * Opening the browser for sign-in is allowed. The return link is a custom URL scheme, which the sandbox permits.
* **Privacy:** reuse the iOS App Privacy answers and `public/privacy.html`. The Mac app
  collects the same data, minus the microphone.
* **Upload:** `electron-builder --mac mas` → Transporter → App Store Connect →
  macOS platform on the ClearMind record.

## Troubleshooting

* **Local data looks empty**: the origin is `http://localhost:47815`. Overriding it with
  `CLEARMIND_PORT` starts with an empty local store. Nothing is bound to the port.
* **Google/GitHub sign-in never returns to the app**: the browser must be allowed to
  open `clearmind-desktop://` links (click "Open ClearMind" on the page). In dev, an
  unpackaged `electron .` registers itself for the scheme on start.
* **App shows only local mode / no cloud sign-in**: `.env.local` was missing at
  build time. Add it (see Prerequisites) and rebuild.
* **"Web build missing"**: run `npm run build:web -w apps/desktop` (or `build:mac`).
* **Google sign-in "unauthorized domain"**: the bridge host (`clearmind.meertech.tech`,
  or `localhost` in dev) is missing from Firebase Auth › Settings › Authorized domains.
* **electron-builder "unknown property"**: options live under `mac`/`dmg` in
  `apps/desktop/electron-builder.yml`. There is no top-level `zip` key.
* **Huge `app.asar`**: the `!**/node_modules/**` file filter keeps the workspace's
  dependencies out. The shell has no runtime dependencies.
* **"ClearMind is damaged" on another Mac**: this is quarantine on an unsigned build. See Install.
* **Developer tools**: View › Toggle Developer Tools (⌥⌘I).
* **A sandboxed test build quits at once**: another sandboxed ClearMind shares the
  container and its single-instance lock (`Data/tmp/S`). Quit it, or start the test
  build with `TMPDIR` and `CLEARMIND_USER_DATA` pointing at a folder inside
  `~/Library/Containers/tech.meertech.clearmind/Data/tmp/`.
