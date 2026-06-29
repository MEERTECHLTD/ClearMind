module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Inline build-time env vars into the bundle as STRING LITERALS. TWO groups,
      // BOTH required — dropping either has caused a shipped failure:
      //
      //  • EXPO_ROUTER_APP_ROOT / EXPO_ROUTER_IMPORT_MODE — expo-router's
      //    `_ctx.<platform>.js` does `require.context(process.env.EXPO_ROUTER_APP_ROOT, …)`.
      //    require.context's first arg MUST be a static string at bundle time, or
      //    Metro throws `SyntaxError: Invalid call … process.env.EXPO_ROUTER_APP_ROOT`
      //    and the bundle step fails (this is exactly what broke the v0.0.12 build,
      //    after these two were removed from this list). babel-preset-expo ships its
      //    own expo-router plugin to inline them, but in this hoisted monorepo built
      //    via gradle's `export:embed` it can't be relied on (its inlining is gated
      //    on resolving expo-router from babel-preset-expo's own dir AND on Metro
      //    caller state that differ from a plain `expo export`). This plugin ALWAYS
      //    runs, so we inline them ourselves. CRITICAL: EXPO_ROUTER_APP_ROOT must be
      //    a path RELATIVE to expo-router's _ctx file (e.g. ../../apps/mobile/app) —
      //    an ABSOLUTE path compiles fine but makes require.context enumerate ZERO
      //    files (silent "No routes found", an empty/config-less app). CI computes
      //    the relative value hoisting-proof and sets EXPO_ROUTER_IMPORT_MODE=sync.
      //    Verified device-free: a local export:embed with the relative value
      //    bundles the routes (app/index.tsx literals land in the bundle); the
      //    absolute value drops them (1368 modules vs 1118, routes absent).
      //
      //  • EXPO_PUBLIC_* — Firebase/Gemini config. The PRIMARY embed path is now
      //    app.config `extra` + expo-constants (lib/config.ts), which is fully
      //    babel-independent; inlining here is a redundant second source. Empty
      //    config (these missing) was the v0.0.11 launch crash (auth/invalid-api-key).
      ['transform-inline-environment-variables', {
        include: [
          'EXPO_ROUTER_APP_ROOT',
          'EXPO_ROUTER_IMPORT_MODE',
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
