# ClearMind platform architecture

Priorities, in order: **data integrity → synchronization → productivity → agent interoperability → UX.**

```
            ┌───────────── shared/ (@clearmind/shared) ─────────────┐
            │ types · domain ops (pure, Edit[]) · filters · recurrence│
            │ quickAdd NLP · productivity · reminders planner         │
            │ widgets snapshot · SyncEngine · agent tool catalog      │
            └───────────────────────────────────────────────────────┘
   web (Vite, IndexedDB)   mobile (Expo, sqlite)   MCP/REST/CLI (firebase-admin)
            └──────────────── Firestore users/{uid}/{collection} ─────┘
```

## 1. One set of domain operations

`shared/domain/ops.ts` holds every mutation:
- tasks: create, update, complete, reopen, delete, restore, move, bulk;
- projects, sections, labels, comments, filters, templates, preferences.

Each operation is a pure function `(state, input, ctx) → { result, edits: Edit[] }`. Validation, activity entries, completion events, recurrence roll-forward and subtask cascades all live here.

**Every client applies the same edits**: web, mobile, widgets, notification actions, MCP, REST and CLI. `ctx` carries:
- `source`: `web`, `android`, `ios`, `widget`, `notification`, `mcp`, `api` or `cli`;
- `agent`;
- `timezone`;
- `now`.

As a result, attribution, activity and productivity are identical whichever client made the change.

## 2. Sync

Code: `shared/sync/*`, `shared/data/firestoreSync.ts`. Rationale: DECISIONS.md D14.

**Records**
- Every record carries **per-field clocks** (`_fc`), `clientId`, `mutationId` and `_serverAt`.
- `stampEdit` applies an edit onto the current record and stamps only the fields that changed.
- `mergeRecord` resolves each field independently. The newer clock wins, so completing on mobile and editing the description on web never overwrite each other.
- Deletes are **tombstones** (`deleted` has its own clock). A stale offline device can't resurrect a deleted record.

**Outbox**
- Every write lands in local storage (IndexedDB on web, sqlite on mobile) first. It then goes into a persistent **outbox**, which survives restarts.
- The outbox is pushed as Firestore merge-writes stamped with `serverTimestamp`.
- Failed pushes are retried with exponential backoff, up to 60 s.
- Writes are idempotent, so a retry never creates a duplicate. Creates can also carry an `idempotencyKey`, giving a deterministic id (`idFromKey`).

**Reading changes**
- **Delta listeners:** one per collection, `where _serverAt >= cursor`. A restarted client downloads only what changed.
- `ingest` is outbox-aware: a pending local edit is never clobbered by an older remote value.
- **Full reconcile** runs every 24 h, or from Settings → Data → Sync now, and repairs any drift.

**Other clients and processes**
- **Agents** write server-side, in a transaction with the same field clocks (`server/firestoreRepo.ts`). Clients receive their changes through the delta listeners like any other change.
- **Android widgets and headless tasks** run in a separate JS context. They write to sqlite and the outbox and try to push themselves. They also set `clearmind:externalWrites`; on the next foreground, the app runs `engine.reloadOutbox()` and re-broadcasts the touched collections.
- **Time zones:** due dates are local calendar dates plus an optional `HH:mm`, with an optional per-task or user `timezone`. `shared/tasks/time.ts` converts them (`zonedToUtc`, `dayInZone`). Completion days are recorded in the user's zone.
- **Status UX:** `onSyncStatus` reports `idle`, `syncing`, `offline` or `error`, plus the pending count and last sync time. It is shown in Settings → Data and in the sync indicator.
- **Multi-client tests:** `shared/sync/engine.test.ts` simulates several devices against an in-memory server. It covers realtime create, offline queue, concurrent field edits, stale delete, retry without duplicates, agent ↔ clients, delta cursor and widget-context writes.

## 3. Notifications

The plan is pure and deterministic: `planNotifications` in `shared/domain/reminders.ts` builds it from tasks and Preferences. It produces:
- explicit reminders, relative or absolute;
- the default reminder;
- the daily plan at `dailyPlanAt`;
- the weekly summary.

The plan respects quiet hours and a cap. Each item has a stable `key`.

**Mobile** (`apps/mobile/services/notifications.ts`, `runtime.ts`)
- The OS schedule is reconciled against the plan with `diffSchedule`: only changed items are cancelled or scheduled, using the key as the notification identifier.
- Category `cm-task` has the actions **Complete**, **Snooze 15 min** and **Tomorrow**. These run the shared domain ops with `source: notification`, even from the lock screen.
- Channels: `reminders` and `digest`.
- Tapping a notification deep-links to `clearmind://task/<id>`.
- Permission flow: explain → request → if denied, link to system settings. A test notification is available in Settings.

**Web** (`services/webReminders.ts`)
- Uses the same planner. Timers are armed for the next 24 h and re-planned when tasks or preferences change.
- Already-fired keys are remembered in each browser's localStorage. Nothing is written back to synced tasks.
- Clicks open `/#today?task=<id>`.

## 4. Android widgets

Five widgets, built on `react-native-android-widget`: **Today**, **Inbox**, **Upcoming**, **Productivity** (Momentum) and **Quick add**.
- `shared/domain/widgets.ts` builds a compact snapshot. The app writes it to AsyncStorage after every data change (`services/widgetData.ts`) and on the daily tick.
- `widgets/handler.tsx` is the headless task handler. It renders from the snapshot, and tapping a task's circle runs `completeTask` with `source: widget` (see Sync above).
- The `+` and Quick add widgets open `clearmind://quickadd`, and rows open the task.
- Configuration lives in `app.config.ts`: the `react-native-android-widget` plugin, with sizes and update period.

## 5. Theme

- **Preference:** `system`, `light` or `dark`, synced in Preferences so it follows the user across devices.
- **Mobile** (`apps/mobile/lib/theme.ts`):
  - Colours are CSS variables via NativeWind `vars()`. Tailwind colours resolve to `var(--…)` (`tailwind.config.js`, `global.css`).
  - A mutable palette `T` serves places that need raw colour values (icons, charts). The root view is keyed on the scheme, so switching re-renders instantly. The status bar follows.
- **Web** (`services/theme.ts`): toggles the `dark` class, follows `matchMedia('(prefers-color-scheme: dark)')` in system mode, and caches the choice to avoid a flash on load.
- **Alternate app icons:** Default, Light, Ocean, Sunset, Forest and Mono, via `expo-alternate-app-icons`. They are generated by `apps/mobile/scripts/generate-alt-icons.mjs`.

## 6. Productivity ("Momentum")

`shared/domain/productivity.ts` is computed from **completion events** (`completions`, id `${taskId}@${occurrence}`, so recurring tasks count once per occurrence).

**Points**
- P1 = 4, P2 = 3, P3 = 2, P4 = 1.
- +1 when completed on time.
- +5 for each day the daily goal is met.
- +20 for each week the weekly goal is met.
- A streak bonus.
- Minus a capped overdue penalty.

**Levels:** Getting started → … → Legendary.

**Streaks** skip days off and vacation mode.

**Also provided:** interval summaries by priority, project and source (including agents), and project stats (progress, overdue, blocked, trend).

## 7. Agents

See [AGENTS.md](AGENTS.md).
