import { isNativeApp } from '../platform/runtime';
import { canShowInterstitial, showInterstitial } from './adService';

// Every invite share on the tally goes through here: maybe an interstitial,
// then the thank-you if one was shown, then the share. Ads never block the
// invite: any skip, failure or throw goes straight to the share.
export const INVITE_PLACEMENT = 'invite';

// On the web, navigator.share needs a fresh user tap, and waiting on an ad
// spends the one that started it. The fallbacks need one too: desktop browsers
// reject clipboard.writeText without it. So after an ad on any web page, the
// thank-you waits for a tap and the share runs inside that tap. The app's
// native sheet has no such rule.
export function thanksNeedsTap() {
  try {
    return !isNativeApp();
  } catch {
    // Treat as the web.
    return true;
  }
}

function canTryAd() {
  try {
    return canShowInterstitial(INVITE_PLACEMENT);
  } catch {
    return false;
  }
}

// share() opens the share and resolves its result. It runs synchronously when
// no ad can be tried (flag off, Pro, capped, too soon, busy), so a tap that
// started this still counts as a user gesture.
// showThanks({ requireTap, proceed, cancel }) puts up the thank-you; it calls
// proceed() to share (from inside a click when requireTap) or cancel() when
// the screen went away. Resolves the share's result, or null if cancelled.
export function runInviteShare({ share, showThanks }) {
  if (!canTryAd()) return Promise.resolve(share());
  return (async () => {
    let outcome = null;
    try {
      outcome = await showInterstitial({ placement: INVITE_PLACEMENT });
    } catch {
      outcome = null;
    }
    if (!outcome || outcome.shown !== true) return share();
    return new Promise((resolve) => {
      let settled = false;
      const proceed = () => {
        if (settled) return;
        settled = true;
        resolve(share());
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        resolve(null);
      };
      try {
        showThanks({ requireTap: thanksNeedsTap(), proceed, cancel });
      } catch {
        proceed();
      }
    });
  })();
}
