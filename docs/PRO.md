# Pro tier

Pro is $3/mo, the only plan: no ads, Run it back and head-to-head stats. Creating bets is not capped
(`FREE_BETS` is not enforced yet). Bettors (anyone who only picks a side) are always free and never
need an account.

Today Pro is a data model, rules, a client listener, badges, a flagged paywall and a
preview-only mock purchase. **No real payment exists yet**; see [TODOs](#todos-for-real-billing).
Web billing with Stripe Checkout is built behind flags, off by default and test mode only: see
[docs/STRIPE-WEB-PRO.md](STRIPE-WEB-PRO.md). Pro already turns ads off (see [docs/ADS.md](ADS.md)).

## Data model

`entitlements/{uid}`, one doc per member, written only by the Admin SDK:

| Field | Type | Notes |
| --- | --- | --- |
| `plan` | `'pro'` | The only plan sold. Legacy docs may say `'founder'`: see below. |
| `source` | `'mock' \| 'storekit' \| 'play' \| 'stripe' \| 'revenuecat' \| 'admin'` | Who granted it. `mock` on previews; `stripe` only with the Stripe flags on ([STRIPE-WEB-PRO.md](STRIPE-WEB-PRO.md)). Nothing reads it to decide Pro. |
| `since` | timestamp | Server time of the grant. |
| `expiresAt` | timestamp or `null` | End of the paid period. Missing or `null` means no expiry. |
| `stripeCustomerId`, `stripeSubscriptionId`, `stripeStatus`, `stripeEventCreated` | string, string, string, number | Only on docs the Stripe webhook touched. See [STRIPE-WEB-PRO.md](STRIPE-WEB-PRO.md). |

**Legacy founder docs.** Before the Founder tier was dropped, the mock purchase could write
`{ plan: 'founder', source: 'mock', since, founderNumber, expiresAt: null }` (lifetime). Those
docs still read as Pro, forever, whatever `expiresAt` says, with the plain `Pro` badge: the
number is never shown. Nothing writes that shape any more, and a legacy founder who buys Pro
again keeps their doc unchanged (a 30 day plan would cut lifetime short).

Pure helpers in `src/phone/entitlement.js`:

- `isProEntitlement(ent, now)`: pro when `expiresAt` is missing, `null`, or later than `now`;
  a legacy founder doc always. Accepts Firestore Timestamps, Dates, millis.
- `badgeFor(ent, now)`: `{ kind: 'pro' }` for any live plan, or `null`.

Pricing, flags and every Pro string live in `src/phone/proConfig.js` (`FREE_BETS`,
`PRO_MONTHLY_USD`, `PRO_PERIOD_DAYS`, `EARLY_ACCESS_TYPES`, `PRO_COPY`).

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
  doc), `fetchEntitlement(uid)` (one server read of it, for Restore purchase),
  `requestMockPurchase(plan)`. The only Pro reads. Both treat `permission-denied` on the
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
- **Main button.** `Get Pro`, enabled as soon as the sheet shows; `Getting you set…` while
  buying (the X, Maybe later, Escape and the scrim do nothing until it ends); `Coming soon`,
  disabled, without `NEXT_PUBLIC_PRO_MOCK_PURCHASE=1`. A failed purchase shows
  `Couldn’t finish that. Try again.` above it.
- **Restore purchase** re-reads `entitlements/{uid}` from the server (`fetchEntitlement` in
  `entitlementApi.js`, via `refreshEntitlement()` in `useEntitlement.js`, which shares the result
  with every screen and the ad service). Pro found: `Restored. You’re Pro.`; none:
  `Nothing to restore on this account.` above the button. No store receipts are checked yet.
- **Terms / Privacy** link to `NEXT_PUBLIC_TERMS_URL` / `NEXT_PUBLIC_PRIVACY_URL` in a new tab,
  each only when set; the dots only sit between links that show.
- **Success screen.** A Pro member (already Pro on arrival, or just bought or restored) sees a
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
| `NEXT_PUBLIC_PRO_MOCK_PURCHASE` | off | Paywall buttons call the mock route. Previews only. |
| `NEXT_PUBLIC_STRIPE_WEB_PRO` | off | Web only: Get Pro goes to Stripe Checkout (wins over the mock flag) and a Stripe member gets Manage subscription. Server flags and secrets in [STRIPE-WEB-PRO.md](STRIPE-WEB-PRO.md). |
| `NEXT_PUBLIC_TERMS_URL` | unset | The Pro sheet's Terms link. Hidden when unset. |
| `NEXT_PUBLIC_PRIVACY_URL` | unset | The Pro sheet's Privacy link. Hidden when unset. |
| `PRO_MOCK_PURCHASE` | off | Server: the mock route answers at all. |
| `PRO_MOCK_UIDS` | empty | Server: testers' uids allowed to use the mock route, comma separated. Empty or unset means nobody. |

The `NEXT_PUBLIC_*` flags are inlined by Next for the web and defined by `mobile/vite.config.mjs`
for the app, like `NEXT_PUBLIC_ADS_ENABLED`. Only `1` turns a flag on.

