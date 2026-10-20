import { canShowInterstitial, showInterstitial } from './adService';

// The interstitial after Settle & notify: the settle has already saved (and
// asked for the result texts) before this runs. Maybe an interstitial, then
// the thank-you if one was shown, then the reveal. Ads never block the
// reveal: any skip, failure or throw goes straight to it.
export const SETTLE_PLACEMENT = 'settle';

// Synchronous: false means no ad will be tried (flag off, Pro, capped, too
// soon, busy), so the screen can reveal exactly as it did before ads.
export function canTrySettleAd() {
  try {
    return canShowInterstitial(SETTLE_PLACEMENT);
  } catch {
    return false;
  }
}

// reveal() shows the settled result. It runs synchronously when no ad can be
// tried. showThanks({ proceed, cancel }) puts up the thank-you; it calls
// proceed() to reveal or cancel() when the screen went away. Resolves true
// once revealed, false if cancelled. Never rejects.
export function runSettleAd({ reveal, showThanks }) {
  const proceedNow = () => {
    reveal();
    return true;
  };
  if (!canTrySettleAd()) return Promise.resolve(proceedNow());
  return (async () => {
    let outcome = null;
    try {
      outcome = await showInterstitial({ placement: SETTLE_PLACEMENT });
    } catch {
      outcome = null;
    }
    if (!outcome || outcome.shown !== true) return proceedNow();
    return new Promise((resolve) => {
      let settled = false;
      const proceed = () => {
        if (settled) return;
        settled = true;
        reveal();
        resolve(true);
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        resolve(false);
      };
      try {
        showThanks({ proceed, cancel });
      } catch {
        proceed();
      }
    });
  })();
}
