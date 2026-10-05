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
