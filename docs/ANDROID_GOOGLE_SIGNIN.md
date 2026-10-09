# Android Google sign-in: signing certificates

Native Google sign-in (`@react-native-google-signin`, `webClientId` = the Firebase
**Web** OAuth client) only works when the **certificate that signed the installed
APK** is registered (SHA-1) on the Firebase Android app `tech.meertech.clearmind`
(project `clearmind-b8d2b`). Otherwise Google returns `DEVELOPER_ERROR` (code 10),
which the app shows as "Google sign-in isn't available in this version yet" and
logs to Settings → Diagnostics.

There are **three** certificates. Each needs its SHA-1 registered:

| Build | Signed by | SHA-1 | Registered |
|---|---|---|---|
| Local debug / dev client | `~/.android/debug.keystore` | `C5:03:F7:FF:88:FF:ED:5D:92:2A:6C:09:A0:BA:5B:BF:22:51:8A:5C` | ✅ |
| GitHub Release APK/AAB (Gradle CI) and EAS builds | MEERTECH upload key (`clearmind-upload`) | `A2:C7:85:EB:0F:D0:7F:25:D6:85:27:BD:F7:9B:16:FC:A7:30:0F:B1` | ✅ |
| **Installed from Google Play** | **Google Play App Signing key** (Google re-signs every Play delivery) | shown only in Play Console | ❌ **until you add it** |

The 2026-10 production report ("Google sign-in config error (SHA-1 not registered
for this build)") was the third row: Play installs carry Google's app-signing
certificate, not the upload key.

## Fix (one time, ~2 minutes, no new build)

1. Play Console → ClearMind → **Test and release → App integrity → App signing**
   → copy **App signing key certificate → SHA-1** (copy the SHA-256 too).
2. Register it (either way):
   - `scripts/register-android-sha.sh <SHA-1>` (and again with the SHA-256), or
   - Firebase console → Project settings → ClearMind Android → **Add fingerprint**.
3. Wait a few minutes, then open the Play-installed app and tap **Continue with
   Google**. No app update is required: the check happens on Google's side, and
   the app ships only the Web client ID (verified identical in the release
   bundle and `google-services.json`).

How to verify which certificate signed an APK:
`keytool -printcert -jarfile app.apk` (for a Play install, pull it with
`adb shell pm path tech.meertech.clearmind` + `adb pull`).

If you ever rotate the upload key (Play Console → App integrity → Request upload
key reset), register the new upload certificate too.
