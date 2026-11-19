# Ads

Two placements are wired: `invite`, before the invite share on the tally (see
[Invite interstitial](#invite-interstitial)), and `settle`, after Settle & notify and before the
reveal (see [Settle interstitial](#settle-interstitial)). Off by default (`NEXT_PUBLIC_ADS_ENABLED` unset),
and with the flag off every flow behaves exactly as it did before ads.

## Release TODOs

None of these block merging the infrastructure. All of them block shipping ads.

- **TODO: real IDs.** Every ID in `src/ads/config.js` is one of Google's public test IDs.
  Create the AdMob apps and interstitial units, then swap in the real values in all three places:
  - `src/ads/config.js` (`AD_IDS`)
  - `ios/App/App/Info.plist` (`GADApplicationIdentifier`)
  - `android/app/src/main/AndroidManifest.xml` (`com.google.android.gms.ads.APPLICATION_ID`)

  `src/ads/config.test.js` asserts the IDs are test IDs and that the native files match
  config. Update that test with the real IDs in the same change.
- **Done: ATT copy (UX).** `NSUserTrackingUsageDescription` in `Info.plist` is final and
  UX-approved: "This lets us show you ads that are more relevant to you." Apple shows it in the
  system tracking prompt, and `src/ads/config.test.js` asserts the exact sentence. The prompt
  order is wired: UMP first, then ATT only if the status is still `notDetermined` (see
  [Consent and ATT](#consent-and-att)). There is no pre-prompt screen.
- **Done: SKAdNetwork.** `SKAdNetworkItems` in `Info.plist` matches Google's list (50 IDs: Google
  plus its published third-party buyers), fetched 2026-11-16 from
  <https://developers.google.com/admob/ios/3p-skadnetworks> (page "Last updated: January 30, 2026"),
  which <https://developers.google.com/admob/ios/privacy/strategies> links to. That refresh added
  `97r2b46745`, `c3frkrj4fj`, `f38h382jlk`, `kbmxgpxpgc`, `klf5c3l5u5`, `wg4vff78zm` and dropped
  `pwa73g5rt2` (no longer on Google's list). No mediation partners are configured, so nothing else
  is listed. Re-check the page before each release; `src/ads/config.test.js` checks the count and
  the format, so update it with the list.
- **TODO: app-ads.txt.** The route is live; it needs Jack's publisher ID and the store listings.
  See [app-ads.txt](#app-adstxt) for the steps.
- **Done in code: consent (UMP).** `initAds()` asks UMP before anything else and only initializes
  AdMob and requests ads when `canRequestAds` is true (see [Consent and ATT](#consent-and-att)).
  The messages themselves are configured in AdMob, below.
- **Pro is wired.** `src/ads/pro.js` `isPro()` reads a cache that `src/phone/useEntitlement.js`
  fills from the signed-in user's `entitlements/{uid}` doc, so a Pro member (legacy founder plans
  included) gets reason `pro` and never sees an ad. Billing itself is still a TODO: see [docs/PRO.md](PRO.md).

### What Jack must do himself

None of this can be done from the repo.

1. **AdMob apps and units.** Create the iOS and Android apps and one interstitial unit each in
   AdMob, then swap the test IDs in `src/ads/config.js`, `Info.plist` and `AndroidManifest.xml`
   and update `src/ads/config.test.js` in the same change (see real IDs above).
2. **Consent messages in AdMob** (Privacy & messaging): create and publish the GDPR message
   (EEA, UK, Switzerland) and, if wanted, the US state regulations message for both apps.
   Optionally an IDFA explainer message for iOS: with it published, UMP shows the explainer and
   the ATT prompt itself, and the app's own ATT call sees the status already answered and stays
   quiet. **Until these messages exist and are published, the consent form may not appear**
   (`isConsentFormAvailable` is false); `canRequestAds` then follows Google's default for the
   user's region.
3. **App Store privacy labels** (App Store Connect > App Privacy): declare tracking, identifiers
   (device ID / IDFA), advertising data and the other data the Google Mobile Ads SDK collects
   (Google lists it for the SDK), and answer "Yes" to tracking if ATT can be granted.
4. **Google Play**: the Data safety form (advertising ID, the ads SDK's data) and the "Contains
   ads" declaration in the Play Console (App content).
5. **app-ads.txt** (see [app-ads.txt](#app-adstxt)): set the publisher ID and store listings.

## app-ads.txt

`GET /app-ads.txt` is served by `app/app-ads.txt/route.js` (body built in
`src/server/appAdsTxt.js`): status 200, `Content-Type: text/plain; charset=utf-8`, no auth, no
redirect, never the SPA or `not-found`. It reads the env on every request.

**Until a publisher ID is set** the body is:

```
# Friendly Bets has no authorized ad sellers yet.
placeholder.example.com, placeholder, DIRECT, placeholder
```

That is valid and authorizes nobody. The second line is the reserved placeholder record from the
IAB ads.txt v1.1 spec (section 3.2.1), which app-ads.txt follows: a file with no sellers should
carry it so crawlers can tell it from an error page (a comment-only or empty file is the
deprecated form). It is not a seller and has no publisher ID.

**Once a publisher ID is set** the body is exactly one line:

```
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

`f08c47fec0942fa0` is Google's certification authority ID, the same for every AdMob account.

The ID is read from these env vars, first valid one wins:

1. `ADMOB_PUBLISHER_ID` (server only; preferred)
2. `NEXT_PUBLIC_ADMOB_PUBLISHER_ID`

A value counts only if it is `pub-` plus 16 digits (surrounding spaces are trimmed, and the
`ca-app-pub-...` form the AdMob console shows is accepted). Anything else (empty, a typo, an app ID
with `~`, an ad unit ID with `/`, Google's test publisher `pub-3940256099942544`) is ignored, and
if neither var holds a valid ID the placeholder body is served. The route never invents an ID.

### Steps for Jack

1. In AdMob, open **Apps > View all apps > app-ads.txt > How to set up app-ads.txt** (or
   **Settings > Account information**) and copy the **Publisher ID** (`pub-` plus 16 digits).
   Only the `pub-...` part goes in the env var, not the whole snippet.
2. In Vercel, **Settings > Environment Variables**, add `ADMOB_PUBLISHER_ID` = that ID for
   **Production**. Redeploy production (env changes only apply to a new deployment).
3. Set the developer website to `https://www.friendly-bets.com` (the same host that serves
   `/app-ads.txt`) in both listings:
   - App Store Connect: the **Marketing URL** field of the app's App Store listing.
   - Play Console: **Store settings > Store listing contact details > Website**.
4. Verify after the deploy:

   ```sh
   curl -sI https://www.friendly-bets.com/app-ads.txt   # 200, content-type: text/plain; charset=utf-8
   curl -s  https://www.friendly-bets.com/app-ads.txt   # the google.com line (or the placeholder before step 2)
   curl -sIL https://friendly-bets.com/app-ads.txt      # apex: a redirect to www, then the same 200
   ```

   AdMob can take a day or more to crawl it (**Apps > View all apps > app-ads.txt** tab).

### The apex redirect

Crawlers drop the `www.` from the developer website (the spec excludes `www.` and `m.`), so they
request `https://friendly-bets.com/app-ads.txt`. The apex already redirects to
`www.friendly-bets.com` at the Vercel domain layer, path preserved (docs/DEVELOPMENT.md, Deploy on
Vercel), and both the spec and Google allow a redirect within the same root domain, including to
`www.`. So the apex request lands on this route.
There is deliberately no Next redirect for this path; do not add one. If the apex redirect is ever
changed, keep it path-preserving and on `friendly-bets.com`.

## Consent and ATT

Native only (`initAds()` returns at once on the web, with the flag off, and for Pro, so none of
this runs there: no consent request, no form, no ATT, no SDK). Once per launch, in this order:

1. `AdMob.requestConsentInfo()` (Google UMP), every launch.
2. If `isConsentFormAvailable` and `status === 'REQUIRED'`: `AdMob.showConsentForm()`, and its
   result replaces the consent info.
3. If `canRequestAds` is false: stop. No ATT, no `initialize`, no ad request this launch;
   `showInterstitial` resolves reason `consent`.
4. iOS only: `trackingAuthorizationStatus()`, and `requestTrackingAuthorization()` only if it is
   still `notDetermined` (UMP's IDFA message may already have asked). Authorized, denied or
   restricted are never asked again.
5. `AdMob.initialize()`, then ads load as before.

`canRequestAds` is the only decision. When it is true the ad request is a normal one: the SDK
reads the stored consent (the TCF / US privacy strings UMP wrote) and serves personalized or
non-personalized ads by itself. There is no custom NPA flag.

Failures fail soft: if `requestConsentInfo` or `showConsentForm` throws (offline, say), no ad is
requested and the next `initAds()` (the next ad attempt) asks again. A failed ATT check is ignored
(non-personalized ads). A failed `initialize` after consent is not fatal: the ad is still tried,
and init retries next time. A `canRequestAds: false` answer is kept for the rest of the launch,
so the form is not put in front of every ad; the next launch asks again.

There is no in-app privacy options entry point (`showPrivacyOptionsForm`) yet. If the published
GDPR message needs one, it needs a settings row (and UX copy).

## Files

| File | What it does |
| --- | --- |
| `src/ads/config.js` | Test IDs, the env flag, frequency caps and timeouts. The only place to tune ads. |
| `src/ads/adService.js` | `showInterstitial`, `initAds`, `__resetAdsForTests`. Picks a backend. |
| `src/ads/caps.js` | Frequency caps (session, day, minimum interval). |
| `src/ads/HouseAd.jsx` | The web stand-in: a neutral full-screen overlay. |
| `src/ads/inviteGate.js` | `runInviteShare`: the ad, the thank-you, then the share, for every tally invite. |
| `src/ads/useInviteShare.jsx` | The React hook the tally uses; renders the thank-you. |
| `src/ads/settleGate.js` | `runSettleAd`: after a saved settle, the ad, the thank-you, then the reveal. |
| `src/ads/useSettleAd.jsx` | The React hook the tally's settle uses; renders the thank-you. |
| `src/ads/AdThanks.jsx` | The thank-you overlay after an ad was shown. |
| `src/ads/pro.js` | `isPro()`, synchronous, from the entitlement cache (`setProEntitlement`). See [docs/PRO.md](PRO.md). |

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

const { shown, skipped, reason } = await showInterstitial({ placement: 'settle' });
```

`canShowInterstitial(placement)` is the synchronous half: it runs the checks `showInterstitial`
makes before it starts (flag, Pro, busy, caps, interval) and returns `false` when the call would
skip right away. `true` does not promise an ad (the load can still time out or fail). Use it to
decide inside a click handler without an `await`. It never throws.

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
| `consent` | Native only: UMP did not allow ad requests (`canRequestAds` false), or the consent request failed. No ad is requested. Not counted. |
| `not-loaded` | AdMob could not load an ad (no fill, network). |
| `error` | Anything else: plugin missing, show failed, house ad could not mount. |

Callers should continue their flow on any result. Only `shown` means the person saw an ad.

`initAds()` runs UMP consent, then (iOS, only if consent allows ads) the tracking prompt if the
status is still `notDetermined`, then `AdMob.initialize()` only if consent allows ads (see
[Consent and ATT](#consent-and-att)). It resolves `{ ok, canRequestAds }` and never rejects. The
promise is memoized; a failed consent request or a failed init resolves `ok: false` and is retried
on the next call. It does nothing on the web, with the flag off, or for Pro
(`{ ok: false, canRequestAds: false }`). The native app calls `startAdsWhenProKnown()`
(`src/ads/startAds.js`) at boot (`mobile/main.jsx`). It waits until the entitlement has loaded
(or auth says nobody is signed in), at most 5 s, so a Pro member's cold start never inits the
SDK or sees the consent form or the ATT prompt, then calls `startAdsOnAppActive()`, which runs `initAds()` once the
app is active, so the consent form, the ATT prompt and SDK startup stay out of the first ad's 5 s budget.
`showInterstitial` still calls `initAds()` as a backstop.

## Invite interstitial

Every invite share on the tally (`src/phone/TallyScreen.jsx`) goes through one flow,
`useInviteShare` / `runInviteShare` (`src/ads/inviteGate.js`): the Text the crew button and the
one-time share sheet right after Create. The result texts (`ResultShare`) do not.

1. `canShowInterstitial('invite')`. If false (flag off, Pro, capped, too soon, busy), the share
   runs at once, synchronously, inside the same click.
2. Otherwise `await showInterstitial({ placement: 'invite' })`. Any skip (`timeout`, `error`,
   `not-loaded`, ...) or a throw goes straight to the share, with no thank-you.
3. Only when `shown` is true: the thank-you overlay (`AdThanks`), "Thanks for watching. That keeps
   Friendly free." It is fixed position on `document.body` (no layout shift), respects the
   safe-area insets, continues on a tap anywhere, and its button (at least 44 pt) reuses the
   "Text the crew" label, so there is no new copy besides that line.
4. Then the same share as before: `formatInvite` text, and `shareMessage` (share sheet, then
   `sms:`, the clipboard, then the manual copy) for the button, or `openShareSheet` (the sheet
   only, never a fallback) for the share after Create. With no share sheet at all, the share
   after Create does nothing, as before, and no ad is tried.

If the tally unmounts while the ad or thank-you is up, nothing is shared, including after a
skip or timeout that lands once the tally is gone.

Caps: `placements.invite` is 1 per session, 3 per day, plus the global 3 minute interval.

### The web user-gesture problem

`navigator.share` (iOS Safari especially) needs transient user activation, and waiting on an
ad spends the tap that started the share. So:

- **Skipped up front** (the default, flag off): `canShowInterstitial` is synchronous, so
  `shareMessage` reaches `navigator.share` inside the original click. Nothing changes.
- **Native app** (Capacitor Share): no gesture rule. The thank-you continues by itself after
  1.5 s (or on a tap) and the share opens.
- **Web, ad shown** (with or without `navigator.share`): the thank-you stays up until it is
  tapped (no auto-continue), and the share runs synchronously inside that tap's click handler,
  so the sheet, `sms:` or the clipboard write (which desktop Firefox and Safari refuse without
  a gesture) has a fresh gesture.
- **Ad tried but skipped on the web** (timeout, no fill, error): the share runs after the await.
  The browser may refuse `navigator.share` by then; `shareMessage` then falls back to `sms:`,
  the clipboard or the manual copy like any refused sheet, and `openShareSheet` (after Create)
  shows nothing, the button stays.

## Settle interstitial

**A settle with Undo shows no ad.** A fresh settle comes back with the creator's 30s Undo
(docs/UNDO-CALL-OFF.md), and an ad and thank-you in front of the reveal would eat that window,
or all of it. So when the saved settle has Undo left (`undoRemainingMs(settled, { localAt }) > 0`),
`confirmSettle` goes straight to the reveal: no `showInterstitial`, no thank-you, and nothing is
counted against the settle caps. The ad is not moved to later either: an interstitial 30 s after
the tap is not at a natural transition, which is where AdMob wants them. Every settle the tally
makes today is fresh, so in practice the settle ad does not show.

The gate, the `settle` placement and its caps all stay in place, so the ad can be pointed at a
better moment later. The one path that still reaches it is a settle that comes back with no Undo:
`settleBet` hands back a settle already saved with the same winner (a stale screen, say the
creator's other tab settled first) whose window has passed, or whose `settledAt` is a number from
an older build. There is no settle outside the tally and no native-only settle path. That path
runs the steps below, unchanged; `src/ads/settleGate.test.js` covers the gate on the real ad
service, and `src/phone/TallyScreen.settleAd.test.jsx` covers both the fresh settle (no ad, caps
untouched) and the no-Undo one (ad, counted).

When the gate runs, `TallyScreen` uses `useSettleAd` / `runSettleAd` (`src/ads/settleGate.js`):

1. `canShowInterstitial('settle')` at the tap, a read of the caps that counts nothing. If false
   (flag off, Pro, capped, too soon, busy), nothing about the settle changes: the save, then the
   reveal, exactly as before ads.
2. The save always goes first: `settleBet` (the Firestore transaction, then the fire-and-forget
   `requestResultTexts(code)` that sends the native result texts). The ad never starts before it
   resolves and never delays it. If the save fails, the error shows as before and no ad is tried.
3. After a successful save with no Undo, `await showInterstitial({ placement: 'settle' })`. Any skip
   (`timeout` after 5 s, `error`, `not-loaded`, ...) or a throw goes straight to the reveal.
4. Only when `shown` is true: the same `AdThanks` overlay and line. No share follows, so there
   is no gesture rule: it continues by itself after 1.5 s, or on a tap, on every platform.
   It has no button text (there is no existing neutral label to reuse, and no new copy): a
   transparent control covers the whole layer, named by the thank-you line, so it takes focus
   and Enter or Space as well as a tap anywhere.
5. Then the reveal (`SettledReveal`), once.

While the ad and thank-you are up the tally holds the screen it had at the tap (the picker
showing Settling…), even though the live snapshot flips the bet to settled underneath. The hold
starts at the tap whenever an ad may follow, since the snapshot can land before `settleBet`
resolves; a settle with Undo lets it go as soon as the save resolves. The reveal and its scroll happen in one render after the overlay closes, so there is
no layout shift and no double reveal. A bet deleted meanwhile is not held.

If the tally unmounts while the save is in flight, the save still lands but no ad starts. If it
unmounts during the ad or the thank-you, nothing more happens (no thank-you, no reveal, the
thank-you's timer is cleared).

Share the result (`ResultShare`) is untouched: the ad flow never calls it, and on the web it
still opens only from the person's own tap, so `navigator.share` has its gesture.

Caps: `placements.settle` is 1 per session, 3 per day, counted apart from `invite`. The global
3 minute interval still applies across both, so an invite ad a minute ago skips the settle ad,
and so does the global `maxPerDay` of 4 ads a day across all placements.

## Backends

1. **Disabled**: flag off or Pro. Resolves immediately, touches nothing.
2. **Native** (`Capacitor.isNativePlatform()`): `initAds()` (consent, ATT, init), then, only if
   `canRequestAds`, `prepareInterstitial` with the platform's interstitial unit, listeners for
   dismissed and failed-to-show, then `showInterstitial`. Resolves `shown` when the ad is
   dismissed. No consent is `consent`, with no ad request. If `initialize` fails after consent, it
   still tries to load the ad (fail open); a load failure is then `not-loaded`.
3. **Web**: mounts `HouseAd` on its own React root at the end of `<body>`. Fixed position, so the
   page under it does not shift. Respects safe-area insets, a 44 pt close button, Escape closes.
   While it is up the app root (`#root`, `#__next` or `.app-frame`) is `inert`; on close focus
   returns to where it was. Resolves `shown` when closed.

### Timeouts

- `timeoutMs` (5000) covers everything up to the ad being on screen: plugin import, consent
  (and its form, when `showInterstitial` is the first to run it), ATT, init, load and present.
  A consent form left open past it skips that ad as `timeout`; the answer still applies to the
  next one. Past it the call resolves `timeout`, and a load that finishes later is
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
- `maxPerDay` (4) caps the sum of all placements' shows for the day, on top of the above.
- `minIntervalMs` (3 min) applies across all placements.
- `sessionGapMs` (30 min): the native app process lives for days, so a resume after at least
  this long in the background starts a new session. A new calendar day does too.

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
- Unit tests for the invite and settle flows: `npx jest src/ads src/phone/TallyScreen`.
- E2E: `CI=1 npm run test:mobile` covers the invite with ads off, with ads on (house ad, then the
  thank-you, then the share from its tap) and skipped, and the settle with ads off, with ads on
  (no ad, the full 30s Undo, caps untouched), with ads on and no Undo (house ad, thank-you,
  reveal) and skipped (capped). The e2e swaps in `src/ads/config.js` with
  the flag on in the browser; the dev server itself keeps the default.
- Screenshots: `npm run screenshots -- house-ad.png thank-you.png --copy-to=<dir>`, and for the
  settle with no Undo `settle-house-ad.png settle-thank-you.png settle-reveal-after-ad.png`.
- Web: `NEXT_PUBLIC_ADS_ENABLED=1 npm run dev`, open a tally you made, tap Text the crew. Expect
  the house ad overlay (closes on the button, Escape, or after 10 s), then the thank-you; tap it
  to share.
- App: `NEXT_PUBLIC_ADS_ENABLED=1 npm run mobile:sync`, open Xcode or Android Studio, run on a
  device or simulator and tap Text the crew on a tally. Expect the consent form if a GDPR
  message is published and the device is in (or debug-set to) the EEA/UK, then the ATT prompt on
  first run (iOS), then a Google "Test Ad" interstitial. Reset ATT with Settings > Privacy >
  Tracking, or by deleting the app; reset consent by deleting the app. The plugin's
  `resetConsentInfo()` and debug geography (`requestConsentInfo({ debugGeography, testDeviceIdentifiers })`)
  are for local testing only and are not wired.
- Clear caps between tries: `localStorage.removeItem('fb.ads.caps.v1')` and reload.

## Native build notes

- iOS: Xcode resolves the new SPM dependencies (Google Mobile Ads, UMP) on the next open or
  build (File > Packages > Resolve Package Versions if it does not). No `pod install`.
- Android: the plugin applies its own Kotlin Gradle plugin. The first Gradle sync downloads
  `play-services-ads`.
- `Info.plist` carries `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`
  (UX's final ATT sentence, see Release TODOs) and `SKAdNetworkItems`. UMP needs no extra plist or manifest
  keys. The Android manifest carries the AdMob application ID `meta-data`.
  The Google Mobile Ads SDK crashes at launch if the app ID is missing, so keep these in sync
  with config.
