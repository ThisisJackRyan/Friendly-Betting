# Friendly Betting

Friends-only wagers. Create a bet, text a short vote link (`/b/[code]`), watch the live tally, then close and settle. Three bet types: Money Line, Over-Under, and Prop.

Responsive clubhouse design: bottom navigation on phones, a sidebar and header from 768px, and focused creation, verification, and voting screens. My bets includes status filters, search, and summaries based on your saved bets. The home-page example is illustrative; it is never saved to Firebase.

Bets are stored in the existing Firebase project. Names and a fallback id stay in `localStorage` on this device. There is no separate app server.

## Run locally

Requires Node.js 22.12 or newer for the shared web and Capacitor 8 toolchain.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Core loop: Create → Text friends → open the `/b/[code]` link → vote → Tally → Close & settle.

## Web + iOS + Android

Prod: https://www.friendly-bets.com. The website stays on Next.js. The iOS and Android apps bundle the **same React screens, CSS, Firebase data layer and settlement logic** using Vite + Capacitor 8; there is no second UI to keep in sync and no production `server.url` wrapper. App assets and fonts ship in the binary. Bets, auth and live results still require a connection.

`src/phone` owns product behavior. `src/platform` exposes the small navigation/native boundary. Next uses its own router; Vite resolves the navigation adapters to React Router in `mobile/`. `mobile/App.jsx` mirrors the web routes. Add a new screen to both route tables while keeping its implementation in `src/phone`.

| Web feature | App implementation |
| --- | --- |
| Home, clubhouse styling, mobile create transitions | Same Landing, AppShell and CSS |
| Money Line, Over-Under, Prop, optional stakes/deadline | Same CreateForm and validation |
| Creator phone OTP, My Bets filters/search, logout | Same auth slides and identity; native SMS verifier |
| Anonymous one-tap picks and live tally | Same VoteScreen, TallyScreen and Firestore API |
| Creator-only settlement, winning names/stake, result preview | Same transactional settlement and ResultCard |
| Winner ping, softer loser ping, Results inbox/read receipts | Same ResultNotifications and device storage |
| Text invitations and share final results | Native share sheet; links always point to prod |
| `/b/:code`, `/t/:code`, legacy `/Bet/:collection/:id` | Same screens, with native deep-link handlers |

```bash
npm run mobile:dev       # app UI preview on http://127.0.0.1:5173
npm run mobile:build     # bundled assets in dist-mobile
npm run mobile:sync      # build and sync both native projects
npm run mobile:ios       # sync and open Xcode
npm run mobile:android   # sync and open Android Studio
npm run mobile:assets   # regenerate launch icons/screens from app/icon.svg
npx playwright install chromium
npm run test:mobile      # iPhone/Android viewport smoke checks; blocks Firebase requests
```

Native project IDs are `com.friendlybetting.app`. Device signing and Firebase native registration are required before release:

1. Register that bundle/package ID for iOS and Android in the existing `friendly-betting-fb47e` Firebase project. Download `GoogleService-Info.plist` to `ios/App/App/` and add it to the App target in Xcode. Download `google-services.json` to `android/app/`. Both are ignored by Git. The web Firebase config is not a substitute for native app registration.
2. For iOS phone auth, add the Firebase **Encoded App ID** URL scheme from the Firebase console, alongside `friendlybetting`, in the App target's URL Types. Enable Push Notifications and Background Modes → Remote notifications, and upload the APNs key in Firebase. The SceneDelegate forwards reCAPTCHA redirects to Firebase. See [Firebase iOS phone setup](https://firebase.google.com/docs/auth/ios/phone-auth).
3. For Android phone auth, register SHA-1 and SHA-256 fingerprints for each debug/release signing certificate in Firebase. Install Android Studio's SDK required by `android/variables.gradle`. See [Firebase Android phone setup](https://firebase.google.com/docs/auth/android/phone-auth).
4. Choose your Apple team in Xcode and Android release keystore. Keep signing credentials outside Git. Sync after dependencies or assets change. Swift Package Manager uses the authentication plugin's Lite trait to exclude optional social sign-in SDKs.
5. To open **prod HTTPS links directly in the installed app**, publish `/.well-known/apple-app-site-association` with your actual Apple team ID + `com.friendlybetting.app`, and `/.well-known/assetlinks.json` with your actual Android release SHA-256 fingerprint. Associate `/b/*`, `/t/*`, `/Bet/*`, and `/Friendly-Betting/*`. The native declarations and URL handlers are included; domain verification needs those real account values. Until then, HTTPS invitations work on the web, and `friendlybetting://b/CODE` exercises native routing. Unrelated hosts/paths are rejected.

Firebase JS remains the session authority on both platforms, with IndexedDB persistence in the app. Native phone verification returns an SMS verification ID to the existing JS credential-linking flow; bettors do not see a sign-in gate. Browser and app installations have separate anonymous identities and inbox storage; moving a participant between them does not migrate their picks. Keep a participant in their original client for result continuity.

