# Pro tier

Pro is $3/mo, the only plan: no ads, Run it back and head-to-head stats. Creating bets is not capped
(`FREE_BETS` is not enforced yet). Bettors (anyone who only picks a side) are always free and never
need an account.

Today Pro is a data model, rules, a client listener, badges and a flagged paywall. **Nothing
sells Pro yet**: no real payment and no mock purchase (the preview-only mock was removed before
launch). See [TODOs](#todos-for-real-billing).
Pro already turns ads off (see [docs/ADS.md](ADS.md)).

## Data model

`entitlements/{uid}`, one doc per member, written only by the Admin SDK:

| Field | Type | Notes |
| --- | --- | --- |
| `plan` | `'pro'` | The only plan sold. Legacy docs may say `'founder'`: see below. |
| `source` | `'mock' \| 'storekit' \| 'play' \| 'stripe' \| 'revenuecat' \| 'admin'` | Who granted it. Nothing writes entitlements today; earlier preview tests wrote `mock`. |
| `since` | timestamp | Server time of the grant. |
| `expiresAt` | timestamp or `null` | End of the paid period. Missing or `null` means no expiry. |

**Mock and legacy founder docs.** Production has no entitlement docs today, but reads must not
break if one reappears: a `source: 'mock'` doc reads like any other plan (Pro while it is live).
Before the Founder tier was dropped, the old mock purchase could write
`{ plan: 'founder', source: 'mock', since, founderNumber, expiresAt: null }` (lifetime). Those
docs still read as Pro, forever, whatever `expiresAt` says, with the plain `Pro` badge: the
number is never shown. Nothing writes that shape any more. A future billing writer should leave
a legacy founder doc unchanged (a 30 day plan would cut lifetime short).

Pure helpers in `src/phone/entitlement.js`:

- `isProEntitlement(ent, now)`: pro when `expiresAt` is missing, `null`, or later than `now`;
  a legacy founder doc always. Accepts Firestore Timestamps, Dates, millis.
- `badgeFor(ent, now)`: `{ kind: 'pro' }` for any live plan, or `null`.

Pricing, flags and every Pro string live in `src/phone/proConfig.js` (`FREE_BETS`,
`PRO_MONTHLY_USD`, `EARLY_ACCESS_TYPES`, `PRO_COPY`).

## Rules

`firestore.rules`:

```
match /entitlements/{uid} {
  allow get: if request.auth != null && request.auth.uid == uid;
  allow list, create, update, delete: if false;
}
```

A member gets only their own entitlement, one doc at a time (no query can list them); no client can grant, extend, edit or delete one.
The read checks no fields, so legacy founder docs still read. There is no `meta/founders` rule
any more: like the rest of `meta` it is closed by default. Covered in
`rules/firestore.rules.test.js` (`pro entitlements`, `meta`). The rules file is not
auto-deployed (see the note at its top).

### Post-deploy steps (after the `entitlements` rules are live)

1. Remove the permission-denied => no-plan mapping in src/phone/entitlementApi.js.
2. A session that was open across the rules deploy: Restore purchase reads fresh every time, so
   it finds Pro without a reload. The listener was denied and stopped, so it keeps answering no
   plan until the page or app reloads (or a Restore shares the plan it found).

## Client

- `src/phone/entitlementApi.js`: `subscribeEntitlement(uid, cb)` (onSnapshot of the user's own
  doc) and `fetchEntitlement(uid)` (one server read of it, for Restore purchase). The only Pro
  reads; nothing on the client writes or buys a plan. Both treat `permission-denied` on the
  user's own doc as no entitlement, like a missing doc, so rules without the `entitlements`
  block (not yet deployed) read as not Pro rather than an error; any other error is still an
  error. Restore purchase always asks the server, even after the listener (or an earlier
  Restore) was denied. Preview and dev builds log a denied read with its error code only
  (`console.info`, never the uid, path or error); production builds log nothing. Jest mocks it for every test in `src/setupTests.js`.
- `src/phone/useEntitlement.js`: one shared listener for the signed-in user.
  `useEntitlement()` returns `{ entitlement, isPro, loading }` and keeps `src/ads/pro.js`
  current through `setProEntitlement`, so the ad service's synchronous `isPro()` is right on
  every screen. `useEntitlementState()` and `useProBadge(uid)` read it without listening.
- `src/phone/EntitlementSync.jsx` mounts the listener once at the root: `app/layout.js` (web,
  every page including `/b/`) and `mobile/App.jsx` (app). It never signs anyone in: it reads
  the user auth already has (`useSignedInUser()` in `identity.js`, `onAuthStateChanged` only),
  so pages without a sign-in of their own start nothing. Device-only (local) users have none.
  Once the plan has loaded, or auth says nobody is signed in, it calls `noteProKnown()`, which
  the native app's ad start waits on (`whenProKnown()` in `src/ads/pro.js`).
- A failed snapshot keeps the last known plan; a new user swaps the listener and clears it.

### Badges

`src/phone/ProBadge.jsx` shows `Pro`. Clients can only read their own
entitlement, so the badge only ever follows the viewer's own name:

- Tally: the viewer's own name in the voter list under the bars.
- Vote page: the inviter line, when the viewer is the bet's creator.
- Reveal (tally and vote page): the headline when it is about the viewer ("You called it.").
- My bets: the page heading.

Nobody else's plan is fetched or shown.

### Early-access bet types

`EARLY_ACCESS_TYPES` in `proConfig.js` is empty. With `NEXT_PUBLIC_PRO_EARLY_TYPES=1` and a Pro
member, the type picker lists those entries after the regular types (with a Pro badge). A real
type also needs CreateForm and model support before it goes in the list.

### Paywall: the Pro sheet

`src/phone/ProSheet.jsx` (UX spec, Oct 20): a bottom sheet that slides up over the page that
opened it, portaled to `document.body`. `src/phone/Paywall.jsx` is `/pro` (web
`app/(chrome)/pro/page.js`, app route `pro`): the same sheet on its own page. With
`NEXT_PUBLIC_PRO_PAYWALL` off the web route is a real 404 and the app shows the not-found page.

Top to bottom: the close X (the shared `.overlay-close`, a soft 36px circle in full ink with a
44px tap area), a green hero with a white `Pro` badge, `All the bets. None of the ads.` (a no-break space
before `ads.`, and `text-wrap: balance`, so `ads.` never wraps alone) and
`Friends always play free.`, five benefit rows, the price, the fine print and
`Restore purchase · Terms · Privacy`; pinned above the safe area, the main button and
`Maybe later`. Every string is in `PRO_COPY` (`proConfig.js`).

- **Highlighted row.** `highlight` (`PRO_ROW`) tints one benefit row: 1 (No ads) from `/pro` and
  the Go Pro links, 3 from a locked Run it back, 4 from the locked Friends (head-to-head) filter.
- **Price.** One plan, so one block under the benefit rows: `$3/mo` with
  `Billed monthly. Cancel anytime.` below it. No plan label, no radio, nothing to pick. Nothing
  loads before it shows (the sheet never waits on a read, so there is no skeleton); a plan that
  arrives later as Pro swaps in the success screen.
- **Fine print.** `Pro renews at $3/mo until you cancel in Settings.`
- **Main button.** Always `Coming soon`, disabled, for anyone not already Pro: nothing sells
  Pro yet, so the sheet never offers a dead `Get Pro`. A real checkout (Stripe, #89; store IAP
  later) is what turns it back into `Get Pro`. `PRO_COPY.getPro` and `PRO_COPY.buying` stay in
  `proConfig.js` for that. `Couldn’t finish that. Try again.` shows above it when Restore fails.
- **Restore purchase** re-reads `entitlements/{uid}` from the server (`fetchEntitlement` in
  `entitlementApi.js`, via `refreshEntitlement()` in `useEntitlement.js`, which shares the result
  with every screen and the ad service). Pro found: `Restored. You’re Pro.`; none:
  `Nothing to restore on this account.` above the button. No store receipts are checked yet.
- **Terms / Privacy** link to `NEXT_PUBLIC_TERMS_URL` / `NEXT_PUBLIC_PRIVACY_URL` in a new tab,
  each only when set; the dots only sit between links that show.
- **Success screen.** A Pro member (already Pro on arrival, or just restored) sees a
  large Pro badge and `You’re Pro. No more ads.`, and `Back to my bets`.

### Entry points and locks

Go Pro (`GoProLink`, to `/pro`), only with the paywall on, never for a Pro member, never on the
vote or tally pages: a muted text link under the ad thank-you note, under Start a bet on Home,
and under the phone sign-in on signed-out My bets (there is no My bets header there); an
outlined chip right of the My bets heading when signed in.

Locked features (`ProLock.jsx`): with the paywall on and no Pro, Run it back (tally reveal) and
the Friends head-to-head filter on My bets keep their look plus a small outlined `Pro` chip, and
a tap opens the sheet on their row. With the paywall off they work for everyone. The lock is
client-side only: the rules don't check Pro for a rematch (it is an ordinary bet create) and
head-to-head stats are computed from bets the creator can already read.

**Not done: the "4th bet" prompt.** Counting a creator's bets in Create would need a
new query (My bets' list isn't loaded there), so for now creation is never blocked. TODO: count
created bets (server-side counter on the user, or the My bets query) and show the paywall when a
non-Pro creator starts bet 4; enforce the limit in rules or a server route if it should be more
than a prompt.

## Flags

| Variable | Default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_PRO_PAYWALL` | off | `/pro`, the Pro sheet, the Go Pro entry points and the Pro locks. Web only: always off in the native app (see below). |
| `NEXT_PUBLIC_PRO_EARLY_TYPES` | off | Early-access types for Pro members. |
| `NEXT_PUBLIC_TERMS_URL` | unset | The Pro sheet's Terms link. Hidden when unset. |
| `NEXT_PUBLIC_PRIVACY_URL` | unset | The Pro sheet's Privacy link. Hidden when unset. |

The `NEXT_PUBLIC_*` flags are inlined by Next for the web and defined by `mobile/vite.config.mjs`
for the app, like `NEXT_PUBLIC_ADS_ENABLED`. Only `1` turns a flag on.

`NEXT_PUBLIC_PRO_PAYWALL` must stay off in the native store builds (Capacitor iOS and Android,
`mobile/`) until store In-App Purchase is wired: the stores do not allow selling digital goods any
other way. `mobile/vite.config.mjs` enforces it by always defining the flag as off, whatever the
build env says (tested in `mobile/viteConfig.test.js`). Turn it back on there only together with
StoreKit and Play Billing.

## TODOs for real billing

- **Store billing.** iOS: StoreKit 2 (auto-renewable subscription for Pro). Android: Play
  Billing (subscription). Web: Stripe Checkout.
  RevenueCat could front all three; if used, set `source: 'revenuecat'` and let its webhooks
  write entitlements.
- **Server-side receipt validation.** Never trust the client: verify App Store signed
  transactions (App Store Server API) and Play purchase tokens (Google Play Developer API) on the
  server before writing `entitlements/{uid}`.
- **Webhooks.** App Store Server Notifications v2, Play Real-time Developer Notifications, Stripe
  webhooks: renewals (move `expiresAt`), refunds and revocations (remove the plan), billing retry / grace periods, expiry.
- **Restore purchases.** The sheet's `Restore purchase` (required by App Review) only re-reads
  the entitlement today. It must also re-validate the store's receipts for the signed-in user
  (a server route) and rewrite the entitlement before it reads. Decide
  how a purchase follows a user who changes phone number (new uid).
- **Paid-bet gating.** The 4th-bet prompt above, and server or rules enforcement if the free limit
  should be hard.
- ~~**Mock removal.**~~ Done: the mock purchase route, its flags and the client call are gone.
  See [pre-launch cleanup](#pre-launch-cleanup) for the leftover Vercel variables.
- **App Store review notes.** Digital goods inside the iOS app must use In-App Purchase (no
  Stripe links in the app, unless a permitted external-purchase entitlement applies). Show price,
  period and auto-renew terms on the paywall, link the Terms of Use and Privacy Policy, include
  Restore Purchases, and give App Review a test account. Play has the equivalent rules for Play Billing.

## Pre-launch cleanup

The test-only mock purchase is gone: no route (`/api/pro/mock-purchase` is a 404 like any
unknown path), no flags read by the code, no client call. What is left, by hand:

1. **Entitlement data.** Production has 0 `entitlements` docs, so there is nothing to delete.
   If a `source == 'mock'` or legacy founder doc ever shows up, it still reads as Pro (see
   [Data model](#data-model)); delete it in the Firebase console. `meta/founders` is not read
   by anything; delete it if it is still there.
2. **Leftover Vercel variables.** Nothing reads `PRO_MOCK_PURCHASE`, `PRO_MOCK_UIDS` or
   `NEXT_PUBLIC_PRO_MOCK_PURCHASE` any more, so they are harmless, but unset them in the Vercel
   dashboard wherever they are still set, including the preview variables scoped to the
   `epic/ads-pro` branch.

## Overlap with open branches

- **#89 `feature/stripe-web-pro`** was written against the mock and keeps it as a fallback
  beside Stripe: `purchasable = stripeCheckout || proMockPurchaseEnabled()`, imports of
  `requestMockPurchase` and `proMockPurchaseEnabled`, `app/api/pro/mock-purchase`, and edits to
  `src/server/proPurchase.js` (which imports the removed `PRO_PERIOD_DAYS`). After this change
  lands, #89 should drop the mock fallback and set `purchasable = stripeCheckout` only, delete
  its edits to `proPurchase.js` and the mock route (both deleted here), drop the mock flag from
  `proConfig.js`, `mobile/vite.config.mjs` and their tests, and stop stubbing
  `requestMockPurchase` in `src/setupTests.js`, `mobile/e2e/app.spec.js` and
  `scripts/screenshots.mjs`. Expect conflicts in `src/phone/ProSheet.jsx` (here the buy path,
  the `buying` state and `mainLabel` were removed and the main button is a fixed disabled
  `Coming soon`; #89 has to bring back a Stripe-only buy path), `src/phone/entitlementApi.js`
  (`requestMockPurchase`, the `auth`/`apiUrl` imports and the abort controller in
  `withTimeout` were removed; #89's `postWithToken` / `requestCheckout` /
  `requestBillingPortal` refactor needs them back), `src/phone/proConfig.js`,
  `src/phone/entitlementApi.test.js`, `src/phone/proConfig.test.js`, `src/setupTests.js`,
  `mobile/viteConfig.test.js`, this file and `docs/DEVELOPMENT.md`; and a modify/delete conflict
  on `src/server/proPurchase.js` (resolve by deleting it).
- **#91 `feature/server-pro-check`** (`POST /api/bets`) does not use the mock purchase. It only
  overlaps on docs: this file (the intro, the locks paragraph and the flags table) and the
  environment variable table in `docs/DEVELOPMENT.md`, where the mock rows were removed here.
