# ClearMind — Architecture & Build Decisions

This log records every non-obvious decision and assumption made while adding the
native **iOS + Android (Expo / React Native)** app that shares the web app's
backend and core logic. Append-only; newest phase at the bottom.

---

## Prime constraints (non-negotiable)

1. **The existing web app must never break.** `npm run dev`, `npm run build`,
   `npm run test` stay green at every commit. No user-visible web change.
2. **One shared core, imported by both web and mobile.** No duplicated `types`,
   Gemini logic, collection map, or merge engine.
3. **Same Firebase project, same Firestore paths.** Mobile reads/writes the
   identical document paths the web app uses so a single user's data syncs
   web ⇄ mobile in real time.

---

## D1 — Monorepo shape: keep web at root, add `shared/` + `apps/mobile/`

**Decision:** Took the prompt's explicit *lower-risk alternative*. The web app
stays at the repository root (unchanged file locations); we add a `shared/`
workspace package and `apps/mobile/`. Root `services/*` are refactored to import
from `shared` instead of defining the core logic locally.

**Why:** The web app is a root-level Vite project with `import.meta.env`, a `@`
path alias, a service worker registered at `/sw.js`, and `public/` asset paths.
Relocating it to `apps/web/` would churn `vite.config.ts`, `tsconfig.json`,
`index.html`, deployment config (`vercel.json`), and every relative import — a
large blast radius for zero functional benefit. Keeping it in place satisfies the
real requirement ("one shared core imported by both") with minimal risk.

## D2 — Web resolves `@clearmind/shared` via a Vite/tsconfig alias to TS source

**Decision:** `shared/` ships raw TypeScript (no build step). The **web** resolves
`@clearmind/shared` through a Vite `resolve.alias` and a `tsconfig` path that
point directly at `shared/` source. **Mobile** (Metro) resolves it via npm
workspace symlink + `metro.config.js` `watchFolders`, transpiling the TS source.

**Why:** Aliasing straight to source decouples the web build from npm package
`exports`-field resolution quirks (and from `allowImportingTsExtensions`
interactions). Vite and Vitest both consume TS directly, so the same alias serves
dev, build, and test. This is the lowest-risk way to guarantee the web build
stays byte-for-byte green while the implementation physically moves to `shared/`.

## D3 — npm workspaces (not Yarn/PNPM)

**Decision:** Use **npm workspaces** (`"workspaces": ["shared", "apps/*"]`). The
repo already ships a `package-lock.json` and the toolchain is npm.

**Why:** Switching package managers is gratuitous churn and risks a different
dependency resolution than the one the green baseline was built against. npm
workspaces are sufficient for hoisting `firebase` / `@google/genai` so the shared
package and both apps share one copy.

## D4 — `shared/data/firestore.ts` takes `(db, uid)` injected, not a global

**Decision:** The shared Firestore read/write/subscribe functions accept the
Firestore instance **and the uid** as arguments. `sanitizeForFirestore`
(recursive `undefined → null`) and the batch-chunking logic (450-op chunks, 3
concurrent batches) move into this shared module too.

**Why:** Every document path is `users/{uid}/{collection}`. Shared code cannot
reach the web's `auth.currentUser` singleton, so the caller injects the uid (web
passes `auth.currentUser.uid`; mobile passes its own). `sanitizeForFirestore` and
the chunking must be **byte-identical** across platforms or mobile writes would
diverge from web writes for the same record.

## D5 — Gemini extraction is sequenced last and lowest-priority in Phase 1

**Decision:** `types`, `data/collections`, and `sync/merge` are extracted first
(they de-risk mobile data parity and are clean/DOM-free). `ai/geminiCore` is
extracted last; if it ever threatens the green build it is carried as a thin
re-export rather than blocking the foundation.

**Why:** Iris (AI) is Phase 6 work, while the data layer is what mobile sync
depends on. `geminiService.ts` is ~900 lines; the API key must be **injected**
(no `process.env` reads inside `shared`). The web boundary keeps reading
`process.env.GEMINI_API_KEY`; mobile reads `EXPO_PUBLIC_GEMINI_API_KEY` — both
pass the key into the shared core.

