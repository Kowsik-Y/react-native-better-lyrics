---
name: lyrics-parser
description: Use when writing or changing LRC, enhanced LRC, TTML, VTT or speaker-tag parsing, the LyricsDocument types, or the active-line search in react-native-better-lyrics.
---
# Lyrics parser skill
1. Read `src/core/types.ts` first. Do not change types without updating all parsers and tests.
2. Parse line by line, tolerant of junk. Collect problems in `warnings[]`, never throw.
3. Steps: strip BOM, normalize newlines, read metadata tags (`ar`, `ti`, `al`, `offset`), expand multi-timestamp lines, sort by `startMs`, parse enhanced word tags, extract speakers, derive `endMs`.
4. Active line: check `current` and `current+1` first, fall back to binary search. Return an array of indices to support overlapping duet lines.
5. Add a fixture and a test for every bug. Run `yarn test`.
Do not: use regexes that backtrack catastrophically, mutate input, or add a parsing dependency without approval.
