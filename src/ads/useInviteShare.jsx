import { useCallback, useEffect, useRef, useState } from 'react';
import AdThanks from './AdThanks';
import { runInviteShare } from './inviteGate';

// How long the thank-you stays up before the share opens by itself (native,
// or a web page with no share sheet).
export const THANKS_AUTO_CONTINUE_MS = 1500;

// The tally's one invite share flow. share(open) runs open() through the ad
// gate and resolves its result, or null if the screen went away first.
// Render `thanks` once; it is null unless the thank-you is up.
export function useInviteShare({ continueLabel } = {}) {
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

  const share = useCallback((open) => runInviteShare({
    share: open,
    showThanks: (thanks) => {
      if (!mounted.current) {
        thanks.cancel();
        return;
      }
      current.current = thanks;
      setPending(thanks);
    },
  }), []);

  const onContinue = useCallback(() => {
    const thanks = current.current;
    current.current = null;
    setPending(null);
    // Synchronous, inside the tap when there was one.
    thanks?.proceed();
  }, []);

  const thanks = pending ? (
    <AdThanks
      onContinue={onContinue}
      autoContinueMs={pending.requireTap ? 0 : THANKS_AUTO_CONTINUE_MS}
      label={continueLabel}
    />
  ) : null;

  return { share, thanks };
}
