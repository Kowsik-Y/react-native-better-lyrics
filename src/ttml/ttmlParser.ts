import type { LyricsDocument, LyricLine, LyricWord } from '../core/types';

function ttmlTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim().replace(',', '.');

  // Handle formats like "1234ms"
  if (trimmed.endsWith('ms')) {
    const val = parseFloat(trimmed.slice(0, -2));
    return isNaN(val) ? 0 : Math.round(val);
  }

  // Handle formats like "9.731s" or "9s"
  if (trimmed.endsWith('s')) {
    const val = parseFloat(trimmed.slice(0, -1));
    return isNaN(val) ? 0 : Math.round(val * 1000);
  }

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
    const num = parseFloat(parts[0] || '0');
    return isNaN(num) ? 0 : Math.round(num * 1000);
  }
  return 0;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function getAttribute(tagString: string, attrName: string): string | undefined {
  // Support prefixes like ttm:agent, itunes:key, xml:id, or simple agent
  const regex = new RegExp(
    `(?:[a-zA-Z0-9_-]+:)?${attrName}\\s*=\\s*["']([^"']*)["']`,
    'i'
  );
  const match = tagString.match(regex);
  return match && match[1] !== undefined ? match[1] : undefined;
}

interface XmlNode {
  type: 'element' | 'text';
  name?: string;
  attrs?: string;
  text?: string;
  children?: XmlNode[];
}

function parseXmlNodes(xml: string): XmlNode[] {
  const nodes: XmlNode[] = [];
  let i = 0;
  while (i < xml.length) {
    const nextTag = xml.indexOf('<', i);
    if (nextTag === -1) {
      const text = xml.slice(i);
      if (text) nodes.push({ type: 'text', text });
      break;
    }
    if (nextTag > i) {
      const text = xml.slice(i, nextTag);
      nodes.push({ type: 'text', text });
    }
    const closeTag = xml.indexOf('>', nextTag);
    if (closeTag === -1) break;
    const tagContent = xml.slice(nextTag + 1, closeTag);
    i = closeTag + 1;
    if (tagContent.startsWith('/')) continue;

    const isSelfClosing = tagContent.endsWith('/');
    const spaceIdx = tagContent.search(/\s/);
    const tagName = (
      spaceIdx === -1
        ? isSelfClosing
          ? tagContent.slice(0, -1)
          : tagContent
        : tagContent.slice(0, spaceIdx)
    ).toLowerCase();
    const attrsStr =
      spaceIdx === -1
        ? ''
        : isSelfClosing
          ? tagContent.slice(spaceIdx, -1)
          : tagContent.slice(spaceIdx);

    if (isSelfClosing) {
      nodes.push({
        type: 'element',
        name: tagName,
        attrs: attrsStr,
        children: [],
      });
      continue;
    }

    const endTagStr = '</' + tagName + '>';
    let depth = 1;
    let searchPos = i;
    let innerEnd = -1;
    while (depth > 0 && searchPos < xml.length) {
      const nextOpen = xml.toLowerCase().indexOf('<' + tagName, searchPos);
      const nextClose = xml.toLowerCase().indexOf(endTagStr, searchPos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        searchPos = nextOpen + tagName.length + 1;
      } else {
        depth--;
        if (depth === 0) {
          innerEnd = nextClose;
          i = nextClose + endTagStr.length;
          break;
        }
        searchPos = nextClose + endTagStr.length;
      }
    }

    const innerXml = innerEnd !== -1 ? xml.slice(closeTag + 1, innerEnd) : '';
    nodes.push({
      type: 'element',
      name: tagName,
      attrs: attrsStr,
      children: parseXmlNodes(innerXml),
    });
  }
  return nodes;
}

interface SpanItem {
  text: string;
  startMs: number;
  endMs: number;
  hasTrailingSpace: boolean;
}

function mergeSpansIntoWords(spans: SpanItem[]): LyricWord[] {
  if (spans.length === 0) return [];
  const words: LyricWord[] = [];
  let curText = spans[0]!.text;
  let curStart = spans[0]!.startMs;
  let curEnd = spans[0]!.endMs;

  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1]!;
    const cur = spans[i]!;
    if (prev.hasTrailingSpace) {
      words.push({ text: curText, startMs: curStart, endMs: curEnd });
      curText = cur.text;
      curStart = cur.startMs;
      curEnd = cur.endMs;
    } else {
      curText += cur.text;
      curEnd = Math.max(curEnd, cur.endMs);
    }
  }

  if (curText) {
    words.push({ text: curText, startMs: curStart, endMs: curEnd });
  }

  return words;
}

