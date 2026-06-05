# ClearMind — Web → Mobile Porting Notes (Phase 0 recon)

Generated from a read of `services/*`, `App.tsx`, `components/Sidebar.tsx`, and
all 20 view files in `components/views/`. This is the contract every later phase
must honor. **Read the "Sync contract" and "Firestore paths" sections before
writing any mobile data code (Phases 3–4).**

---

## 1. Firestore paths & sync contract (THE keystone — must match byte-for-byte)

Confirmed from `services/firebase.ts`:

- **Per-user scope.** Every syncable collection is at
  `users/{uid}/{firestoreCollectionName}`. Profile is the top-level doc
  `users/{uid}` (fields `nickname`, `email`, `provider`, `joinedAt`, `photoURL`).
- **Collection-name renames** (local store → Firestore collection), from the
  canonical map now in `shared/data/collections.ts`:
  | local store | Firestore collection |
  |---|---|
  | `logs` | `dailyLogs` |
  | `dailymapper` | `timeblocks` |
  | `dailymappertemplates` | `timeblocktemplates` |
  | `learningresources` | `learningResources` |
  | `learningfolders` | `learningFolders` |
  | (all others) | same name |
  | `profile` | *(never synced)* |

**Sync contract invariants** (mobile sqlite + sync MUST replicate exactly):

- Every local `put` stamps `updatedAt = new Date().toISOString()`.
- Every cloud push stamps `syncedAt = new Date().toISOString()`.
- **Soft delete** = `{ ...existingItem, deleted: true, deletedAt, updatedAt }`
  (preserve the existing record), pushed to cloud. `getAll` filters out
  `deleted` items; `getAllIncludingDeleted` does not (sync uses the latter).
- **Hard delete** (`hardDelete`) = true removal + `deleteItemFromCloud`; used for
  30-day tombstone cleanup and for `dailymappertemplates` deletes.
- LWW priority `updatedAt > lastEdited > syncedAt`, fallback epoch; **tie → cloud
  wins**.
- `dbService.put` / `dbService.delete` **internally fan out to Firebase**
  (`pushItemToCloud`) when configured. **Views never import `firebaseService`** —
  they rely on this side effect. The mobile `dbService` must preserve it, or
  writes won't sync. (Confirmed across Dashboard, Projects, Tasks, Calendar, etc.)

---

## 2. Cross-cutting concerns (apply to nearly every view)

These recur in almost all 20 views; solve once in the mobile shell/UI kit:

1. **`clearmind-sync` event bus.** Every list/detail view does
   `window.addEventListener('clearmind-sync', …)` and reloads its store when
   `e.detail.store === '<store>'`. RN has no `window` events → replace with a
   single shared emitter (`DeviceEventEmitter` or a small typed event bus / store)
   that the mobile sync layer publishes to, mirroring the per-store filter.
   `services/syncService.ts` `dispatchSyncEvent` / `dispatchAllSyncEvents` is the
   web emitter; the mobile sync service needs the equivalent.
2. **`dbService` is IndexedDB-backed** (`services/db.ts`). Mobile reimplements the
   *same API* (`getAll`, `get`, `put`, `delete` soft, `hardDelete`,
   `getAllIncludingDeleted`, `putBatchLocalOnly`, `cleanupDeletedItems`) over
   **expo-sqlite**, preserving the auto-sync + soft-delete semantics above.
3. **Blocking dialogs:** `window.confirm` / `alert` / `prompt` → `Alert.alert`
   (async) and TextInput modals. Present in Tasks, Notes, Habits, Goals,
   Calendar, Milestones, Projects, MindMap, DailyMapper, Iris, LearningVault,
   Applications.
4. **Native HTML inputs** `<input type=date|time>`, `<select>`, `<input
   type=range>`, `<input type=number>` → `@react-native-community/datetimepicker`,
   a Picker / bottom-sheet, `@react-native-community/slider`, `keyboardType`.
5. **Fixed-overlay modals** (`fixed inset-0 z-50 bg-black/50`) → the kit's `Sheet`
   (`@gorhom/bottom-sheet`) or RN `Modal`.
6. **`lucide-react` → `lucide-react-native`** everywhere. **Tailwind `className`
   → NativeWind.**
7. **`localStorage`** (Applications prefs, LearningVault prefs, notification prefs,
   app-deadline dedupe, theme, pwa-installed) → `AsyncStorage`. Note async init
   (no synchronous `useState` initializer from storage).
8. **Connectivity:** Milestones uses `navigator.onLine` + `online`/`offline`
   events → `@react-native-community/netinfo` (Phase 4 offline queue).

---

## 3. Per-view inventory (priority order from the build plan)

