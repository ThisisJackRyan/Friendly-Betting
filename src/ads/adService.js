import { Capacitor } from '@capacitor/core';
import { AD_IDS, AD_LIMITS, GOOGLE_TEST_PUBLISHER, adsEnabled } from './config';
import { capReason, recordShow, resetCaps } from './caps';
import { isPro } from './pro';

// One entry point for interstitials, three backends:
//   native  AdMob through @capacitor-community/admob (iOS and Android app)
//   web     a house ad overlay (src/ads/HouseAd.jsx)
//   none    flag off or a Pro member
// showInterstitial never throws and never waits more than AD_LIMITS.timeoutMs
// for an ad to get on screen. Ads are a bonus: every failure skips the ad.

const TIMEOUT = Symbol('timeout');

let initPromise = null;
let busy = false;

const result = (shown, reason) => ({ shown, skipped: !shown, reason });

function platform() {
  try {
    return Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  } catch {
    return 'web';
  }
}

function proMember() {
  try {
    return Boolean(isPro());
  } catch {
    return false;
  }
}

// Loaded on first use so the web bundle never pulls in the plugin up front.
async function loadAdMob() {
  const { AdMob } = await import('@capacitor-community/admob');
  return AdMob;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Initializes AdMob once, then asks for tracking permission once on iOS.
// Never rejects: a failed init resolves { ok: false } and the next call retries.
export function initAds() {
  const os = platform();
  if (os === 'web' || !adsEnabled() || proMember()) return Promise.resolve({ ok: false });
  if (!initPromise) {
    initPromise = (async () => {
      const AdMob = await loadAdMob();
      await AdMob.initialize();
      if (os === 'ios') {
        try {
          const { status } = await AdMob.trackingAuthorizationStatus();
          if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
        } catch {
          // No answer means non-personalized ads, which is fine.
        }
      }
      return { ok: true };
    })().catch(() => {
      initPromise = null;
      return { ok: false };
    });
  }
  return initPromise;
}

async function listen(AdMob, eventName, handler) {
  try {
    return await AdMob.addListener(eventName, handler);
  } catch {
    return null;
  }
}

async function showNative(os, placement, state) {
  const adId = AD_IDS[os]?.interstitial;
  if (!adId) return result(false, 'error');
  const AdMob = await loadAdMob();
  // Init failing is not fatal: try the ad anyway, and skip it if that fails.
  await initAds();
  if (state.cancelled) return result(false, 'timeout');
  try {
    await AdMob.prepareInterstitial({ adId, isTesting: adId.startsWith(GOOGLE_TEST_PUBLISHER) });
  } catch {
    return result(false, 'not-loaded');
  }
  if (state.cancelled) return result(false, 'timeout');

  let settle;
  const closed = new Promise((resolve) => { settle = resolve; });
  const handles = await Promise.all([
    listen(AdMob, 'interstitialAdDismissed', () => settle('shown')),
    listen(AdMob, 'interstitialAdFailedToShow', () => settle('error')),
  ]);
  const cleanup = () => handles.forEach((handle) => {
    try {
      const removed = handle?.remove();
      if (removed && typeof removed.catch === 'function') removed.catch(() => {});
    } catch {
      // Already gone.
    }
  });
  try {
    await AdMob.showInterstitial();
  } catch {
    cleanup();
    return result(false, 'error');
  }
  // On screen. Wait for the person to close it, within reason.
  return {
    onScreen: true,
    closed: withTimeout(closed, AD_LIMITS.dismissTimeoutMs)
      .then((outcome) => result(outcome !== 'error', outcome === 'error' ? 'error' : 'shown'))
      .finally(cleanup),
  };
}

async function showWeb(state) {
  const { showHouseAd } = await import('./HouseAd');
  if (state.cancelled) return result(false, 'timeout');
  return {
    onScreen: true,
    closed: showHouseAd({ autoCloseMs: AD_LIMITS.houseAdAutoCloseMs })
      .then(() => result(true, 'shown'), () => result(false, 'error')),
  };
}

async function present(placement) {
  const os = platform();
  const state = { cancelled: false };
  const attempt = os === 'web' ? showWeb(state) : showNative(os, placement, state);
  const first = await withTimeout(attempt.catch(() => result(false, 'error')), AD_LIMITS.timeoutMs);
  if (first === TIMEOUT) {
    state.cancelled = true;
    return result(false, 'timeout');
  }
  if (!first.onScreen) return first;
  return first.closed.catch(() => result(false, 'error'));
}

// The checks showInterstitial makes before it starts, in the same order.
// '' when an ad may be tried now. Synchronous, so a caller can decide inside
// a click handler and keep the browser's user activation.
function skipReason(placement) {
  if (!adsEnabled()) return 'disabled';
  if (proMember()) return 'pro';
  if (busy) return 'busy';
  return capReason(placement);
}

// Synchronous precheck: false means showInterstitial would skip right away
// (disabled, pro, busy, capped, interval). True does not promise an ad: the
// load can still time out or fail. Never throws.
export function canShowInterstitial(placement) {
  try {
    return !skipReason(String(placement || 'default'));
  } catch {
    return false;
  }
}

// Shows one interstitial for `placement` if the flag, Pro status and caps
// allow it. Resolves { shown, skipped, reason } once the ad is closed or skipped.
export async function showInterstitial(options) {
  try {
    const placement = String(options?.placement || 'default');
    const skip = skipReason(placement);
    if (skip) return result(false, skip);
    busy = true;
    try {
      const outcome = await present(placement);
      if (outcome.shown) recordShow(placement);
      return outcome;
    } finally {
      busy = false;
    }
  } catch {
    return result(false, 'error');
  }
}

// Tests only: forget init, the in-flight guard and every cap.
export function __resetAdsForTests() {
  initPromise = null;
  busy = false;
  resetCaps();
}
