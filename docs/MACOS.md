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
 │   ├─ loopback server on http://localhost:47815 (src/server.cjs)
 │   │    /            → bundled web build (Contents/Resources/web), SPA fallback
 │   │    /api/v1/*    → forwarded to https://clearmind.meertech.tech (Firebase ID token passes through)
 │   │    /desktop-auth/complete → receives the Google/GitHub credential (one-time state)
 │   ├─ native menus (src/menu.cjs), window state, Dock reopen
 │   └─ IPC: clearmind:oauth
 └─ renderer = the web app, sandboxed, contextIsolation, no Node
      window.clearmindDesktop (src/preload.cjs) → services/desktop.ts
```

* **Fixed localhost origin.** IndexedDB, localStorage and the Firebase session are
  stored per origin, so the port never changes (47815; dev uses 47816).
  Firebase allows `localhost` for OAuth by default.
* **Sign-in.** Email/password and anonymous sign-in run in the app unchanged.
  Google and GitHub open the default browser on `http://localhost:47815/desktop-auth`,
  because Google blocks OAuth inside embedded webviews. The provider popup runs
  there, and the credential is POSTed back to the local server with a one-time
  `state` (and an Origin check). The app then calls `signInWithCredential`, and the
  browser's own Firebase session is signed out. The result is the same Firebase
  user as on web and mobile.
* **AI.** The app calls `/api/v1/ai/generate` on the same origin, and the local
  server forwards it server-to-server. No CORS allowlist change is needed and
  no key ships in the app (see docs/SECURITY.md S1).
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
| Unit tests (local server) | `npm run test:mac` |
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

The local build has an **ad-hoc signature**, not Developer ID, and is not
notarized. A build made on your own Mac is not quarantined, so it opens directly. If you
copy the DMG/ZIP to another Mac (AirDrop, download), Gatekeeper blocks the
first launch. To allow it, right-click the app › **Open** › **Open**, or go to System
Settings › Privacy & Security › **Open Anyway**. You can also run
`xattr -dr com.apple.quarantine /Applications/ClearMind.app`.

## Architectures

The `build:mac` output is a universal binary (`lipo -archs` → `x86_64 arm64`).
There are no native Node modules, so both slices are complete. The minimum macOS
version is 12.0 (Electron 44's floor). The app has been verified on Apple Silicon
(macOS 26.7). The Intel slice is built but has not been run on Intel hardware.

## Tests (run on 2026-10-23, macOS 26.7.2 arm64, Xcode 27.0)

* `npm run test:mac`: 6/6 pass (static serving, SPA fallback, path traversal,
  API forwarding without cookies, OAuth callback state/origin/provider checks,
  port-in-use error).
* `npm run test:e2e:mac`: 7/7 pass, both unpackaged and against the packaged
  universal `.app`. Covered: window size limits, localhost origin, the bridge is the only
  exposed API (no `require`/`process`), the app renders with no page errors and no
  service worker, the Go menu changes the route, `/api/v1` reaches the real production API
  (401 when signed out), the sign-in page renders, and close-to-Dock then reopen works.
* A real Chromium popup from `http://localhost/desktop-auth` reaches
  `accounts.google.com`, so Firebase accepts the localhost origin. A full
  Google/GitHub/email sign-in needs a human with an account and has not been automated.
* Existing suite: `npx vitest run`, 36 files / 343 tests pass.
* `codesign --verify --deep --strict` passes (ad-hoc). The DMG mounts with
  `ClearMind.app` and an Applications link.

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
* The loopback server binds `127.0.0.1` only. It serves static files and a
  one-time sign-in endpoint, and forwards `/api/v1` with the caller's own token.

## Future distribution (nothing has been submitted)

### Outside the App Store (Developer ID + notarization)

1. In the Apple Developer account (team of the iOS app), create a **Developer ID
   Application** certificate and install it in the login keychain. Only an
   "Apple Development" identity is present today.
2. Create an app-specific password (or an App Store Connect API key) for notarization.
3. Build:
   ```sh
   APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=… \
   npm run build -w apps/desktop -- \
     -c.mac.identity="Developer ID Application: Meertech LTD (TEAMID)" \
     -c.mac.hardenedRuntime=true -c.mac.notarize=true
   ```
   `build/entitlements.mac.plist` already has the JIT entitlements Electron needs
   under the hardened runtime.
4. Check the result with `spctl -a -vv dist/mac-universal/ClearMind.app` (it should say "Notarized
   Developer ID") and `xcrun stapler validate dist/ClearMind.dmg`.

### Mac App Store (later)

* **Identity:** `tech.meertech.clearmind.mac`, version 1.0.0 (`apps/desktop/package.json`),
  category Productivity. To share one App Store record and Universal Purchase
  with iOS, switch to `tech.meertech.clearmind` before the first submission.
* **Target:** add an electron-builder `mas` target with a "Apple Distribution" cert,
  "Mac Installer Distribution" cert and a provisioning profile
  (`build/embedded.provisionprofile`).
* **Sandbox entitlements (`build/entitlements.mas.plist`):** `com.apple.security.app-sandbox`,
  `com.apple.security.network.client` (Firebase/API), `com.apple.security.network.server`
  (the loopback server), and `com.apple.security.files.user-selected.read-write`
  (Excel import/export, attachments).
* **Review risks:**
  * Guideline 4.2 (minimum functionality / web wrappers): the bundled
    offline build, menus and Dock behaviour help.
  * Guideline 4.8: Sign in with Apple, because Google sign-in is offered. iOS already has it, but the
    web/desktop flow does not yet, so Apple would have to be added as a Firebase OAuth provider on web
    with a Services ID.
  * Opening the browser for sign-in is allowed. The loopback port must also work under the sandbox.
* **Privacy:** reuse the iOS App Privacy answers and `public/privacy.html`. The Mac app
  collects the same data, minus the microphone.
* **Upload:** `electron-builder --mac mas` → Transporter → App Store Connect →
  macOS platform on the ClearMind record.

## Troubleshooting

* **"Port 47815 is already in use"**: another program has the port. Quit it
  (`lsof -i :47815`). The port is fixed because local data is tied to it. You can override it with
  `CLEARMIND_PORT`, but that starts with an empty local store.
* **App shows only local mode / no cloud sign-in**: `.env.local` was missing at
  build time. Add it (see Prerequisites) and rebuild.
* **"Web build missing"**: run `npm run build:web -w apps/desktop` (or `build:mac`).
* **Google sign-in "unauthorized domain"**: `localhost` was removed from Firebase
  Auth › Settings › Authorized domains. Add it back.
* **electron-builder "unknown property"**: options live under `mac`/`dmg` in
  `apps/desktop/electron-builder.yml`. There is no top-level `zip` key.
* **Huge `app.asar`**: the `!**/node_modules/**` file filter keeps the workspace's
  dependencies out. The shell has no runtime dependencies.
* **"ClearMind is damaged" on another Mac**: this is quarantine on an unsigned build. See Install.
* **Developer tools**: View › Toggle Developer Tools (⌥⌘I).
