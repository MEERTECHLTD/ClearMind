module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Inline ONLY the EXPO_PUBLIC_* config vars. CRITICAL: this plugin shares the
      // underlying transform with babel-preset-expo's own EXPO_PUBLIC_* inlining, so
      // an `include` list restricts inlining to exactly these — they MUST be listed
      // or the Firebase config ships empty (a v0.0.11 launch-crash cause; also
      // belt-and-suspenders'd via app.config `extra` + expo-constants in lib/config).
      //
      // Do NOT list EXPO_ROUTER_APP_ROOT / EXPO_ROUTER_IMPORT_MODE here: blindly
      // inlining EXPO_ROUTER_APP_ROOT to an absolute path makes expo-router's
      // require.context non-enumerable -> "No routes found" crash (the REAL v0.0.11
      // bug). Leaving them un-inlined lets babel-preset-expo's expo-router plugin
      // transform _ctx correctly (it resolves expo-router when co-located — see the
      // root `expo-router` dep that forces co-location with babel-preset-expo).
      ['transform-inline-environment-variables', {
        include: [
          'EXPO_PUBLIC_FIREBASE_API_KEY',
          'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
          'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
          'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
          'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
          'EXPO_PUBLIC_FIREBASE_APP_ID',
          'EXPO_PUBLIC_GEMINI_API_KEY',
          'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
        ],
      }],
      // react-native-reanimated/plugin MUST be listed last.
      'react-native-reanimated/plugin',
    ],
  };
};
