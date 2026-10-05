---
name: lyrics-edge-checks
description: "Guidelines and edge checks for parsing lyrics formats (LRC, TTML) and handling optional dependencies in react-native-better-lyrics."
---

# Lyrics Parser Edge Checks

When working on the `react-native-better-lyrics` package, ensure you handle the following edge cases robustly to prevent crashes in consumer applications.

## 1. Optional Dependency Failures
- **MaskedView / Skia:** If the user enables `highlightMode: 'sweep'` but has not installed `@react-native-masked-view/masked-view` or `@shopify/react-native-skia`, the library MUST NOT crash.
  - **Check:** Use a `try/catch` around the `require` statement.
  - **Fallback:** Fall back to a standard opacity/fade highlight mode and log a single `console.warn` in `__DEV__`.

## 2. Malformed Lyrics Files
- **Invalid Timestamps:** If an LRC line contains a malformed timestamp (e.g., `[99:99.99]`), the parser should either ignore the line or place it at the beginning/end depending on standard LRC fallback rules. Do not throw a fatal error.
- **Missing TTML Tags:** When parsing TTML using `@applemusic-like-lyrics/ttml`, ensure null-checks are in place for missing `<p>` or `<span>` tags.

## 3. Playback Synchronization Edge Cases
- **Scrubbing/Seeking:** When the `currentTime` prop jumps significantly (e.g., the user scrubs the audio timeline), the `activeLineIndex` calculation (binary search) must accurately snap to the correct line without getting stuck in an intermediate state.
- **End of Song:** Ensure the final lyric remains highlighted or the screen transitions smoothly when `currentTime` exceeds the final timestamp in the `lyricsData` array.

## 4. UI Fallbacks
- **Missing BlurComponent:** If the user does not pass a `BlurComponent` (like `expo-blur`), the background should fallback to a standard `rgba(0,0,0, 0.8)` overlay to ensure lyric readability.
