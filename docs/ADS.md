# Ads

Infrastructure only. No screen calls `showInterstitial` yet, so no flow shows an ad.
Off by default (`NEXT_PUBLIC_ADS_ENABLED` unset).

## Release TODOs

None of these block merging the infrastructure. All of them block shipping ads.

- **TODO: real IDs.** Every ID in `src/ads/config.js` is one of Google's public test IDs.
  Create the AdMob apps and interstitial units, then swap in the real values in all three places:
  - `src/ads/config.js` (`AD_IDS`)
  - `ios/App/App/Info.plist` (`GADApplicationIdentifier`)
  - `android/app/src/main/AndroidManifest.xml` (`com.google.android.gms.ads.APPLICATION_ID`)

  `src/ads/config.test.js` asserts the IDs are test IDs and that the native files match
  config. Update that test with the real IDs in the same change.
- **TODO: ATT.** Review the `NSUserTrackingUsageDescription` text in `Info.plist` and the App
  Store privacy answers (tracking, identifiers, advertising data). Decide whether the prompt
  should come from a deliberate moment (call `initAds()` there) instead of the first ad.
- **TODO: SKAdNetwork.** Re-check `SKAdNetworkItems` in `Info.plist` against Google's current
  list (developers.google.com/admob/ios/privacy/strategies) plus any mediation partners.
- **TODO: app-ads.txt.** Publish `https://www.friendly-bets.com/app-ads.txt` with the AdMob
  publisher line, and set that domain as the developer website in both stores.
- **TODO: consent (UMP).** Required for EEA, UK and Switzerland users, and for US state privacy
  regulations. Configure the messages in AdMob, then call the plugin's consent API
  (`requestConsentInfo` / `showConsentForm`) before `initialize`, and only request ads when
  consent allows. Not wired yet.
- **TODO: Play data safety** form and the Play Console "Contains ads" declaration.
- **TODO: Pro.** `src/ads/pro.js` `isPro()` always returns `false`. Feature 4 replaces it.

## Files

| File | What it does |
| --- | --- |
| `src/ads/config.js` | Test IDs, the env flag, frequency caps and timeouts. The only place to tune ads. |
| `src/ads/adService.js` | `showInterstitial`, `initAds`, `__resetAdsForTests`. Picks a backend. |
| `src/ads/caps.js` | Frequency caps (session, day, minimum interval). |
| `src/ads/HouseAd.jsx` | The web stand-in: a neutral full-screen overlay. |
| `src/ads/pro.js` | `isPro()` stub. |

## Plugin

`@capacitor-community/admob` 8.2.1, the latest 8.x. Its only runtime peer dependency is
`@capacitor/core ^8.0.0`, which matches our Capacitor 8.5.2. It ships a `Package.swift`, so
`cap sync` adds it to `ios/App/CapApp-SPM/Package.swift` (no CocoaPods). It pulls in
Google Mobile Ads SDK 13.11.0 and UMP 3.1.x on iOS, and `play-services-ads` 25.4.x and UMP 4.0.0
on Android.

The plugin is loaded with `import()` on first use, only on a native platform, so the web build
never loads it.

## API

```js
import { showInterstitial, initAds } from '../ads/adService';

const { shown, skipped, reason } = await showInterstitial({ placement: 'after-settle' });
```

`showInterstitial({ placement })` resolves `{ shown, skipped, reason }` once the ad has been
closed, or as soon as it is skipped. It never rejects and never throws.

| reason | meaning |
| --- | --- |
| `shown` | An ad was on screen and has closed. Counted against the caps. |
| `disabled` | `NEXT_PUBLIC_ADS_ENABLED` is not `1`. |
| `pro` | `isPro()` is true. |
| `busy` | Another interstitial is already in progress. |
| `capped` | This placement hit its per-session or per-day limit. |
| `interval` | Any interstitial was shown less than `minIntervalMs` ago. |
| `timeout` | The ad was not on screen within `timeoutMs` (5 s). |
| `not-loaded` | AdMob could not load an ad (no fill, network). |
| `error` | Anything else: plugin missing, show failed, house ad could not mount. |

Callers should continue their flow on any result. Only `shown` means the person saw an ad.

