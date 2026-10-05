---
trigger: always_on
description: "Core architectural and dependency rules for the react-native-better-lyrics library"
---

# Better Lyrics React Native Library - Architecture Rules

## Core Principles
You are working on a reusable React Native package (library), NOT a standalone app.
You MUST adhere strictly to the following dependency and architectural rules to ensure the library remains pure and compatible with both Expo and Bare React Native apps.

## Dependency Policy
- `react`, `react-native`: Peer dependencies, required.
- `react-native-reanimated`: Peer dependency, required (`>=3.16`).
- **NEVER import `expo-*` packages** directly into `src/` files. Doing so breaks bare apps.
- Features like `expo-blur` must be injected via props (e.g., `<LyricsViewer BlurComponent={BlurView} />`).
- Masked view / Skia must be treated as **optional peers** and lazy-loaded via `try/require` if needed for optional features.

## Reanimated Constraints
- Stick to the stable core API (`useSharedValue`, `useAnimatedStyle`, `useFrameCallback`, `useAnimatedRef`, `scrollTo`, `interpolate`, `withTiming`).
- Avoid deprecated or highly experimental Reanimated APIs.
- Never import from `react-native-worklets` directly.

## Packaging Gotchas
- Keep `src/core` completely free of any React Native imports so it can function in Node.js, tests, and web players.
- Ensure the package correctly outputs `'worklet'` directives for Babel to consume.

## Testing Expectations
When running tests or verifying behavior, ensure we validate against:
1. Expo Go environments (zero native setup).
2. Bare RN (New Architecture).
