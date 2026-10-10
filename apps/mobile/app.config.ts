import type { ExpoConfig, ConfigContext } from 'expo/config';

// Brand tokens — pulled EXACTLY from the web Tailwind config (index.html:
// --bg-main dark = #05050A = `midnight`; accent = #3B82F6). Do not eyeball.
const MIDNIGHT = '#05050A';
const ACCENT = '#3B82F6';

// EAS (Expo Application Services) project — builds, signing and Play submission
// are managed on expo.dev (see eas.json and DECISIONS.md D12).
const EAS_OWNER = 'meertech'; // Expo account (renamed from ameer911)
const EAS_PROJECT_ID = 'ae776c4c-c63c-425f-aa1d-bdf4e58d6e38';

// All iconography is generated from the real web logo by
// scripts/generate-icons.mjs into ./assets/branding/ (see DECISIONS.md D9).
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ClearMind',
  slug: 'clearmind',
  owner: EAS_OWNER,
  scheme: 'clearmind',
  version: '0.4.0', // versionName — bump per release (see README Play checklist)
  orientation: 'portrait',
  userInterfaceStyle: 'dark', // the UI is dark-only; keeps native pickers/dialogs consistent
  newArchEnabled: true,
  icon: './assets/branding/icon.png',
  splash: {
    image: './assets/branding/splash.png',
    resizeMode: 'contain',
    backgroundColor: MIDNIGHT,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'tech.meertech.clearmind',
    // Sign in with Apple entitlement (App Store guideline 4.8 alongside Google sign-in).
    usesAppleSignIn: true,
    buildNumber: '1', // managed remotely by EAS (appVersionSource: remote)
    // Firebase iOS config (gitignored; EAS file env var GOOGLE_SERVICES_PLIST).
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: 'ClearMind uses the camera only when you choose to take a new profile photo.',
      NSPhotoLibraryUsageDescription: 'ClearMind lets you pick a profile photo from your library.',
      UIBackgroundModes: ['fetch', 'processing', 'remote-notification'],
    },
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: 'tech.meertech.clearmind',
    // Firebase Android config (gitignored). On EAS it comes from the
    // GOOGLE_SERVICES_JSON file environment variable; locally / in the Gradle
    // workflow it's decoded to ./google-services.json before prebuild.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    // Play requires versionCode to rise per build. EAS manages it remotely
    // (eas.json appVersionSource: remote + autoIncrement); the Gradle workflow
    // still sets it from the run number.
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    // Strip Play-sensitive permissions the app does NOT use (prebuild/RN add these
    // by default): the dev-only overlay SYSTEM_ALERT_WINDOW, and legacy storage —
    // the Excel import/export uses scoped access (document-picker/file-system/sharing),
    // so no storage permission is required. INTERNET + VIBRATE + (notifications)
    // remain. blockedPermissions adds tools:node="remove" so the merger drops them.
    blockedPermissions: [
      // expo-secure-store declares these for requireAuthentication, which ClearMind never uses.
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      // Profile photos use the system photo picker (no media permission needed).
      // RECORD_AUDIO is NOT blocked: Quick Add voice input (expo-speech-recognition)
      // needs it; it's requested only when the user taps the mic.
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.MODIFY_AUDIO_SETTINGS',
    ],
    // Edge-to-edge (react-native-edge-to-edge): mandatory on Android 16 for
    // targetSdk 36 — the old opt-out is ignored — so draw behind the system bars
    // everywhere and let safe-area insets pad content (Screen, tabs, sheets).
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/branding/adaptive-foreground.png',
      backgroundColor: MIDNIGHT,
    },
  },
  web: {
    bundler: 'metro',
    favicon: './assets/branding/favicon.png',
  },
  notification: {
    icon: './assets/branding/notification-icon.png',
    color: ACCENT,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    'expo-background-task',
    ['expo-image-picker', { photosPermission: 'ClearMind lets you pick a profile photo from your library.', cameraPermission: 'ClearMind uses the camera only when you choose to take a new profile photo.', microphonePermission: false }],
    ['expo-audio', { microphonePermission: false }],
    // Voice-to-text in Quick Add — uses the device's speech service (Google app on Android).
    ['expo-speech-recognition', {
      microphonePermission: 'ClearMind uses the microphone only while you dictate a task.',
      speechRecognitionPermission: 'ClearMind turns your speech into task text.',
      androidSpeechServicePackages: ['com.google.android.googlequicksearchbox'],
    }],
    // iOS: Google Sign-In's AppCheckCore (Swift, static) needs module maps for these.
    // Android: Google Play requires targetSdk 36 (Android 16) for new apps/updates.
    ['expo-build-properties', {
      android: { compileSdkVersion: 36, targetSdkVersion: 36, buildToolsVersion: '36.0.0' },
      ios: { extraPods: [{ name: 'GoogleUtilities', modular_headers: true }, { name: 'RecaptchaInterop', modular_headers: true }] },
    }],
    // Android home-screen widgets (see widgets/ and services/widgetData.ts).
    ['react-native-android-widget', {
      widgets: [
        { name: 'Today', label: 'ClearMind · Today', description: 'Today’s and overdue tasks — tick them off from your home screen', minWidth: '250dp', minHeight: '180dp', targetCellWidth: 4, targetCellHeight: 3, resizeMode: 'horizontal|vertical', updatePeriodMillis: 1800000 },
        { name: 'Inbox', label: 'ClearMind · Inbox', description: 'Recent captures with a quick add button', minWidth: '250dp', minHeight: '180dp', targetCellWidth: 4, targetCellHeight: 3, resizeMode: 'horizontal|vertical', updatePeriodMillis: 1800000 },
        { name: 'Upcoming', label: 'ClearMind · Upcoming', description: 'The next few days at a glance', minWidth: '250dp', minHeight: '180dp', targetCellWidth: 4, targetCellHeight: 3, resizeMode: 'horizontal|vertical', updatePeriodMillis: 1800000 },
        { name: 'Productivity', label: 'ClearMind · Momentum', description: 'Completed today, daily goal and streak', minWidth: '180dp', minHeight: '110dp', targetCellWidth: 2, targetCellHeight: 2, resizeMode: 'horizontal|vertical', updatePeriodMillis: 1800000 },
        { name: 'QuickAdd', label: 'ClearMind · Quick add', description: 'One tap to capture a task', minWidth: '110dp', minHeight: '40dp', targetCellWidth: 2, targetCellHeight: 1, resizeMode: 'horizontal', updatePeriodMillis: 0 },
      ],
    }],
    // Alternate app icons (Settings → Appearance), generated by scripts/generate-alt-icons.mjs.
    ['expo-alternate-app-icons', ['Light', 'Ocean', 'Sunset', 'Forest', 'Mono'].map((n) => ({
      name: n,
      ios: `./assets/icons/${n.toLowerCase()}.png`,
      android: { foregroundImage: `./assets/icons/${n.toLowerCase()}-foreground.png`, backgroundColor: ({ Light: '#FFFFFF', Ocean: '#1E40AF', Sunset: '#EA580C', Forest: '#065F46', Mono: '#111111' } as Record<string, string>)[n] },
    }))],
    'expo-apple-authentication',
    '@react-native-google-signin/google-signin',
    [
      'expo-notifications',
      {
        icon: './assets/branding/notification-icon.png',
        color: ACCENT,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  // `extra` is evaluated at prebuild time (env present) and EMBEDDED into the app,
  // read at runtime via expo-constants (lib/config.ts). This makes the Firebase /
  // Gemini config deterministic — unlike bare process.env.EXPO_PUBLIC_* which was
  // NOT inlined into the release bundle (the v0.0.11 launch crash).
  extra: {
    eas: { projectId: EAS_PROJECT_ID },
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
    },
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  },
});