function getNodeDirectText(nodes: XmlNode[]): string {
  let result = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      result += node.text || '';
    } else if (node.type === 'element' && node.children) {
      result += getNodeDirectText(node.children);
    }
  }
  return decodeHtmlEntities(result);
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

  const pRegex = /<p\b([^>]*)>(.*?)<\/p>/gis;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(rawXml)) !== null) {
    const attrsStr = match[1] || '';
    const bodyXml = match[2] || '';

    const beginStr = getAttribute(attrsStr, 'begin');
    const endStr = getAttribute(attrsStr, 'end');
    const durStr = getAttribute(attrsStr, 'dur');
    const agent = getAttribute(attrsStr, 'agent');

    if (!beginStr) {
      continue;
    }

    const pStartMs = ttmlTimeToMs(beginStr);
    let pEndMs = endStr
      ? ttmlTimeToMs(endStr)
      : durStr
        ? pStartMs + ttmlTimeToMs(durStr)
        : pStartMs + 3500;

    if (pEndMs <= pStartMs) {
      pEndMs = pStartMs + 3500;
    }

    const childNodes = parseXmlNodes(bodyXml);
    const mainSpans: SpanItem[] = [];
    const bgLines: LyricLine[] = [];

    for (let j = 0; j < childNodes.length; j++) {
      const node = childNodes[j]!;
      if (node.type === 'element' && node.name === 'span') {
        const role = getAttribute(node.attrs || '', 'role');

        if (role === 'x-bg') {
          // Background vocal span: parse its nested child spans
          const bgSpans: SpanItem[] = [];
          const bgChildren = node.children || [];

          for (let k = 0; k < bgChildren.length; k++) {
            const cn = bgChildren[k]!;
            if (cn.type === 'element' && cn.name === 'span') {
              const b = getAttribute(cn.attrs || '', 'begin');
              const e = getAttribute(cn.attrs || '', 'end');
              const txt = decodeHtmlEntities(
                getNodeDirectText(cn.children || [])
              ).trim();
              const nextCn = bgChildren[k + 1];
              const hasSpace = Boolean(
                nextCn && nextCn.type === 'text' && /\s/.test(nextCn.text || '')
              );
              if (txt) {
                bgSpans.push({
                  text: txt,
                  startMs: b ? ttmlTimeToMs(b) : pStartMs,
                  endMs: e ? ttmlTimeToMs(e) : pEndMs,
                  hasTrailingSpace: hasSpace,
                });
              }
            }
          }

          const bgWords = mergeSpansIntoWords(bgSpans);
          const bgText =
            bgWords.length > 0
              ? bgWords.map((w) => w.text).join(' ')
              : decodeHtmlEntities(getNodeDirectText(bgChildren)).trim();

          if (bgText) {
            const bgStart = bgWords.length > 0 ? bgWords[0]!.startMs : pStartMs;
            const bgEnd =
              bgWords.length > 0 ? bgWords[bgWords.length - 1]!.endMs : pEndMs;

            bgLines.push({
              text: bgText,
              startMs: bgStart,
              endMs: Math.max(bgEnd, bgStart + 300),
              words: bgWords.length > 0 ? bgWords : undefined,
              isBackground: true,
            });
          }
        } else if (role !== 'x-translation' && role !== 'x-roman') {
          // Regular main vocal word span
          const b = getAttribute(node.attrs || '', 'begin');
          const e = getAttribute(node.attrs || '', 'end');
          const txt = decodeHtmlEntities(
            getNodeDirectText(node.children || [])
          ).trim();
          const nextNode = childNodes[j + 1];
          const hasSpace = Boolean(
            nextNode &&
            nextNode.type === 'text' &&
            /\s/.test(nextNode.text || '')
          );

          if (txt) {
            mainSpans.push({
              text: txt,
              startMs: b ? ttmlTimeToMs(b) : pStartMs,
              endMs: e ? ttmlTimeToMs(e) : pEndMs,
              hasTrailingSpace: hasSpace,
            });
          }
        }
      }
    }

    const mainWords = mergeSpansIntoWords(mainSpans);
    const mainText =
      mainWords.length > 0
        ? mainWords.map((w) => w.text).join(' ')
        : decodeHtmlEntities(getNodeDirectText(childNodes)).trim();

    if (mainText) {
      const line: LyricLine = {
        startMs: pStartMs,
        endMs: pEndMs,
        text: mainText,
      };
      if (mainWords.length > 0) {
        line.words = mainWords;
      }
      if (agent) {
        line.agent = agent;
      }
      doc.lines.push(line);
    }

    // Append background lines
    for (const bg of bgLines) {
      doc.lines.push(bg);
    }
  }

  // Sort lines chronologically
  doc.lines.sort((a, b) => a.startMs - b.startMs);

  // Enforce strictly non-overlapping active windows (matching LRC standard: no two lines active at a time)
  for (let i = 0; i < doc.lines.length; i++) {
    const cur = doc.lines[i]!;

    if (i < doc.lines.length - 1) {
      const next = doc.lines[i + 1]!;
      if (next.startMs > cur.startMs && cur.endMs > next.startMs) {
        cur.endMs = next.startMs;
      }
    }

    // Ensure word timestamps do not exceed clamped line endMs
    if (cur.words && cur.words.length > 0) {
      const lastWord = cur.words[cur.words.length - 1];
      if (lastWord && lastWord.endMs > cur.endMs) {
        lastWord.endMs = cur.endMs;
      }
    }
  }

  if (doc.lines.length === 0) {
    doc.warnings.push('No valid lines parsed from TTML');
  }

  return doc;
}
