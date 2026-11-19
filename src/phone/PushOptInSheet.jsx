'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalBackground } from '../platform/modalBackground';
import { acceptPushOptIn, declinePushOptIn } from './pushOptIn';
import { PUSH_COPY } from './pushCopy';

// The soft ask after the creator's first send (docs/PUSH.md). The tally only
// mounts it when shouldOfferPushOptIn said yes, so it never shows with push
// off, on the web, or on a vote link. "Turn on notifications" is the only
// thing that asks the OS. "Not now", Escape and the scrim are a soft decline:
// no OS prompt, and not again this session. Either way onDone runs once, and
// the tally's share sheet follows.
export default function PushOptInSheet({ onDone }) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef(null);
  const turnOnRef = useRef(null);
  const laterRef = useRef(null);
  const live = useRef(true);
  const finished = useRef(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    live.current = true;
    setMounted(true);
    return () => {
      live.current = false;
    };
  }, []);

  useModalBackground(dialogRef, mounted);

  useEffect(() => {
    if (mounted) dialogRef.current?.focus();
  }, [mounted]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone?.();
  };

  const notNow = () => {
    if (busy || finished.current) return;
    declinePushOptIn();
    finish();
  };

  // Never throws: whatever the OS says (or if it fails), the sheet goes.
  const turnOn = async () => {
    if (busy || finished.current) return;
    setBusy(true);
    try {
      await acceptPushOptIn();
    } catch {
      // Fail soft: nothing saved, nothing stuck.
    }
    if (live.current) setBusy(false);
    finish();
  };

  useEffect(() => {
    if (!mounted) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        notNow();
        return;
      }
      if (event.key !== 'Tab') return;
      // Keep focus inside the sheet.
      const first = turnOnRef.current;
      const last = laterRef.current;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!mounted) return null;

  return createPortal(
    <div className="push-sheet-layer">
      <div className="push-sheet-scrim" aria-hidden="true" onClick={notNow} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="push-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId} className="push-sheet-title">{PUSH_COPY.sheetTitle}</h2>
        <p id={bodyId} className="push-sheet-body">{PUSH_COPY.sheetBody}</p>
        <div className="push-sheet-actions">
          <button
            ref={turnOnRef}
            type="button"
            className="cta press push-sheet-main"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={turnOn}
          >
            {PUSH_COPY.turnOn}
          </button>
          <button ref={laterRef} type="button" className="push-sheet-later" disabled={busy} onClick={notNow}>
            {PUSH_COPY.notNow}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
