---
name: rn-library-packaging
description: Use when editing package.json, exports, builder-bob config, peer dependencies, subpath entries, CI, release setup, or Expo/bare-RN compatibility for this library.
---
# Packaging skill
1. Peers: `react`, `react-native`, `react-native-reanimated` (supports 3.16+ and 4.x). Optional peers go in `peerDependenciesMeta`.
2. Subpath exports (`/ttml`) also need physical stub folders for older Metro.
3. Keep `"sideEffects": false`. Verify `'worklet'` directives survive the build.
4. Before release: `npm pack`, install the tarball into (a) a fresh Expo app and (b) a fresh bare RN app, and run a smoke test in each.
5. Verify every version number against npm. Do not guess.
Do not: import `expo-*` in `src/`, or add native code.
