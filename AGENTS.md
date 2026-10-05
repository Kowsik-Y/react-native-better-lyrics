# Project rules: react-native-better-lyrics

## How to work
- Verify before claiming. Never invent package names, versions, flags or APIs. Check npm, the package's README, or the installed `node_modules` source. If you can't verify, say so.
- Work in small steps. Plan first, then implement, then run tests and report the real output. Don't claim something works unless you ran it.
- Ask one focused question only when a decision blocks progress. Otherwise state your assumption and continue.
- Match existing code style. Don't refactor unrelated code or add dependencies without saying why.
- Be honest about uncertainty and tradeoffs. Push back on bad ideas politely.

## Architecture
- `src/core/` is pure TypeScript. It must not import `react`, `react-native` or any `expo-*` package. It must run in Node.
- `src/hooks/` and `src/components/` may import React, React Native and Reanimated only.
- Never import `expo-*` anywhere in `src/`. Optional native features (blur, masked view, Skia) are injected via props or loaded with a guarded `require` and a fallback.
- TTML and VTT parsers are optional subpath entries. Mark the package `"sideEffects": false`.
- Keep the public API small. Everything exported from `src/index.ts` is a semver promise.

## Parsing rules
- Parsers never throw on bad input. Return a best-effort `LyricsDocument` plus `warnings[]`.
- Always compute `endMs` for every line (from the next line's start, or a default tail).
- Handle: multiple timestamps per line, 2- and 3-digit fractions, `[offset:]`, `\r\n`, and enhanced `<mm:ss.xx>` word tags.
- Every parser change needs a fixture in `__fixtures__/` and a test. Include messy real-world cases.

## Performance rules (Reanimated)
- No per-frame work on the JS thread. Time is `number | SharedValue<number>`; derive progress in worklets.
- Use only stable Reanimated APIs: `useSharedValue`, `useAnimatedStyle`, `useFrameCallback`, `useAnimatedRef`, `scrollTo`, `interpolate`, `withTiming`. Import only from `react-native-reanimated`.
- Don't re-render the list on every time tick. Memoize rows and keep row props stable.
- Measure row heights with `onLayout`, cache them, and center using cached offsets (not `scrollToIndex`).
- Respect reduce-motion. Provide a fallback when blur isn't available.

## Styling
- Internal components use `StyleSheet` + Reanimated styles only. No NativeWind, Tailwind or CSS-in-JS inside `src/`.
- Expose style props (`activeLyricStyle`, `inactiveLyricStyle`, `speakerTagStyle`, `containerStyle`) so consumers can pass their own classes. NativeWind is allowed only in `example/`.

## Quality gates (run before saying "done")
- `yarn typecheck`, `yarn lint`, `yarn test` must pass. Use the repo's actual script names; check `package.json`.
- TypeScript is strict. No `any` in the public API.
- Test the packed tarball (`npm pack`) in a fresh app before any release, not just the workspace example.

## Legal
- Never bundle copyrighted lyrics in the repo, fixtures, docs or tests. Use original or public-domain text and synthetic timestamps.
- Check the license of every new dependency before adding it. Avoid AGPL/GPL dependencies in the library. Flag any you find.
