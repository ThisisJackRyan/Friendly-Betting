import { isSettled } from './betStatus';
import { PROD_ORIGIN } from '../platform/runtime';
import { REVEAL_COPY, buildCardReveal } from './reveal';
import { settlementOf } from './settlement';

// The shareable winner card: a 1080x1350 PNG of a settled bet's reveal. This
// file only lays it out (which lines, where, in which font); winnerCardImage.js
// draws the layout on a canvas. Text is measured through `measure(text, font)`
// so the layout can be tested without a canvas.

export const CARD = { width: 1080, height: 1350, pad: 96 };
export const CARD_COLORS = { background: '#007a45', ink: '#ffffff', soft: '#deecd5', rule: '#ffffff35', accentSoft: '#a6c9a9' };
export const CARD_FONT_FAMILY = 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const CARD_BRAND = 'friendly';
export const CARD_FILENAME = 'friendly-result.png';

const font = (weight, size) => `${weight} ${size}px ${CARD_FONT_FAMILY}`;
const ELLIPSIS = '…';
const NBSP = '\u00A0';
// Whitespace a line may break at: any but the no-break space.
const BREAKS = /[^\S\u00A0]+/;

// User-perceived characters, so a cut never splits an emoji, a ZWJ sequence
// or an accent from its letter. Code points where Intl.Segmenter is missing.
let segmenter;
export function graphemes(text) {
  const value = String(text);
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return Array.from(value);
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(value), ({ segment }) => segment);
}

// A line's direction from its first strongly directional character, as
// dir="auto" does: 'rtl' for Hebrew, Arabic and the like, else 'ltr'.
const STRONG_RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const STRONG = /\p{L}/u;
export function textDirection(text) {
  const first = STRONG.exec(String(text || ''));
  return first && STRONG_RTL.test(first[0]) ? 'rtl' : 'ltr';
}

// "& 2 others" joined with no-break spaces, so the count never ends a line
// on its own ("Sam & 2" / "others won."); "& I" the same way.
const keepCount = (headline) => headline
  .replace(/ & (\d+) (others?)\b(?=[^&]*$)/, ` &${NBSP}$1${NBSP}$2`)
  .replace(/ & I won\.$/, ` &${NBSP}I won.`);

// Each block: its font sizes, largest first, with line height as a multiple
// of the size, how many lines it may take and the gap after it. The headline
// steps down a size before it clips, so "& 4 others" survives long names.
const BLOCKS = {
  question: { weight: 600, sizes: [44], leading: 1.32, maxLines: 3, color: 'soft', after: 64 },
  eyebrow: { weight: 700, sizes: [40], leading: 1.3, maxLines: 2, color: 'soft', after: 20 },
  headline: { weight: 800, sizes: [100, 84, 72], leading: 1.1, maxLines: 3, color: 'ink', after: 28 },
  subline: { weight: 600, sizes: [44], leading: 1.32, maxLines: 2, color: 'ink', after: 0 },
  stake: { weight: 600, sizes: [40], leading: 1.35, maxLines: 1, color: 'soft', after: 0 },
};

// Cut `text` to fit `width`, ending in an ellipsis.
function clip(text, width, fontSpec, measure) {
  if (measure(text, fontSpec) <= width) return text;
  let chars = graphemes(text);
  while (chars.length && measure(`${chars.join('').trimEnd()}${ELLIPSIS}`, fontSpec) > width) chars = chars.slice(0, -1);
  return `${chars.join('').trimEnd()}${ELLIPSIS}`;
}

// Word wrap to at most `maxLines`, never at a no-break space; a word wider
// than a line is broken, and whatever does not fit ends the last line with an
// ellipsis.
export function wrapText(text, { width, font: fontSpec, maxLines, measure }) {
  const words = String(text || '').split(BREAKS).filter(Boolean);
  const lines = [];
  let line = '';
  let rest = words;
  while (rest.length && lines.length < maxLines) {
    const [word, ...more] = rest;
    const next = line ? `${line} ${word}` : word;
    if (measure(next, fontSpec) <= width) {
      line = next;
      rest = more;
    } else if (line) {
      lines.push(line);
      line = '';
    } else {
      // One word wider than the line: break it.
      const chars = graphemes(word);
      let cut = chars.length - 1;
      while (cut > 1 && measure(chars.slice(0, cut).join(''), fontSpec) > width) cut -= 1;
      lines.push(chars.slice(0, cut).join(''));
      rest = [chars.slice(cut).join(''), ...more];
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line);
    line = '';
  }
  if (rest.length || line) {
    // Only a line's worth of the overflow is needed to clip it.
    const tail = graphemes([lines.pop(), line, ...rest].filter(Boolean).join(' ')).slice(0, 200).join('');
    lines.push(clip(`${tail}${ELLIPSIS}`, width, fontSpec, measure));
  }
  return lines;
}

