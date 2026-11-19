'use client';

import { useEffect, useState } from 'react';
import { hydrateBet, subscribeBet } from './api';

// Live bets/{code} for the tally and vote screens, its votes merged from the
// legacy array and the per-voter vote docs (subscribeBet). Keeps exactly one
// subscription open, and swaps it for a fresh one when the page becomes visible
// again or comes back online (iOS Safari can freeze listeners in background
// tabs). Once a bet has loaded, a later snapshot error keeps the last good bet
// on screen; `failed` is only set when nothing loaded. A missing bet the server
// confirms (deleted, or a bad code) sets `bet` to null at any time. A miss
// served from the offline cache never blanks a loaded bet. Before anything
// loads, a cache miss keeps the loader up for CACHE_MISS_GRACE_MS (a bet just
// created in a transaction is not in the local cache yet); if the server has
// not answered by then, it counts as a load failure.
export const CACHE_MISS_GRACE_MS = 1500;

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
    // Pending fallback for a first-load cache miss; cleared by any
    // authoritative snapshot, a resubscribe, or unmount.
    let graceTimer = null;
    const clearGrace = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = null;
    };

    setBet(undefined);
    setFailed(false);

    const show = (next) => {
      loaded = true;
      setFailed(false);
      setBet(next);
    };

    const subscribe = () => {
      if (unsubscribe) unsubscribe();
      clearGrace();
      const token = {};
      current = token;
      latest += 1;
      unsubscribe = subscribeBet(code, (next, err, meta) => {
        if (!active || current !== token) return;
        if (!next && !err && meta?.fromCache) {
          // Not in the local cache yet. Keep the loader up and give the
          // server a moment to answer before calling it a failure.
          if (loaded || graceTimer) return;
          graceTimer = setTimeout(() => {
            graceTimer = null;
            if (!active || current !== token || loaded) return;
            setFailed(true);
            setBet(null);
          }, CACHE_MISS_GRACE_MS);
          return;
        }
        clearGrace();
        if (err) {
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
      clearGrace();
      document.removeEventListener('visibilitychange', resubscribe);
      window.removeEventListener('online', resubscribe);
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    };
  }, [code]);

  return { bet, setBet, failed };
}
