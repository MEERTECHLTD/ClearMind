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
  version: '0.1.0', // versionName — bump per release (see README Play checklist)
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
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    // Edge-to-edge needs the react-native-edge-to-edge package (Theme.EdgeToEdge);
    // disabled for the skeleton build. Re-enable + `expo install react-native-edge-to-edge`
    // for production (Android 15 / Play increasingly expects edge-to-edge).
    edgeToEdgeEnabled: false,
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
    geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  },
});