// What the card says when `viewerId` shares it: the reveal a visitor sees
// (never "You", since the card goes to the group; buildCardReveal), with the
// bet's question on top. Null for anything that is not a settled bet with a
// known result: open, called off, or a legacy count-only bet.
export function winnerCardText(bet, viewerId = null) {
  if (!isSettled(bet)) return null;
  const result = settlementOf(bet);
  const reveal = buildCardReveal(bet, viewerId);
  if (!result || !reveal || reveal.kind === 'legacy' || reveal.kind === 'called-off') return null;
  return {
    question: result.question,
    eyebrow: reveal.eyebrow,
    headline: keepCount(reveal.headline),
    subline: reveal.subline,
    stake: reveal.stake ? REVEAL_COPY.stake(reveal.stake) : '',
  };
}

// Names cut to `max` characters, for a headline too long for the card.
const NAME_CUTS = [18, 12];
const cutName = (name, max) => {
  const chars = graphemes(String(name || '').trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}${ELLIPSIS}` : chars.join('');
};

// The reveal's headline, then the same with each name cut shorter.
function headlineVariants(bet, headline, viewerId) {
  const result = settlementOf(bet);
  return [headline, ...NAME_CUTS.map((max) => keepCount(buildCardReveal({
    ...bet, settlement: { ...result, winners: result.winners.map((winner) => ({ ...winner, name: cutName(winner.name, max) })) },
  }, viewerId).headline))];
}

// The full layout, as `viewerId` would share it: positioned lines plus the
// brand, rule and footer.
export function buildWinnerCard(bet, { measure, viewerId = null }) {
  const text = winnerCardText(bet, viewerId);
  if (!text) return null;
  const variants = { headline: headlineVariants(bet, text.headline, viewerId) };
  const { width, height, pad } = CARD;
  const inner = width - pad * 2;
  const lines = [];
  let y = 236;
  const place = (key) => {
    const block = BLOCKS[key];
    // The first text and size that fit whole: the full text at each size,
    // then shorter names. Else the full text at the smallest size, clipped.
    const fits = (value, size) => wrapText(value, {
      width: inner, font: font(block.weight, size), maxLines: Infinity, measure,
    }).length <= block.maxLines;
    const tries = (variants[key] || [text[key]]).flatMap((value) => block.sizes.map((size) => ({ value, size })));
    const { value, size } = tries.find((item) => fits(item.value, item.size)) || { value: text[key], size: block.sizes.at(-1) };
    const fontSpec = font(block.weight, size);
    const wrapped = wrapText(value, { width: inner, font: fontSpec, maxLines: block.maxLines, measure });
    wrapped.forEach((line) => {
      y += Math.round(size * block.leading);
      lines.push({ key, text: line, font: fontSpec, color: CARD_COLORS[block.color], x: pad, y });
    });
    if (wrapped.length) y += block.after;
  };
  place('question');
  place('eyebrow');
  place('headline');
  place('subline');
  let rule = null;
  if (text.stake) {
    y += 44;
    rule = { x: pad, y, width: inner, color: CARD_COLORS.rule };
    y += 20;
    place('stake');
  }
  return {
    width,
    height,
    background: CARD_COLORS.background,
    text,
    // The app's Brand (ProductUI.jsx): the F. symbol, then "friendly."
    brand: {
      x: pad, y: pad, symbol: 66, text: CARD_BRAND, period: '.', font: font(800, 56), spacing: -2.8,
      color: CARD_COLORS.ink, letter: CARD_COLORS.background, periodColor: CARD_COLORS.accentSoft,
    },
    footer: { text: new URL(PROD_ORIGIN).host.replace(/^www\./, ''), font: font(700, 32), color: CARD_COLORS.soft, x: pad, y: height - pad },
    rule,
    lines,
  };
}
