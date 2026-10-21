'use client';

import { useEffect, useRef, useState } from 'react';
import { FiRotateCcw } from 'react-icons/fi';
import { useRouter } from '../platform/navigation';
import { saveBet } from './api';
import { markFreshBet } from './freshBet';
import { friendlyError } from './model';
import { canRunItBack, saveRematch } from './rematch';
import ProSheet from './ProSheet';
import { ProChip, useProLocked } from './ProLock';
import { PRO_ROW } from './proConfig';

export const RUN_IT_BACK_COPY = {
  label: 'Run it back',
  // The same busy line and fallback error as Create.
  busy: 'Getting it ready…',
  failed: 'Could not save this bet.',
};

// On the creator's settled reveal: one tap makes the same bet again through
// Create's write path and opens its tally, which offers the invite like a bet
// just made in Create. A push, so back returns to the settled bet. Pro with
// the paywall on: without Pro the tap opens the Pro sheet on its row instead.
export default function RunItBack({ bet, code, user }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proSheet, setProSheet] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  const buttonRef = useRef(null);
  const locked = useProLocked();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!canRunItBack(user, bet)) return null;

  // Once saved, the button stays busy until the new tally shows.
  const run = async () => {
    if (locked) {
      setProSheet(true);
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const id = await saveRematch(saveBet, bet, user, code);
      // Left mid-save: the bet is in My bets, and no tally opens.
      if (!mountedRef.current) return;
      markFreshBet(id);
      router.push(`/t/${encodeURIComponent(id)}`);
    } catch (err) {
      savingRef.current = false;
      if (!mountedRef.current) return;
      setSaving(false);
      setError(friendlyError(err, RUN_IT_BACK_COPY.failed));
    }
  };

  return (
    <>
      <button ref={buttonRef} type="button" className="secondary press" disabled={saving} aria-busy={saving || undefined} onClick={run}>
        <FiRotateCcw size={18} aria-hidden="true" />
        {saving ? RUN_IT_BACK_COPY.busy : RUN_IT_BACK_COPY.label}
        {locked && <ProChip />}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {proSheet && (
        <ProSheet
          highlight={PRO_ROW.runItBack}
          onClose={() => {
            setProSheet(false);
            buttonRef.current?.focus();
          }}
          onDone={() => router.push('/bets')}
        />
      )}
    </>
  );
}
