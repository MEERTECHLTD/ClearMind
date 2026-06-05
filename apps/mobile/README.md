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

## Branding

All app iconography is the **real ClearMind logo** (head + lightbulb), generated
from `public/clearmindlogo.png` into `assets/branding/` by:

```bash
node apps/mobile/scripts/generate-icons.mjs   # run from the repo root (uses sharp)
```

Outputs (wired in `app.config.ts`): `icon.png` (1024, no alpha — symbol only,
wordmark dropped), `adaptive-foreground.png` (Android adaptive, safe-zone),
`adaptive-background.png`, `splash.png` (full lockup with wordmark),
`notification-icon.png` (96px white silhouette), `favicon.png`. Backgrounds use
the exact web `midnight` `#05050A`; accent `#3B82F6`.

> The web `public/icon-*.png` / `apple-touch-icon.png` / `favicon.png` are a
> generic database stock graphic (generated from `clearmindlogo.jpg`) and are
> **not** the brand — they are deliberately not used. See `DECISIONS.md` D9.

To inspect the prebuild result: `npx expo prebuild --platform android --no-install`
then check `android/app/src/main/res/mipmap-*/` and the splash drawables.

## Android release builds — signed `.aab` + `.apk` via GitHub Actions

CI ([`.github/workflows/android-release.yml`](../../.github/workflows/android-release.yml))
builds **on the runner** with `eas build --local` (no Expo cloud / credits, no
`EXPO_TOKEN`) and uploads a signed app-bundle (`clearmind-aab`, for the Play
Store) and a signed apk (`clearmind-apk`, for sideloading) as workflow artifacts.

**Trigger:** push a tag `mobile-v*` (e.g. `git tag mobile-v1.0.0 && git push --tags`)
or run the workflow manually (Actions → Android Release → Run workflow).

### One-time: create the upload keystore (developer machine — never commit it)

```bash
keytool -genkeypair -v \
  -keystore upload-keystore.jks -alias clearmind-upload \
  -keyalg RSA -keysize 2048 -validity 10000
# base64-encode it for the GitHub secret:
base64 -w0 upload-keystore.jks > upload-keystore.b64     # macOS: base64 -i upload-keystore.jks -o upload-keystore.b64
```

`*.jks`, `*.b64`, `credentials.json`, and `credentials/` are gitignored — only
`credentials.example.json` is tracked. CI decodes the keystore from a secret and
`envsubst`s the example into `credentials.json` at build time, which
`eas build --local` reads for signing.

### Required GitHub repository secrets

Settings → Secrets and variables → Actions:

| Secret | Purpose |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of `upload-keystore.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password (from `keytool`) |
| `ANDROID_KEY_PASSWORD` | key password (from `keytool`) |
| `EXPO_PUBLIC_FIREBASE_API_KEY` … `_APP_ID` (6) | same Firebase project as web |
| `EXPO_PUBLIC_GEMINI_API_KEY` | Iris AI |
| `EAS_PROJECT_ID` | optional; `extra.eas.projectId` |

(`EXPO_TOKEN` is **not** required for `--local`.) `versionCode` is set
automatically from the workflow run number; bump `version` (versionName) in
`app.config.ts` per release.

### Before the first CI run

The skeleton's `package-lock.json` is **not yet synced** with the mobile RN deps
(they were hand-pinned, never installed in this environment). Run once at the repo
root and commit the result, or the workflow's install step will keep re-resolving:

```bash
npm install            # syncs package-lock.json with apps/mobile deps
git add package-lock.json && git commit -m "chore: lock mobile deps"
```

### Gradle fallback (if `eas build --local` is undesirable / hits a monorepo snag)

`eas build --local` archives the **project** dir; in this monorepo the shared
package lives at `../../shared`, so if EAS can't resolve `@clearmind/shared`, use
the in-place Gradle path (Metro's `watchFolders` resolves shared correctly). In
the workflow, replace the two `eas-cli build` steps with:

```yaml
      - run: npx expo prebuild --platform android --no-install
      - run: |
          mkdir -p android/app
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/upload-keystore.jks
          cat >> android/gradle.properties <<EOF
          CLEARMIND_UPLOAD_STORE_FILE=upload-keystore.jks
          CLEARMIND_UPLOAD_KEY_ALIAS=clearmind-upload
          CLEARMIND_UPLOAD_STORE_PASSWORD=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          CLEARMIND_UPLOAD_KEY_PASSWORD=${{ secrets.ANDROID_KEY_PASSWORD }}
          EOF
      - run: node scripts/patch-android-signing.mjs   # idempotent; prebuild regenerates android/
      - run: cd android && ./gradlew bundleRelease && ./gradlew assembleRelease
      # artifacts: android/app/build/outputs/bundle/release/*.aab and .../apk/release/*.apk
```

### Verify a build is correctly signed (not a debug key)

```bash
jarsigner -verify -verbose -certs clearmind-<run>.apk     # APK
bundletool validate --bundle=clearmind-<run>.aab          # AAB structure
```
The certificate must match the upload keystore.

### Play Store readiness checklist

- [ ] `applicationId` / `package` is final: `tech.meertech.clearmind`
- [ ] `versionCode` increases every build (CI uses the run number)
- [ ] `versionName` (`version` in `app.config.ts`) set for the release
- [ ] `targetSdkVersion` meets the current Play requirement (Expo SDK 53 default OK)
- [ ] the `.aab` uploads to a Play Console **internal testing** track
- [ ] after first upload, **Play App Signing** is enrolled — the committed key is
      then the **upload** key only (Google holds the app-signing key)

> **Scope:** this makes ClearMind *buildable and shippable as branded, signed
> Android artifacts*. The artifact's **contents** are only as complete as
> Phases 3–9 (see [ROADMAP.md](./ROADMAP.md)). For a real release, finish those,
> then cut `mobile-v1.0.0` for the final `.aab` (Play) + `.apk` (sideload).
