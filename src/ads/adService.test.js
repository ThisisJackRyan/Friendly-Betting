import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';
import { showHouseAd } from './HouseAd';
import { isPro } from './pro';
import { AD_LIMITS, placementLimits } from './config';
import { App } from '@capacitor/app';
import { __resetAdsForTests, canShowInterstitial, initAds, showInterstitial, startAdsOnAppActive } from './adService';

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => false), getPlatform: jest.fn(() => 'web') },
}));

jest.mock('@capacitor-community/admob', () => {
  const listeners = {};
  return {
    AdMob: {
      listeners,
      initialize: jest.fn(),
      trackingAuthorizationStatus: jest.fn(),
      requestTrackingAuthorization: jest.fn(),
      prepareInterstitial: jest.fn(),
      showInterstitial: jest.fn(),
      addListener: jest.fn(),
    },
  };
});

jest.mock('@capacitor/app', () => {
  const listeners = {};
  return {
    App: {
      listeners,
      addListener: jest.fn(async (eventName, handler) => {
        listeners[eventName] = handler;
        return { remove: jest.fn() };
      }),
      getState: jest.fn(async () => ({ isActive: true })),
    },
  };
});

jest.mock('./HouseAd', () => ({ showHouseAd: jest.fn() }));
jest.mock('./pro', () => ({ isPro: jest.fn(() => false) }));

const flag = process.env.NEXT_PUBLIC_ADS_ENABLED;
const shown = { shown: true, skipped: false, reason: 'shown' };
const skipped = (reason) => ({ shown: false, skipped: true, reason });
// Moves the clock Date.now() sees past the minimum interval.
let clock;
const nextSlot = () => { clock += AD_LIMITS.minIntervalMs; };
const flush = () => new Promise((resolve) => { jest.requireActual('timers').setImmediate(resolve); });

function onPlatform(os) {
  Capacitor.isNativePlatform.mockReturnValue(os !== 'web');
  Capacitor.getPlatform.mockReturnValue(os);
}

// A native ad that the person closes as soon as it is up.
function nativeAdCloses() {
  AdMob.showInterstitial.mockImplementation(async () => {
    setTimeout(() => AdMob.listeners.interstitialAdDismissed?.(), 0);
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADS_ENABLED = '1';
  jest.useRealTimers();
  clock = new Date(2026, 9, 20, 9).getTime();
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  __resetAdsForTests();
  localStorage.clear();
  onPlatform('web');
  isPro.mockReset().mockReturnValue(false);
  showHouseAd.mockReset().mockResolvedValue(undefined);
  Object.keys(AdMob.listeners).forEach((key) => delete AdMob.listeners[key]);
  AdMob.initialize.mockReset().mockResolvedValue(undefined);
  AdMob.trackingAuthorizationStatus.mockReset().mockResolvedValue({ status: 'notDetermined' });
  AdMob.requestTrackingAuthorization.mockReset().mockResolvedValue(undefined);
  AdMob.prepareInterstitial.mockReset().mockResolvedValue({ adUnitId: 'x' });
  AdMob.showInterstitial.mockReset();
  AdMob.addListener.mockReset().mockImplementation(async (eventName, handler) => {
    AdMob.listeners[eventName] = handler;
    return { remove: jest.fn(async () => { delete AdMob.listeners[eventName]; }) };
  });
  nativeAdCloses();
  Object.keys(App.listeners).forEach((key) => delete App.listeners[key]);
  App.addListener.mockClear();
  App.getState.mockReset().mockResolvedValue({ isActive: true });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (flag === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  else process.env.NEXT_PUBLIC_ADS_ENABLED = flag;
});

describe('gates', () => {
  test('flag off skips without touching any backend', async () => {
    delete process.env.NEXT_PUBLIC_ADS_ENABLED;
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('disabled'));
    process.env.NEXT_PUBLIC_ADS_ENABLED = '0';
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('disabled'));
    expect(showHouseAd).not.toHaveBeenCalled();
    expect(AdMob.prepareInterstitial).not.toHaveBeenCalled();
  });

  test('Pro members never see an ad, on web or native', async () => {
    isPro.mockReturnValue(true);
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('pro'));
    onPlatform('ios');
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('pro'));
    await expect(initAds()).resolves.toEqual({ ok: false });
    expect(showHouseAd).not.toHaveBeenCalled();
    expect(AdMob.initialize).not.toHaveBeenCalled();
  });

  test('a throwing Pro check counts as not Pro', async () => {
    isPro.mockImplementation(() => { throw new Error('boom'); });
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
  });
});

