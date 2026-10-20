import { AD_IDS, AD_LIMITS, GOOGLE_TEST_PUBLISHER, adsEnabled, placementLimits } from './config';

test("every ad ID is one of Google's public test IDs", () => {
  const ids = Object.values(AD_IDS).flatMap((platform) => Object.values(platform));
  expect(ids.length).toBeGreaterThanOrEqual(8);
  ids.forEach((id) => expect(id.startsWith(`${GOOGLE_TEST_PUBLISHER}`)).toBe(true));
  expect(GOOGLE_TEST_PUBLISHER).toBe('ca-app-pub-3940256099942544');
  expect(AD_IDS.ios.appId).toBe('ca-app-pub-3940256099942544~1458002511');
  expect(AD_IDS.android.appId).toBe('ca-app-pub-3940256099942544~3347511713');
  expect(AD_IDS.ios.interstitial).toBe('ca-app-pub-3940256099942544/4411468910');
  expect(AD_IDS.android.interstitial).toBe('ca-app-pub-3940256099942544/1033173712');
});

test('the native app IDs match the test IDs in config', () => {
  const fs = jest.requireActual('fs');
  const path = jest.requireActual('path');
  const root = path.join(__dirname, '..', '..');
  const plist = fs.readFileSync(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  expect(plist).toMatch(new RegExp(`<key>GADApplicationIdentifier</key>\\s*<string>${AD_IDS.ios.appId}</string>`));
  expect(manifest).toContain(`android:value="${AD_IDS.android.appId}"`);
});

test('ads are off unless the flag is exactly 1', () => {
  const flag = process.env.NEXT_PUBLIC_ADS_ENABLED;
  try {
    delete process.env.NEXT_PUBLIC_ADS_ENABLED;
    expect(adsEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_ADS_ENABLED = 'true';
    expect(adsEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_ADS_ENABLED = '1';
    expect(adsEnabled()).toBe(true);
  } finally {
    if (flag === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
    else process.env.NEXT_PUBLIC_ADS_ENABLED = flag;
  }
});

test('limits: 3 minutes between interstitials, 5 second timeout, a default placement', () => {
  expect(AD_LIMITS.minIntervalMs).toBe(180000);
  expect(AD_LIMITS.timeoutMs).toBe(5000);
  expect(placementLimits('anything')).toBe(AD_LIMITS.placements.default);
});
