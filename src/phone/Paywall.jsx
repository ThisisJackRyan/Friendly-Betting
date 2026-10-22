'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '../platform/navigation';
import { isNativeApp } from '../platform/runtime';
import NotFound from './NotFound';
import ProSheet from './ProSheet';
import { PRO_COPY, PRO_ROW, proPaywallEnabled, stripeWebProEnabled } from './proConfig';

// Stripe Checkout sends the member back to /pro?checkout=success or
// ?checkout=cancel (docs/STRIPE-WEB-PRO.md). Reads it once and takes it off
// the URL, so a reload doesn't wait for a plan again. Web, flag on only.
function useCheckoutReturn(enabled) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!enabled || !stripeWebProEnabled() || isNativeApp()) return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get('checkout');
    if (!result) return;
    if (result === 'success') setConfirming(true);
    url.searchParams.delete('checkout');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [enabled]);
  return confirming;
}

// /pro: the Pro sheet on its own page, with the Go Pro row highlighted (the
// Go Pro links land here). Off (a 404) unless NEXT_PUBLIC_PRO_PAYWALL=1.
// Store billing is not built yet (docs/PRO.md); web billing with Stripe is
// behind NEXT_PUBLIC_STRIPE_WEB_PRO (docs/STRIPE-WEB-PRO.md).
export default function Paywall() {
  const router = useRouter();
  const enabled = proPaywallEnabled();
  const confirming = useCheckoutReturn(enabled);

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
      <ProSheet highlight={PRO_ROW.noAds} onClose={close} onDone={() => router.push('/bets')} confirming={confirming} />
    </div>
  );
}
