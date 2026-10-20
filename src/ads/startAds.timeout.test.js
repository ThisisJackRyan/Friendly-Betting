import { startAdsOnAppActive } from './adService';
import { PRO_KNOWN_WAIT_MS, startAdsWhenProKnown } from './startAds';

jest.mock('./adService', () => ({ startAdsOnAppActive: jest.fn(async () => {}) }));
jest.mock('../phone/entitlement', () => ({ isProEntitlement: () => false }));

test('a slow or offline entitlement read starts ads anyway after the wait', async () => {
  jest.useFakeTimers();
  const done = startAdsWhenProKnown();
  jest.advanceTimersByTime(PRO_KNOWN_WAIT_MS);
  await done;
  expect(startAdsOnAppActive).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