describe('web fallback', () => {
  test('shows the house ad and resolves once it closes', async () => {
    let close;
    showHouseAd.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
    let done = false;
    const pending = showInterstitial({ placement: 'settle' }).then((value) => { done = true; return value; });
    await flush();
    expect(showHouseAd).toHaveBeenCalledWith({ autoCloseMs: AD_LIMITS.houseAdAutoCloseMs });
    expect(done).toBe(false);
    close();
    await expect(pending).resolves.toEqual(shown);
    expect(AdMob.prepareInterstitial).not.toHaveBeenCalled();
  });

  test('a house ad that fails to mount is skipped, not thrown', async () => {
    showHouseAd.mockRejectedValue(new Error('no DOM'));
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('error'));
  });
});

describe('native AdMob', () => {
  test.each(['ios', 'android'])('%s loads the test unit, shows it, and resolves on dismiss', async (os) => {
    onPlatform(os);
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
    const adId = os === 'ios' ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-3940256099942544/1033173712';
    expect(AdMob.prepareInterstitial).toHaveBeenCalledWith({ adId, isTesting: true });
    expect(AdMob.showInterstitial).toHaveBeenCalledTimes(1);
    expect(showHouseAd).not.toHaveBeenCalled();
    // Listeners are removed once the ad is closed.
    expect(AdMob.listeners).toEqual({});
  });

  test('init and the iOS tracking prompt run once across many ads', async () => {
    onPlatform('ios');
    await initAds();
    await showInterstitial({ placement: 'a' });
    nextSlot();
    await showInterstitial({ placement: 'b' });
    await initAds();
    expect(AdMob.initialize).toHaveBeenCalledTimes(1);
    expect(AdMob.trackingAuthorizationStatus).toHaveBeenCalledTimes(1);
    expect(AdMob.requestTrackingAuthorization).toHaveBeenCalledTimes(1);
    expect(AdMob.prepareInterstitial).toHaveBeenCalledTimes(2);
  });

  test('the tracking prompt is skipped once answered, and never asked on Android', async () => {
    onPlatform('ios');
    AdMob.trackingAuthorizationStatus.mockResolvedValue({ status: 'denied' });
    await initAds();
    expect(AdMob.requestTrackingAuthorization).not.toHaveBeenCalled();
    __resetAdsForTests();
    onPlatform('android');
    await initAds();
    expect(AdMob.trackingAuthorizationStatus).toHaveBeenCalledTimes(1);
    expect(AdMob.requestTrackingAuthorization).not.toHaveBeenCalled();
  });

  test('init failure fails open: the ad is still tried, and init retries next time', async () => {
    onPlatform('android');
    AdMob.initialize.mockRejectedValueOnce(new Error('init failed'));
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
    expect(AdMob.prepareInterstitial).toHaveBeenCalledTimes(1);
    await expect(initAds()).resolves.toEqual({ ok: true });
    expect(AdMob.initialize).toHaveBeenCalledTimes(2);
  });

  test('a failed ATT check does not fail init', async () => {
    onPlatform('ios');
    AdMob.trackingAuthorizationStatus.mockRejectedValue(new Error('nope'));
    await expect(initAds()).resolves.toEqual({ ok: true });
  });

  test('an ad that fails to load is skipped as not-loaded', async () => {
    onPlatform('ios');
    AdMob.prepareInterstitial.mockRejectedValue(new Error('No fill'));
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('not-loaded'));
    expect(AdMob.showInterstitial).not.toHaveBeenCalled();
  });

  test('a plugin that throws on show is skipped as error and not counted', async () => {
    onPlatform('ios');
    AdMob.showInterstitial.mockRejectedValue(new Error("Ad wasn't ready"));
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('error'));
    expect(AdMob.listeners).toEqual({});
    nativeAdCloses();
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
  });

  test('a synchronous throw from the plugin is still caught', async () => {
    onPlatform('android');
    AdMob.prepareInterstitial.mockImplementation(() => { throw new TypeError('bridge gone'); });
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('not-loaded'));
    AdMob.addListener.mockImplementation(() => { throw new Error('no listeners'); });
    AdMob.prepareInterstitial.mockResolvedValue({});
    AdMob.showInterstitial.mockResolvedValue(undefined);
    jest.useFakeTimers();
    const pending = showInterstitial({ placement: 'settle' });
    // No dismiss event can arrive, so the safety cap ends the wait.
    await jest.advanceTimersByTimeAsync(AD_LIMITS.dismissTimeoutMs);
    await expect(pending).resolves.toEqual(shown);
  });

  test('a failed-to-show event after presenting is skipped as error', async () => {
    onPlatform('android');
    AdMob.showInterstitial.mockImplementation(async () => {
      setTimeout(() => AdMob.listeners.interstitialAdFailedToShow?.({ code: 1 }), 0);
    });
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('error'));
  });
});

