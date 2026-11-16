'use client';

import { useEffect, useRef, useState } from 'react';
import { isNativeApp } from '../platform/runtime';
import { leaveForBilling } from './billingRedirect';
import { stripeGraceNotice } from './entitlement';
import { requestBillingPortal } from './entitlementApi';
import GoProLink from './GoProLink';
import { PRO_COPY, STRIPE_COPY, proPaywallEnabled, stripeWebProEnabled } from './proConfig';
import { useEntitlementState } from './useEntitlement';

// The muted banner at the top of My bets for a Stripe past_due grace
// (docs/STRIPE-WEB-PRO.md). Web only, and only with the paywall and Stripe
// web Pro flags on. Read from the member's own entitlement
// (stripeGraceNotice): during the grace, Update payment opens the Stripe
// customer portal (the existing /api/pro/portal); for a while after the
// grace ran out, Go Pro goes to /pro. No dismiss: it goes away on its own
// (recovery, Pro again, or STRIPE_GRACE_ENDED_NOTICE_DAYS later).
export default function StripeBillingNotice() {
  const { entitlement } = useEntitlementState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const live = useRef(true);
  useEffect(() => () => {
    live.current = false;
  }, []);

  if (!(proPaywallEnabled() && stripeWebProEnabled()) || isNativeApp()) return null;
  const notice = stripeGraceNotice(entitlement, Date.now());
  if (!notice) return null;

  const updatePayment = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const left = await requestBillingPortal().then(({ url }) => leaveForBilling(url)).catch(() => false);
    if (left || !live.current) return;
    setBusy(false);
    setError(PRO_COPY.error);
  };

  return (
    <div className="billing-notice" role="status">
      {notice === 'grace' ? (
        <p>
          {STRIPE_COPY.graceNotice}{' '}
          <button type="button" className="billing-notice-link" onClick={updatePayment} disabled={busy}>
            {STRIPE_COPY.updatePayment}
          </button>
        </p>
      ) : (
        <p>
          {STRIPE_COPY.graceEnded} <GoProLink className="billing-notice-link" />
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
