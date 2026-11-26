// Pure layout for the link preview card: picks a font size for the bet
// question and breaks it into at most three balanced lines with no orphan.
// Widths are estimated in em from rough per-character classes (tuned for a
// heavy sans such as Manrope 800), so the card never depends on measuring.

export const MAX_LINES = 3;
// Largest first; the first size whose greedy wrap fits in MAX_LINES wins.
export const FONT_SIZES = [92, 80, 70, 62, 54, 48];
export const LINE_HEIGHT = 1.18;
const ELLIPSIS = '…';

const NARROW = new Set("iljtfrI.,:;'!|()[]` ");
const WIDE = new Set('mwMW@%');

// Approximate advance width of one character, in em.
export function charWidth(ch) {
  if (ch === ' ') return 0.27;
  if (NARROW.has(ch)) return 0.33;
  if (WIDE.has(ch)) return 0.9;
  if (/[A-Z]/.test(ch)) return 0.7;
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[a-z]/.test(ch)) return 0.58;
  // Emoji, CJK and anything else: assume wide.
  return ch.codePointAt(0) > 0x2000 ? 1.05 : 0.62;
}

export function textWidth(text) {
  let width = 0;
  for (const ch of text) width += charWidth(ch);
  return width;
}

// Splits a single word wider than maxEm into pieces that fit.
function splitLongWord(word, maxEm) {
  const pieces = [];
  let current = '';
  for (const ch of word) {
    if (current && textWidth(current + ch) > maxEm) {
      pieces.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function wordsOf(text, maxEm) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .flatMap((word) => (textWidth(word) > maxEm ? splitLongWord(word, maxEm) : [word]));
}

// Greedy wrap: fills each line as far as maxEm allows.
export function greedyWrap(words, maxEm) {
  const lines = [];
  let current = [];
  for (const word of words) {
    const next = [...current, word];
    if (current.length && textWidth(next.join(' ')) > maxEm) {
      lines.push(current);
      current = [word];
    } else {
      current = next;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

// Same line count as greedy, but with the narrowest width that keeps it, so
// the lines come out about even.
export function balancedWrap(words, maxEm) {
  const target = greedyWrap(words, maxEm).length;
  if (target <= 1) return greedyWrap(words, maxEm);
  let lo = Math.max(...words.map(textWidth));
  let hi = maxEm;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (greedyWrap(words, mid).length <= target) hi = mid;
    else lo = mid;
  }
  return greedyWrap(words, hi);
}

// A last line that is one short word reads as an orphan: pull a word down
// from the line above when it still fits.
export function fixOrphan(lines, maxEm) {
  if (lines.length < 2) return lines;
  const out = lines.map((line) => [...line]);
  const last = out[out.length - 1];
  const prev = out[out.length - 2];
  if (last.length === 1 && prev.length > 1) {
    const moved = [prev[prev.length - 1], ...last];
    if (textWidth(moved.join(' ')) <= maxEm) {
      prev.pop();
      out[out.length - 1] = moved;
    }
  }
  return out;
}

// Keeps the first maxLines lines and ends the last with an ellipsis that fits.
function ellipsize(lines, maxEm, maxLines = MAX_LINES) {
  const kept = lines.slice(0, maxLines).map((line) => [...line]);
  const last = kept[kept.length - 1];
  while (last.length > 1 && textWidth(`${last.join(' ')}${ELLIPSIS}`) > maxEm) last.pop();
  let text = last.join(' ').replace(/[\s.,;:!?-]+$/, '');
  while (text.length > 1 && textWidth(`${text}${ELLIPSIS}`) > maxEm) text = text.slice(0, -1);
  kept[kept.length - 1] = [`${text}${ELLIPSIS}`];
  return kept;
}

const asLayout = (fontSize, lineHeight, lines) => ({ fontSize, lineHeight, lines: lines.map((line) => line.join(' ')) });

// { fontSize, lineHeight, lines: string[] } for text on a box maxWidth
// pixels wide: the largest of `sizes` whose wrap fits in maxLines, balanced
// with no orphan, else the smallest size cut with an ellipsis. Never throws;
// empty text gives no lines.
export function layoutText(text, maxWidth, { sizes = FONT_SIZES, maxLines = MAX_LINES, lineHeight = LINE_HEIGHT } = {}) {
  for (const fontSize of sizes) {
    const maxEm = maxWidth / fontSize;
    const words = wordsOf(text, maxEm);
    if (!words.length) return { fontSize, lineHeight, lines: [] };
    if (greedyWrap(words, maxEm).length <= maxLines) {
      return asLayout(fontSize, lineHeight, fixOrphan(balancedWrap(words, maxEm), maxEm));
    }
  }
  const fontSize = sizes[sizes.length - 1];
  const maxEm = maxWidth / fontSize;
  return asLayout(fontSize, lineHeight, ellipsize(greedyWrap(wordsOf(text, maxEm), maxEm), maxEm, maxLines));
}

// The open card's question: up to MAX_LINES lines from FONT_SIZES.
export function layoutQuestion(question, maxWidth = 1008) {
  return layoutText(question, maxWidth);
}

// Like layoutText, for `head` followed by a fixed `suffix` (" won."): when
// the whole will not fit in maxLines even at the smallest size, the head is
// cut (whole words first, then letters) and ends with an ellipsis, so the
// suffix always shows: "{head…} won.".
export function layoutWithSuffix(head, suffix, maxWidth, { sizes = FONT_SIZES, maxLines = MAX_LINES, lineHeight = LINE_HEIGHT } = {}) {
  const clean = String(head || '').replace(/\s+/g, ' ').trim();
  const fits = (text, fontSize) => {
    const maxEm = maxWidth / fontSize;
    return greedyWrap(wordsOf(text, maxEm), maxEm).length <= maxLines;
  };
  for (const fontSize of sizes) {
    if (fits(`${clean}${suffix}`, fontSize)) return layoutText(`${clean}${suffix}`, maxWidth, { sizes: [fontSize], maxLines, lineHeight });
  }
  const fontSize = sizes[sizes.length - 1];
  const cut = (text) => `${text.replace(/[\s.,;:!?-]+$/, '')}${ELLIPSIS}${suffix}`;
  const words = clean.split(' ');
  for (let count = words.length - 1; count >= 1; count -= 1) {
    const text = cut(words.slice(0, count).join(' '));
    if (fits(text, fontSize)) return layoutText(text, maxWidth, { sizes: [fontSize], maxLines, lineHeight });
  }
  const letters = Array.from(words[0] || '');
  for (let count = letters.length - 1; count >= 1; count -= 1) {
    const text = cut(letters.slice(0, count).join(''));
    if (fits(text, fontSize)) return layoutText(text, maxWidth, { sizes: [fontSize], maxLines, lineHeight });
  }
  return layoutText(`${clean}${suffix}`, maxWidth, { sizes, maxLines, lineHeight });
}
