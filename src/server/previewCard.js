import { createElement as h } from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { layoutQuestion } from './previewCardLayout.js';

// The link preview card for /b/{code}, 1200x630. Plain createElement (no JSX)
// so a node script can render it too. The question card is the question in
// dark ink on white; the fallback card is the app icon and the name.

export const CARD_SIZE = { width: 1200, height: 630 };
export const CARD_COLORS = { background: '#ffffff', ink: '#1a1a1a' };
const PADDING_X = 96;
const FONT_FAMILY = 'Manrope';

const fontPath = (weight) =>
  join(process.cwd(), 'node_modules', '@fontsource', 'manrope', 'files', `manrope-latin-${weight}-normal.woff`);

// Manrope 800 and 600 as ImageResponse fonts, or [] when they cannot be read
// (the card then uses the built-in sans). Never throws.
export async function loadCardFonts() {
  try {
    const [heavy, semi] = await Promise.all([readFile(fontPath(800)), readFile(fontPath(600))]);
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
    const svg = await readFile(join(process.cwd(), 'app', 'icon.svg'));
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

function questionCard(question) {
  const { fontSize, lineHeight, lines } = layoutQuestion(question, CARD_SIZE.width - PADDING_X * 2);
  return frame(
    { justifyContent: 'space-between', padding: `88px ${PADDING_X}px 72px` },
    h('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' } },
      ...lines.map((line, i) => h('div', {
        key: i,
        style: {
          display: 'flex', fontSize, fontWeight: 800, lineHeight, letterSpacing: -0.02 * fontSize, whiteSpace: 'nowrap',
        },
      }, line))),
    h('div', { style: { display: 'flex', fontSize: 34, fontWeight: 600, letterSpacing: -0.5 } }, 'Friendly Bets'),
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
export function previewCard(question, { iconSrc = '' } = {}) {
  const text = String(question || '').trim();
  return text ? questionCard(text) : fallbackCard(iconSrc);
}
