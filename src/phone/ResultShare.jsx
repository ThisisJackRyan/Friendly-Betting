'use client';

import { useState } from 'react';
import { FiShare2 } from 'react-icons/fi';
import { voteUrl } from './routes';
import { shareMessage } from './share';
import { formatResultMessage } from './settlement';

export default function ResultShare({ bet, code }) {
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const message = formatResultMessage(bet, voteUrl(bet.code || code));
  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setState(await shareMessage(message));
    } catch {
      setState('manual');
    } finally {
      setBusy(false);
    }
  };
  const notes = {
    shared: 'The group chat gets the final word.',
    sms: 'Your result is ready in Messages.',
    copied: 'Result copied. Drop it in the group chat.',
    aborted: 'All good. The result’s here when you’re ready.',
    manual: 'Copy this into the group chat.',
  };
  return (
    <div className="tally-share result-share">
      <button type="button" className="cta press" disabled={busy} onClick={share}>
        <FiShare2 size={18} aria-hidden="true" />
        {busy ? 'Getting it ready…' : 'Share the result'}
      </button>
      {state && <p className="share-note" role="status">{notes[state]}</p>}
      {state === 'manual' && <p className="manual-message">{message}</p>}
    </div>
  );
}