Native release check: create each bet type on a device, verify a configured test phone, invite a browser participant, cast picks from both clients, settle as the creator, check winner/loser results, reopen the app, share the result and confirm the URL uses prod. Also test OTP resend/expiry, Android back, cold/warm deep links, notches, keyboard, rotation and lost connection. Browser smoke tests cannot verify native phone auth, Messages, OS link association or signing.

There is no paywall in this release. Pricing stays locked: 3 free creations, then $3/month unlimited; Founder lifetime $40 for the first 100, $80 for the next 500, then monthly only. Bettors always free. Founder perks, one non-voter nudge and rematches remain later work.

### Current close/settle and SMS map

`CreateForm` → `api.createBet` → `model.formatSms` → `share.shareMessage` → Messages/native share/clipboard → `/b/:code` → `api.castVote` → live Firestore subscriptions.

`TallyScreen` → creator phone gate → choose side + `ResultCard` preview → `api.settleBet` transaction → saved settlement snapshot → `ResultNotifications` for remembered participant IDs → `ResultShare` → `settlement.formatResultMessage` → the same share adapter.

The notification delivery channel is the in-app inbox, while open or on return. Automatic SMS and background push require a server delivery service and recipient opt-in/contact tokens; neither is implied by tapping **Settle & notify**. No participant phone collection or external messaging service is added here.

## Settlement and results

Creators pick the winning side, review the result, then tap **Settle & notify**. The close and result snapshot are saved in one Firestore transaction, including all winning participants, the stake, and recipient IDs. Repeating the same close keeps the original result; a different winner or a late edit is rejected by the app. Firebase security rules remain the authority for database access; this repository does not manage or deploy those rules.

Participants get **in-app** results: “You called it.” for winners, “This one’s settled.” for everyone else. A Results inbox appears after a successful pick, with an unread ping when the creator settles. Reopening Friendly in the same browser also picks up results settled while away. Read receipts survive reloads and sync between tabs. No participant phone number or extra sign-in is required. This release does not send automatic SMS or background push notifications. Browser storage and the participant identity must still be available; clearing them or using another device loses inbox continuity. Returning to an old bet link registers an existing participant for future results.

Both the invite and tally links show the final result, winning names, winning side, and stake. **Share the result** opens the native share sheet, Messages, clipboard, or a copyable text fallback. Money is not collected or paid out. Stakes are displayed as entered; `$5` is not multiplied into a pot, and multiple winners are not assigned invented payout amounts. Only an explicit stake such as `$20 pot` is described as a pot. Noncash and blank stakes work too (blank means bragging rights).

Voice: short, playful, a little competitive. “Make your call.” “Text the crew.” “Bragging rights, secured.” Keep the losing side welcome; no automatic roasts.

### Crew check before release

1. Create a bet with an explicit `$20 pot`, invite a few friends, and have at least two choose the winning side. Keep one participant on a different page in Friendly; close another participant’s browser.
2. As the creator, preview the winner and settle. Check the winning names and stake, a winner ping, and the softer message for a losing pick. The participant who was away should see their unread result on reopening the same browser.
3. Dismiss a ping, reload, and open Results. The result should still be there without a new unread ping. Open the invite link and share the final result back to the group chat.
4. Repeat with pizza, an empty stake, nobody on the winning side, and an expired pick deadline. Expiry alone must not announce a winner. Try a second close and a late pick; neither should change the final result.

Automated checks: `npm test -- --runInBand` and `npm run build`. The tests use mocked Firebase transactions/subscriptions, so the crew check still needs to confirm the deployed Firebase rules permit the settlement field and participant reads.

Next, after this loop works with real friends: one nudge for non-voters, “run it back,” then a Founder badge and number when the paywall arrives. Automatic loser roasts, public leaderboards, and ad placement stay on hold.

## Deploy on Vercel

GitHub Pages and Create React App are no longer used. Production is a Next.js App Router app on Vercel.

1. In the [Vercel dashboard](https://vercel.com/new), import this GitHub repository (`ThisisJackRyan/Friendly-Betting`).
2. Framework preset: **Next.js**. Production branch: **`main`**. Leave the build command as `next build` (or `npm run build`). No extra environment variables are required for this app.
3. Deploy.
4. Optional: add a production domain on the Vercel project and point DNS at Vercel.
5. In Firebase Authentication → Settings → Authorized domains, add the `*.vercel.app` host and any custom domain. Auth fails on a host that is not authorized. `localhost` is already allowed for local dev. Production needs `friendly-betting-teal.vercel.app`.
6. Creator sign-in is Firebase Phone OTP only. In Authentication → Sign-in method, turn **Phone** on and leave **Anonymous** on. Add test numbers with fixed codes for the crew (those work without sending SMS). Real texts need the Blaze plan. Bettors never sign in.

An agent cannot connect the Vercel account or set the production domain. Those steps stay in the dashboard.

Old GitHub Pages links under `/Friendly-Betting/...` redirect to the same path at the site root, so a previously texted `/Friendly-Betting/b/[code]` URL still opens the vote screen.