| View | Reads | Writes | Service calls | Hardest mobile bit |
|---|---|---|---|---|
| **Dashboard** | tasks, habits, logs, projects, goals | tasks(+), logs(+), habits(upd) | `dbService.getAll/put` | quick-create modals; relies on implicit put→cloud sync; 30s `setInterval` + sync-event refresh |
| **Tasks** | tasks | tasks (CRUD, soft-del) | `dbService.getAll/put/delete` | soft-delete+sync contract; date/time pickers; `Notification.permission` "Enable Reminders" → expo-notifications |
| **Projects** ⚠️ largest (122KB) | projects | projects + all embedded sub-entities (phases, risks, resources, metrics, check-ins, alignments) via full-record `put` | `dbService.getAll/put/delete` | **xlsx import/export** (file picker→`expo-document-picker`, `file.arrayBuffer()`→`expo-file-system`, `XLSX.writeFile` download→buffer+`expo-sharing`); huge form → break into sub-screens. Sub-entities are embedded fields, not separate stores |
| **Calendar** | events | events (upsert, soft-del) | `dbService.getAll/put/delete` | 6×7 month grid (Flexbox + Pressable), `onDoubleClick` quick-add → double-tap gesture, date/time pickers |
| **Daily Mapper** (50KB) | dailymapper, dailymappertemplates | dailymapper (CRUD, auto-move, template materialization), templates (create + **hardDelete**) | `getAll/put/delete/hardDelete` | `loadEntriesAndAutoMove` reconciliation on mount (auto-moves incomplete entries to today, materializes recurring templates w/ dedupe) — ideally move into sync layer; `prompt()` for target date |
| **Habits** | habits | habits (CRUD, **hard delete**) | `getAll/put/delete` | weekly/monthly calendar grid; note `delete` here is a hard delete in-view |
| **Goals** | goals | goals (CRUD, hard delete) | `getAll/put/delete` | range slider, date input, select |
| **Milestones** | milestones | milestones (CRUD, soft-del) | `getAll/put/delete`, `firebaseService.subscribeToCollection`, `isFirebaseConfigured` | `navigator.onLine` + online/offline + `setInterval` auto-sync → netinfo; only view calling `subscribeToCollection` directly |
| **Daily Log** | logs | logs (create) | `getAll/put` | simple; sync-event reload |
| **Notes** | notes | notes (CRUD, soft-del) | `getAll/put/delete` | master/detail two-pane → React Navigation list→detail or Sheet |
| **Rant Corner** | rants + 10 stores (context) + profile | rants (CRUD, soft-del) | `getAll/get/put/delete`, `geminiService.generateIrisResponse` | builds UserContext from 11 stores for Gemini |
| **Applications** | applications | applications (CRUD) | `getAll/put/delete` | localStorage prefs; SectionList grouping; external link → `Linking.openURL` |
| **Learning Vault** (65KB) | learningResources, learningFolders | resources (CRUD, **hardDelete**, embedded notes), folders (create, hardDelete + bulk unassign) | `getAll/put/hardDelete` | `fetchMetadataFromUrl` → third-party oEmbed `fetch()` (consider Cloud Function proxy); `window.open`→Linking; `<img>`→`Image` w/ fallbacks; grid→FlatList numColumns |
| **Mind Map** (39KB) | mindmaps | mindmaps (create, update nodes/edges, soft-del) | `getAll/put/delete`, `generateResponse`, `isApiConfigured` | **interactive zoom/pan/drag canvas**: `getBoundingClientRect` + mouse/touch math + raw `<svg>` → `react-native-svg` + `gesture-handler` + `reanimated`; `crypto.randomUUID`→`expo-crypto` |
| **Analytics** | logs, tasks, projects, habits, goals, events, rants | — (read-only) | `dbService.getAll` | **recharts → victory-native** (Pie, Area, horizontal Bar); same aggregations |
| **Iris (AI)** (36KB) | iris_conversations, profile + 12 stores | iris_conversations + writes across ~all stores via action commands (put/delete/hardDelete) | `geminiService.generateIrisResponse` + `parseActionCommands`, `dbService.get/getAll/put/delete/hardDelete` | **`executeActions()`**: parses Gemini output into ~30 action types, sequential store mutations w/ case-insensitive name matching. Pure logic, ports cleanly over mobile dbService. Chat UI = `ChatBubble`+`ChatInputBar`; `scrollIntoView`→`scrollToEnd`; persists to `iris_conversations` (doc id `current-iris-conversation`) |
| **Settings** | profile (prop) + transitive all 16 stores via `syncAllStores` | profile (update), transitive all-store sync | `dbService.put(PROFILE)`, `isFirebaseConfigured`, `syncAllStores`, `dispatchAllSyncEvents`, notification prefs/scheduler | notifications block (`Notification.permission` 3-state UI → expo-notifications statuses); Cloud Sync button = `syncAllStores()` |
| **Auth** | — | — | `firebaseService.signUp/signIn{Email,Google,Github,Anonymously}`, `resetPassword`, `isFirebaseConfigured` | **OAuth popup** (`signInWithPopup`) has no RN equivalent → `expo-auth-session`/`@react-native-google-signin` → `signInWithCredential`; drop `auth/popup-*` error maps; inline Google `<svg>`→`react-native-svg` |
| **Onboarding** | — | profile (create; local-only, PROFILE excluded from sync) | `dbService.put(PROFILE)`, `isFirebaseConfigured` | low complexity; logo `<img>`→bundled `Image` asset |

