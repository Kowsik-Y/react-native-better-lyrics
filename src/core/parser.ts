import type { LyricsDocument, LyricLine, LyricWord } from './types';

// Matches [mm:ss.xx] or [mm:ss.xxx]
const TIME_TAG_REGEX = /\[(\d{2,}):(\d{2})(?:[.:](\d{2,3}))?\]/g;
// Matches <mm:ss.xx>
const ENHANCED_TAG_REGEX = /<(\d{2,}):(\d{2})(?:[.:](\d{2,3}))?>/g;
// Matches [tag:value]
const METADATA_TAG_REGEX = /\[([a-zA-Z]+):([^\]]*)\]/;
const INSTRUMENTAL_REGEX =
  /^\s*(?:[([].*?(?:instrumental|solo|bridge|intro|outro|music|interlude|break).*?[)\]]|(?:instrumental|interlude|music)|[♫♪♩♬\s]+)\s*$/i;

function timeToMs(m: string, s: string, fraction?: string): number {
  const min = parseInt(m, 10);
  const sec = parseInt(s, 10);
  let ms = 0;
  if (fraction) {
    if (fraction.length === 2) {
      ms = parseInt(fraction, 10) * 10;
    } else if (fraction.length === 3) {
      ms = parseInt(fraction, 10);
    }
  }
  return min * 60000 + sec * 1000 + ms;
}

export function parseLRC(rawText: string): LyricsDocument {
  const doc: LyricsDocument = {
    metadata: {},
    lines: [],
    warnings: [],
  };

  if (!rawText || typeof rawText !== 'string') {
    doc.warnings.push('Input is empty or not a string.');
    return doc;
  }

  // Strip BOM and normalize newlines
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() || '';
    if (!line) continue;

    // Check for metadata
    const metadataMatch = line.match(METADATA_TAG_REGEX);
    if (metadataMatch && !TIME_TAG_REGEX.test(line)) {
      const key = metadataMatch[1];
      const value = metadataMatch[2] || '';
      if (key) {
        doc.metadata[key] = value.trim();
        if (key.toLowerCase() === 'offset') {
          const offsetVal = parseInt(value, 10);
          if (!isNaN(offsetVal)) {
            offset = offsetVal;
          } else {
            doc.warnings.push(
              `Invalid offset value on line ${i + 1}: ${value}`
            );
          }
        }
      }
      continue;
    }

    // Extract timestamps
    const timestamps: number[] = [];
    let match;
    TIME_TAG_REGEX.lastIndex = 0;
    while ((match = TIME_TAG_REGEX.exec(line)) !== null) {
      if (match[1] && match[2]) {
        timestamps.push(timeToMs(match[1], match[2], match[3]));
      }
    }

    if (timestamps.length === 0) {
      doc.warnings.push(`No valid timestamp found on line ${i + 1}: ${line}`);
      continue;
    }

    // Get the text payload (strip timestamps)
    let payload = line.replace(TIME_TAG_REGEX, '').trim();

    // Extract speaker if present [Artist]: text
    let speaker: string | undefined;
    const speakerMatch = payload.match(/^\[([^\]]+)\]:\s*(.*)$/);
    if (speakerMatch && speakerMatch[1] && speakerMatch[2] !== undefined) {
      speaker = speakerMatch[1].trim();
      payload = speakerMatch[2].trim();
    } else {
      const alternateSpeakerMatch = payload.match(/^([^:]+):\s*(.*)$/);
      if (
        alternateSpeakerMatch &&
        alternateSpeakerMatch[1] &&
        alternateSpeakerMatch[2] !== undefined &&
        alternateSpeakerMatch[1].length < 20 &&
        !alternateSpeakerMatch[1].includes('<')
      ) {
        speaker = alternateSpeakerMatch[1].trim();
        payload = alternateSpeakerMatch[2].trim();
      }
    }

    // Extract enhanced words if present
    let words: LyricWord[] | undefined;
    if (ENHANCED_TAG_REGEX.test(payload)) {
      words = [];
      let plainText = '';

      ENHANCED_TAG_REGEX.lastIndex = 0;
      let lastIndex = 0;
      let wordMatch;
      let wordStartMs = timestamps[0] || 0;

      while ((wordMatch = ENHANCED_TAG_REGEX.exec(payload)) !== null) {
        const textBefore = payload.slice(lastIndex, wordMatch.index).trim();
        if (textBefore) {
          words.push({
            startMs: wordStartMs,
            endMs: wordStartMs, // Will be updated later
            text: textBefore,
          });
          plainText += textBefore + ' ';
        }
        if (wordMatch[1] && wordMatch[2]) {
          wordStartMs = timeToMs(wordMatch[1], wordMatch[2], wordMatch[3]);
        }
        lastIndex = ENHANCED_TAG_REGEX.lastIndex;
      }
      const finalWordText = payload.slice(lastIndex).trim();
      if (finalWordText) {
        words.push({
          startMs: wordStartMs,
          endMs: wordStartMs, // Will be updated
          text: finalWordText,
        });
        plainText += finalWordText;
      }

      // Update word endMs based on the next word's startMs
      for (let j = 0; j < words.length; j++) {
        const w = words[j];
        const nextW = words[j + 1];
        if (w && nextW) {
          w.endMs = nextW.startMs;
        } else if (w) {
          w.endMs = w.startMs + 2000;
        }
      }

      payload = plainText.trim();
    }

    // Detect if this line represents an instrumental break/solo/intro
    const isInstrumental = INSTRUMENTAL_REGEX.test(payload);

    // Expand multiple timestamps (e.g. chorus)
    for (const time of timestamps) {
      const startMs = Math.max(0, time + offset);
      const newLyricLine: LyricLine = {
        startMs,
        endMs: startMs, // Will be updated later
        text: payload,
      };
      if (speaker) newLyricLine.speaker = speaker;
      if (isInstrumental) newLyricLine.isInstrumental = true;
      if (words) {
        // Deep copy words and adjust their startMs by offset
        newLyricLine.words = words.map((w) => ({
          ...w,
          startMs: Math.max(0, w.startMs + offset),
          endMs: Math.max(0, w.endMs + offset),
        }));
      }
      doc.lines.push(newLyricLine);
    }
  }

  // Sort by startMs
  doc.lines.sort((a, b) => a.startMs - b.startMs);

  // Derive endMs from the next line
  for (let i = 0; i < doc.lines.length; i++) {
    const current = doc.lines[i];
    if (!current) continue;

    if (i < doc.lines.length - 1) {
      let nextIndex = i + 1;
      while (nextIndex < doc.lines.length) {
        const nextLine = doc.lines[nextIndex];
        if (nextLine && nextLine.startMs === current.startMs) {
          nextIndex++;
        } else {
          break;
        }
      }
      const foundNext = doc.lines[nextIndex];
      if (foundNext) {
        current.endMs = foundNext.startMs;
      } else {
        current.endMs = current.startMs + 5000;
      }
    } else {
      current.endMs = current.startMs + 5000;
    }

    // Ensure word endMs doesn't exceed line endMs
    if (current.words && current.words.length > 0) {
      const lastWord = current.words[current.words.length - 1];
      if (lastWord) {
        lastWord.endMs = current.endMs;
      }
    }
  }

  return doc;
}
