import { ImageResponse } from 'next/og';
import { previewQuestion } from '../../../src/server/betPreview';
import { CARD_SIZE, loadAppIcon, loadCardFonts, previewCard } from '../../../src/server/previewCard';

export const runtime = 'nodejs';
export const alt = 'Friendly Bets';
export const size = CARD_SIZE;
export const contentType = 'image/png';

// The bet's question on a plain card, or the app icon and name when there is
// no question to show (src/server/previewCard.js).
export default async function Image({ params }) {
  let question = '';
  try {
    const { code } = await params;
    question = await previewQuestion(code);
  } catch (err) {
    question = '';
  }
  const [fonts, iconSrc] = await Promise.all([loadCardFonts(), question ? '' : loadAppIcon()]);
  const options = { ...size, ...(fonts.length ? { fonts } : {}) };
  try {
    return new ImageResponse(previewCard(question, { iconSrc }), options);
  } catch (err) {
    return new ImageResponse(previewCard('', { iconSrc: await loadAppIcon() }), options);
  }
}
