import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';
import { showHouseAd } from './HouseAd';
import { isPro } from './pro';
import { AD_LIMITS, placementLimits } from './config';
import { __resetAdsForTests, canShowInterstitial, showInterstitial } from './adService';
import { capReason, recordShow } from './caps';
import { SETTLE_PLACEMENT, canTrySettleAd, runSettleAd } from './settleGate';
import { INVITE_PLACEMENT } from './inviteGate';

// The settle gate on top of the real ad service, with the plugin and house ad mocked.
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

function gate() {
  const reveal = jest.fn();
  const showThanks = jest.fn();
  const done = runSettleAd({ reveal, showThanks });
  return { reveal, showThanks, done };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADS_ENABLED = '1';
  jest.useRealTimers();
  __resetAdsForTests();
  localStorage.clear();
  onPlatform('web');
  isPro.mockReset().mockReturnValue(false);
  showHouseAd.mockReset().mockResolvedValue(undefined);
  Object.values(AdMob).forEach((fn) => fn.mockReset());
  AdMob.initialize.mockResolvedValue(undefined);
  AdMob.trackingAuthorizationStatus.mockResolvedValue({ status: 'authorized' });
  AdMob.addListener.mockResolvedValue({ remove: jest.fn() });
});

afterEach(() => {
  jest.useRealTimers();
  if (flag === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  else process.env.NEXT_PUBLIC_ADS_ENABLED = flag;
});

test('the settle placement has its own caps: 1 per session, 3 per day', () => {
  expect(SETTLE_PLACEMENT).toBe('settle');
  expect(placementLimits('settle')).toBe(AD_LIMITS.placements.settle);
  expect(AD_LIMITS.placements.settle).toEqual({ maxPerSession: 1, maxPerDay: 3 });
});

test('the settle cap is counted apart from the invite cap; the interval is shared', () => {
  const start = new Date(2026, 9, 20, 9).getTime();
  recordShow(INVITE_PLACEMENT, start);
  const later = start + AD_LIMITS.minIntervalMs;
  expect(capReason(INVITE_PLACEMENT, later)).toBe('capped');
  expect(capReason(SETTLE_PLACEMENT, later)).toBe('');
  // Within the global minimum interval of any ad, settle waits too.
  expect(capReason(SETTLE_PLACEMENT, start + 1)).toBe('interval');

  __resetAdsForTests();
  recordShow(SETTLE_PLACEMENT, start);
  expect(capReason(SETTLE_PLACEMENT, later)).toBe('capped');
  expect(capReason(INVITE_PLACEMENT, later)).toBe('');
});

test('after a shown invite ad the settle ad can still show (past the interval), and vice versa', async () => {
  let clock = new Date(2026, 9, 20, 9).getTime();
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  try {
    await expect(showInterstitial({ placement: INVITE_PLACEMENT })).resolves.toMatchObject({ shown: true });
    clock += AD_LIMITS.minIntervalMs;
    expect(canShowInterstitial(INVITE_PLACEMENT)).toBe(false);
    expect(canTrySettleAd()).toBe(true);
    const { reveal, showThanks, done } = gate();
    await flush();
    showThanks.mock.calls[0][0].proceed();
    await expect(done).resolves.toBe(true);
    expect(reveal).toHaveBeenCalledTimes(1);
    clock += AD_LIMITS.minIntervalMs;
    expect(canTrySettleAd()).toBe(false);
  } finally {
    Date.now.mockRestore();
  }
});

test('flag off: reveals synchronously, with no ad and no thank-you', async () => {
  delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  const { reveal, showThanks, done } = gate();
  expect(reveal).toHaveBeenCalledTimes(1);
  await expect(done).resolves.toBe(true);
  expect(showThanks).not.toHaveBeenCalled();
  expect(showHouseAd).not.toHaveBeenCalled();
});

test('Pro: never touches the plugin, reveals synchronously', async () => {
  isPro.mockReturnValue(true);
  onPlatform('ios');
  expect(canTrySettleAd()).toBe(false);
  const { reveal, showThanks, done } = gate();
  expect(reveal).toHaveBeenCalledTimes(1);
  await done;
  await flush();
  expect(showThanks).not.toHaveBeenCalled();
  Object.values(AdMob).forEach((fn) => expect(fn).not.toHaveBeenCalled());
});

test('a shown ad leads to the thank-you, and the reveal waits for it', async () => {
  const { reveal, showThanks, done } = gate();
  expect(reveal).not.toHaveBeenCalled();
  await flush();
  expect(showHouseAd).toHaveBeenCalledTimes(1);
  expect(showThanks).toHaveBeenCalledTimes(1);
  expect(reveal).not.toHaveBeenCalled();
  const { proceed } = showThanks.mock.calls[0][0];
  proceed();
  proceed();
  expect(reveal).toHaveBeenCalledTimes(1);
  await expect(done).resolves.toBe(true);
  // One settle ad a session.
  expect(canTrySettleAd()).toBe(false);
});

test('timeout fails open: an ad that never loads reveals after 5 s, with no thank-you', async () => {
  jest.useFakeTimers();
  onPlatform('ios');
  AdMob.prepareInterstitial.mockImplementation(() => new Promise(() => {}));
  const { reveal, showThanks, done } = gate();
  await jest.advanceTimersByTimeAsync(AD_LIMITS.timeoutMs - 1);
  expect(reveal).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  await expect(done).resolves.toBe(true);
  expect(reveal).toHaveBeenCalledTimes(1);
  expect(showThanks).not.toHaveBeenCalled();
});

test.each([
  ['not-loaded', () => { onPlatform('android'); AdMob.prepareInterstitial.mockRejectedValue(new Error('no fill')); }],
  ['error', () => { showHouseAd.mockRejectedValue(new Error('mount')); }],
])('a %s skip reveals directly, with no thank-you', async (_reason, arrange) => {
  arrange();
  const { reveal, showThanks, done } = gate();
  await expect(done).resolves.toBe(true);
  expect(reveal).toHaveBeenCalledTimes(1);
  expect(showThanks).not.toHaveBeenCalled();
});

test('a thank-you that throws still reveals; a cancelled one never does', async () => {
  const reveal = jest.fn();
  await expect(runSettleAd({ reveal, showThanks: () => { throw new Error('boom'); } })).resolves.toBe(true);
  expect(reveal).toHaveBeenCalledTimes(1);

  __resetAdsForTests();
  const later = jest.fn();
  await expect(runSettleAd({ reveal: later, showThanks: ({ cancel }) => cancel() })).resolves.toBe(false);
  expect(later).not.toHaveBeenCalled();
});
