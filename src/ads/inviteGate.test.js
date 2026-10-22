import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';
import { showHouseAd } from './HouseAd';
import { isPro } from './pro';
import { AD_LIMITS, placementLimits } from './config';
import { __resetAdsForTests, canShowInterstitial } from './adService';
import { INVITE_PLACEMENT, runInviteShare, thanksNeedsTap } from './inviteGate';

// The gate on top of the real ad service, with the plugin and house ad mocked.
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => false), getPlatform: jest.fn(() => 'web') },
}));

jest.mock('@capacitor-community/admob', () => ({
  AdMob: {
    initialize: jest.fn(),
    trackingAuthorizationStatus: jest.fn(),
    requestTrackingAuthorization: jest.fn(),
    prepareInterstitial: jest.fn(),
    showInterstitial: jest.fn(),
    addListener: jest.fn(),
  },
}));

jest.mock('./HouseAd', () => ({ showHouseAd: jest.fn() }));
jest.mock('./pro', () => ({ isPro: jest.fn(() => false) }));

const flag = process.env.NEXT_PUBLIC_ADS_ENABLED;
const flush = () => new Promise((resolve) => { jest.requireActual('timers').setImmediate(resolve); });

function onPlatform(os) {
  Capacitor.isNativePlatform.mockReturnValue(os !== 'web');
  Capacitor.getPlatform.mockReturnValue(os);
}

function setShare(value) {
  Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value });
}

function gate() {
  const share = jest.fn(() => Promise.resolve('shared'));
  const showThanks = jest.fn();
  const done = runInviteShare({ share, showThanks });
  return { share, showThanks, done };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADS_ENABLED = '1';
  jest.useRealTimers();
  __resetAdsForTests();
  localStorage.clear();
  onPlatform('web');
  setShare(undefined);
  isPro.mockReset().mockReturnValue(false);
  showHouseAd.mockReset().mockResolvedValue(undefined);
  Object.values(AdMob).forEach((fn) => fn.mockReset());
  AdMob.initialize.mockResolvedValue(undefined);
  AdMob.trackingAuthorizationStatus.mockResolvedValue({ status: 'authorized' });
  AdMob.addListener.mockResolvedValue({ remove: jest.fn() });
});

afterEach(() => {
  jest.useRealTimers();
  setShare(undefined);
  if (flag === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  else process.env.NEXT_PUBLIC_ADS_ENABLED = flag;
});

test('the invite placement has its own light caps', () => {
  expect(INVITE_PLACEMENT).toBe('invite');
  expect(placementLimits('invite')).toBe(AD_LIMITS.placements.invite);
  expect(AD_LIMITS.placements.invite.maxPerSession).toBeLessThanOrEqual(AD_LIMITS.placements.default.maxPerSession);
});

test('flag off: shares synchronously, with no ad and no thank-you', async () => {
  delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  const { share, showThanks, done } = gate();
  // Called before any await, so a tap that started it still counts.
  expect(share).toHaveBeenCalledTimes(1);
  await expect(done).resolves.toBe('shared');
  expect(showThanks).not.toHaveBeenCalled();
  expect(showHouseAd).not.toHaveBeenCalled();
});

test('Pro: never touches the plugin, shares synchronously', async () => {
  isPro.mockReturnValue(true);
  onPlatform('ios');
  expect(canShowInterstitial('invite')).toBe(false);
  const { share, showThanks, done } = gate();
  expect(share).toHaveBeenCalledTimes(1);
  await done;
  await flush();
  expect(showThanks).not.toHaveBeenCalled();
  Object.values(AdMob).forEach((fn) => expect(fn).not.toHaveBeenCalled());
});

test('a shown house ad leads to the thank-you, and the share waits for it', async () => {
  const { share, showThanks, done } = gate();
  expect(share).not.toHaveBeenCalled();
  await flush();
  expect(showHouseAd).toHaveBeenCalledTimes(1);
  expect(showThanks).toHaveBeenCalledTimes(1);
  expect(share).not.toHaveBeenCalled();
  const { proceed } = showThanks.mock.calls[0][0];
  proceed();
  proceed();
  expect(share).toHaveBeenCalledTimes(1);
  await expect(done).resolves.toBe('shared');
});

test('after one shown invite ad, the next invite is capped and shares synchronously', async () => {
  const first = gate();
  await flush();
  first.showThanks.mock.calls[0][0].proceed();
  await first.done;
  expect(canShowInterstitial('invite')).toBe(false);
  const second = gate();
  expect(second.share).toHaveBeenCalledTimes(1);
  expect(second.showThanks).not.toHaveBeenCalled();
  expect(showHouseAd).toHaveBeenCalledTimes(1);
});

test('the web thank-you always needs a tap, with or without navigator.share; native never does', async () => {
  expect(thanksNeedsTap()).toBe(true);
  setShare(jest.fn());
  expect(thanksNeedsTap()).toBe(true);
  const web = gate();
  await flush();
  expect(web.showThanks.mock.calls[0][0].requireTap).toBe(true);

  __resetAdsForTests();
  onPlatform('android');
  AdMob.prepareInterstitial.mockResolvedValue({});
  AdMob.addListener.mockImplementation(async (eventName, handler) => {
    if (eventName === 'interstitialAdDismissed') setTimeout(handler, 0);
    return { remove: jest.fn() };
  });
  AdMob.showInterstitial.mockResolvedValue(undefined);
  expect(thanksNeedsTap()).toBe(false);
  const native = gate();
  for (let i = 0; i < 50 && !native.showThanks.mock.calls.length; i += 1) await new Promise((resolve) => { setTimeout(resolve, 5); });
  expect(native.showThanks).toHaveBeenCalledTimes(1);
  expect(native.showThanks.mock.calls[0][0].requireTap).toBe(false);
});

test('timeout fails open: an ad that never loads shares after 5 s, with no thank-you', async () => {
  jest.useFakeTimers();
  onPlatform('ios');
  AdMob.prepareInterstitial.mockImplementation(() => new Promise(() => {}));
  const { share, showThanks, done } = gate();
  await jest.advanceTimersByTimeAsync(AD_LIMITS.timeoutMs - 1);
  expect(share).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  await expect(done).resolves.toBe('shared');
  expect(share).toHaveBeenCalledTimes(1);
  expect(showThanks).not.toHaveBeenCalled();
});

test.each([
  ['not-loaded', () => { onPlatform('android'); AdMob.prepareInterstitial.mockRejectedValue(new Error('no fill')); }],
  ['error', () => { showHouseAd.mockRejectedValue(new Error('mount')); }],
])('a %s skip shares directly, with no thank-you', async (_reason, arrange) => {
  arrange();
  const { share, showThanks, done } = gate();
  await expect(done).resolves.toBe('shared');
  expect(share).toHaveBeenCalledTimes(1);
  expect(showThanks).not.toHaveBeenCalled();
});

test('a thank-you that throws still shares; a cancelled one resolves null and never shares', async () => {
  const share = jest.fn(() => Promise.resolve('shared'));
  await expect(runInviteShare({ share, showThanks: () => { throw new Error('boom'); } })).resolves.toBe('shared');
  expect(share).toHaveBeenCalledTimes(1);

  __resetAdsForTests();
  const later = jest.fn(() => Promise.resolve('shared'));
  await expect(runInviteShare({ share: later, showThanks: ({ cancel }) => cancel() })).resolves.toBeNull();
  expect(later).not.toHaveBeenCalled();
});
