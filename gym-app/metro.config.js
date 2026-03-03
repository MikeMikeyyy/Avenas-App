const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v9+ uses package.json "exports" field — must be enabled
config.resolver.unstable_enablePackageExports = true;
config.resolver.sourceExts.push('cjs');

module.exports = config;
