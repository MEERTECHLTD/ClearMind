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
  version: '0.0.0', // versionName — bump per release (see README Play checklist)
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
    [
      'expo-notifications',
      {
        icon: './assets/branding/notification-icon.png',
        color: ACCENT,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
