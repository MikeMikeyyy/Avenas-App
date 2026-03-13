const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v9+ uses package.json "exports" field — must be enabled
config.resolver.unstable_enablePackageExports = true;
// Include react-native condition so Expo native modules resolve correctly
config.resolver.unstable_conditionNames = ['require', 'default', 'react-native'];
config.resolver.sourceExts.push('cjs');

module.exports = config;