## D6 — Existing `services/sync.test.ts` is left intact; a new shared-import test is added

**Decision:** `services/sync.test.ts` is self-contained (it duplicates the merge
logic and store map and imports nothing from `services/`), so it stays green
through the refactor. Rather than rewrite it, we **add** a test that imports the
real `shared` modules and asserts identical behavior, giving genuine coverage of
the extracted code. The original is now effectively a spec-level duplicate.

**Why:** Keeps the 26-test safety net untouched while proving the extraction
preserved behavior. (Vitest `include` is currently `services/**/*.test.ts`, so
the new test lives under `services/` or the glob is extended.)

## D7 — Session scope: Phases 0–1 verified, Phase 2 scaffolded, 3–9 roadmapped

**Decision:** This session delivers Phase 0 (recon + green baseline) and Phase 1
(shared core) fully built and **verified** (web build + tests green), scaffolds
Phase 2 (Expo skeleton), and documents Phases 3–9 as a concrete continuation
roadmap.

**Why:** A full native app with auth providers, sqlite sync, 18 ported views,
notifications, and EAS builds cannot be *verified* in this environment (no
simulator, no real Firebase credentials, no device). The prompt's own prime
directive — "never advance with a red build" — means the honest deliverable is a
rock-solid, verified foundation plus a faithful roadmap, not thousands of lines
of unverifiable RN code.

---

## Sync contract invariants (must hold identically on web and mobile)

These are the rules the mobile sqlite + sync layer (Phase 4) must replicate
exactly, or web ⇄ mobile records will diverge:

