'use client';

import { useEffect, useRef, useState } from 'react';
import { FiImage, FiShare2 } from 'react-icons/fi';
import { voteUrl } from './routes';
import { shareMessage } from './share';
import { shareImage } from './imageShare';
import { formatResultMessage } from './settlement';
import { winnerCardText } from './winnerCard';
import { renderWinnerCard } from './winnerCardImage';

// Share the result as text, and for a settled bet with a known result, as
// the winner card image too. The card is drawn as soon as the screen shows,
// so a tap can open the share sheet straight away.
export default function ResultShare({ bet, code }) {
  const [state, setState] = useState('');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState('');
  const card = useRef(null);
  const message = formatResultMessage(bet, voteUrl(bet.code || code));
  const cardText = winnerCardText(bet);
  const cardKey = cardText ? JSON.stringify(cardText) : '';

  useEffect(() => {
    card.current = cardKey ? renderWinnerCard(bet).catch(() => null) : null;
    setPreview('');
    // The card only changes when its text does.
  }, [cardKey]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const share = async () => {
    if (busy) return;
    setBusy('text');
    try {
      setState(await shareMessage(message));
    } catch {
      setState('manual');
    } finally {
      setBusy('');
    }
  };
  const shareCard = async () => {
    if (busy) return;
    setBusy('image');
    try {
      const blob = await (card.current || renderWinnerCard(bet));
      const outcome = await shareImage(blob);
      if (outcome === 'preview') setPreview(URL.createObjectURL(blob));
      setState(`image-${outcome}`);
    } catch {
      setState('image-failed');
    } finally {
      setBusy('');
    }
  };
  const notes = {
    shared: 'The group chat gets the final word.',
    sms: 'Your result is ready in Messages.',
    copied: 'Result copied. Drop it in the group chat.',
    aborted: 'All good. The result’s here when you’re ready.',
    manual: 'Copy this into the group chat.',
    'image-downloaded': 'Image saved. Drop it in the group chat.',
    'image-preview': 'Press and hold the card to save it.',
    'image-failed': 'Couldn’t make the image. Share the result instead.',
  };
  notes['image-shared'] = notes.shared;
  notes['image-aborted'] = notes.aborted;
  return (
    <div className="tally-share result-share">
      <button type="button" className="cta press" disabled={Boolean(busy)} onClick={share}>
        <FiShare2 size={18} aria-hidden="true" />
        {busy === 'text' ? 'Getting it ready…' : 'Share the result'}
      </button>
      {cardText && (
        <button type="button" className="secondary press result-share-image" disabled={Boolean(busy)} onClick={shareCard}>
          <FiImage size={18} aria-hidden="true" />
          {busy === 'image' ? 'Getting it ready…' : 'Share as image'}
        </button>
      )}
      {state && <p className="share-note" role="status">{notes[state]}</p>}
      {state === 'manual' && <p className="manual-message">{message}</p>}
      {state === 'image-preview' && preview && (
        <img className="result-share-preview" src={preview} alt={`${cardText?.headline || ''} ${cardText?.question || ''}`.trim()} />
      )}
    </div>
  );
}
