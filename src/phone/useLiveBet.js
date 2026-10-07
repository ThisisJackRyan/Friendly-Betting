'use client';

import { useEffect, useState } from 'react';
import { hydrateBet, subscribeBet } from './api';

// Live bets/{code} for the tally and vote screens. Keeps exactly one snapshot
// listener open, and swaps it for a fresh one when the page becomes visible
// again or comes back online (iOS Safari can freeze listeners in background
// tabs). Once a bet has loaded, a later snapshot error keeps the last good bet
// on screen; `failed` is only set when nothing loaded. A missing bet the server
// confirms (deleted, or a bad code) sets `bet` to null at any time. A miss
// served from the offline cache never blanks a loaded bet; before anything
// loads it counts as a load failure until the server answers.
export function useLiveBet(code) {
  const [bet, setBet] = useState(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let loaded = false;
    let unsubscribe = null;
    let current = null;
    // Bumped on every bet snapshot and every resubscribe, so a slow
    // hydrateBet can't overwrite a newer snapshot or land after unmount.
    let latest = 0;

    setBet(undefined);
    setFailed(false);

    const show = (next) => {
      loaded = true;
      setFailed(false);
      setBet(next);
    };

    const subscribe = () => {
      if (unsubscribe) unsubscribe();
      const token = {};
      current = token;
      latest += 1;
      unsubscribe = subscribeBet(code, (next, err, meta) => {
        if (!active || current !== token) return;
        if (err || (!next && meta?.fromCache)) {
          if (loaded) return;
          setFailed(true);
          setBet(null);
          return;
        }
        if (!next) {
          // Gone on the server: an authoritative answer, like a loaded bet.
          // Drop any pending hydrate of the old bet.
          latest += 1;
          loaded = true;
          setFailed(false);
          setBet(null);
          return;
        }
        const seq = ++latest;
        if (next.schemaVersion === 2 && Array.isArray(next.options)) {
          show(next);
          return;
        }
        hydrateBet(next)
          .then((full) => {
            if (active && seq === latest) show(full);
          })
          .catch(() => {
            if (active && seq === latest) show(next);
          });
      });
    };

    const resubscribe = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      subscribe();
    };

    subscribe();
    document.addEventListener('visibilitychange', resubscribe);
    window.addEventListener('online', resubscribe);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', resubscribe);
      window.removeEventListener('online', resubscribe);
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    };
  }, [code]);

  return { bet, setBet, failed };
}
