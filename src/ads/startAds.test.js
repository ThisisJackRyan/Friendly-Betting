import { startAdsOnAppActive } from './adService';
import { noteProKnown } from './pro';
import { PRO_KNOWN_WAIT_MS, startAdsWhenProKnown } from './startAds';

jest.mock('./adService', () => ({ startAdsOnAppActive: jest.fn(async () => {}) }));
jest.mock('../phone/entitlement', () => ({ isProEntitlement: () => false }));

afterEach(() => jest.useRealTimers());

test('waits for the entitlement before starting ads, so a Pro cold start never inits the SDK', async () => {
  jest.useFakeTimers();
  const done = startAdsWhenProKnown();
  await Promise.resolve();
  jest.advanceTimersByTime(PRO_KNOWN_WAIT_MS - 1);
  await Promise.resolve();
  expect(startAdsOnAppActive).not.toHaveBeenCalled();
  noteProKnown();
  await done;
  expect(startAdsOnAppActive).toHaveBeenCalledTimes(1);
});
