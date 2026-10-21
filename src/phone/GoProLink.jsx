'use client';

import Link from '../platform/Link';
import { PRO_COPY, proPaywallEnabled } from './proConfig';
import { useEntitlementState } from './useEntitlement';

// The quiet way to /pro: a muted text link, never a button and never accent
// green, so it doesn't compete with a screen's main action. Only with the
// paywall on, and never for a Pro member. Keep it off bettor pages (vote and
// tally).
export default function GoProLink({ className = '', onClick }) {
  const { isPro } = useEntitlementState();
  if (!proPaywallEnabled() || isPro) return null;
  return (
    <Link className={`go-pro-link ${className}`.trim()} href="/pro" onClick={onClick}>
      {PRO_COPY.link}
    </Link>
  );
}
