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

// Keeps the first MAX_LINES lines and ends the last with an ellipsis that fits.
function ellipsize(lines, maxEm) {
  const kept = lines.slice(0, MAX_LINES).map((line) => [...line]);
  const last = kept[kept.length - 1];
  while (last.length > 1 && textWidth(`${last.join(' ')}${ELLIPSIS}`) > maxEm) last.pop();
  let text = last.join(' ').replace(/[\s.,;:!?-]+$/, '');
  while (text.length > 1 && textWidth(`${text}${ELLIPSIS}`) > maxEm) text = text.slice(0, -1);
  kept[kept.length - 1] = [`${text}${ELLIPSIS}`];
  return kept;
}

// { fontSize, lineHeight, lines: string[] } for a question on a box maxWidth
// pixels wide. Never throws; an empty question gives no lines.
export function layoutQuestion(question, maxWidth = 1008) {
  const sizes = FONT_SIZES;
  for (const fontSize of sizes) {
    const maxEm = maxWidth / fontSize;
    const words = wordsOf(question, maxEm);
    if (!words.length) return { fontSize, lineHeight: LINE_HEIGHT, lines: [] };
    if (greedyWrap(words, maxEm).length <= MAX_LINES) {
      const lines = fixOrphan(balancedWrap(words, maxEm), maxEm);
      return { fontSize, lineHeight: LINE_HEIGHT, lines: lines.map((line) => line.join(' ')) };
    }
  }
  const fontSize = sizes[sizes.length - 1];
  const maxEm = maxWidth / fontSize;
  const lines = ellipsize(greedyWrap(wordsOf(question, maxEm), maxEm), maxEm);
  return { fontSize, lineHeight: LINE_HEIGHT, lines: lines.map((line) => line.join(' ')) };
}
