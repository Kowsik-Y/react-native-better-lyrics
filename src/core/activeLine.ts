import type { LyricsDocument } from './types';

/**
 * Returns an array of active line indices.
 * Supports returning multiple indices for overlapping lines (e.g. duets).
 */
export function getActiveLineIndices(
  doc: LyricsDocument,
  currentTimeMs: number
): number[] {
  if (!doc || !doc.lines || doc.lines.length === 0) return [];

  const activeIndices: number[] = [];

  let low = 0;
  let high = doc.lines.length - 1;
  let foundIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const line = doc.lines[mid];

    if (!line) break;

    if (currentTimeMs >= line.startMs && currentTimeMs < line.endMs) {
      foundIndex = mid;
      break;
    } else if (currentTimeMs < line.startMs) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (foundIndex === -1) {
    return [];
  }

  activeIndices.push(foundIndex);

  for (let i = foundIndex - 1; i >= 0; i--) {
    const line = doc.lines[i];
    if (!line) continue;
    if (currentTimeMs >= line.startMs && currentTimeMs < line.endMs) {
      activeIndices.unshift(i);
    } else if (line.endMs < currentTimeMs - 10000) {
      break;
    }
  }

  for (let i = foundIndex + 1; i < doc.lines.length; i++) {
    const line = doc.lines[i];
    if (!line) continue;
    if (currentTimeMs >= line.startMs && currentTimeMs < line.endMs) {
      activeIndices.push(i);
    } else if (line.startMs > currentTimeMs) {
      break;
    }
  }

  return activeIndices;
}
