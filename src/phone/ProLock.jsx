'use client';

import { PRO_COPY, proPaywallEnabled } from './proConfig';
import { useEntitlementState } from './useEntitlement';

// Pro-only features (Run it back, head-to-head stats): with the paywall on
// and no Pro, the control looks as usual with a small Pro chip, and a tap
// opens the Pro sheet on that feature's row instead. With the paywall off
// they work for everyone.
export function useProLocked() {
  const { isPro } = useEntitlementState();
  return proPaywallEnabled() && !isPro;
}

export function ProChip() {
  return <span className="pro-lock-chip">{PRO_COPY.pro}</span>;
}
