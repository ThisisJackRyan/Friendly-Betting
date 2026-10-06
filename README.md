# Friendly Betting

Friends-only wagers. Create a bet, text a short vote link (`/b/[code]`), watch the live tally, then close and settle. Three bet types: Money Line, Over-Under, and Prop.

Responsive clubhouse design: bottom navigation on phones, a sidebar and header from 768px, and focused creation, verification, and voting screens. My bets includes status filters, search, and summaries based on your saved bets. The home-page example is illustrative; it is never saved to Firebase.

Bets are stored in the existing Firebase project. Names and a fallback id stay in `localStorage` on this device. There is no separate app server.

## Run locally

Requires Node.js 18.18 or newer (Node 20+ is fine). Next.js 15 will not start on older Node.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Core loop: Create → Text friends → open the `/b/[code]` link → vote → Tally → Close & settle.

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