describe('timeout', () => {
  test('an ad that never loads resolves as timeout after the configured wait', async () => {
    onPlatform('ios');
    jest.useFakeTimers();
    AdMob.prepareInterstitial.mockImplementation(() => new Promise(() => {}));
    let settled = null;
    showInterstitial({ placement: 'settle' }).then((value) => { settled = value; });
    await jest.advanceTimersByTimeAsync(AD_LIMITS.timeoutMs - 1);
    expect(settled).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toEqual(skipped('timeout'));
  });

  test('a hung init also times out, and a late load never shows the ad', async () => {
    onPlatform('android');
    jest.useFakeTimers();
    let finishInit;
    AdMob.initialize.mockImplementation(() => new Promise((resolve) => { finishInit = resolve; }));
    const pending = showInterstitial({ placement: 'settle' });
    await jest.advanceTimersByTimeAsync(AD_LIMITS.timeoutMs);
    await expect(pending).resolves.toEqual(skipped('timeout'));
    finishInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(AdMob.showInterstitial).not.toHaveBeenCalled();
  });
});

describe('frequency caps', () => {
  test('per placement session cap, counting only successful shows', async () => {
    const { maxPerSession } = placementLimits('settle');
    showHouseAd.mockRejectedValueOnce(new Error('failed'));
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('error'));
    for (let i = 0; i < maxPerSession; i += 1) {
      nextSlot();
      await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
    }
    nextSlot();
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('capped'));
    // Another placement has its own count.
    await expect(showInterstitial({ placement: 'other' })).resolves.toEqual(shown);
  });

  test('per placement daily cap persists in localStorage and resets the next day', () => {
    const { maxPerDay } = placementLimits('settle');
    const day = new Date(2026, 9, 20, 9).getTime();
    jest.isolateModules(() => {
      const caps = require('./caps');
      for (let i = 0; i < maxPerDay; i += 1) {
        caps.recordShow('settle', day + i * AD_LIMITS.minIntervalMs);
      }
    });
    expect(JSON.parse(localStorage.getItem('fb.ads.caps.v1')).counts).toEqual({ settle: maxPerDay });
    jest.isolateModules(() => {
      // A fresh module is a fresh session: only the stored day count remains.
      const later = require('./caps');
      expect(later.capReason('settle', day + 10 * AD_LIMITS.minIntervalMs)).toBe('capped');
      // Another placement is only held back once the day's total hits the global cap.
      expect(later.capReason('other', day + 10 * AD_LIMITS.minIntervalMs))
        .toBe(maxPerDay >= AD_LIMITS.maxPerDay ? 'capped' : '');
      expect(later.capReason('settle', new Date(2026, 9, 21, 9).getTime())).toBe('');
    });
  });

  test('a global daily cap across all placements, on top of each placement cap', () => {
    const day = new Date(2026, 9, 20, 9).getTime();
    expect(AD_LIMITS.maxPerDay).toBe(4);
    jest.isolateModules(() => {
      const caps = require('./caps');
      ['a', 'b', 'c'].forEach((placement, i) => caps.recordShow(placement, day + i * AD_LIMITS.minIntervalMs));
    });
    jest.isolateModules(() => {
      const caps = require('./caps');
      const at = day + 10 * AD_LIMITS.minIntervalMs;
      expect(caps.capReason('d', at)).toBe('');
      caps.recordShow('d', at);
      // Each of e and f is far under its own cap, but the day's total is 4.
      expect(caps.capReason('e', at + AD_LIMITS.minIntervalMs)).toBe('capped');
      expect(caps.capReason('e', new Date(2026, 9, 21, 9).getTime())).toBe('');
    });
  });

  test('a resume after 30 min in the background starts a new session; a short one does not', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    const start = new Date(2026, 9, 20, 9).getTime();
    jest.isolateModules(() => {
      const caps = require('./caps');
      const { maxPerSession } = placementLimits('settle');
      let at = start;
      for (let i = 0; i < maxPerSession; i += 1) {
        caps.recordShow('settle', at);
        at += AD_LIMITS.minIntervalMs;
      }
      expect(caps.capReason('settle', at)).toBe('capped');
      caps.notePause(at);
      caps.noteResume(at + AD_LIMITS.sessionGapMs - 1);
      expect(caps.capReason('settle', at + AD_LIMITS.sessionGapMs)).toBe('capped');
      caps.notePause(at);
      caps.noteResume(at + AD_LIMITS.sessionGapMs);
      expect(caps.capReason('settle', at + AD_LIMITS.sessionGapMs)).toBe('');
      // A resume with no pause seen is not a gap.
      caps.recordShow('settle', at + AD_LIMITS.sessionGapMs);
      caps.recordShow('settle', at + AD_LIMITS.sessionGapMs + AD_LIMITS.minIntervalMs);
      caps.noteResume(at + 2 * AD_LIMITS.sessionGapMs);
      expect(caps.capReason('settle', at + 2 * AD_LIMITS.sessionGapMs)).toBe('capped');
    });
  });

  test('a new calendar day starts a new session, with no pause at all', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    jest.isolateModules(() => {
      const caps = require('./caps');
      const late = new Date(2026, 9, 20, 23, 50).getTime();
      for (let i = 0; i < placementLimits('settle').maxPerSession; i += 1) {
        caps.recordShow('settle', late + i * 1000);
      }
      expect(caps.capReason('settle', late + AD_LIMITS.minIntervalMs)).toBe('capped');
      const nextDay = new Date(2026, 9, 21, 0, 10).getTime();
      expect(caps.capReason('settle', nextDay)).toBe('');
    });
  });

  test('a global minimum interval between interstitials', async () => {
    await expect(showInterstitial({ placement: 'a' })).resolves.toEqual(shown);
    clock += AD_LIMITS.minIntervalMs - 1;
    await expect(showInterstitial({ placement: 'b' })).resolves.toEqual(skipped('interval'));
    clock += 1;
    await expect(showInterstitial({ placement: 'b' })).resolves.toEqual(shown);
  });

  test('broken or missing storage never throws, and caps still hold for the session', async () => {
    localStorage.setItem('fb.ads.caps.v1', '{not json');
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
    __resetAdsForTests();
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('interval'));
    for (let i = 1; i < placementLimits('settle').maxPerSession; i += 1) {
      nextSlot();
      await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
    }
    nextSlot();
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(skipped('capped'));
    expect(() => __resetAdsForTests()).not.toThrow();
  });

  test('one interstitial at a time', async () => {
    let close;
    showHouseAd.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
    const first = showInterstitial({ placement: 'a' });
    await flush();
    await expect(showInterstitial({ placement: 'b' })).resolves.toEqual(skipped('busy'));
    close();
    await expect(first).resolves.toEqual(shown);
  });
});

