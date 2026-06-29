// Metro config for a monorepo: Metro must watch the workspace root so it can
// resolve and transpile the @clearmind/shared TypeScript source (shared by the
// web and mobile apps), and resolve hoisted deps from the root node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo (so edits to shared/ hot-reload here).
config.watchFolders = [workspaceRoot];

// 2. Resolve from the app's node_modules first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Avoid pulling a second copy of a package from a nested location.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './global.css' });
