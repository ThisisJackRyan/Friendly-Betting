import { useCallback, useEffect, useRef, useState } from 'react';
import AdThanks from './AdThanks';
import { canTrySettleAd, runSettleAd } from './settleGate';
import { THANKS_AUTO_CONTINUE_MS } from './useInviteShare';

// The tally's settle flow after the save. mayShow() is the synchronous
// precheck. run(reveal) maybe shows an ad and the thank-you, then calls
// reveal(); it never calls it once the screen has gone away. Render `thanks`
// once; it is null unless the thank-you is up. onThanksClose, if given, runs
// as the thank-you closes, right before reveal().
export function useSettleAd() {
  const [pending, setPending] = useState(null);
  const mounted = useRef(true);
  const current = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current?.cancel();
      current.current = null;
    };
  }, []);

  const run = useCallback((reveal, { onThanksClose } = {}) => {
    // Left the tally while the settle was saving: no ad, nothing to reveal.
    if (!mounted.current) return Promise.resolve(false);
    return runSettleAd({
      reveal: () => {
        if (mounted.current) reveal();
      },
      showThanks: (thanks) => {
        if (!mounted.current) {
          thanks.cancel();
          return;
        }
        current.current = { ...thanks, onThanksClose };
        setPending(thanks);
      },
    });
  }, []);

  const onContinue = useCallback(() => {
    const thanks = current.current;
    current.current = null;
    // Same tick as reveal(), so the thank-you and the held screen swap for
    // the reveal in one render.
    setPending(null);
    thanks?.onThanksClose?.();
    thanks?.proceed();
  }, []);

  // No share follows, so no tap is needed: it continues by itself on every
  // platform. No button label: there is no existing neutral one, so the whole
  // layer is the control (see AdThanks).
  const thanks = pending ? (
    <AdThanks onContinue={onContinue} autoContinueMs={THANKS_AUTO_CONTINUE_MS} />
  ) : null;

  return { mayShow: canTrySettleAd, run, thanks };
}