`NEXT_PUBLIC_PRO_PAYWALL` must stay off in the native store builds (Capacitor iOS and Android,
`mobile/`) until store In-App Purchase is wired: the stores do not allow selling digital goods any
other way. `mobile/vite.config.mjs` enforces it by always defining the flag as off, whatever the
build env says (tested in `mobile/viteConfig.test.js`). Turn it back on there only together with
StoreKit and Play Billing.

## Mock purchase

`POST /api/pro/mock-purchase` with `{ plan: 'pro' }` and
`Authorization: Bearer <Firebase ID token>`. Code: `app/api/pro/mock-purchase/route.js`,
`src/server/proPurchase.js`. Tests: `src/server/proPurchase.test.js`.

Guards, in order:

1. **404** unless `PRO_MOCK_PURCHASE === '1'` and the deploy is not production:
   `VERCEL_ENV` of `preview` or `development` on Vercel (previews run with
   `NODE_ENV=production`, so `VERCEL_ENV` decides there), or, off Vercel,
   `NODE_ENV !== 'production'`. `VERCEL_ENV=production` is always a 404, as is any other
   `VERCEL_ENV`. OPTIONS is a 404 too. Nothing is read before this check.
2. **401** without a bearer token, or with one the Admin SDK can't verify. The token is checked
   with `verifyIdToken(token, true)`, so a revoked token is a 401 too. The uid always comes
   from the token; a `uid` in the body is ignored.
3. **403** `forbidden` for an anonymous session (`firebase.sign_in_provider === 'anonymous'`), a
   token without a `phone_number` claim, or a uid not listed in `PRO_MOCK_UIDS`. Empty or unset
   `PRO_MOCK_UIDS` means everyone gets a 403.
4. **400** `invalid-plan` for anything but `pro` (`founder` included).
5. **503** without `FIREBASE_SERVICE_ACCOUNT`.

Why the allowlist: there is only one Firebase project, so a mock purchase on a preview writes a
real `entitlements/{uid}`. Without it, any bettor (an anonymous session) on a preview could make
itself Pro. The checks live
in `authorizeMockBuyer` and `mockBuyerAllowed` (`src/server/proPurchase.js`), which never log
tokens, phone numbers or uids. To add a tester, put their uid in `PRO_MOCK_UIDS` on the preview
deploy.

Writes (one transaction): Pro is `{ plan: 'pro', source: 'mock', since: serverTimestamp,
expiresAt: now + 30 days }`. A legacy founder doc is left as it is, and so is a live Stripe plan;
any Stripe ids already on the doc are kept ([STRIPE-WEB-PRO.md](STRIPE-WEB-PRO.md)). CORS is the same
allowlist as the other routes (`src/server/http.js`).

The native app calls the production origin (`apiUrl`), where this route is a 404, and its
paywall is always off, so mock purchases only work on the web preview.

## TODOs for real billing

- **Store billing.** iOS: StoreKit 2 (auto-renewable subscription for Pro). Android: Play
  Billing (subscription). Web: Stripe Checkout, built behind flags in test mode
  ([STRIPE-WEB-PRO.md](STRIPE-WEB-PRO.md)); live mode is still to do.
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
- **Mock removal.** Before launch, delete the mock route and `NEXT_PUBLIC_PRO_MOCK_PURCHASE`, or
  keep them strictly preview-only. Either way, do the [pre-launch cleanup](#pre-launch-cleanup).
- **App Store review notes.** Digital goods inside the iOS app must use In-App Purchase (no
  Stripe links in the app, unless a permitted external-purchase entitlement applies). Show price,
  period and auto-renew terms on the paywall, link the Terms of Use and Privacy Policy, include
  Restore Purchases, and give App Review a test account. Play has the equivalent rules for Play Billing.

## Pre-launch cleanup

Mock purchases write to the one production Firebase project, so testers' mock plans are real
data. Before real billing launches, by hand (nothing does this automatically):

1. **Turn the mock off.** Unset `PRO_MOCK_PURCHASE`, `PRO_MOCK_UIDS` and
   `NEXT_PUBLIC_PRO_MOCK_PURCHASE` in every Vercel environment, and redeploy.
2. **Delete every mock entitlement.** Every `entitlements` doc with `source == 'mock'`. In the
   Firebase console, filter the `entitlements` collection on `source == mock` and delete the
   results, or run a one-off Admin SDK script from a trusted machine with the service account:

   ```js
   const snap = await db.collection('entitlements').where('source', '==', 'mock').get();
   const batch = db.batch();
   snap.docs.forEach((doc) => batch.delete(doc.ref));
   await batch.commit(); // over 500 docs: commit in chunks of 500
   ```

   Count the docs first and check that none has another `source`.
3. **Legacy founder docs.** Step 2 already deletes every mock one (they are all
   `source == 'mock'`). If `meta/founders` is still in the database, delete it: nothing reads it.
4. **Check.** `entitlements` has no `source == 'mock'` docs, `meta/founders` is gone, and
   `POST /api/pro/mock-purchase` is a 404 on every deploy.

Do not commit the script or wire it into a build or deploy step.
