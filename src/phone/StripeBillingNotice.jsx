'use client';

import { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { isNativeApp } from '../platform/runtime';
import { leaveForBilling } from './billingRedirect';
import { stripeGraceNotice, toMillis } from './entitlement';
import { requestBillingPortal, requestDismissGraceEndedNotice, requestGraceEndedNotice } from './entitlementApi';
import GoProLink from './GoProLink';
import { PRO_COPY, STRIPE_COPY, proPaywallEnabled, stripeWebProEnabled } from './proConfig';
import { useEntitlementState } from './useEntitlement';

// Whether this account dismissed the ended banner of one grace, keyed by
// `${uid}:${stripePastDueAt}`: true, false, or missing until the server
// answers. The server (stripeNoticeDismissals/{uid}, via
// /api/pro/billing-notice) is the record; this only saves asking again on
// every visit to My bets in one session.
const dismissals = new Map();

export function __resetBillingNoticeForTests() {
  dismissals.clear();
}

// For the ended banner only: whether it was dismissed (true / false), or
// undefined while the server is asked. A failed read shows the banner.
function useEndedDismissed(key) {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!key || dismissals.has(key)) return undefined;
    let live = true;
    requestGraceEndedNotice()
      .then(({ dismissed }) => Boolean(dismissed), () => false)
      .then((dismissed) => {
        if (!dismissals.has(key)) dismissals.set(key, dismissed);
        if (live) rerender((n) => n + 1);
      });
    return () => {
      live = false;
    };
  }, [key]);
  const dismiss = () => {
    dismissals.set(key, true);
    rerender((n) => n + 1);
    // Hidden at once. A failed save shows it again on the next load.
    requestDismissGraceEndedNotice().catch(() => {});
  };
  return [key ? dismissals.get(key) : undefined, dismiss];
}

// The muted banner at the top of My bets for a Stripe past_due grace
// (docs/STRIPE-WEB-PRO.md). Web only, and only with the paywall and Stripe
// web Pro flags on. Read from the member's own entitlement
// (stripeGraceNotice): during the grace, Update payment opens the Stripe
// customer portal (the existing /api/pro/portal); for a while after the
// grace ran out, Go Pro goes to /pro. The grace banner has no dismiss: it goes
// away on recovery or when Pro ends. The ended banner goes away when the
// member is Pro again, STRIPE_GRACE_ENDED_NOTICE_DAYS later, or for good on
// that account once they dismiss it (the X, saved on the server).
export default function StripeBillingNotice() {
  const { uid, entitlement } = useEntitlementState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const live = useRef(true);
  useEffect(() => () => {
    live.current = false;
  }, []);

  const shown = (proPaywallEnabled() && stripeWebProEnabled()) && !isNativeApp();
  const notice = shown ? stripeGraceNotice(entitlement, Date.now()) : null;
  const endedKey = notice === 'ended' && uid ? `${uid}:${toMillis(entitlement?.stripePastDueAt)}` : '';
  const [dismissed, dismiss] = useEndedDismissed(endedKey);

  if (!notice) return null;
  // The ended banner waits for the server, so a dismissed one never flashes.
  if (notice === 'ended' && dismissed !== false) return null;

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
    <div className={`billing-notice${notice === 'ended' ? ' billing-notice-dismissable' : ''}`} role="status">
      {notice === 'grace' ? (
        <p>
          {STRIPE_COPY.graceNotice}{' '}
          <button type="button" className="billing-notice-link" onClick={updatePayment} disabled={busy}>
            {STRIPE_COPY.updatePayment}
          </button>
        </p>
      ) : (
        <>
          <p>
            {STRIPE_COPY.graceEnded} <GoProLink className="billing-notice-link" />
          </p>
          <button type="button" className="billing-notice-dismiss" aria-label="Dismiss" onClick={dismiss}>
            <FiX aria-hidden="true" focusable="false" />
          </button>
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
