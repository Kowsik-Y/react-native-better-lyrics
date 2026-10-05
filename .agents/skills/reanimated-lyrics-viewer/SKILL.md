---
name: reanimated-lyrics-viewer
description: Use when building or debugging the animated LyricsViewer, line/word highlighting, auto-scroll centering, clock smoothing, or any Reanimated worklet code in this library.
---
# Reanimated viewer skill
1. Time source is a `SharedValue<number>` (ms). If given a plain number, mirror it into a shared value in an effect.
2. Clock smoothing: use `useFrameCallback` to extrapolate between player updates using `isPlaying` and `playbackRate`. Snap on seeks (large delta); ease small drift.
3. Per-line progress = clamp((t - startMs) / (endMs - startMs), 0, 1), computed in worklets.
4. Centering: store measured row offsets in a shared value; call `scrollTo` from a worklet. Pause auto-scroll while the user drags; resume after an idle timeout.
5. Verify on a low-end Android build. Report frame drops honestly.
Do not: call `setState` per frame, read shared `.value` during render, or use `scrollToIndex` with variable-height rows.
