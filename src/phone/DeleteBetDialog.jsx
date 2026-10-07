'use client';

import { useEffect, useId, useRef } from 'react';

// Confirm before deleting a bet. "Keep it" takes focus on open; Escape and the
// backdrop keep the bet. While the delete is in flight both buttons are
// disabled so the outcome always lands in this dialog.
const DeleteBetDialog = ({ busy, error, onConfirm, onCancel }) => {
  const titleId = useId();
  const keepRef = useRef(null);
  const deleteRef = useRef(null);
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
    const first = deleteRef.current;
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
        <h2 id={titleId} className="dialog-title">Delete this bet?</h2>
        <p className="dialog-copy">It’s gone for everyone, including the votes and the share link.</p>
        <div className="dialog-actions">
          <button ref={deleteRef} type="button" className="danger press" disabled={busy} onClick={onConfirm}>
            {busy ? 'Deleting…' : 'Delete bet'}
          </button>
          <button ref={keepRef} type="button" className="dialog-keep press" disabled={busy} onClick={onCancel}>
            Keep it
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

export default DeleteBetDialog;
