'use client';

import Link from '../platform/Link';
import { isNativeApp } from '../platform/runtime';
import { PRO_COPY, proPaywallEnabled } from './proConfig';
import { useEntitlementState } from './useEntitlement';

// The quiet way to /pro, which opens the Pro sheet on its No ads row. A muted
// text link by default, never accent green, so it doesn't compete with a
// screen's main action; `chip` is the outlined chip on the My bets header.
// Only with the paywall on, never for a Pro member, and never in the native
// app (no store purchase there yet). Keep it off bettor pages (vote and tally).
export default function GoProLink({ className = '', onClick, chip = false }) {
  const { isPro } = useEntitlementState();
  if (!(proPaywallEnabled() && !isPro && !isNativeApp())) return null;
  const base = chip ? 'go-pro-chip' : 'go-pro-link';
  return (
    <Link className={`${base} ${className}`.trim()} href="/pro" onClick={onClick}>
      {PRO_COPY.link}
    </Link>
  );
}