`initAds()` initializes AdMob once, then on iOS checks the tracking status and asks for
permission only if it is `notDetermined`. The promise is memoized; a failed init resolves
`{ ok: false }` (it never rejects) and is retried on the next call. It does nothing on the web,
with the flag off, or for Pro. `showInterstitial` calls it, so calling it ahead of time is
optional (it moves the ATT prompt and SDK startup out of the first ad's 5 s budget).

## Backends

1. **Disabled**: flag off or Pro. Resolves immediately, touches nothing.
2. **Native** (`Capacitor.isNativePlatform()`): `initAds()`, `prepareInterstitial` with the
   platform's interstitial unit, listeners for dismissed and failed-to-show, then
   `showInterstitial`. Resolves `shown` when the ad is dismissed. If init fails, it still tries
   to load the ad (fail open); a load failure is then `not-loaded`.
3. **Web**: mounts `HouseAd` on its own React root at the end of `<body>`. Fixed position, so the
   page under it does not shift. Respects safe-area insets, a 44 pt close button, Escape closes.
   Resolves `shown` when closed.

### Timeouts

- `timeoutMs` (5000) covers everything up to the ad being on screen: plugin import, init, ATT,
  load and present. Past it the call resolves `timeout`, and a load that finishes later is
  not shown.
- Once a native ad is on screen there is no 5 s limit (people watch ads longer than that).
  `dismissTimeoutMs` (2 min) is a safety net in case the dismiss event never arrives.
- The house ad closes itself after `houseAdAutoCloseMs` (10 s) and resolves `shown`, so a flow
  never waits on a web overlay forever.

Known edge: if the timeout fires while the native `showInterstitial` call is already in flight,
the ad can still appear after the caller moved on. It is not counted.

## Frequency caps

Set in `AD_LIMITS` in `src/ads/config.js`:

- `placements.<name>.maxPerSession` / `maxPerDay`. Unknown placements use `placements.default`
  (2 per session, 4 per day). Each placement is counted on its own.
- `minIntervalMs` (3 min) applies across all placements.

Only successful shows count. Per-day counts and the last show time live in localStorage under
`fb.ads.caps.v1` (the local calendar day; a new day starts at zero). Session counts and a copy
of the last show time live in memory, so the caps still hold for the session when storage is
unavailable or throws.

## Flags

`NEXT_PUBLIC_ADS_ENABLED=1` turns ads on. Same wiring as `NEXT_PUBLIC_RESULT_TEXTS`: Next inlines
it for the web, and `mobile/vite.config.mjs` defines it for the app from the shell or repo-root
`.env*` files (the shell wins). Set it before `npm run mobile:build` / `mobile:sync`.

## Test IDs

From Google's sample ad units (they always serve test ads, safe to click):

| | iOS | Android |
| --- | --- | --- |
| App ID | `ca-app-pub-3940256099942544~1458002511` | `ca-app-pub-3940256099942544~3347511713` |
| Interstitial | `ca-app-pub-3940256099942544/4411468910` | `ca-app-pub-3940256099942544/1033173712` |
| Banner | `ca-app-pub-3940256099942544/2934735716` | `ca-app-pub-3940256099942544/6300978111` |
| Rewarded | `ca-app-pub-3940256099942544/1712485313` | `ca-app-pub-3940256099942544/5224354917` |

`prepareInterstitial` is passed `isTesting: true` whenever the unit is a test ID.

## How to test

- Unit tests: `npx jest src/ads` (mocked plugin, fake timers).
- Web: no flow calls the service yet, so add a temporary button that calls
  `showInterstitial({ placement: 'dev' })`, run `NEXT_PUBLIC_ADS_ENABLED=1 npm run dev`, and click
  it. Expect the house ad overlay; it closes on the button, Escape, or after 10 s. Remove the
  button before committing.
- App: `NEXT_PUBLIC_ADS_ENABLED=1 npm run mobile:sync`, open Xcode or Android Studio, run on a
  device or simulator with the same temporary call. Expect a Google "Test Ad" interstitial and
  the ATT prompt on first run (iOS). Reset ATT with Settings > Privacy > Tracking, or by
  deleting the app.
- Clear caps between tries: `localStorage.removeItem('fb.ads.caps.v1')` and reload.

## Native build notes

- iOS: Xcode resolves the new SPM dependencies (Google Mobile Ads, UMP) on the next open or
  build (File > Packages > Resolve Package Versions if it does not). No `pod install`.
- Android: the plugin applies its own Kotlin Gradle plugin. The first Gradle sync downloads
  `play-services-ads`.
- `Info.plist` carries `GADApplicationIdentifier`, `NSUserTrackingUsageDescription` and
  `SKAdNetworkItems`. The Android manifest carries the AdMob application ID `meta-data`.
  The Google Mobile Ads SDK crashes at launch if the app ID is missing, so keep these in sync
  with config.
