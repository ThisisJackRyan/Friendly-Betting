# Friendly Betting

Friends-only wagers. Create a bet, text a short vote link (`/b/[code]`), watch the live tally, then close and settle. Three bet types: Money Line, Over-Under, and Prop.

Phone-first. At 768px and up the same screens sit in a desktop frame (top bar, and a left rail from 1024px).

Bets are stored in the existing Firebase project. Names and a fallback id stay in `localStorage` on this device. There is no separate app server.

## Run locally

Requires Node.js 18.18 or newer (Node 20+ is fine). Next.js 15 will not start on older Node.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Core loop: Create → phone code → Text friends → open the `/b/[code]` link → vote → Tally → Close & settle.

Friends who open a vote link stay anonymous. The vote screen never asks for a phone. Creators verify with Firebase Phone OTP after the stake step, and again on My bets or settle if that browser has no phone session yet.

## Creator phone sign-in

Phone numbers live on the Firebase Auth user. Bets still store `createdByID` as that user’s uid. Anonymous sign-in stays on so a creator can link a phone without orphaning bets they already created on this device.

In the Firebase console for this project:

1. Authentication → Sign-in method: turn **Phone** on. Leave **Anonymous** on.
2. Add Crew test numbers and fixed 6-digit codes under Phone → Phone numbers for testing. Test numbers do not send an SMS.
3. Authentication → Settings → Authorized domains: add `friendly-betting-teal.vercel.app`. `localhost` is already allowed.
4. Real SMS needs the **Blaze** plan. Test numbers work without it.

## Deploy on Vercel

GitHub Pages and Create React App are no longer used. Production is a Next.js App Router app on Vercel.

1. In the [Vercel dashboard](https://vercel.com/new), import this GitHub repository (`ThisisJackRyan/Friendly-Betting`).
2. Framework preset: **Next.js**. Production branch: **`main`**. Leave the build command as `next build` (or `npm run build`). No extra environment variables are required for this app.
3. Deploy.
4. Optional: add a production domain on the Vercel project and point DNS at Vercel.
5. In Firebase Authentication → Settings → Authorized domains, add the production host (and any custom domain). Anonymous sign-in and phone OTP both fail on a host that is not authorized. `localhost` is already allowed for local dev. Turn Phone sign-in on before creators can text or settle; see [Creator phone sign-in](#creator-phone-sign-in).

An agent cannot connect the Vercel account or set the production domain. Those steps stay in the dashboard.

Old GitHub Pages links under `/Friendly-Betting/...` redirect to the same path at the site root, so a previously texted `/Friendly-Betting/b/[code]` URL still opens the vote screen.
