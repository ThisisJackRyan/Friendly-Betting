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
// created in a transaction is not in the local cache yet). On a cold first
// load the cache miss means Firestore gave up on its first connect (one failed
// stream attempt, or no answer in 10s), so the server may still be seconds
// away. If the server has not answered by then, or the listener errors before
// anything loaded, one fresh listener is opened silently with its own grace
// period; only a second miss or error counts as a load failure.
//
// Once the server has confirmed the bet (meta.fromCache false, which
// subscribeBet's fresh read also reports), snapshots served from the cache
// never replace it: a resubscribe's first snapshot comes from the cache and
// can be older than what is on screen. The bet stays until the server answers
// again. A bet only ever loaded from the cache still shows cache data, so the
// app works offline.
export const CACHE_MISS_GRACE_MS = 4000;

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
    // The one silent retry before the first load, used up for this code.
    let retried = false;
    let gaveUp = false;
    // The server confirmed the bet (or that it is gone) for this code.
    let confirmed = false;

    setBet(undefined);
    setFailed(false);

    const show = (next) => {
      loaded = true;
      setFailed(false);
      setBet(next);
    };

    // Nothing loaded yet: retry once with a fresh listener, then fail.
    const missed = () => {
      if (retried) {
        gaveUp = true;
        setFailed(true);
        setBet(null);
        return;
      }
      retried = true;
      subscribe();
      // The fresh listener may stay silent; it still gets a deadline.
      if (!loaded && !gaveUp) startGrace(current);
    };

    function startGrace(token) {
      if (graceTimer) return;
      graceTimer = setTimeout(() => {
        graceTimer = null;
        if (!active || current !== token || loaded) return;
        missed();
      }, CACHE_MISS_GRACE_MS);
    }

    function subscribe() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      clearGrace();
      const token = {};
      current = token;
      latest += 1;
      // The last bet this listener reported. subscribeBet reports the same
      // object again when only the server confirmed it.
      let lastNext;
      const stop = subscribeBet(code, (next, err, meta) => {
        if (!active || current !== token) return;
        if (!next && !err && meta?.fromCache) {
          // Not in the local cache yet. Keep the loader up and give the
          // server a moment to answer before calling it a failure.
          if (loaded) return;
          startGrace(token);
          return;
        }
        clearGrace();
        if (err) {
          if (loaded) return;
          missed();
          return;
        }
        // Cache data never replaces what the server confirmed.
        if (meta?.fromCache && confirmed) return;
        if (meta && !meta.fromCache) confirmed = true;
        if (next === lastNext) return;
        lastNext = next;
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
      // A listener that answered synchronously may already have been
      // replaced by the retry; close it instead of keeping its handle.
      if (current === token) unsubscribe = stop;
      else stop();
    }

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
