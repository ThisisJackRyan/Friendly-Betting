'use client';

import { useEffect, useState } from 'react';

export const FRIENDLY_LOAD_MS = 450;

export function useMinHold(resetKey) {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    setElapsed(false);
    const id = window.setTimeout(() => setElapsed(true), FRIENDLY_LOAD_MS);
    return () => window.clearTimeout(id);
  }, [resetKey]);

  return elapsed;
}

// A neutral page skeleton: a heading block and a few content bars in grey.
// No wordmark, no brand colour, no visible text.
const FriendlyLoader = () => (
  <div className="friendly-load" role="status" aria-label="Loading">
    <div className="friendly-load-bars" aria-hidden="true">
      <span className="friendly-load-title" />
      <span className="friendly-load-bar" />
      <span className="friendly-load-bar" />
      <span className="friendly-load-bar" />
      <span className="friendly-load-card" />
    </div>
  </div>
);

export default FriendlyLoader;
