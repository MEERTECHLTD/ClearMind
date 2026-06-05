# ClearMind Mobile (Expo / React Native)

Native iOS + Android app that shares the **same backend and core logic** as the
web app via the `@clearmind/shared` workspace package — same Firebase project,
same Firestore collections/paths, same data model, same Gemini AI core.

> **Status:** Phase 2 skeleton. Config + Firebase/Gemini adapters that consume the
> shared core are in place; the data layer, UI kit, navigation, and the 18 views
> are roadmapped in [ROADMAP.md](./ROADMAP.md). See [PORTING_NOTES.md](./PORTING_NOTES.md)
> for the per-view porting inventory and the root `DECISIONS.md` for architecture.

## Prerequisites

- Node 20+, the monorepo installed from the **repo root**: `npm install`
- Xcode (iOS) / Android Studio (Android), or the **Expo Go** app on a device
- A `.env` file here (copy `.env.example`) — **use the same Firebase project as web**

## Run

```bash
# from the repo root (installs the whole workspace incl. Expo deps)
npm install

# then, in apps/mobile
cd apps/mobile
npx expo install --fix      # reconcile the expo-* / RN versions to the installed SDK
cp .env.example .env        # fill in the SAME Firebase values the web app uses
npx expo start              # press i (iOS), a (Android), or scan with Expo Go
```

> The first install pulls the Expo/React Native toolchain. If Metro can't resolve
> `@clearmind/shared`, confirm `metro.config.js` `watchFolders` includes the repo
> root (it does by default here) and re-run with `npx expo start -c` to clear the cache.

## How it shares the backend

- `lib/firebase.ts` — initialises Firebase with the same config as web, using
  `initializeAuth(getReactNativePersistence(AsyncStorage))` for native session persistence.
- `services/firebaseService.ts` — mirrors the web `firebaseService` API; all
  Firestore ops delegate to `@clearmind/shared/data/firestore` with the injected
  `(db, uid)`, so documents land at the identical `users/{uid}/{collection}` paths.
- `services/gemini.ts` — mirrors the web Gemini adapter; reads
  `EXPO_PUBLIC_GEMINI_API_KEY` and injects it into `@clearmind/shared/ai/geminiCore`.
- The store→collection map and the last-write-wins merge engine come straight from
  `@clearmind/shared` — there is no mobile copy.

## Build (EAS) — Phase 9

```bash
npm i -g eas-cli
eas build --profile preview --platform android   # or ios
```
See [ROADMAP.md](./ROADMAP.md) for the `eas.json` profiles and submit steps.
