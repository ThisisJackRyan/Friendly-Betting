'use client';

import { useEffect, useRef, useState } from 'react';
import { FiRotateCcw } from 'react-icons/fi';
import { useRouter } from '../platform/navigation';
import { saveBet } from './api';
import { markFreshBet } from './freshBet';
import { canRunItBack, saveRematch } from './rematch';
import ProSheet from './ProSheet';
import { ProChip, useProLocked } from './ProLock';
import { PRO_ROW } from './proConfig';
import { CREATE_ERROR_ACTION, CREATE_ERROR_COPY, createSaveError } from './createErrors';
import { refreshEntitlement } from './useEntitlement';
import CreateSaveError from './CreateSaveError';

export const RUN_IT_BACK_COPY = {
  label: 'Run it back',
  // The same busy line and errors as Create (createErrors.js).
  busy: 'Getting it ready…',
  failed: CREATE_ERROR_COPY.failed,
};

// On the creator's settled reveal: one tap makes the same bet again through
// Create's write path and opens its tally, which offers the invite like a bet
// just made in Create. A push, so back returns to the settled bet. Pro with
// the paywall on: without Pro the tap opens the Pro sheet on its row instead.
// If Pro lapsed after the lock last looked, the server refuses the rematch
// (pro-required) and Go Pro opens the same sheet.
export default function RunItBack({ bet, code, user }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
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
    setError(null);
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
      const failure = createSaveError(err);
      // The server says Pro ended: catch the local plan up, so the lock and
      // the Pro sheet agree with it.
      if (failure.action === CREATE_ERROR_ACTION.goPro) refreshEntitlement().catch(() => {});
      setError(failure);
    }
  };

  return (
    <>
      <button ref={buttonRef} type="button" className="secondary press" disabled={saving} aria-busy={saving || undefined} onClick={run}>
        <FiRotateCcw size={18} aria-hidden="true" />
        {saving ? RUN_IT_BACK_COPY.busy : RUN_IT_BACK_COPY.label}
        {locked && <ProChip />}
      </button>
      <CreateSaveError
        error={error}
        disabled={saving}
        onGoPro={() => {
          setError(null);
          setProSheet(true);
        }}
        onRetry={run}
      />
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
