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
  allow get: if request.auth != null && request.auth.uid == uid;
  allow list, create, update, delete: if false;
}
match /meta/founders {
  allow get: if true;
  allow list, create, update, delete: if false;
}
```

A member gets only their own entitlement, one doc at a time (no query can list them); no client can grant, extend, edit or delete one,
founder numbers included. The founder count is public (it is not sensitive and the paywall
needs it), and client-unwritable. The rest of `meta` stays closed by default. Covered in
`rules/firestore.rules.test.js` (`pro entitlements`, `founder counter`).

## Client

- `src/phone/entitlementApi.js`: `subscribeEntitlement(uid, cb)` (onSnapshot of the user's own
  doc), `fetchEntitlement(uid)` (one server read of it, for Restore purchase),
  `fetchFounderCount()`, `requestMockPurchase(plan)`. The only Pro reads. Jest mocks it for
  every test in `src/setupTests.js`.
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

### Paywall: the Pro sheet

`src/phone/ProSheet.jsx` (UX spec, Oct 20): a bottom sheet that slides up over the page that
opened it, portaled to `document.body`. `src/phone/Paywall.jsx` is `/pro` (web
`app/(chrome)/pro/page.js`, app route `pro`): the same sheet on its own page. With
`NEXT_PUBLIC_PRO_PAYWALL` off the web route is a real 404 and the app shows the not-found page.

Top to bottom: the close X (the shared `.overlay-close`, a soft 36px circle in full ink with a
44px tap area), a green hero with a white `Pro` badge, `All the bets. None of the ads.` and
`Friends always play free.`, five benefit rows, the plan cards, the fine print and
`Restore purchase · Terms · Privacy`; pinned above the safe area, the main button and
`Maybe later`. Every string is in `PRO_COPY` (`proConfig.js`).

- **Highlighted row.** `highlight` (`PRO_ROW`) tints one benefit row: 1 (No ads) from `/pro` and
  the Go Pro links, 3 from a locked Run it back, 4 from the locked Friends (head-to-head) filter.
- **Plan cards.** Pro `$3/mo` and Founder `$40 once` / `$80 once`, priced by `founderOffer()`
  from `meta/founders`. Founder is picked while spots remain, with `{n} of 100 spots left` (or
  `of 500` in tier 2) only once the real count has loaded. After 600, no Founder card, Pro
  picked, `Founder spots are gone.` above it. If the count can't be read, only the Pro card
  shows (no guessed price or seats). Until the count is back the cards
  are grey placeholders and the main button is disabled.
- **Main button.** `Get Pro` / `Get Founder`; `Getting you set…` while buying (cards, X and
  Maybe later disabled); `Coming soon`, disabled, without `NEXT_PUBLIC_PRO_MOCK_PURCHASE=1`. A
  failed purchase shows `Couldn’t finish that. Try again.` above it.
- **Restore purchase** re-reads `entitlements/{uid}` from the server (`fetchEntitlement` in
  `entitlementApi.js`, via `refreshEntitlement()` in `useEntitlement.js`, which shares the result
  with every screen and the ad service). Pro found: `Restored. You’re Pro.`; none:
  `Nothing to restore on this account.` above the button. No store receipts are checked yet.
- **Terms / Privacy** link to `NEXT_PUBLIC_TERMS_URL` / `NEXT_PUBLIC_PRIVACY_URL` in a new tab,
  each only when set; the dots only sit between links that show.
- **Success screen.** A Pro member (already Pro on arrival, or just bought or restored) sees a
  large badge and `You’re Pro. No more ads.` or `You’re Founder #7. No more ads.`, and
  `Back to my bets`.

### Entry points and locks

Go Pro (`GoProLink`, to `/pro`), only with the paywall on, never for a Pro member, never on the
vote or tally pages: a muted text link under the ad thank-you note, under Start a bet on Home,
and on My bets.

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

`POST /api/pro/mock-purchase` with `{ plan: 'pro' | 'founder' }` and
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
4. **400** `invalid-plan` for anything but `pro` or `founder`.
5. **409** `sold-out` for founder once 600 spots are taken.
6. **503** without `FIREBASE_SERVICE_ACCOUNT`.

Why the allowlist: there is only one Firebase project, so a mock purchase on a preview writes a
real `entitlements/{uid}` and takes a real founder number from `meta/founders`. Without it, any
bettor (an anonymous session) on a preview could make itself Pro or a Founder. The checks live
in `authorizeMockBuyer` and `mockBuyerAllowed` (`src/server/proPurchase.js`), which never log
tokens, phone numbers or uids. To add a tester, put their uid in `PRO_MOCK_UIDS` on the preview
deploy.

Writes (one transaction): Pro is `{ plan: 'pro', source: 'mock', since: serverTimestamp,
expiresAt: now + 30 days }`. Founder reads `meta/founders`, takes `count + 1` as
`founderNumber`, writes the new count and `{ plan: 'founder', source: 'mock', since,
founderNumber, expiresAt: null }`. A founder buying again changes nothing. CORS is the same
allowlist as the other routes (`src/server/http.js`).

The native app calls the production origin (`apiUrl`), where this route is a 404, and its
paywall is always off, so mock purchases only work on the web preview.

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
- **Restore purchases.** The sheet's `Restore purchase` (required by App Review) only re-reads
  the entitlement today. It must also re-validate the store's receipts for the signed-in user
  (a server route) and rewrite the entitlement before it reads. Decide
  how a purchase follows a user who changes phone number (new uid).
- **Founder counter integrity.** Assign numbers only in the validated-purchase transaction, make
  it idempotent per transaction id (a retried webhook must not take a second number), and add an
  admin audit that `count` equals the number of founder entitlements.
- **Paid-bet gating.** The 4th-bet prompt above, and server or rules enforcement if the free limit
  should be hard.
- **Mock removal.** Before launch, delete the mock route and `NEXT_PUBLIC_PRO_MOCK_PURCHASE`, or
  keep them strictly preview-only. Either way, do the [pre-launch cleanup](#pre-launch-cleanup).
- **App Store review notes.** Digital goods inside the iOS app must use In-App Purchase (no
  Stripe links in the app, unless a permitted external-purchase entitlement applies). Show price,
  period and auto-renew terms on the paywall, link the Terms of Use and Privacy Policy, include
  Restore Purchases, and give App Review a test account. Founder must be clearly described as a
  one-time lifetime purchase. Play has the equivalent rules for Play Billing.

## Pre-launch cleanup

Mock purchases write to the one production Firebase project, so testers' mock plans and founder
numbers are real data. Before real billing launches, by hand (nothing does this automatically):

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
3. **Reset the founder counter.** Set `meta/founders` back to `{ count: 0 }`, or delete the doc
   (a missing doc reads as 0). Do this after step 2, and only while no real founder has been
   sold, so no real buyer loses a number.
4. **Check.** `entitlements` has no `source == 'mock'` docs, `meta/founders` is missing or 0, and
   `POST /api/pro/mock-purchase` is a 404 on every deploy.

Do not commit the script or wire it into a build or deploy step.
