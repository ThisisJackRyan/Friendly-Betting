import { buildWinnerCard, textDirection } from './winnerCard';

// Draws the winner card (winnerCard.js) on a canvas and returns a PNG Blob.
// Manrope is already on the page (app/layout.js on the web, @fontsource in
// the app); this only waits a moment for it. If it never loads the card
// still draws, in the system font.

const FONT_WAIT_MS = 1500;
const WEIGHTS = [600, 700, 800];

async function fontsReady(doc) {
  const fonts = doc?.fonts;
  if (!fonts?.load) return;
  const loads = Promise.all(WEIGHTS.map((weight) => fonts.load(`${weight} 40px Manrope`))).catch(() => {});
  await Promise.race([loads, new Promise((resolve) => { setTimeout(resolve, FONT_WAIT_MS); })]);
}

// Draws `text` a letter at a time, `spacing` apart; returns where it ended.
function drawSpaced(ctx, text, x, y, spacing) {
  let left = x;
  Array.from(text).forEach((char) => {
    ctx.fillText(char, left, y);
    left += ctx.measureText(char).width + spacing;
  });
  return left;
}

// The Brand symbol (ProductUI.jsx), its 32-unit box scaled to `size`.
function drawSymbol(ctx, { x, y, symbol: size, color, letter }) {
  const unit = size / 32;
  const at = (ux, uy) => [x + ux * unit, y + uy * unit];
  ctx.fillStyle = color;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, size, size, 10 * unit);
  else ctx.rect(x, y, size, size);
  ctx.fill();
  ctx.fillStyle = letter;
  ctx.beginPath();
  [[10, 8], [24, 8], [24, 13], [15, 13], [15, 16], [22, 16], [22, 21], [15, 21], [15, 26], [10, 26]]
    .forEach(([ux, uy], index) => ctx[index ? 'lineTo' : 'moveTo'](...at(ux, uy)));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(...at(24, 25), 3 * unit, 0, Math.PI * 2);
  ctx.fill();
}

function drawBrand(ctx, brand) {
  drawSymbol(ctx, brand);
  ctx.font = brand.font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = brand.color;
  const end = drawSpaced(ctx, brand.text, brand.x + brand.symbol * 1.3, brand.y + brand.symbol / 2, brand.spacing);
  ctx.fillStyle = brand.periodColor;
  ctx.fillText(brand.period, end, brand.y + brand.symbol / 2);
  ctx.textBaseline = 'alphabetic';
}

export function drawWinnerCard(ctx, card) {
  ctx.fillStyle = card.background;
  ctx.fillRect(0, 0, card.width, card.height);
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  drawBrand(ctx, card.brand);
  const { footer, rule } = card;
  card.lines.forEach((line) => {
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    // A right-to-left line sets from the right edge, the same pad in.
    if (textDirection(line.text) === 'rtl') {
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillText(line.text, card.width - line.x, line.y);
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(line.text, line.x, line.y);
    }
  });
  if (rule) {
    ctx.fillStyle = rule.color;
    ctx.fillRect(rule.x, rule.y, rule.width, 2);
  }
  ctx.font = footer.font;
  ctx.fillStyle = footer.color;
  ctx.fillText(footer.text, footer.x, footer.y);
}

// A PNG Blob of this bet's card as `viewerId` would share it, or null when
// the bet has no card (not settled, called off) or the browser can't draw
// one. Never throws.
export async function renderWinnerCard(bet, viewerId = null, doc = typeof document !== 'undefined' ? document : null) {
  try {
    if (!doc) return null;
    await fontsReady(doc);
    const canvas = doc.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const measure = (text, font) => {
      ctx.font = font;
      return ctx.measureText(text).width;
    };
    const card = buildWinnerCard(bet, { measure, viewerId });
    if (!card) return null;
    canvas.width = card.width;
    canvas.height = card.height;
    drawWinnerCard(ctx, card);
    return await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), 'image/png');
    });
  } catch {
    return null;
  }
}
