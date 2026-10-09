# Releasing ClearMind

All native builds, signing and versioning run on **EAS** (project `@meertech/clearmind`).

- `appVersionSource` is `remote`, so EAS sets the Android `versionCode` and iOS `buildNumber` and auto-increments them.
- You only bump the user-facing `version` in `apps/mobile/app.config.ts`.

Secrets are never in the repo. Client config lives in EAS environment variables (`production` and `preview`):
- `EXPO_PUBLIC_FIREBASE_*`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GEMINI_API_KEY` (sensitive)
- file variables `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICES_PLIST`

## Web

Web deploys on merge to `main`:

| Target | How it deploys |
|---|---|
| Vercel | Automatic. Serves `clearmind.meertech.tech` plus the hosted agent functions `api/mcp.js` and `api/v1.js` |
| `clearmind.expo.app` | `npm run deploy:web` |

If `shared/`, `server/`, `api-src/` or `cli/` changed, run `npm run build:agent` before committing so `api/*.js` is current.

Caching, the service-worker update flow, PWA install, and the "stale bundle" runbook are in [WEB_CACHING_AND_PWA.md](WEB_CACHING_AND_PWA.md). `clearmind.expo.app` ignores `vercel.json` (no 404 for missing assets, no security headers). See section 5 there.

## Android

```bash
cd apps/mobile
npx eas-cli build -p android --profile production       # signed .aab, versionCode auto-increments
npx eas-cli build -p android --profile preview          # installable .apk for testing
```

- **Signing:** the MEERTECH upload keystore ("ClearMind upload key", SHA-256 `D7:AC:04…6E`) is stored as EAS remote credentials.
- **Google sign-in:** every signing certificate (debug, upload key, **and the Play App Signing key**) must have its SHA-1 on the Firebase Android app — see [ANDROID_GOOGLE_SIGNIN.md](ANDROID_GOOGLE_SIGNIN.md).

**Google Play.** ClearMind is live on Play (`tech.meertech.clearmind`); uploads are still manual (no service account yet). How the first upload was done:
1. Create the app in Play Console (`tech.meertech.clearmind`). Fill in the store listing, content rating and data safety, using the privacy policy URL.
2. Upload the `.aab` from the EAS build page to **Internal testing**. Enrol in Play App Signing.
3. Create a Google Play service account with release permissions and upload its JSON key to EAS (`eas credentials`).
4. From then on, `npx eas-cli submit -p android --profile production` sends builds to the internal track as drafts.

**Local test build** (emulator, no EAS):
```bash
cd apps/mobile && npx expo prebuild -p android --no-install
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  EXPO_ROUTER_IMPORT_MODE=sync EXPO_ROUTER_APP_ROOT=../../apps/mobile/app \
  ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```
Gradle 8.13 needs JDK 17 or 21, not 25. The local build needs the gitignored `apps/mobile/.env` and `google-services.json`.

## iOS

**One-time setup.** Already done for team `7N86K8Q433`:
- **Bundle ID** `tech.meertech.clearmind` is registered with Push Notifications enabled.
- **Distribution certificate** is shared with the team's other apps.
- **App Store provisioning profile** is managed by EAS.
- **iOS Firebase app** (`GOOGLE_SERVICES_PLIST` on EAS) is registered and includes `REVERSED_CLIENT_ID` for Google Sign-In.

**Build.** Uses the team's App Store Connect API key; the key never leaves your machine or Keychain:
```bash
cd apps/mobile
export EXPO_ASC_API_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8 EXPO_ASC_KEY_ID=XXXXXXXXXX \
       EXPO_ASC_ISSUER_ID=<issuer-uuid> EXPO_APPLE_TEAM_ID=7N86K8Q433 EXPO_NO_CAPABILITY_SYNC=1
npx eas-cli build -p ios --profile production --non-interactive
```

- `EXPO_NO_CAPABILITY_SYNC=1` avoids an eas-cli bug that rejects the Push capability patch. Push is already enabled on the identifier.
- If capabilities ever need changing, do it in the Apple Developer portal, or through the App Store Connect API (`POST /v1/bundleIdCapabilities`).

**Before the first App Store submission (human-only steps).**
1. Create the app record in **App Store Connect** → My Apps → + → New App:
   - platform iOS;
   - name "ClearMind";
   - bundle ID `tech.meertech.clearmind`;
   - SKU, e.g. `clearmind-ios`.

   Apple's API cannot create app records.
2. Complete App Privacy (data types: contact info such as email and name, user content, identifiers), age rating, pricing, and the screenshots and description for each device size.
3. Then submit the latest build to TestFlight / App Review:
   ```bash
   npx eas-cli submit -p ios --profile production --latest
   ```
   With the ASC key env vars set, EAS uploads with the API key. You then add the build to a TestFlight group or submit it for review in App Store Connect.

**Already in the app config.** Export compliance (`ITSAppUsesNonExemptEncryption: false`), camera and photo-library usage strings (avatar), and background modes (background fetch and processing for sync) are set in `app.config.ts`.

## Release checklist

- [ ] `npx vitest run` passes, plus `npx tsc --noEmit -p .` and `npx tsc --noEmit -p apps/mobile`.
- [ ] `npm run build:agent` if the agent or shared code changed.
- [ ] Bump `version` in `apps/mobile/app.config.ts`.
- [ ] Android: production `.aab` and preview `.apk`. iOS: production build.
- [ ] Smoke test on a device:
  - sign-in;
  - create, complete and sync across web and phone;
  - reminder fires, with its actions;
  - widgets;
  - theme switch;
  - an agent creates a task and it appears.
- [ ] Submit, or upload manually for the first release on each store.
