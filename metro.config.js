const { getDefaultConfig } = require("expo/metro-config");

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  const { sourceExts, assetExts } = config.resolver;
  config.resolver.sourceExts = [...new Set([...sourceExts, "glsl"])];
  config.resolver.assetExts = assetExts.filter((ext) => ext !== "glsl");
  return config;
})();
