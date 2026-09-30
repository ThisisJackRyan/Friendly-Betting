# Friendly Betting

Friends-only wagers. Create a bet, text a short vote link (`/b/[code]`), watch the live tally, then close and settle. Three bet types: Money Line, Over-Under, and Prop.

Phone-first. At 768px and up the same screens sit in a desktop frame (top bar, and a left rail from 1024px).

Bets are stored in the existing Firebase project. Names and a fallback id stay in `localStorage` on this device. There is no separate app server.

## Run locally

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
5. In Firebase Authentication → Settings → Authorized domains, add the `*.vercel.app` host and any custom domain. Anonymous sign-in fails on a host that is not authorized, so create / vote / settle will not work until that domain is listed. `localhost` is already allowed for local dev.

An agent cannot connect the Vercel account or set the production domain. Those steps stay in the dashboard.

Old GitHub Pages links under `/Friendly-Betting/...` redirect to the same path at the site root, so a previously texted `/Friendly-Betting/b/[code]` URL still opens the vote screen.
