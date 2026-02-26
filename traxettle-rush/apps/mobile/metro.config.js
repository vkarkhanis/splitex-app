// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo so Metro can resolve workspace packages
config.watchFolders = [monorepoRoot];

// 2. Tell Metro where to look for node_modules (pnpm hoists to common/temp)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'common/temp/node_modules'),
];

// 3. Ensure symlinks are followed (critical for pnpm)
config.resolver.unstable_enableSymlinks = true;

// 4. Disable package exports which can cause issues in pnpm monorepos
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
