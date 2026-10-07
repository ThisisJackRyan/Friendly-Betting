import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = await readFile(`${root}app/icon.svg`);
const icon = (size) => sharp(source).resize(size, size).png().toBuffer();
const canvas = (width, height, background) => sharp({ create: { width, height, channels: 4, background } });

await canvas(1024, 1024, '#007a45')
  .composite([{ input: await icon(1024) }]).flatten({ background: '#007a45' })
  .png().toFile(`${root}ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`);

const splash = await canvas(2732, 2732, '#f6f7f2')
  .composite([{ input: await icon(260), gravity: 'centre' }]).png().toBuffer();
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await writeFile(`${root}ios/App/App/Assets.xcassets/Splash.imageset/${name}`, splash);
}

const res = `${root}android/app/src/main/res`;
for (const [density, size, foreground] of [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
]) {
  const png = await icon(size);
  await writeFile(`${res}/mipmap-${density}/ic_launcher.png`, png);
  await writeFile(`${res}/mipmap-${density}/ic_launcher_round.png`, png);
  await canvas(foreground, foreground, '#007a45')
    .composite([{ input: await icon(Math.round(foreground * 0.6)), gravity: 'centre' }])
    .png().toFile(`${res}/mipmap-${density}/ic_launcher_foreground.png`);
}
for (const name of await readdir(res)) {
  if (!name.startsWith('drawable')) continue;
  const file = `${res}/${name}/splash.png`;
  let metadata;
  try { metadata = await sharp(file).metadata(); } catch { continue; }
  const { width, height } = metadata;
  await canvas(width, height, '#f6f7f2')
    .composite([{ input: await icon(Math.min(260, Math.round(Math.min(width, height) * 0.24))), gravity: 'centre' }])
    .png().toBuffer().then((data) => writeFile(file, data));
}
console.log('Generated native icons and launch screens from app/icon.svg.');
