'use client';

import { useEffect, useId, useRef } from 'react';

// Confirm before a step the creator can't take back (deleting or calling off
// a bet). "Keep it" takes focus on open; Escape and the backdrop keep the
// bet. While the action is in flight both buttons are disabled so the outcome
// always lands in this dialog. `copy` is one line of text; `body` takes any
// content (a list) instead. `confirmClassName` swaps the red confirm for
// another button style; `cancelLabel` and `cancelClassName` do the same for
// "Keep it" (Log out? uses a muted Cancel).
const ConfirmDialog = ({
  title,
  copy,
  body = null,
  confirmLabel,
  confirmClassName = 'danger',
  cancelLabel = 'Keep it',
  cancelClassName = 'dialog-keep',
  busyLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  const keepRef = useRef(null);
  const confirmRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  // Disabled buttons drop focus; hold it on the dialog until the outcome.
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!busy) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep focus inside the dialog.
    const first = confirmRef.current;
    const last = keepRef.current;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="dialog-title">{title}</h2>
        {body ? <div className="dialog-copy">{body}</div> : copy && <p className="dialog-copy">{copy}</p>}
        <div className="dialog-actions">
          <button ref={confirmRef} type="button" className={`${confirmClassName} press`} disabled={busy} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </button>
          <button ref={keepRef} type="button" className={`${cancelClassName} press`} disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default ConfirmDialog;
