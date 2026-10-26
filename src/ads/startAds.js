import { startAdsOnAppActive } from './adService';
import { whenProKnown } from './pro';

// How long app start waits for the entitlement before starting ads anyway.
export const PRO_KNOWN_WAIT_MS = 5000;

// Native app start (mobile/main.jsx). On a cold start isPro() is false until
// the entitlement listener hears back, so starting ads right away would init
// the SDK (and ask for tracking on iOS) for a Pro member. Waits for it first;
// a slow or offline read falls back after PRO_KNOWN_WAIT_MS, and
// showInterstitial still checks isPro() before every ad. Never rejects.
export async function startAdsWhenProKnown(waitMs = PRO_KNOWN_WAIT_MS) {
  try {
    await whenProKnown(waitMs);
  } catch {
    // Start anyway.
  }
  return startAdsOnAppActive();
}