test('never throws, even when called with nothing or when a cap check blows up', async () => {
  await expect(showInterstitial()).resolves.toEqual(shown);
  nextSlot();
  await expect(showInterstitial(undefined)).resolves.toEqual(shown);
  nextSlot();
  // Same default placement, now at its session cap.
  await expect(showInterstitial(null)).resolves.toEqual(skipped('capped'));
});

describe('canShowInterstitial, the synchronous precheck', () => {
  test('agrees with showInterstitial on every skip it can see up front', async () => {
    expect(canShowInterstitial('invite')).toBe(true);
    delete process.env.NEXT_PUBLIC_ADS_ENABLED;
    expect(canShowInterstitial('invite')).toBe(false);
    process.env.NEXT_PUBLIC_ADS_ENABLED = '1';

    isPro.mockReturnValue(true);
    expect(canShowInterstitial('invite')).toBe(false);
    isPro.mockReturnValue(false);

    let close;
    showHouseAd.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
    const first = showInterstitial({ placement: 'invite' });
    await flush();
    // Busy while an ad is up.
    expect(canShowInterstitial('other')).toBe(false);
    close();
    await expect(first).resolves.toEqual(shown);
    // Too soon after the last ad, then the invite's own session cap.
    expect(canShowInterstitial('other')).toBe(false);
    nextSlot();
    expect(canShowInterstitial('other')).toBe(true);
    expect(canShowInterstitial('invite')).toBe(placementLimits('invite').maxPerSession > 1);
  });

  test('returns a boolean synchronously and never throws', () => {
    isPro.mockImplementation(() => { throw new Error('boom'); });
    expect(canShowInterstitial()).toBe(true);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(typeof canShowInterstitial('invite')).toBe('boolean');
  });
});

