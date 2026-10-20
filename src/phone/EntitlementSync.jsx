'use client';

import { useEntitlement } from './useEntitlement';

// Mounted once at the app root (app/layout.js, mobile/App.jsx) so the
// signed-in user's Pro status, and with it the ad service's isPro(), is
// known on every screen.
export default function EntitlementSync() {
  useEntitlement();
  return null;
}
