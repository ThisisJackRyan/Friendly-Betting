import { ImageResponse } from 'next/og';
import { previewBet } from '../../../src/server/betPreview';
import {
  CARD_SIZE, FALLBACK_CACHE, QUESTION_CACHE, loadAppIcon, loadCardFonts, previewCard,
} from '../../../src/server/previewCard';

export const runtime = 'nodejs';
export const alt = 'Friendly Bets';
export const size = CARD_SIZE;
export const contentType = 'image/png';

// The bet's card: the question while it is open, or its settled, called-off
// or picks-in card, from the bet's own status (a ?s= on the URL only varies
// the cache key and is ignored here). The app icon and name when there is no
// question to show (src/server/previewCard.js). Cache headers per card are
// explained at QUESTION_CACHE and FALLBACK_CACHE.
export default async function Image({ params }) {
  let preview = { question: '', status: 'open', side: '' };
  try {
    const { code } = await params;
    preview = await previewBet(code);
  } catch (err) {
    preview = { question: '', status: 'open', side: '' };
  }
  const { question, status, side } = preview;
  const [fonts, iconSrc] = await Promise.all([loadCardFonts(), question ? '' : loadAppIcon()]);
  const options = (cacheControl) => ({
    ...size,
    ...(fonts.length ? { fonts } : {}),
    headers: { 'Cache-Control': cacheControl },
  });
  try {
    return new ImageResponse(
      previewCard(question, { iconSrc, status, side }),
      options(question ? QUESTION_CACHE : FALLBACK_CACHE),
    );
  } catch (err) {
    return new ImageResponse(previewCard('', { iconSrc: await loadAppIcon() }), options(FALLBACK_CACHE));
  }
}