- Every local `put` stamps `updatedAt = new Date().toISOString()`.
- Every cloud push stamps `syncedAt = new Date().toISOString()`.
- Soft delete writes `{ ...existingItem, deleted: true, deletedAt, updatedAt }`
  (preserves the existing item's fields) and pushes that to the cloud.
- Hard delete (cleanup) removes items soft-deleted > 30 days ago.
- The `profile` store **never** syncs to the generic collections; the profile
  lives at the top-level Firestore doc `users/{uid}`.
- Last-write-wins timestamp priority: `updatedAt > lastEdited > syncedAt`,
  falling back to epoch (`1970-01-01T00:00:00.000Z`).
- On equal timestamps, the **cloud** item wins.

## Firestore path scheme (confirmed from `services/firebase.ts`)

- Syncable collections: `users/{uid}/{firestoreCollectionName}` (per-user scope).
- User profile: top-level document `users/{uid}` (fields: `nickname`, `email`,
  `provider`, `joinedAt`, `photoURL`).
- Collection-name renames (IndexedDB store → Firestore collection):
  `logs → dailyLogs`, `dailymapper → timeblocks`,
  `dailymappertemplates → timeblocktemplates`,
  `learningresources → learningResources`, `learningfolders → learningFolders`.
  All other stores map 1:1. `profile` is not in the map (not synced).

---

## D8 — Phase 2 Expo skeleton: Expo SDK 53 / React 19, scaffold-not-install

**Decision:** `apps/mobile` targets **Expo SDK 53** (React 19.0.0, RN 0.79), which
keeps React on 19.x — aligned with the web app's React 19.2.3. NativeWind v4 +
the full interaction stack (gesture-handler, reanimated, bottom-sheet, haptics,
blur, svg, lucide-react-native) are declared. `metro.config.js` watches the
workspace root so Metro transpiles `@clearmind/shared` TS source; deps resolve
from the app then the hoisted root.

This session **scaffolds** the mobile project (config + Firebase/Gemini adapters
that consume the shared core) but does **not** run the heavy RN `npm install` or
boot a simulator.

**Why:** (1) Phase 2's real verification — "expo start boots, placeholder
renders" — requires a simulator/device unavailable here, so installing the
toolchain adds no *verifiable* value. (2) Installing RN deps re-resolves the root
workspace and risks the green web build (React-version hoisting). Web uses
`^19.2.3`; mobile pins `19.0.0`, so npm keeps `19.2.3` hoisted for web and nests
`19.0.0` for mobile — but that only matters once a developer runs install, which
is documented in `apps/mobile/README.md` as the next step. The scaffold files are
written correct-by-construction against the shared API (which this session
authored), and creating them leaves the web build untouched (verified: 34 tests +
build still green).

**Mobile↔shared proof points:** `lib/firebase.ts` (initializeAuth +
getReactNativePersistence, same config keys as web), `services/firebaseService.ts`
(mirrors web method names; Firestore via `@clearmind/shared/data/firestore` with
injected `(db, uid)` → identical `users/{uid}/{collection}` paths),
`services/gemini.ts` (mirrors web adapter; injects `EXPO_PUBLIC_GEMINI_API_KEY`
into the shared `geminiCore`). Google/GitHub sign-in are stubbed with explicit
Phase 3 TODOs (no `signInWithPopup` on native).

**Continuation:** Phases 3–9 are specified in `apps/mobile/ROADMAP.md`.

---

## D9 — Phase 10 Part A: branding from the real logo, not the brief's listed sources

**Decision:** Mobile iconography is generated from `public/clearmindlogo.png` (the
real ClearMind head+lightbulb mark) by `apps/mobile/scripts/generate-icons.mjs`,
**not** from the `public/icon-*.png` / `apple-touch-icon.png` / `favicon.png` the
brief listed. The app icon is the **symbol only** (wordmark cropped, bbox detected
by per-row alpha analysis: symbol `y139–670`, wordmark `y727–846`); the splash is
the full lockup with wordmark; the Android notification icon is a flat white head
silhouette. Backgrounds use the exact web `midnight` `#05050A` and accent `#3B82F6`
(from index.html's Tailwind config). `app.json` → `app.config.ts` so versionCode /
EAS projectId read from env.

**Why:** I verified (viewed the actual pixels) that `public/icon-512.png` and the
whole PWA icon set are a **generic blue-server + yellow-database stock graphic**
(generated from `clearmindlogo.jpg`), not the ClearMind brand. Following the brief
literally would ship a database icon — the opposite of its intent ("inherit the
ClearMind icon, not a placeholder"). The user confirmed: use the real logo,
symbol-cropped. `icon.png` is flattened with **no alpha channel** (iOS App Store
rejects icons with alpha).

## D10 — Phase 10 B/C: `eas build --local` primary, signing via secrets

**Decision:** CI builds the signed `.aab` + `.apk` on the GitHub runner with
`eas build --local` (no Expo cloud, no `EXPO_TOKEN`). The upload keystore is never
committed — it is base64-stored as a GitHub secret, decoded at build time;
`credentials.example.json` (tracked) is `envsubst`'d into `credentials.json`
(gitignored) which EAS reads for signing. `eas.json` uses
**`appVersionSource: "local"`** (brief said `"remote"`) so `versionCode` comes
from `app.config.ts`'s `ANDROID_VERSION_CODE` env (the CI run number); `"remote"`
would require an EAS account and ignore the env-driven versionCode. The workflow
uses `npm install` (not `npm ci`) because the skeleton lockfile isn't yet synced
with the hand-pinned mobile deps.

**Known caveat (documented, not blocking):** `eas build --local` archives the
*project* dir, while `@clearmind/shared` lives at the workspace root
(`../../shared`). If EAS can't resolve the shared package, switch to the **Gradle
fallback** (in-place `expo prebuild` + `gradlew`, where Metro's `watchFolders`
resolves shared); `apps/mobile/scripts/patch-android-signing.mjs` (idempotent)
injects the release `signingConfig` for that path. Both paths are documented in
`apps/mobile/README.md`.

**Not run this session (environment limits, faithfully scoped):** the RN toolchain
install, `expo prebuild`, the CI build itself, device install, and `jarsigner`/
`bundletool` signing verification all require the installed toolchain / a runner /
GitHub secrets / a device — none available here. The **source branding was
visually verified**; the workflow YAML + both scripts pass parse/syntax checks; no
secret material is tracked; and the web app stays green. The first real CI run is a
developer step after setting the 11 secrets and committing a synced lockfile.
