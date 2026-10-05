import type { LyricsDocument } from '../core/types';

// WebVTT timestamp regex: 00:00:00.000 or 00:00.000
const VTT_TIMESTAMP_REGEX = /(?:(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3}))/;
const VTT_BLOCK_REGEX =
  /((?:(?:\d+):)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:(?:\d+):)?\d{2}:\d{2}\.\d{3})(?:.*?)\n([\s\S]*?)(?=\n\n|$)/g;

function vttTimeToMs(timeStr: string): number {
  const match = timeStr.match(VTT_TIMESTAMP_REGEX);
  if (!match) return 0;

  const h = match[1] ? parseInt(match[1], 10) : 0;
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  const ms = parseInt(match[4] || '0', 10);

  return h * 3600000 + m * 60000 + s * 1000 + ms;
}

export function parseVTT(rawText: string): LyricsDocument {
  const doc: LyricsDocument = {
    metadata: {},
    lines: [],
    warnings: [],
  };

  if (
    !rawText ||
    typeof rawText !== 'string' ||
    !rawText.trim().startsWith('WEBVTT')
  ) {
    doc.warnings.push(
      'Input is empty, not a string, or missing WEBVTT header.'
    );
    return doc;
  }

  // Normalize newlines
  const text = rawText.replace(/\r\n/g, '\n');

  VTT_BLOCK_REGEX.lastIndex = 0;
  let match;
  while ((match = VTT_BLOCK_REGEX.exec(text)) !== null) {
    if (!match[1] || !match[2]) continue;

    const startMs = vttTimeToMs(match[1]);
    const endMs = vttTimeToMs(match[2]);
    const payload = (match[3] || '').trim();

    // We can also parse `<c>word</c>` or `<00:00.000>` style tags inside VTT, but we'll stick to line-level for this basic parser
    let plainText = payload.replace(/<[^>]*>?/gm, '').trim();

    if (plainText) {
      doc.lines.push({
        startMs,
        endMs,
        text: plainText,
      });
    }
  }

  doc.lines.sort((a, b) => a.startMs - b.startMs);

  if (doc.lines.length === 0) {
    doc.warnings.push('No valid lines parsed from VTT');
  }

  return doc;
}
