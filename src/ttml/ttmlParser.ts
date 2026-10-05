import type { LyricsDocument, LyricWord } from '../core/types';

// Matches <p ... begin="HH:MM:SS.ms" end="HH:MM:SS.ms" ...>Text</p>
// Basic TTML parser using Regex for light weight
// Note: Real TTML is full XML, but for react-native we avoid heavy DOM parsers where possible.
const P_TAG_REGEX =
  /<p[^>]*begin="([^"]+)"[^>]*end="([^"]+)"[^>]*>(.*?)<\/p>/gs;
// Matches <span ... begin="HH:MM:SS.ms" end="HH:MM:SS.ms" ...>Text</span> followed by optional whitespace
const SPAN_TAG_REGEX =
  /<span[^>]*begin="([^"]+)"[^>]*end="([^"]+)"[^>]*>(.*?)<\/span>(\s*)/gs;

function ttmlTimeToMs(timeStr: string): number {
  // Format typically: HH:MM:SS.ms, MM:SS.ms, or SS.ms (e.g. "9.731" or "9.731s")
  const trimmed = timeStr.trim();
  const parts = trimmed.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    const sParts = (parts[2] || '0').split('.');
    const s = parseInt(sParts[0] || '0', 10);
    const ms = sParts[1]
      ? parseInt(sParts[1].padEnd(3, '0').slice(0, 3), 10)
      : 0;
    return h * 3600000 + m * 60000 + s * 1000 + ms;
  } else if (parts.length === 2) {
    const m = parseInt(parts[0] || '0', 10);
    const sParts = (parts[1] || '0').split('.');
    const s = parseInt(sParts[0] || '0', 10);
    const ms = sParts[1]
      ? parseInt(sParts[1].padEnd(3, '0').slice(0, 3), 10)
      : 0;
    return m * 60000 + s * 1000 + ms;
  } else if (parts.length === 1) {
    const sStr = parts[0]?.replace('s', '') || '0';
    const num = parseFloat(sStr);
    return isNaN(num) ? 0 : Math.round(num * 1000);
  }
  return 0;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

export function parseTTML(rawXml: string): LyricsDocument {
  const doc: LyricsDocument = {
    metadata: {},
    lines: [],
    warnings: [],
  };

  if (!rawXml || typeof rawXml !== 'string') {
    doc.warnings.push('Input is empty or not a string.');
    return doc;
  }

  // Very loose parsing just to extract `<p>` tags
  P_TAG_REGEX.lastIndex = 0;
  let match;
  while ((match = P_TAG_REGEX.exec(rawXml)) !== null) {
    if (!match[1] || !match[2]) {
      doc.warnings.push('Missing begin or end in p tag');
      continue;
    }
    const startMs = ttmlTimeToMs(match[1]);
    const endMs = ttmlTimeToMs(match[2]);
    let content = match[3] || '';

    // Check for span tags inside content (word level)
    let words: LyricWord[] | undefined;
    let plainText = '';

    if (content.includes('<span')) {
      words = [];
      SPAN_TAG_REGEX.lastIndex = 0;
      let spanMatch;
      while ((spanMatch = SPAN_TAG_REGEX.exec(content)) !== null) {
        if (spanMatch[1] && spanMatch[2]) {
          const wordStart = ttmlTimeToMs(spanMatch[1]);
          const wordEnd = ttmlTimeToMs(spanMatch[2]);
          const rawText = decodeHtmlEntities(
            (spanMatch[3] || '').replace(/<[^>]*>?/gm, '')
          );
          const hasSpaceAfter =
            (spanMatch[4] && spanMatch[4].length > 0) || rawText.endsWith(' ');
          const cleanText = rawText.trim();
          if (cleanText) {
            const wordText = hasSpaceAfter ? `${cleanText} ` : cleanText;
            words.push({
              startMs: wordStart,
              endMs: wordEnd,
              text: wordText,
            });
            plainText += wordText;
          }
        }
      }
    }

    // Strip any remaining html tags and decode entities for the line payload
    if (!words) {
      plainText = decodeHtmlEntities(content.replace(/<[^>]*>?/gm, '').trim());
    } else {
      plainText = plainText.trim();
    }

    if (plainText) {
      doc.lines.push({
        startMs,
        endMs,
        text: plainText,
        words: words && words.length > 0 ? words : undefined,
      });
    }
  }

  doc.lines.sort((a, b) => a.startMs - b.startMs);

  if (doc.lines.length === 0) {
    doc.warnings.push('No valid lines parsed from TTML');
  }

  return doc;
}
