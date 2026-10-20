// The one place ad IDs and ad limits live. Every ID below is one of Google's
// public sample IDs, which always serve test ads. See docs/ADS.md before
// release: the real app IDs and ad unit IDs replace these (and the native
// app IDs in Info.plist and AndroidManifest.xml).
export const GOOGLE_TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

export const AD_IDS = {
  ios: {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    banner: 'ca-app-pub-3940256099942544/2934735716',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
  android: {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    banner: 'ca-app-pub-3940256099942544/6300978111',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
};

// Off unless the build sets NEXT_PUBLIC_ADS_ENABLED=1. The mobile vite build
// defines the same variable (mobile/vite.config.mjs), so one flag covers both.
export function adsEnabled() {
  return process.env.NEXT_PUBLIC_ADS_ENABLED === '1';
}

export const AD_LIMITS = {
  // Any placement not listed here uses `default`.
  placements: {
    default: { maxPerSession: 2, maxPerDay: 4 },
    // Before the tally's invite share. Light: inviting the crew is the core flow.
    invite: { maxPerSession: 1, maxPerDay: 3 },
  },
  // Across all placements: no interstitial within this long of the last one.
  minIntervalMs: 3 * 60 * 1000,
  // Longest wait for an ad to get on screen (init, load and present).
  timeoutMs: 5000,
  // Once a native ad is up, stop waiting for its dismiss event after this.
  dismissTimeoutMs: 2 * 60 * 1000,
  // The web house ad closes itself after this, so a flow never hangs on it.
  houseAdAutoCloseMs: 10000,
};

export function placementLimits(placement) {
  return AD_LIMITS.placements[placement] || AD_LIMITS.placements.default;
}
