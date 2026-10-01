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

const FriendlyLoader = () => (
  <div className="friendly-load" role="status" aria-label="Loading">
    <p className="friendly-load-mark">Friendly</p>
    <div className="friendly-load-bars" aria-hidden="true">
      <span className="friendly-load-bar" />
      <span className="friendly-load-bar" />
      <span className="friendly-load-bar" />
    </div>
  </div>
);

export default FriendlyLoader;
