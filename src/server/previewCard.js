import { createElement as h } from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { layoutQuestion, layoutText, layoutWithSuffix } from './previewCardLayout.js';
import { BRAND_ACCENT } from '../phone/brandColors.js';
import { CLOSED_CARD_COPY } from '../phone/closedCopy.js';

// The link preview card for /b/{code}, 1200x630. Plain createElement (no JSX)
// so a node script can render it too. The question card is the question in
// the brand green on white with the name in dark ink; the fallback card is the
// app icon and the name in dark ink. A closed bet (settled, called off, or
// picks in) gets a closed card in the same frame: a big status line, the
// question under it, and for called off and picks in a muted note.

export const CARD_SIZE = { width: 1200, height: 630 };
export const CARD_COLORS = { background: '#ffffff', ink: '#1a1a1a', title: BRAND_ACCENT, muted: '#6b6b6b' };
// ImageResponse defaults to a year-long immutable cache, which would pin a
// card forever. next/og copies options.headers over its defaults, so these win.
// A question card: browsers recheck after a minute and the CDN after five, so
// an edited or deleted bet shows within minutes, while stale-while-revalidate
// keeps crawlers fast by serving the old card during the refetch.
export const QUESTION_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';
// The fallback card (no question, or any failure) may only stand for a
// moment: a cold read or a brief outage must not stick to a real bet's
// preview, so browsers never reuse it and the CDN holds it a minute at most.
export const FALLBACK_CACHE = 'public, max-age=0, s-maxage=60';
const PADDING_X = 96;
const FONT_FAMILY = 'Manrope';

// One literal path per weight, so file tracing can see them. next.config.js
// also lists these files (and app/icon.svg) in outputFileTracingIncludes for
// the opengraph-image route.
export const FONT_PATHS = {
  800: join(process.cwd(), 'node_modules/@fontsource/manrope/files/manrope-latin-800-normal.woff'),
  600: join(process.cwd(), 'node_modules/@fontsource/manrope/files/manrope-latin-600-normal.woff'),
};
export const ICON_PATH = join(process.cwd(), 'app/icon.svg');

// Manrope 800 and 600 as ImageResponse fonts, or [] when they cannot be read
// (the card then uses the built-in sans). Never throws.
export async function loadCardFonts() {
  try {
    const [heavy, semi] = await Promise.all([readFile(FONT_PATHS[800]), readFile(FONT_PATHS[600])]);
    return [
      { name: FONT_FAMILY, data: heavy, weight: 800, style: 'normal' },
      { name: FONT_FAMILY, data: semi, weight: 600, style: 'normal' },
    ];
  } catch (err) {
    return [];
  }
}

// The app icon (app/icon.svg, the source for every other icon) as a data URL,
// or '' when it cannot be read. Never throws.
export async function loadAppIcon() {
  try {
    const svg = await readFile(ICON_PATH);
    return `data:image/svg+xml;base64,${svg.toString('base64')}`;
  } catch (err) {
    return '';
  }
}

const frame = (style, ...children) =>
  h('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: CARD_COLORS.background, color: CARD_COLORS.ink, fontFamily: FONT_FAMILY, ...style,
    },
  }, ...children);

const wordmark = () => h('div', { style: { display: 'flex', color: CARD_COLORS.ink, fontSize: 34, fontWeight: 600, letterSpacing: -0.5 } }, 'Friendly Bets');

const textLines = ({ lines, fontSize, lineHeight }, { color, weight, tight = false }) =>
  lines.map((line, i) => h('div', {
    key: i,
    style: {
      display: 'flex', color, fontSize, fontWeight: weight, lineHeight, whiteSpace: 'nowrap',
      ...(tight ? { letterSpacing: -0.02 * fontSize } : {}),
    },
  }, line));

// Closed cards: the hero takes at most two lines from HERO_SIZES; the question
// is about half the hero's size, at most two lines; the note a little smaller.
export const HERO_SIZES = [92, 80, 70, 62];
const HERO_LINES = 2;
const BODY_LINE_HEIGHT = 1.25;

function closedCard(status, question, side) {
  const copy = CLOSED_CARD_COPY[status];
  const width = CARD_SIZE.width - PADDING_X * 2;
  const heroOptions = { sizes: HERO_SIZES, maxLines: HERO_LINES };
  const hero = status === 'settled'
    ? layoutWithSuffix(side, copy.heroSuffix, width, heroOptions)
    : layoutText(copy.hero(), width, heroOptions);
  const bodySize = Math.max(34, Math.round(hero.fontSize / 2));
  const body = layoutText(question, width, { sizes: [bodySize], maxLines: 2, lineHeight: BODY_LINE_HEIGHT });
  const noteSize = Math.round(bodySize * 0.85);
  return frame(
    { justifyContent: 'space-between', padding: `88px ${PADDING_X}px 72px` },
    h('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' } },
      ...textLines(hero, { color: status === 'settled' ? CARD_COLORS.title : CARD_COLORS.ink, weight: 800, tight: true }),
      h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: Math.round(hero.fontSize * 0.3) } },
        ...textLines(body, { color: CARD_COLORS.ink, weight: 600 })),
      copy.note
        ? h('div', {
          style: {
            display: 'flex', marginTop: Math.round(noteSize * 0.6), color: CARD_COLORS.muted, fontSize: noteSize, fontWeight: 600, lineHeight: BODY_LINE_HEIGHT,
          },
        }, copy.note)
        : null),
    wordmark(),
  );
}

function questionCard(question) {
  const { fontSize, lineHeight, lines } = layoutQuestion(question, CARD_SIZE.width - PADDING_X * 2);
  return frame(
    { justifyContent: 'space-between', padding: `88px ${PADDING_X}px 72px` },
    h('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' } },
      ...lines.map((line, i) => h('div', {
        key: i,
        style: {
          display: 'flex', color: CARD_COLORS.title, fontSize, fontWeight: 800, lineHeight, letterSpacing: -0.02 * fontSize, whiteSpace: 'nowrap',
        },
      }, line))),
    wordmark(),
  );
}

function fallbackCard(iconSrc) {
  return frame(
    { alignItems: 'center', justifyContent: 'center' },
    iconSrc
      ? h('img', { src: iconSrc, width: 200, height: 200, style: { marginBottom: 44 } })
      : null,
    h('div', { style: { display: 'flex', fontSize: 72, fontWeight: 800, letterSpacing: -1.5 } }, 'Friendly Bets'),
  );
}

// The card element for a question, or the fallback card when it is empty.
// `status` ('settled', 'calledOff' or 'closed') picks a closed card; a
// settled card needs the winning `side`. Anything else is the open card.
export function previewCard(question, { iconSrc = '', status = 'open', side = '' } = {}) {
  const text = String(question || '').trim();
  if (!text) return fallbackCard(iconSrc);
  const winner = String(side || '').trim();
  if (status === 'calledOff' || status === 'closed' || (status === 'settled' && winner)) {
    return closedCard(status, text, winner);
  }
  return questionCard(text);
}
