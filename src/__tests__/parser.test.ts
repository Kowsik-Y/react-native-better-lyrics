import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { parseLRC, estimateLineWordTimings } from '../core/parser';
import { getActiveLineIndices } from '../core/activeLine';

describe('Lyrics Parser', () => {
  let sampleLrc: string;

  beforeAll(() => {
    sampleLrc = fs.readFileSync(
      path.join(__dirname, '../__fixtures__/sample.lrc'),
      'utf8'
    );
  });

  it('should parse metadata correctly', () => {
    const doc = parseLRC(sampleLrc);
    expect(doc.metadata.ti).toBe('Never Gonna Give You Up');
    expect(doc.metadata.ar).toBe('Rick Astley');
  });

  it('should apply offset to timestamps', () => {
    const doc = parseLRC(sampleLrc);
    expect(doc.lines[0]?.startMs).toBe(500);
  });

  it('should extract speakers', () => {
    const doc = parseLRC(sampleLrc);
    const lineWithSpeaker = doc.lines.find(
      (l) => l.text === "You wouldn't get this from any other guy"
    );
    expect(lineWithSpeaker).toBeDefined();
    if (lineWithSpeaker) {
      expect(lineWithSpeaker.speaker).toBe('Rick');
    }
  });

  it('should parse enhanced word tags', () => {
    const doc = parseLRC(sampleLrc);
    const lineWithWords = doc.lines.find((l) =>
      l.text.includes("commitment's what I'm thinking of")
    );
    expect(lineWithWords).toBeDefined();
    if (lineWithWords && lineWithWords.words) {
      expect(lineWithWords.words.length).toBeGreaterThan(0);
      expect(lineWithWords.words[0]?.startMs).toBe(28000);
    } else {
      expect('Words array was undefined').toBe('defined');
    }
  });

  it('should duplicate lines for multiple timestamps', () => {
    const doc = parseLRC(sampleLrc);
    const chorusLines = doc.lines.filter(
      (l) => l.text === 'You know the rules and so do I'
    );
    expect(chorusLines.length).toBe(2);
  });

  it('should generate warnings for malformed lines but not throw', () => {
    const doc = parseLRC(sampleLrc);
    expect(doc.warnings.length).toBeGreaterThan(0);
    const hasMalformedWarning = doc.warnings.some((w) =>
      w.includes('[malformed timestamp]')
    );
    expect(hasMalformedWarning).toBe(true);
  });

  it('should detect instrumental break tags', () => {
    const doc = parseLRC(
      '[00:10.00] (Instrumental Solo)\n[00:20.00] [Music]\n[00:30.00] ♫\n[00:40.00] ♪'
    );
    expect(doc.lines[0]?.isInstrumental).toBe(true);
    expect(doc.lines[1]?.isInstrumental).toBe(true);
    expect(doc.lines[2]?.isInstrumental).toBe(true);
    expect(doc.lines[3]?.isInstrumental).toBe(true);
  });

  it('should parse agent and bg tags matching Echo-Music format', () => {
    const doc = parseLRC(
      '[00:05.00] {agent:v1} Main singer verse\n[00:10.00] {agent:v2} Duet response\n[00:15.00] {bg} Backing vocals harmony'
    );
    expect(doc.lines[0]?.agent).toBe('v1');
    expect(doc.lines[0]?.text).toBe('Main singer verse');

    expect(doc.lines[1]?.agent).toBe('v2');
    expect(doc.lines[1]?.text).toBe('Duet response');

    expect(doc.lines[2]?.isBackground).toBe(true);
    expect(doc.lines[2]?.text).toBe('Backing vocals harmony');
  });

  it('should estimate proportional word timings for lines without word timestamps', () => {
    const doc = parseLRC(
      '[00:00.00] Hello wonderful world\n[00:04.00] Next line'
    );
    const firstLine = doc.lines[0]!;
    const words = estimateLineWordTimings(firstLine);
    expect(words.length).toBe(3);
    expect(words[0]?.text).toBe('Hello');
    expect(words[1]?.text).toBe('wonderful');
    expect(words[2]?.text).toBe('world');
    expect(words[0]?.startMs).toBe(0);
    expect(words[2]?.endMs).toBeGreaterThan(words[1]?.startMs || 0);
  });
});

describe('Active Line Search', () => {
  it('should find active line index via binary search', () => {
    const doc = parseLRC('[00:00.00] One\n[00:02.00] Two\n[00:04.00] Three');
    expect(getActiveLineIndices(doc, 1000)).toEqual([0]);
    expect(getActiveLineIndices(doc, 2000)).toEqual([1]);
    expect(getActiveLineIndices(doc, 3000)).toEqual([1]);
    expect(getActiveLineIndices(doc, 4500)).toEqual([2]);
  });

  it('should return multiple indices for duets', () => {
    const doc = parseLRC('[00:00.00] Boy\n[00:00.00] Girl');
    expect(getActiveLineIndices(doc, 1000)).toEqual([0, 1]);
  });
});
