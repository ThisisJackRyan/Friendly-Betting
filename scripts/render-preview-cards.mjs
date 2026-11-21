// Renders the /b/{code} link preview cards to PNG for a visual check.
//   node scripts/render-preview-cards.mjs <outDir> ["question"]
// Writes <outDir>/question.png and <outDir>/fallback.png. Needs no secrets.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ImageResponse } from 'next/og.js';
import { CARD_SIZE, loadAppIcon, loadCardFonts, previewCard } from '../src/server/previewCard.js';

const outDir = resolve(process.argv[2] || 'preview-cards');
const question = process.argv[3] || 'Will Sam actually finish the marathon before the end of next spring?';

const fonts = await loadCardFonts();
const iconSrc = await loadAppIcon();
const options = { ...CARD_SIZE, ...(fonts.length ? { fonts } : {}) };

async function render(name, element) {
  const png = Buffer.from(await new ImageResponse(element, options).arrayBuffer());
  const file = join(outDir, name);
  await writeFile(file, png);
  console.log(`Wrote ${file}`);
}

await mkdir(outDir, { recursive: true });
await render('question.png', previewCard(question));
await render('fallback.png', previewCard('', { iconSrc }));
