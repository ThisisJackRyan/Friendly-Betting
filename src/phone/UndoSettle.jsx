'use client';

import { useEffect, useState } from 'react';
import { undoRemainingMs } from './undoSettle';

// The creator's Undo under a fresh reveal, with a seconds countdown. Gone
// once the window runs out (undoSettle.js); the rules hold the same line.
export default function UndoSettle({ bet, localAt, busy, error, onUndo }) {
  const [now, setNow] = useState(() => Date.now());
  const left = undoRemainingMs(bet, { now, localAt });

  useEffect(() => {
    if (left <= 0) return undefined;
    // Tick on the next whole second left, so the count and the hide line up.
    const id = setTimeout(() => setNow(Date.now()), left % 1000 || 1000);
    return () => clearTimeout(id);
  }, [now, left > 0, bet?.settledAt, localAt]);

  if (left <= 0 && !error) return null;
  return (
    <div className="undo-settle">
      {left > 0 && (
        <p className="undo-settle-row">
          <button type="button" className="text-link press" disabled={busy} onClick={onUndo}>
            {busy ? 'Undoing…' : 'Undo'}
          </button>
          <span className="undo-settle-count" aria-hidden="true">{Math.ceil(left / 1000)}s</span>
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
