import { ImageResponse } from 'next/og';
import { previewQuestion } from '../../../src/server/betPreview';

export const runtime = 'nodejs';
export const alt = 'Pick your side on Friendly Bets';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Matches the winner card (src/phone/winnerCard.js CARD_COLORS).
const COLORS = { background: '#007a45', ink: '#ffffff', soft: '#deecd5', accent: '#a6c9a9' };

function questionSize(text) {
  if (text.length > 140) return 44;
  if (text.length > 80) return 54;
  return 68;
}

function card(question) {
  const headline = question || 'Pick your side.';
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: 80, background: COLORS.background, color: COLORS.ink, fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, letterSpacing: -2 }}>
        friendly<span style={{ color: COLORS.accent }}>.</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: COLORS.soft, marginBottom: 24 }}>
          {question ? 'New bet' : 'Friendly Bets'}
        </div>
        <div style={{ display: 'flex', fontSize: questionSize(headline), fontWeight: 800, lineHeight: 1.15 }}>
          {headline.length > 200 ? `${headline.slice(0, 197)}...` : headline}
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, color: COLORS.soft }}>
        friendly-bets.com
      </div>
    </div>
  );
}

export default async function Image({ params }) {
  let question = '';
  try {
    const { code } = await params;
    question = await previewQuestion(code);
  } catch (err) {
    question = '';
  }
  try {
    return new ImageResponse(card(question), size);
  } catch (err) {
    return new ImageResponse(card(''), size);
  }
}
