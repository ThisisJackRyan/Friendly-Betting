import { act, render, renderHook } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useSignedInUser } from './identity';
import { __resetEntitlementForTests, useEntitlement, useEntitlementState, useProBadge } from './useEntitlement';
import { isPro } from '../ads/pro';
import { __resetAdsForTests, canShowInterstitial, showInterstitial } from '../ads/adService';
import { showHouseAd } from '../ads/HouseAd';
import EntitlementSync from './EntitlementSync';

// The real entitlementApi on a fake Firestore: only onSnapshot is stubbed.
jest.unmock('./entitlementApi');
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...segments) => ({ path: segments.join('/') })),
  getDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));
jest.mock('../Config/firebase-config', () => ({ auth: null, db: {} }));
jest.mock('./identity', () => ({ useSignedInUser: jest.fn() }));
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));
jest.mock('../ads/HouseAd', () => ({ showHouseAd: jest.fn(async () => {}) }));

const creator = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
const DAY = 24 * 60 * 60 * 1000;
const flag = process.env.NEXT_PUBLIC_ADS_ENABLED;

// One live listener per path: emit(path, data) delivers a snapshot to it.
let sinks;
const stops = [];
function emit(path, data) {
  act(() => {
    sinks[path].next({ exists: () => data !== null, data: () => data });
  });
}

beforeEach(() => {
  sinks = {};
  stops.length = 0;
  onSnapshot.mockReset();
  onSnapshot.mockImplementation((ref, next, error) => {
    sinks[ref.path] = { next, error };
    const stop = jest.fn();
    stops.push(stop);
    return stop;
  });
  useSignedInUser.mockReset();
  useSignedInUser.mockReturnValue(creator);
  __resetEntitlementForTests();
  __resetAdsForTests();
  localStorage.clear();
  showHouseAd.mockClear();
  process.env.NEXT_PUBLIC_ADS_ENABLED = '1';
});

afterEach(() => {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  else process.env.NEXT_PUBLIC_ADS_ENABLED = flag;
});

test('listens to entitlements/{uid} and reports loading, then the plan', () => {
  const { result } = renderHook(() => useEntitlement());
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  expect(onSnapshot.mock.calls[0][0]).toEqual({ path: 'entitlements/jack' });
  expect(result.current).toEqual({ entitlement: null, isPro: false, loading: true });

  emit('entitlements/jack', { plan: 'pro', source: 'mock', expiresAt: Date.now() + DAY });
  expect(result.current.isPro).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(result.current.entitlement.plan).toBe('pro');

  emit('entitlements/jack', null);
  expect(result.current).toEqual({ entitlement: null, isPro: false, loading: false });
});

test('an expired Pro plan is not Pro', () => {
  const { result } = renderHook(() => useEntitlement());
  emit('entitlements/jack', { plan: 'pro', expiresAt: Date.now() - 1 });
  expect(result.current.isPro).toBe(false);
  expect(isPro()).toBe(false);
});

test('Pro fills the ad cache: showInterstitial skips with reason pro', async () => {
  renderHook(() => useEntitlement());
  expect(canShowInterstitial('invite')).toBe(true);
  emit('entitlements/jack', { plan: 'founder', founderNumber: 3, expiresAt: null });
  expect(isPro()).toBe(true);
  expect(canShowInterstitial('invite')).toBe(false);
  await expect(showInterstitial({ placement: 'invite' })).resolves.toEqual({ shown: false, skipped: true, reason: 'pro' });
  expect(showHouseAd).not.toHaveBeenCalled();

  // Plan gone (refund, expiry): ads are back.
  emit('entitlements/jack', null);
  expect(isPro()).toBe(false);
  await expect(showInterstitial({ placement: 'invite' })).resolves.toMatchObject({ shown: true, reason: 'shown' });
});

test('every caller shares one listener, which stops when the last one unmounts', () => {
  const first = render(<EntitlementSync />);
  const second = renderHook(() => useEntitlement());
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  first.unmount();
  expect(stops[0]).not.toHaveBeenCalled();
  second.unmount();
  expect(stops[0]).toHaveBeenCalledTimes(1);
});

test('a new user swaps the listener and forgets the old plan', () => {
  const { result, rerender } = renderHook(() => useEntitlement());
  emit('entitlements/jack', { plan: 'pro' });
  expect(isPro()).toBe(true);
  useSignedInUser.mockReturnValue({ uid: 'maya', isAnonymous: true, providerData: [] });
  rerender();
  expect(stops[0]).toHaveBeenCalled();
  expect(onSnapshot.mock.calls[1][0]).toEqual({ path: 'entitlements/maya' });
  expect(result.current.isPro).toBe(false);
  expect(isPro()).toBe(false);
});

test('a device-only user has no entitlement and starts no listener', () => {
  useSignedInUser.mockReturnValue({ uid: 'local-1', isLocal: true });
  const { result } = renderHook(() => useEntitlement());
  expect(onSnapshot).not.toHaveBeenCalled();
  expect(result.current).toEqual({ entitlement: null, isPro: false, loading: true });
});

test('a failed read keeps the plan already known', () => {
  const { result } = renderHook(() => useEntitlement());
  emit('entitlements/jack', { plan: 'pro' });
  act(() => sinks['entitlements/jack'].error(new Error('offline')));
  expect(result.current.isPro).toBe(true);
});

test('the badge is only for the signed-in user it was loaded for', () => {
  renderHook(() => useEntitlement());
  emit('entitlements/jack', { plan: 'founder', founderNumber: 9 });
  expect(renderHook(() => useProBadge('jack')).result.current).toEqual({ kind: 'founder', number: 9 });
  expect(renderHook(() => useProBadge('maya')).result.current).toBeNull();
  expect(renderHook(() => useProBadge(undefined)).result.current).toBeNull();
  expect(renderHook(() => useEntitlementState()).result.current.isPro).toBe(true);
});