describe('startAdsOnAppActive, at native app start', () => {
  test('inits once the app is active, so the first ad is not waiting on the tracking prompt', async () => {
    onPlatform('ios');
    let answer;
    AdMob.requestTrackingAuthorization.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await startAdsOnAppActive();
    await flush();
    expect(AdMob.initialize).toHaveBeenCalledTimes(1);
    expect(AdMob.requestTrackingAuthorization).toHaveBeenCalledTimes(1);
    answer();
    await flush();
    await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
    expect(AdMob.initialize).toHaveBeenCalledTimes(1);
    // Once per launch.
    await startAdsOnAppActive();
    expect(App.getState).toHaveBeenCalledTimes(1);
  });

  test('not active yet: waits for the app to become active', async () => {
    onPlatform('ios');
    App.getState.mockResolvedValue({ isActive: false });
    await startAdsOnAppActive();
    await flush();
    expect(AdMob.initialize).not.toHaveBeenCalled();
    App.listeners.appStateChange({ isActive: false });
    await flush();
    expect(AdMob.initialize).not.toHaveBeenCalled();
    App.listeners.appStateChange({ isActive: true });
    await flush();
    expect(AdMob.initialize).toHaveBeenCalledTimes(1);
  });

  test('pause and resume reach the session caps', async () => {
    onPlatform('android');
    await startAdsOnAppActive();
    const { maxPerSession } = placementLimits('settle');
    for (let i = 0; i < maxPerSession; i += 1) {
      nextSlot();
      await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual(shown);
    }
    localStorage.clear();
    nextSlot();
    expect(canShowInterstitial('settle')).toBe(false);
    App.listeners.pause();
    clock += AD_LIMITS.sessionGapMs;
    App.listeners.resume();
    expect(canShowInterstitial('settle')).toBe(true);
  });

  test.each([
    ['web', () => onPlatform('web')],
    ['flag off', () => { onPlatform('ios'); delete process.env.NEXT_PUBLIC_ADS_ENABLED; }],
    ['Pro', () => { onPlatform('ios'); isPro.mockReturnValue(true); }],
  ])('%s: never loads the ad SDK', async (_case, arrange) => {
    arrange();
    await startAdsOnAppActive();
    await flush();
    App.listeners.appStateChange?.({ isActive: true });
    await flush();
    Object.values(AdMob).forEach((fn) => {
      if (typeof fn === 'function') expect(fn).not.toHaveBeenCalled();
    });
  });

  test('never rejects when the App plugin fails', async () => {
    onPlatform('ios');
    App.getState.mockRejectedValue(new Error('no plugin'));
    await expect(startAdsOnAppActive()).resolves.toBeUndefined();
  });
});
