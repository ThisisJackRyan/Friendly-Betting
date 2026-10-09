# Developing Friendly

Everything technical about Friendly Betting lives here. The [README](../README.md) is the product page.

Friends-only wagers. Create a bet, text a short vote link (`/b/[code]`), watch the live tally, then close and settle. Three bet types: Money Line, Over-Under, and Prop.

Responsive clubhouse design: bottom navigation on phones, a sidebar and header from 768px, and focused creation, verification, and voting screens. My bets includes status filters, search, and summaries based on your saved bets. The home-page example is illustrative; it is never saved to Firebase.

Bets are stored in the existing Firebase project (`friendly-betting-fb47e`) and read and written from the browser through `src/phone/api.js`. Names and a fallback id stay in `localStorage` on this device. The only server code is a few Next.js API routes (see [API routes](#api-routes)) that use the Firebase Admin SDK for private result-text numbers and creator deletes. The app works without them configured.

## Run locally

Requires Node.js 22.12 or newer (`engines` in `package.json`; Vercel reads it) for the shared web and Capacitor 8 toolchain. `.nvmrc` pins Node 22 for local `nvm use`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Core loop: Create → the live tally `/t/[code]` (share sheet opens once, Text the crew) → open the `/b/[code]` link → vote → Tally → Close & settle.

### Scripts and checks

```bash
npm test                 # Jest unit/component tests (mocked Firebase)
npm run test:rules       # Firestore rules tests against the local emulator
npm run test:mobile      # Playwright phone/Android smoke checks on the app preview
npm run build            # next build
npm run mobile:build     # Vite build of the native app bundle
npm run screenshots      # regenerate docs/screenshots (see below)
```

`npm run test:rules` runs `firebase emulators:exec --only firestore` with the demo project `demo-friendly-betting`, then Jest with `jest.rules.config.js` over `rules/*.test.js`. It needs the Firebase CLI and Java on `PATH`. It never touches the real project. `npm test` skips `rules/` and `mobile/e2e/`, and only picks up `*.test.js(x)` files, so `scripts/` is never run by Jest.

## Web + iOS + Android

Prod: https://www.friendly-bets.com (the apex `friendly-bets.com` redirects to `www`). The website stays on Next.js. The iOS and Android apps bundle the **same React screens, CSS, Firebase data layer and settlement logic** using Vite + Capacitor 8; there is no second UI to keep in sync and no production `server.url` wrapper. App assets and fonts ship in the binary. Bets, auth and live results still require a connection. The native apps are not published to the App Store or Google Play yet.

`src/phone` owns product behavior. `src/platform` exposes the small navigation/native boundary. Next uses its own router; Vite resolves the navigation adapters to React Router in `mobile/`. `mobile/App.jsx` mirrors the web routes. Add a new screen to both route tables while keeping its implementation in `src/phone`.

| Web feature | App implementation |
| --- | --- |
| Home, clubhouse styling, mobile create transitions | Same Landing, AppShell and CSS |
| Money Line, Over-Under, Prop, optional stakes/deadline | Same CreateForm and validation |
| Creator phone OTP, My Bets filters/search, logout | Same auth slides and identity; native SMS verifier |
| Creator delete from My Bets | Same DeleteBetDialog; calls the prod `DELETE /api/bets/:code` |
| Anonymous one-tap picks and live tally | Same VoteScreen, TallyScreen and Firestore API |
| Creator-only settlement, winning names/stake, result preview | Same transactional settlement and ResultCard |
| Winner ping, softer loser ping, Results inbox/read receipts | Same header ResultsMenu and device storage |
| Optional result-text number (behind `NEXT_PUBLIC_RESULT_TEXTS`) | Same ResultTextCard; calls the prod API |
| Text invitations and share final results | Native share sheet; links always point to prod |
| `/b/:code`, `/t/:code`, legacy `/Bet/:collection/:id` | Same screens, with native deep-link handlers |

```bash
npm run mobile:dev       # app UI preview on http://127.0.0.1:5173
npm run mobile:build     # bundled assets in dist-mobile
npm run mobile:sync      # build and sync both native projects
npm run mobile:ios       # sync and open Xcode
npm run mobile:android   # sync and open Android Studio
npm run mobile:assets    # regenerate launch icons/screens from app/icon.svg
npx playwright install chromium
npm run test:mobile      # iPhone/Android viewport smoke checks; blocks Firebase requests
```

The native app has no API of its own: `apiUrl` in `src/phone/resultTexts.js` points API calls at `https://www.friendly-bets.com` when running in Capacitor, which is why those routes allow the app's WebView origins (see [CORS](#cors)).

Native project IDs are `com.friendlybetting.app`. Device signing and Firebase native registration are required before release:

1. Register that bundle/package ID for iOS and Android in the existing `friendly-betting-fb47e` Firebase project. Download `GoogleService-Info.plist` to `ios/App/App/` and add it to the App target in Xcode. Download `google-services.json` to `android/app/`. Both are ignored by Git. The web Firebase config is not a substitute for native app registration.
2. For iOS phone auth, add the Firebase **Encoded App ID** URL scheme from the Firebase console, alongside `friendlybetting`, in the App target's URL Types. Enable Push Notifications and Background Modes → Remote notifications, and upload the APNs key in Firebase. The SceneDelegate forwards reCAPTCHA redirects to Firebase. See [Firebase iOS phone setup](https://firebase.google.com/docs/auth/ios/phone-auth).
3. For Android phone auth, register SHA-1 and SHA-256 fingerprints for each debug/release signing certificate in Firebase. Install Android Studio's SDK required by `android/variables.gradle`. See [Firebase Android phone setup](https://firebase.google.com/docs/auth/android/phone-auth).
4. Choose your Apple team in Xcode and Android release keystore. Keep signing credentials outside Git. Sync after dependencies or assets change. Swift Package Manager uses the authentication plugin's Lite trait to exclude optional social sign-in SDKs.
5. To open **prod HTTPS links directly in the installed app**, publish `/.well-known/apple-app-site-association` with your actual Apple team ID + `com.friendlybetting.app`, and `/.well-known/assetlinks.json` with your actual Android release SHA-256 fingerprint. Associate `/b/*`, `/t/*`, `/Bet/*`, and `/Friendly-Betting/*`. The native declarations and URL handlers are included; domain verification needs those real account values (neither file exists in `public/` yet). Until then, HTTPS invitations work on the web, and `friendlybetting://b/CODE` exercises native routing. Unrelated hosts/paths are rejected.

Firebase JS remains the session authority on both platforms, with IndexedDB persistence in the app. Native phone verification returns an SMS verification ID to the existing JS credential-linking flow; bettors do not see a sign-in gate. Browser and app installations have separate anonymous identities and inbox storage; moving a participant between them does not migrate their picks. Keep a participant in their original client for result continuity.

Native release check: create each bet type on a device, verify a configured test phone, invite a browser participant, cast picks from both clients, settle as the creator, check winner/loser results, reopen the app, share the result and confirm the URL uses prod. Also test OTP resend/expiry, Android back, cold/warm deep links, notches, keyboard, rotation and lost connection. Browser smoke tests cannot verify native phone auth, Messages, OS link association or signing.

There is no paywall in this release. Pricing stays locked: 3 free creations, then $3/month unlimited; Founder lifetime $40 for the first 100, $80 for the next 500, then monthly only. Bettors always free. Founder perks, one non-voter nudge and rematches remain later work. (The README only says bettors are free and Founder seats are coming; it lists no prices.)

### Current close/settle and SMS map

`CreateForm` → `api.saveBet` → replaces Create with `/t/:code` (`TallyScreen`) → `inviteCopy.formatInvite` → `share.openShareSheet` once on arrival (only when a share sheet exists), then `share.shareMessage` from Text the crew → Messages/native share/clipboard → `/b/:code` → `api.castVote` → live Firestore subscriptions.

`TallyScreen` → creator phone gate → choose side + `ResultCard` preview → `api.settleBet` transaction → saved settlement snapshot → `ResultsMenu` for remembered participant IDs → `ResultShare` → `settlement.formatResultMessage` → the same share adapter.

The default notification delivery channel is the in-app inbox, while open or on return. Background push is not built. Tapping **Settle & notify** does not imply an SMS on its own.

Optional result texts ("text me who won"), off by default: with `NEXT_PUBLIC_RESULT_TEXTS=1`, `VoteScreen` shows `ResultTextCard` after a recorded pick → `resultTexts.saveResultText` → `POST /api/bets/:code/result-texts` (Admin SDK, private storage). After settling, `requestResultTexts` → `POST /api/bets/:code/result-texts/send` → `deliverResultTexts` → `sendResultSms` in `src/server/sms.js`. That function is still a `TODO(notify)` that throws `sms-not-configured`, so **no SMS is actually sent yet**; saved numbers are deleted at settle and counted as failed. Leave the flag off until an SMS provider and `FIREBASE_SERVICE_ACCOUNT` are configured. Full details: [docs/result-texts.md](result-texts.md).

## Settlement and results

Creators pick the winning side, review the result, then tap **Settle & notify**. The close and result snapshot are saved in one Firestore transaction, including all winning participants, the stake, and recipient IDs. Repeating the same close keeps the original result; a different winner or a late edit is rejected by the app and by this repo's `firestore.rules` (see [Firestore rules](#firestore-rules) for deployment). Only the creator can close or settle (`calledOff` can only be set by settling).

Participants get **in-app** results: “You called it.” for winners, “This one’s settled.” for everyone else. A Results button appears in the header after a successful pick, with an unread count when the creator settles. Reopening Friendly in the same browser also picks up results settled while away. Read receipts survive reloads and sync between tabs. No participant phone number or extra sign-in is required. Automatic SMS (see result texts above) and background push are not live. Browser storage and the participant identity must still be available; clearing them or using another device loses inbox continuity. Returning to an old bet link registers an existing participant for future results.

Both the invite and tally links show the final result, winning names, winning side, and stake. **Share the result** opens the native share sheet, Messages, clipboard, or a copyable text fallback. Money is not collected or paid out. Stakes are displayed as entered; `$5` is not multiplied into a pot, and multiple winners are not assigned invented payout amounts. Only an explicit stake such as `$20 pot` is described as a pot. Noncash and blank stakes work too (blank means bragging rights).

Creators can delete their own bet from My bets. See [API routes](#api-routes) for how that works with and without Admin credentials.

Voice: short, playful, a little competitive. “Make your call.” “Text the crew.” “Bragging rights, secured.” Keep the losing side welcome; no automatic roasts.

### Crew check before release

1. Create a bet with an explicit `$20 pot`, invite a few friends, and have at least two choose the winning side. Keep one participant on a different page in Friendly; close another participant’s browser.
2. As the creator, preview the winner and settle. Check the winning names and stake, the “n new” count on Results, the winner line, and the softer message for a losing pick. The participant who was away should see their unread result on reopening the same browser.
3. Open Results, tap the result, then reload and open Results again. The result should still be there without a new unread count. Open the invite link and share the final result back to the group chat.
4. Repeat with pizza, an empty stake, nobody on the winning side, and an expired pick deadline. Expiry alone must not announce a winner. Try a second close and a late pick; neither should change the final result.
5. As the creator, delete a bet from My bets and confirm its links show the bet is gone. As a non-creator, confirm there is no delete.

Automated checks: `npm test`, `npm run test:rules`, `npm run build`, and `npm run mobile:build` (plus `npm run test:mobile` for the app preview). The Jest tests use mocked Firebase transactions/subscriptions, and the rules tests run against the emulator with this repo's `firestore.rules`, so the crew check still needs to confirm the **deployed** Firebase rules permit the settlement field, participant reads and creator deletes.

Next, after this loop works with real friends: one nudge for non-voters, “run it back,” then a Founder badge and number when the paywall arrives. Automatic loser roasts, public leaderboards, and ad placement stay on hold.

## Firestore rules

`firestore.rules` is the source of truth for what the repo expects: creator-only edits, close/settle and delete; vote-only updates for bettors; and a deny-all for `privateResultTexts` (Admin SDK only). Tests live in `rules/firestore.rules.test.js` and run with `npm run test:rules`.

The file is **not auto-deployed**. Nothing in this repo or on Vercel deploys it. Prod rules live in the Firebase console. Before anyone runs `firebase deploy --only firestore:rules`, review it line by line against the rules live in the console for `friendly-betting-fb47e` and merge anything the live rules allow that is missing here. Any catch-all `match /{document=**}` allow rule in the console would expose private result-text numbers and must not exist.

## API routes

All three run on the Node runtime with the Firebase Admin SDK (`src/server/firebaseAdmin.js`). Without `FIREBASE_SERVICE_ACCOUNT` they answer `503 { error: 'not-configured' }`.

| Route | Who | What |
| --- | --- | --- |
| `POST /api/bets/[code]/result-texts` | Voter (Firebase ID token, the anonymous user) | Saves one US number per voter per bet in `privateResultTexts/{code}`. Side comes from the recorded vote. |
| `POST /api/bets/[code]/result-texts/send` | Anyone; acts only on settled bets | Claims each saved number once (deleted in a transaction) and calls `sendResultSms`. |
| `DELETE /api/bets/[code]` | Creator (ID token with the creator uid and phone) | `src/server/deleteBet.js`: deletes the bet, its result-text numbers and the `privateResultTexts/{code}` doc in one transaction. |

If the delete route returns 503 `not-configured`, the app falls back to deleting `bets/{code}` directly from the client, which `firestore.rules` allows for the creator only. No numbers can exist in that case, since saving them needs the same credentials. Legacy detail docs (`MoneyLineBets`/`OverUnderBets`/`PropBets`) are left in place.

### CORS

`src/server/http.js` echoes an exact allowed origin only, with no credentials (the ID token is a header, not a cookie). The allowlist:

- `capacitor://localhost` (iOS app WebView)
- `https://localhost` (Android app WebView)
- `https://www.friendly-bets.com` (production site)

Preflight never touches auth or the database.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Vercel, server only | Service-account JSON (or base64 of it) for the API routes. Optional; without it the routes return 503 and the app uses its client fallbacks. |
| `NEXT_PUBLIC_RESULT_TEXTS` | Vercel and native builds | `1` shows the optional result-text field and fires the send call after settling. Leave unset until an SMS provider is wired into `src/server/sms.js` and the service account is set. |

`NEXT_PUBLIC_RESULT_TEXTS` is read by both builds: Next inlines it for the web, and `mobile/vite.config.mjs` defines it for the app from the shell environment or the repo-root `.env*` files (the shell wins). Set it before `npm run mobile:build`/`mobile:sync` if the app should show the field.

## Screenshots

The README images live in `docs/screenshots/`. Regenerate them with:

```bash
npx playwright install chromium   # once
npm run screenshots               # or: node scripts/screenshots.mjs vote.png
```

`scripts/screenshots.mjs` reuses a Vite app preview already on `http://127.0.0.1:5173` or starts `npm run mobile:dev` and stops it afterwards. It opens each screen in Playwright's Chromium at 393×852, 2x scale, touch, reduced motion. Like `mobile/e2e/app.spec.js`, it aborts every Google/Firebase request and serves fixture versions of `src/phone/identity.js`, `src/phone/api.js` and `src/phone/routes.js` (vote links on the production origin) through `page.route`, so no app code changes, nothing signs in and no real bets are created. The settled shot builds its result with the app's own `buildSettlement`. Images are palette-compressed with `sharp`. The script fails if a page throws.

Shots: `create-bet.png` (stake slide), `text-the-crew.png` (the live tally right after Create, with Text the crew emphasized), `vote.png` (one-tap pick), `live-tally.png` (creator's live tally, with who picked each side) and `settled.png` (winner's settled result and final tally). `many-voters.png` (a side with more than five names) `settled-tally.png` (the settled final tally) `results-open.png` (the header Results inbox), `tally-after-create.png` (the tally behind the share sheet that opens after Create) and `tally-after-create-dismissed.png` (the same tally once that sheet is dismissed) are only written with `--copy-to=<dir>`, which also copies every shot to that directory. Older design-review captures are in `docs/design-refresh/`.

## Deploy on Vercel

GitHub Pages and Create React App are no longer used. Production is a Next.js App Router app on Vercel.

1. In the [Vercel dashboard](https://vercel.com/new), import this GitHub repository (`ThisisJackRyan/Friendly-Betting`).
2. Framework preset: **Next.js**. Production branch: **`main`**. Leave the build command as `next build` (or `npm run build`). Node version comes from `engines` (`>=22.12.0`). No environment variables are required for the core app; add the optional ones above only when turning on result texts or server deletes.
3. Deploy.
4. Production domain: `www.friendly-bets.com`, with the apex `friendly-bets.com` redirecting to `www`. DNS points at Vercel.
5. In Firebase Authentication → Settings → Authorized domains, make sure `www.friendly-bets.com` (and `friendly-bets.com`) are listed, plus the `*.vercel.app` host (`friendly-betting-teal.vercel.app`) for previews. Auth fails on a host that is not authorized. `localhost` is already allowed for local dev.
6. Creator sign-in is Firebase Phone OTP only. In Authentication → Sign-in method, turn **Phone** on and leave **Anonymous** on. Add test numbers with fixed codes for the crew (those work without sending SMS). Real texts need the Blaze plan. Bettors never sign in.

An agent cannot connect the Vercel account or set the production domain. Those steps stay in the dashboard.

Old GitHub Pages links under `/Friendly-Betting/...` redirect to the same path at the site root (`next.config.js`), so a previously texted `/Friendly-Betting/b/[code]` URL still opens the vote screen.
