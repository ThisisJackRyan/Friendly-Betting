# Pro tier

Creators get 3 free bet creations, then Pro at $3/mo. Founder is lifetime Pro: $40 for the
first 100 spots, $80 for the next 500, then sold out. Bettors (anyone who only picks a side) are
always free and never need an account.

Today Pro is a data model, rules, a client listener, badges, a flagged paywall and a
preview-only mock purchase. **No real payment exists yet**; see [TODOs](#todos-for-real-billing).
Pro already turns ads off (see [docs/ADS.md](ADS.md)).

## Data model

`entitlements/{uid}`, one doc per member, written only by the Admin SDK:

| Field | Type | Notes |
| --- | --- | --- |
| `plan` | `'pro' \| 'founder'` | Founder counts as Pro, forever. |
| `source` | `'mock' \| 'storekit' \| 'play' \| 'stripe' \| 'revenuecat' \| 'admin'` | Who granted it. Only `mock` is written today. |
| `since` | timestamp | Server time of the grant. |
| `founderNumber` | number, founders only | 1 to 600, from `meta/founders`. |
| `expiresAt` | timestamp or `null` | Pro: end of the paid period. Founder: `null`. Missing or `null` on Pro means no expiry. |

`meta/founders` is `{ count }`: how many founder spots are taken. The paywall reads it to price
the next spot.

Pure helpers in `src/phone/entitlement.js`:

- `isProEntitlement(ent, now)`: founder always; pro when `expiresAt` is missing, `null`, or later
  than `now`. Accepts Firestore Timestamps, Dates, millis.
- `badgeFor(ent, now)`: `{ kind: 'pro' }`, `{ kind: 'founder', number? }` or `null`.

Pricing, flags and every Pro string live in `src/phone/proConfig.js` (`FREE_BETS`,
`PRO_MONTHLY_USD`, `FOUNDER_TIERS`, `founderOffer(count)`, `EARLY_ACCESS_TYPES`, `PRO_COPY`).
The server route uses the same `founderOffer`, so the paywall and the counter agree.

## Rules

`firestore.rules`:

```
match /entitlements/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow create, update, delete: if false;
}
match /meta/founders {
  allow get: if true;
  allow list, create, update, delete: if false;
}
```

A member reads only their own entitlement; no client can grant, extend, edit or delete one,
founder numbers included. The founder count is public (it is not sensitive and the paywall
needs it), and client-unwritable. The rest of `meta` stays closed by default. Covered in
`rules/firestore.rules.test.js` (`pro entitlements`, `founder counter`).

## Client

- `src/phone/entitlementApi.js`: `subscribeEntitlement(uid, cb)` (onSnapshot of the user's own
  doc), `fetchFounderCount()`, `requestMockPurchase(plan)`. The only Pro reads. Jest mocks it for
  every test in `src/setupTests.js`.
- `src/phone/useEntitlement.js`: one shared listener for the signed-in user.
  `useEntitlement()` returns `{ entitlement, isPro, loading }` and keeps `src/ads/pro.js`
  current through `setProEntitlement`, so the ad service's synchronous `isPro()` is right on
  every screen. `useEntitlementState()` and `useProBadge(uid)` read it without listening.
- `src/phone/EntitlementSync.jsx` mounts the listener once at the root: `app/layout.js` (web,
  every page including `/b/`) and `mobile/App.jsx` (app). Device-only (local) users have none.
- A failed snapshot keeps the last known plan; a new user swaps the listener and clears it.

### Badges

`src/phone/ProBadge.jsx` shows `Pro`, `Founder` or `Founder #N`. Clients can only read their own
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

### Paywall

`src/phone/Paywall.jsx` at `/pro` (web `app/(chrome)/pro/page.js`, app route `pro`). With
`NEXT_PUBLIC_PRO_PAYWALL` off the web route is a real 404 and the app shows the not-found page.

Copy (all from `PRO_COPY`): `Go Pro`, `3 free bets, then $3/mo.`, `No ads.`, the founder line,
`Picking a side is always free.`, and `Get Pro`, `Get Founder`, `Not now`. The founder line is
data-driven from `meta/founders`: `Founder: $40 lifetime for the first 100.` while fewer than 100
are taken, `Founder: $80 lifetime for the next 500.` up to 600, then
`Founder spots are sold out.` (and no Get Founder button). If the count can't be read, the founder
line and button are left out rather than guessing a price.

Buttons only do something with `NEXT_PUBLIC_PRO_MOCK_PURCHASE=1` (previews). Otherwise they are
disabled with `Coming soon` under them. A Pro member sees their badge and
`You’re all set. No ads.` instead of the buttons.

Entry points: `/pro` directly, and a `Go Pro` link on My bets for a signed-in creator without Pro
(flag on). **Not done: the "4th bet" prompt.** Counting a creator's bets in Create would need a
new query (My bets' list isn't loaded there), so for now the paywall is only linked from My bets
and creation is never blocked. TODO: count created bets (server-side counter on the user, or the
My bets query) and show the paywall when a non-Pro creator starts bet 4; enforce the limit in
rules or a server route if it should be more than a prompt.

## Flags

| Variable | Default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_PRO_PAYWALL` | off | `/pro` and the My bets link. |
| `NEXT_PUBLIC_PRO_EARLY_TYPES` | off | Early-access types for Pro members. |
| `NEXT_PUBLIC_PRO_MOCK_PURCHASE` | off | Paywall buttons call the mock route. Previews only. |
| `PRO_MOCK_PURCHASE` | off | Server: the mock route answers at all. |

The `NEXT_PUBLIC_*` flags are inlined by Next for the web and defined by `mobile/vite.config.mjs`
for the app, like `NEXT_PUBLIC_ADS_ENABLED`. Only `1` turns a flag on.

## Mock purchase

`POST /api/pro/mock-purchase` with `{ plan: 'pro' | 'founder' }` and
`Authorization: Bearer <Firebase ID token>`. Code: `app/api/pro/mock-purchase/route.js`,
`src/server/proPurchase.js`. Tests: `src/server/proPurchase.test.js`.

Guards, in order:

1. **404** unless `PRO_MOCK_PURCHASE === '1'` and the deploy is not production:
   `VERCEL_ENV` of `preview` or `development` on Vercel (previews run with
   `NODE_ENV=production`, so `VERCEL_ENV` decides there), or, off Vercel,
   `NODE_ENV !== 'production'`. `VERCEL_ENV=production` is always a 404, as is any other
   `VERCEL_ENV`. OPTIONS is a 404 too. Nothing is read before this check.
2. **401** without a bearer token or with one the Admin SDK can't verify. The uid always comes
   from the token; a `uid` in the body is ignored.
3. **400** `invalid-plan` for anything but `pro` or `founder`.
4. **409** `sold-out` for founder once 600 spots are taken.
5. **503** without `FIREBASE_SERVICE_ACCOUNT`.

Writes (one transaction): Pro is `{ plan: 'pro', source: 'mock', since: serverTimestamp,
expiresAt: now + 30 days }`. Founder reads `meta/founders`, takes `count + 1` as
`founderNumber`, writes the new count and `{ plan: 'founder', source: 'mock', since,
founderNumber, expiresAt: null }`. A founder buying again changes nothing. CORS is the same
allowlist as the other routes (`src/server/http.js`).

The native app calls the production origin (`apiUrl`), where this route is a 404, so mock
purchases only work on the web preview (or a native build pointed at a preview).

## TODOs for real billing

- **Store billing.** iOS: StoreKit 2 (auto-renewable subscription for Pro, non-consumable for
  Founder). Android: Play Billing (subscription + one-time product). Web: Stripe Checkout.
  RevenueCat could front all three; if used, set `source: 'revenuecat'` and let its webhooks
  write entitlements.
- **Server-side receipt validation.** Never trust the client: verify App Store signed
  transactions (App Store Server API) and Play purchase tokens (Google Play Developer API) on the
  server before writing `entitlements/{uid}`.
- **Webhooks.** App Store Server Notifications v2, Play Real-time Developer Notifications, Stripe
  webhooks: renewals (move `expiresAt`), refunds and revocations (remove the plan, and for a
  refunded founder decide whether the number is retired), billing retry / grace periods, expiry.
- **Restore purchases.** A Restore button on the paywall (required by App Review) that
  re-validates the store's receipts for the signed-in user and rewrites the entitlement. Decide
  how a purchase follows a user who changes phone number (new uid).
- **Founder counter integrity.** Assign numbers only in the validated-purchase transaction, make
  it idempotent per transaction id (a retried webhook must not take a second number), and add an
  admin audit that `count` equals the number of founder entitlements.
- **Paid-bet gating.** The 4th-bet prompt above, and server or rules enforcement if the free limit
  should be hard.
- **Mock removal.** Before launch, delete the mock route and `NEXT_PUBLIC_PRO_MOCK_PURCHASE`, or
  keep them strictly preview-only.
- **App Store review notes.** Digital goods inside the iOS app must use In-App Purchase (no
  Stripe links in the app, unless a permitted external-purchase entitlement applies). Show price,
  period and auto-renew terms on the paywall, link the Terms of Use and Privacy Policy, include
  Restore Purchases, and give App Review a test account. Founder must be clearly described as a
  one-time lifetime purchase. Play has the equivalent rules for Play Billing.
