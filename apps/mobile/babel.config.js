module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Monorepo: babel-preset-expo is hoisted to the repo root and can't
      // require.resolve('expo-router') (nested in apps/mobile), so it skips the
      // expo-router transform that inlines EXPO_ROUTER_APP_ROOT into _ctx's
      // require.context(...) — causing "Invalid call" in release bundles. Inline
      // it ourselves (this plugin always runs, regardless of hoisting). Expo sets
      // EXPO_ROUTER_APP_ROOT in dev/export; CI sets it explicitly.
      ['transform-inline-environment-variables', { include: ['EXPO_ROUTER_APP_ROOT'] }],
      // react-native-reanimated/plugin MUST be listed last.
      'react-native-reanimated/plugin',
    ],
  };
};
