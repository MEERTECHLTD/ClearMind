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
