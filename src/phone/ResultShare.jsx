'use client';

import { useEffect, useRef, useState } from 'react';
import { FiImage, FiShare2 } from 'react-icons/fi';
import { voteUrl } from './routes';
import { shareMessage } from './share';
import { canShareImageFiles, shareImage } from './imageShare';
import { formatResultMessage } from './settlement';
import { winnerCardText } from './winnerCard';
import { renderWinnerCard } from './winnerCardImage';
import { isNativeApp } from '../platform/runtime';

// Draws the card when the page is idle, or shortly after where there is no
// requestIdleCallback (Safari). Returns the cancel.
function whenIdle(work) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work, { timeout: 1000 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = setTimeout(work, 200);
  return () => clearTimeout(id);
}

// Share the result as text, and for a settled bet with a known result, as
// the winner card image too. The card is drawn once the screen is idle, so a
// tap can usually open the share sheet straight away; a tap before that
// draws it first. In the app the image is only offered when its share sheet
// takes a PNG file: the app has no download to fall back on.
export default function ResultShare({ bet, code }) {
  const [state, setState] = useState('');
  const [busy, setBusy] = useState('');
  const [imageShareable, setImageShareable] = useState(() => !isNativeApp());
  const card = useRef(null);
  const message = formatResultMessage(bet, voteUrl(bet.code || code));
  const cardText = winnerCardText(bet);
  const cardKey = cardText ? JSON.stringify(cardText) : '';
  const drawCard = () => {
    if (!card.current) card.current = renderWinnerCard(bet).catch(() => null);
    return card.current;
  };

  useEffect(() => {
    if (isNativeApp()) setImageShareable(canShareImageFiles());
  }, []);

  useEffect(() => {
    card.current = null;
    if (!cardKey || !imageShareable) return undefined;
    return whenIdle(drawCard);
    // The card only changes when its text does.
  }, [cardKey, imageShareable]);

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
      const outcome = await shareImage(await drawCard());
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
      {cardText && imageShareable && (
        <button type="button" className="secondary press result-share-image" disabled={Boolean(busy)} onClick={shareCard}>
          <FiImage size={18} aria-hidden="true" />
          {busy === 'image' ? 'Getting it ready…' : 'Share as image'}
        </button>
      )}
      {state && <p className="share-note" role="status">{notes[state]}</p>}
      {state === 'manual' && <p className="manual-message">{message}</p>}
    </div>
  );
}
