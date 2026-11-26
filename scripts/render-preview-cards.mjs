// Renders the /b/{code} link preview cards to PNG for a visual check.
//   node scripts/render-preview-cards.mjs <outDir> ["question"]
// Writes <outDir>/question.png and fallback.png (the open and no-question
// cards), open.png (the open card again, to compare with the closed ones),
// settled-short.png, settled-long.png (a side long enough to be cut with an
// ellipsis), called-off.png and picks-in.png. Needs no secrets.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ImageResponse } from 'next/og.js';
import { CARD_SIZE, loadAppIcon, loadCardFonts, previewCard } from '../src/server/previewCard.js';

const outDir = resolve(process.argv[2] || 'preview-cards');
const question = process.argv[3] || 'Will Sam actually finish the marathon before the end of next spring?';
const longSide = 'Sam finishes strong, crosses the line before noon, and somehow still has the legs to dance at the after party';

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
await render('open.png', previewCard(question));
await render('settled-short.png', previewCard(question, { status: 'settled', side: 'Yes' }));
await render('settled-long.png', previewCard(question, { status: 'settled', side: longSide }));
await render('called-off.png', previewCard(question, { status: 'calledOff' }));
await render('picks-in.png', previewCard(question, { status: 'closed' }));
