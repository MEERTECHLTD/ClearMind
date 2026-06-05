# ClearMind Mobile — Build Roadmap (Phases 3–9)

Phases 0–2 are **done and committed** (recon, shared core, Expo skeleton). This is
the concrete continuation. Every phase ends the same way: **run its verification,
update `DECISIONS.md`, commit.** Keep the web build green (`npm run build` + `npm
run test` from the repo root) at every commit — the shared core is imported by both.

The keystone is already in place: `@clearmind/shared` owns `types`, the
`STORE_TO_FIRESTORE` map + helpers, the LWW `mergeItems` engine, the Firestore
ops (`(db, uid)`-injected), and the DOM-free `geminiCore`. Mobile must **consume**
these — never re-implement them.

---

## Phase 3 — Auth + onboarding parity

**Build**
- `app/(auth)/sign-in.tsx`, `app/(auth)/onboarding.tsx` — port `AuthView` /
  `OnboardingView` UX with the kit (Phase 5). Logo from `assets/`.
- Finish `services/firebaseService.ts` Google/GitHub (currently stubbed):
  - **Google:** `expo-auth-session` Google provider (or `@react-native-google-signin`)
    → get `id_token` → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential(auth, cred)`.
    Use `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`. Drop the web `auth/popup-*` error mapping.
  - **GitHub:** `expo-auth-session` AuthRequest against GitHub OAuth → exchange code
    for token (needs a tiny token-exchange endpoint / Cloud Function — GitHub has no PKCE-only flow)
    → `GithubAuthProvider.credential(token)` → `signInWithCredential`.
- Root `app/_layout.tsx`: gate on `firebaseService.onAuthChange`; mirror `App.tsx`
  profile bootstrap (local profile doc id `current-user`, `cloudUserId = uid`).

**Verify:** sign in on device with an **existing web account** → `getUserProfile`
loads from the same Firestore → a task created on web appears on mobile after sync.

---

## Phase 4 — Local store (expo-sqlite) + sync engine

**Build `services/db.ts`** — same public API as web `dbService` so views/sync are
identical: `getAll` (filters `deleted`), `get`, `put` (stamps `updatedAt`, then
fans out to `firebaseService.pushItemToCloud`), `delete` (soft: `{...item,
deleted:true, deletedAt, updatedAt}` + cloud push), `hardDelete`,
`getAllIncludingDeleted`, `putBatchLocalOnly`, `putLocalOnly`, `cleanupDeletedItems`
(30-day). One sqlite **table per store** (17 stores from `STORES`); store the
entity as a JSON column keyed by `id`, plus promoted columns `updatedAt`,
`lastEdited`, `deleted`, `deletedAt`, `syncedAt`, `notified` for query/sort.
> Preserve the **implicit put→cloud / delete→cloud fan-out** — views never import
> firebaseService (PORTING_NOTES §1). `profile` store does NOT sync.

**Build `services/syncService.ts`** — reuse `@clearmind/shared/sync/merge` and
`@clearmind/shared/data/collections`. Port `syncStore`, `syncAllStores`,
`handleRealtimeUpdate`, `syncDeletedItems`. Real-time via
`firebaseService.subscribeToAllCollections(getAllFirestoreCollections(), …)`.
Replace the web `clearmind-sync` window CustomEvent bus with a typed
`DeviceEventEmitter` (or a small store) the sync layer publishes to; views
subscribe by store key (PORTING_NOTES §2.1).

**Offline:** `@react-native-community/netinfo` — queue writes locally (the sqlite
write already succeeds offline; the cloud push is best-effort), flush/sync on
reconnect.

**Verify:** offline edit on mobile → reconnect → appears on web; delete on web →
soft-delete reflected on mobile; round-trip with no dup/lost records. Port the
`sync.test.ts` assertions against the shared engine under `__tests__/`.

---

## Phase 5 — Shared UI kit + navigation shell (messaging-app feel)

**Build `components/ui/`** (NativeWind tokens from `tailwind.config.js`):
`Button` (pill, haptic + press-scale), `IconButton` (circular ≥44pt, ripple/opacity),
`Fab`, `ListItem` (avatar + title + subtitle + trailing meta), `SwipeableRow`
(`react-native-gesture-handler` Swipeable + Reanimated; left=delete/archive,
right=complete/pin), `Sheet` (`@gorhom/bottom-sheet`, grabber + snap points),
`ChatBubble`, `ChatInputBar` (keyboard-avoiding, mic↔send morph), `Avatar`,
`Header` (compact, blur-on-scroll via `expo-blur`), `EmptyState`, `Skeleton`.
All later screens consume these — no ad-hoc styling.

**Navigation:** `expo-router` bottom **tab bar** for primary routes (line icons +
active accent + badges, haptic on change, safe-area aware). Sidebar order
(PORTING_NOTES) → 5 tabs (Dashboard, Tasks, Calendar, Iris, More) + a "More"
drawer/sheet for the rest. Port `TopBar`/`Sidebar` affordances (theme toggle,
sync-status, profile avatar) into `Header`. Theme context (default dark).

**Verify:** navigate to every route (stubs OK); kit shows correct press/haptic
feedback; sync-status reflects real sync events; theme toggle works.

---

## Phase 6 — Port the 18 views

Port `components/views/*` → `app/` screens. **Same data calls + shared logic; only
presentation changes.** Use the kit everywhere; list screens get swipe actions + a
create **FAB**; create/edit open as **Sheets**. Order + per-view specifics are in
[PORTING_NOTES.md](./PORTING_NOTES.md) §3. Commit after each:

1. Dashboard → 2. Tasks → 3. Projects (break up; xlsx via document-picker/file-system/sharing)
→ 4. Calendar + Daily Mapper (`react-native-calendars`; move the auto-move/template
reconciliation into the sync layer) → 5. Habits/Goals/Milestones/Daily Log →
6. Notes/Rant → 7. Applications → 8. Learning Vault (oEmbed fetch → consider a
Cloud Function proxy) → 9. Mind Map (`react-native-svg` + gesture-handler +
reanimated pan/pinch) → 10. Analytics (`victory-native`, same series) → 11. **Iris**
(full chat: `ChatBubble`+`ChatInputBar`, typing indicator, `executeActions` over
mobile `dbService`, persist to `iris_conversations`) → 12. Settings.

**Verify (per view):** CRUD round-trips through sqlite **and** syncs to Firestore;
the same record is visible on web. Iris responds via the shared Gemini core.

---

## Phase 7 — Native notifications

Replace the web SW scheduler with `expo-notifications` + `expo-background-task`/
`expo-task-manager`. Reuse the **exact deadline logic** from PORTING_NOTES §4
(tasks: `advanceNoticeHours` window + overdue-1h; applications: 24/72/168h buckets;
events: 30-min-before). Extract the shared date-math + `NotificationPreferences`
shape into `@clearmind/shared` (small) so web and mobile agree. **Keep the
`notified` flag semantics** (set `notified:true` on the record; app-deadline
dedupe → AsyncStorage keyed `app-notified-${id}-${hours}`) so web & mobile never
double-notify. Permissions on first run; toggles in Settings. Consolidate on the
`notificationService` model (ignore the inline `App.tsx` duplicate).

**Verify:** a task/app/event due soon → local notification fires; `notified`
set + synced so web doesn't re-fire.

---

## Phase 8 — Export, sharing & polish

- Port spreadsheet export: build the workbook with `xlsx` in memory →
  `expo-file-system` write → `expo-sharing` share. Import via `expo-document-picker`
  + `file.arrayBuffer()` (needs Buffer/base64 polyfill for SheetJS on RN).
- Safe-area + keyboard avoidance everywhere, pull-to-refresh on syncable lists,
  haptics on key actions, offline banner (netinfo), splash/icon/status-bar polish.

**Verify:** export opens correctly as `.xlsx`; UI behaves on a small Android phone
and a large iPhone.

---

## Phase 9 — Tests, EAS, docs

- Jest + React Native Testing Library for `services/db.ts` and `services/syncService.ts`;
  reuse/extend `sync.test.ts` against the shared engine. Shared-package tests run
  once and cover both consumers.
- `eas.json` with `development` / `preview` / `production` profiles (iOS + Android).
  Document build + submit. Suggested:
  ```jsonc
  { "cli": { "version": ">= 12" },
    "build": {
      "development": { "developmentClient": true, "distribution": "internal" },
      "preview":     { "distribution": "internal", "android": { "buildType": "apk" } },
      "production":  { "autoIncrement": true } },
    "submit": { "production": {} } }
  ```
  EAS env: set `EXPO_PUBLIC_FIREBASE_*` + `EXPO_PUBLIC_GEMINI_API_KEY` as EAS
  secrets (same Firebase project as web). Register iOS/Android OAuth client ids
  for Google sign-in and add the Firebase Android SHA-1 (from the EAS keystore).
- Update the root `README.md`: monorepo layout, run web vs mobile, env vars,
  EAS workflow. Finalise `DECISIONS.md`.

**Verify:** `eas build --profile preview --platform android` produces an
installable artifact; full sync round-trip works on the installed build against
the shared Firebase project.

---

## Acceptance (from the build brief)

- ✅ One shared core in `shared/`, imported by web **and** mobile — no duplicated
  types/Gemini/collection-map/merge. *(Done in Phases 1–2.)*
- ◻ Mobile uses the same Firebase project + Firestore paths; data syncs web ⇄
  mobile in real time incl. soft deletes. *(Adapters wired; full sync = Phase 4.)*
- ◻ All 18 views usable natively, backed by shared logic; Iris via shared Gemini.
- ◻ Native messaging-grade UI: kit everywhere, pill buttons, circular icon
  buttons, create FAB, swipe + long-press, bottom sheets, full Iris chat — in
  ClearMind's own theme, no third-party brand assets.
- ◻ Native notifications via the shared `notified` flag (no double-notify).
- ✅ Web app unchanged for users; build + tests stay green.
- ◻ EAS preview builds for iOS + Android.
