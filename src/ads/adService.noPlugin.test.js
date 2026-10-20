import { __resetAdsForTests, initAds, showInterstitial } from './adService';

// Its own file: the module registry here has a plugin that fails to load.
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));
jest.mock('@capacitor-community/admob', () => {
  throw new Error('not installed');
});

const flag = process.env.NEXT_PUBLIC_ADS_ENABLED;

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADS_ENABLED = '1';
  __resetAdsForTests();
});

afterEach(() => {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  else process.env.NEXT_PUBLIC_ADS_ENABLED = flag;
});

test('a plugin that cannot load is skipped as error, never thrown', async () => {
  await expect(showInterstitial({ placement: 'settle' })).resolves.toEqual({ shown: false, skipped: true, reason: 'error' });
  await expect(initAds()).resolves.toEqual({ ok: false });
});
