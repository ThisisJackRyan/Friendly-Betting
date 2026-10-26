'use client';

import { useEffect } from 'react';
import { useRouter } from '../platform/navigation';
import NotFound from './NotFound';
import ProSheet from './ProSheet';
import { PRO_COPY, PRO_ROW, proPaywallEnabled } from './proConfig';

// /pro: the Pro sheet on its own page, with the Go Pro row highlighted (the
// Go Pro links land here). Off (a 404) unless NEXT_PUBLIC_PRO_PAYWALL=1.
// Real store billing is not built yet (docs/PRO.md).
export default function Paywall() {
  const router = useRouter();
  const enabled = proPaywallEnabled();

  useEffect(() => {
    if (enabled) document.title = `${PRO_COPY.title} · Friendly`;
  }, [enabled]);

  if (!enabled) return <NotFound />;

  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/');
  };

  return (
    <div className="phone paywall-screen">
      <ProSheet highlight={PRO_ROW.noAds} onClose={close} onDone={() => router.push('/bets')} />
    </div>
  );
}
