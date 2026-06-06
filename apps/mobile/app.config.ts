import type { ExpoConfig, ConfigContext } from 'expo/config';

// Brand tokens — pulled EXACTLY from the web Tailwind config (index.html:
// --bg-main dark = #05050A = `midnight`; accent = #3B82F6). Do not eyeball.
const MIDNIGHT = '#05050A';
const ACCENT = '#3B82F6';

// All iconography is generated from the real web logo by
// scripts/generate-icons.mjs into ./assets/branding/ (see DECISIONS.md D9).
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ClearMind',
  slug: 'clearmind',
  scheme: 'clearmind',
  version: '0.0.17', // versionName — bump per release (see README Play checklist)
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
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
    // Firebase Android config (apiKey/oauth clients) — decoded from a CI secret to
    // ./google-services.json before prebuild; present locally (gitignored).
    googleServicesFile: './google-services.json',
    // Play requires versionCode to rise per build; CI sets it from the run number.
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
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
    eas: { projectId: process.env.EAS_PROJECT_ID },
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
