# Pro tier

Pro is $3/mo, the only plan: no ads, the Pro badge, Run it back, head-to-head stats and early
access to new bet types. Creating bets is never capped: a creator without Pro makes as many bets
as they like, with ads. With the paywall on, the server checks Pro only for Run it back and
early-access types (see [Server-side Pro checks](#server-side-pro-checks)). Bettors (anyone who
only picks a side) are always free and never need an account.

Today Pro is a data model, rules, a client listener, badges, a flagged paywall and a
preview-only mock purchase. **No real payment exists yet**; see [TODOs](#todos-for-real-billing).
Pro already turns ads off (see [docs/ADS.md](ADS.md)).

## Data model

`entitlements/{uid}`, one doc per member, written only by the Admin SDK:

| Field | Type | Notes |
| --- | --- | --- |
| `plan` | `'pro'` | The only plan sold. Legacy docs may say `'founder'`: see below. |
| `source` | `'mock' \| 'storekit' \| 'play' \| 'stripe' \| 'revenuecat' \| 'admin'` | Who granted it. Only `mock` is written today. |
| `since` | timestamp | Server time of the grant. |
| `expiresAt` | timestamp or `null` | End of the paid period. Missing or `null` means no expiry. |

**Legacy founder docs.** Before the Founder tier was dropped, the mock purchase could write
`{ plan: 'founder', source: 'mock', since, founderNumber, expiresAt: null }` (lifetime). Those
docs still read as Pro, forever, whatever `expiresAt` says, with the plain `Pro` badge: the
number is never shown. Nothing writes that shape any more, and a legacy founder who buys Pro
again keeps their doc unchanged (a 30 day plan would cut lifetime short).

Pure helpers in `src/phone/entitlement.js`:

- `isProEntitlement(ent, now)`: pro when `expiresAt` is missing, `null`, or later than `now`;
  a legacy founder doc always. Accepts Firestore Timestamps, Dates, millis.
- `badgeFor(ent, now)`: `{ kind: 'pro' }` for any live plan, or `null`.

Pricing, flags and the Pro sheet's strings live in `src/phone/proConfig.js`
(`PRO_MONTHLY_USD`, `PRO_PERIOD_DAYS`, `EARLY_ACCESS_TYPES`, `PRO_ROW`, `PRO_COPY`). The errors
for a create the server refuses are in `src/phone/createErrors.js` (`CREATE_ERROR_COPY`; see
[Create errors](#create-errors)).

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
a tap opens the sheet on their row. With the paywall off they work for everyone. With the paywall
on, the server also refuses a rematch without Pro (see
[Server-side Pro checks](#server-side-pro-checks)); head-to-head stats stay a client lock, since
they are computed from bets the creator can already read.

Creating a bet is not a Pro feature and has no lock or limit.

## Server-side Pro checks

Launch step 11: every Pro gate, and where it is enforced.

| Gate | Before | Now | Caveat |
| --- | --- | --- | --- |
| No ads | Client: `src/ads/adService.js` skips ads when `isPro()` (`src/ads/pro.js`, filled from `entitlements/{uid}`). Not tied to the paywall flag. | Unchanged, client only. | Ads are shown by the client (AdMob, the web house ad); there is no ad API to gate, so a patched client can always hide ads. Nothing to enforce. |
| Run it back | Client lock: `useProLocked()` in `RunItBack.jsx`. The write was a plain client create. | Paywall on: `POST /api/bets` refuses a create with `rematchOf` unless the caller is Pro (`403 pro-required`). Paywall off: unchanged, client create for everyone. | The same bet typed into Create without the link is an ordinary bet, which anyone can make. See the rules caveat below. |
| Head-to-head stats | Client lock: `useProLocked()` in `MyBets.jsx`; `friendStats()` over My bets. | Unchanged, client only. | Computed from bets the creator can already list; there is no data to withhold. |
| Early-access types | Client: `visibleEarlyTypes()` in `TypePicker.jsx` (flag and Pro). | Also on the server: with the paywall on, `POST /api/bets` refuses a type in `EARLY_ACCESS_TYPES` unless `NEXT_PUBLIC_PRO_EARLY_TYPES=1` and the caller is Pro (`403 pro-required`). | The list is empty, so nothing is refused today. With the paywall off the client writes the bet and only the picker hides the types. |
| Creating bets | Not a Pro feature. | Not capped, with or without Pro or the paywall: `POST /api/bets` never counts a creator's bets. | Free creators see ads. |
| Pro badge, Go Pro, `/pro`, the Pro sheet | Display and entry points. | Unchanged. | Not privileges; nothing to enforce on a write. |

### `POST /api/bets`

`app/api/bets/route.js` and `src/server/createBet.js` (tests: `src/server/createBet.test.js`,
`src/server/createRoute.test.js`). Pro is read by `src/server/proEntitlement.js`, which reads
`entitlements/{uid}` with the Admin SDK and calls `isProEntitlement` from
`src/phone/entitlement.js` (tests: `src/server/proEntitlement.test.js`), so expiry and legacy
founder plans count exactly as they do in the app. Body: `{ fields }`, the same fields Create and
Run it back pass to `saveBet(null, fields)`. Answers `{ code }`.

Guards, in order:

1. **404** `not-found` unless `NEXT_PUBLIC_PRO_PAYWALL === '1'` (`proPaywallEnabled()`, the same
   check the app uses). OPTIONS too. Nothing is read before this check.
2. **401** `unauthorized` without a bearer token, or with one the Admin SDK can't verify.
3. **403** `forbidden` without a `phone_number` claim (an anonymous bettor), or with a
   `createdByID` in the fields that isn't the token's uid. The uid always comes from the token.
4. **400** `invalid-bet` when `fields` is not an object.
5. **403** `pro-required` for a rematch (`rematchOf` set) or an early-access type without Pro
   (early types also need `NEXT_PUBLIC_PRO_EARLY_TYPES=1`).
6. **503** `not-configured` without `FIREBASE_SERVICE_ACCOUNT`; **500** `server` otherwise.

There is no count of the caller's bets: a creator without Pro can always create a bet that is
neither a rematch nor an early-access type. The Pro check and the write are one transaction. The
Admin SDK bypasses `firestore.rules`, so the route applies the create rule itself:
the bet is written in the caller's name, open, with no winner, no votes and no result fields
(`settledAt`, `settlement`, `calledOff` are dropped), in the same shape the client writes
(`newBetDoc` in `src/phone/newBet.js`, shared with `createBet` in `api.js`).

**Client.** `createBet` in `src/phone/api.js` (behind `saveBet(null, fields)`, used by Create
and Run it back) calls the route only when `proPaywallEnabled()`. Any error, including `503
not-configured`, fails closed: there is no fallback to the client write, which would skip the
checks. With the paywall off it writes `bets/{code}` from the client exactly as before and never
calls the route, so it needs no Admin credentials. The native app forces the paywall off, so it
never calls this route. Editing an existing bet is unchanged (client update).

### Rules caveat (a rules deploy needs sign-off)

`firestore.rules` is **unchanged**. Its `bets/{code}` create rule still lets any phone-verified
user create a bet in their own name, so with the paywall on, a patched client can still skip
`POST /api/bets` and write the bet (rematch link included) directly: the server checks stop
the real app, not a determined user. Rules can't read `NEXT_PUBLIC_PRO_PAYWALL`, so closing that
gap can't be a paywall-dependent rule, and denying client creates outright would break the
paywall-off path, which still writes bets from the client.

To make the Run it back and early-type checks hard against patched clients when the paywall
launches, one of these is needed,
each a separate decision and a rules deploy:

- deploy a rules version with the client `create` on `bets/{code}` removed, together with (never
  before) the paywall-on web build, since every create then goes through the route; or
- have rules read a server-written flag doc (for example `config/pro { paywall: true }`) and
  refuse client creates while it is set. That is a second source of truth for the flag, so it
  would have to be set in the same step as `NEXT_PUBLIC_PRO_PAYWALL`.

Either way, cover it in `rules/firestore.rules.test.js` and follow the review note at the top of
`firestore.rules`.

### Create errors

Create and Run it back show the same lines for a failed save, from `CREATE_ERROR_COPY` and
`createSaveError()` in `src/phone/createErrors.js`, rendered by `src/phone/CreateSaveError.jsx`
(the alert line and its button). A coded error gets its own line whatever the error's message
says:

| Error | Line | Button |
| --- | --- | --- |
| `403 pro-required` | `Your Pro ended, so Run it back is locked.` | `Go Pro`: opens the Pro sheet with row 3 (`PRO_ROW.runItBack`, Run it back) highlighted. |
| `503 not-configured` | `Couldn’t check Pro right now. Try again in a bit.` | `Try again`: saves the same bet again. |
| Anything else | The error's own message (offline, `permission-denied`'s `Saving was blocked. Try again in a moment.`), else `Couldn’t save this bet. Try again.` | None; the main button saves again. |

`createBet` in `api.js` gives every route error the message `Couldn’t save this bet. Try again.`
(and a code), so a route error never shows anything else.

`pro-required` mostly reaches Run it back when a plan lapsed while the reveal was open, so the
client lock still said Pro. The same line and button show in Create if a create there is ever
refused for Pro (an early-access type; Create never sends `rematchOf`). On `pro-required` both
also re-read the entitlement (`refreshEntitlement()`), so the lock and the Pro sheet agree with
the server instead of showing the success screen. `not-configured` means the paywall is on and
`FIREBASE_SERVICE_ACCOUNT` is not set: creating fails until it is.

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
expiresAt: now + 30 days }`. A legacy founder doc is left as it is. CORS is the same
allowlist as the other routes (`src/server/http.js`).

The native app calls the production origin (`apiUrl`), where this route is a 404, and its
paywall is always off, so mock purchases only work on the web preview.

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
- **Pro create checks.** Creating is not capped. `POST /api/bets` checks Pro for Run it back and
  early-access types; the rules change in
  [Rules caveat](#rules-caveat-a-rules-deploy-needs-sign-off) is still needed if those checks
  must hold against patched clients.
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
