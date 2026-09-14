module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-worklets/plugin must stay last — Reanimated relies on it
    // running after every other transform.
    plugins: ["react-native-worklets/plugin"],
  };
};