> **Sidebar nav order** (`components/Sidebar.tsx`) drives the mobile tab/drawer:
> Dashboard, Projects, Tasks, Applications, Calendar, Daily Mapper, Notes,
> Learning Vault, Habits, Goals, Milestones, Mind Map, AI (Iris), Rant Corner,
> Daily Log, Analytics, Settings. (17 routes incl. Settings; Auth/Onboarding are
> pre-auth.) A 5-tab bottom bar + "More" drawer is the likely mobile mapping.

> **Note:** `AetherisView.tsx` is a second, self-contained AI chat (no stores, only
> `geminiService.generateIRISResponse`). Not in the Sidebar; treat as legacy/extra.

---

## 4. Service deep-reads

### `geminiService.ts` — FULLY DOM-FREE ✅ (extract to `shared/ai/geminiCore.ts`)

The **only** platform line is `const GLOBAL_API_KEY = process.env.GEMINI_API_KEY
|| process.env.API_KEY || ''` (line 5), used by `getApiKey`, `isApiConfigured`,
`getAI`. Everything else is pure: `cleanResponse`, `formatUserContext`,
`parseActionCommands`, `parseTaskCommands`, all `Parsed*`/`UserContext`
interfaces, and the prompt + `generateContent` logic in `generateResponse`,
`generateIrisResponse`, `generateIRISResponse`.

**Extraction plan (Phase 1.5):** move the pure logic into `shared/ai/geminiCore.ts`;
refactor the `generate*`/`getAI` functions to accept an **injected apiKey or
`GoogleGenAI` client**. Keep `process.env` reads, `GLOBAL_API_KEY`, `getApiKey`,
and the env-backed `isApiConfigured` at the web boundary (`services/geminiService.ts`
becomes a thin adapter). `cleanResponse`/`formatUserContext` are currently
unexported — export them from the shared module. Caveat: a few `new Date()` calls
for default dates (non-deterministic but platform-agnostic). `shared` gains a
`@google/genai` dependency.

### `notificationService.ts` — NOT DOM-free (Phase 7 native port)

Scans **three** stores for deadlines: `tasks`, `applications`, `events` (no
goals/projects/milestones/habits). Decision logic to replicate on mobile:

- **Tasks:** skip completed/`notified`/no-`dueDate`; deadline = `${dueDate}T${dueTime}`
  or `…T23:59:59`; fire when `0 < timeTillDeadline <= advanceNoticeHours` (default
  24h); also "Overdue" within the last 1h. Sets `notified: true` on the record.
- **Applications:** skip `closed/submitted/accepted/rejected`; deadline =
  `submissionDeadline || closingDate` at `T23:59:59`; fixed buckets
  **24h / 72h / 168h**, once per crossed bucket. Dedupe via **localStorage** keys
  `app-notified-${id}-${hours}` — **NOT** a DB flag (mobile: AsyncStorage/MMKV).
- **Events:** skip no-`reminder`/`notified`; start = `${date}T${startTime}` or
  `…T09:00:00`; fire 30 min before. Sets `notified: true`.

Web-only: Notification API, service worker `/sw.js`, `localStorage`, 5-min
`setInterval` foreground poll. Shareable: the date-math + `NotificationPreferences`
shape (`enabled`, `taskReminders`, `applicationDeadlines`, `calendarReminders`,
`advanceNoticeHours`, `dailySummary`*/`dailySummaryTime`* — *declared but
unimplemented). Mobile (Phase 7): `expo-notifications` + `expo-background-task`/
`expo-task-manager`; prefs → AsyncStorage. **Keep the `notified` field semantics
so web & mobile don't double-notify.**

> ⚠️ App.tsx also contains an **inline** notification loop (separate from
> `notificationService.ts`) with slightly different thresholds (tasks within 5
> min / 8–9am; events 15 min; apps 1/3/7 days via `localStorage` keys
> `app-deadline-${id}-${days}`). Phase 7 should consolidate on the
> `notificationService` model and not port the inline duplicate.

---

## 5. Heavy deps → mobile swaps (summary)

| Web | Mobile |
|---|---|
| `recharts` (Analytics) | `victory-native` |
| `xlsx` download (Projects) | `xlsx` buffer + `expo-file-system` + `expo-sharing`; file import via `expo-document-picker` |
| raw `<svg>`/canvas (MindMap) | `react-native-svg` + `gesture-handler` + `reanimated` |
| `lucide-react` | `lucide-react-native` |
| `@google/genai` | same (fetch-based, RN-OK) via `shared/ai/geminiCore` |
| `firebase` web SDK + `signInWithPopup` | `firebase` JS SDK + `initializeAuth(getReactNativePersistence)`; OAuth via `expo-auth-session` |
| IndexedDB | `expo-sqlite` |
| `localStorage` | `@react-native-async-storage/async-storage` |
| Web Notifications + SW | `expo-notifications` + background task |
| hash routing | `expo-router` |
