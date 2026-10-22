# Web Pro billing with Stripe

Pro ($3/mo, see [docs/PRO.md](PRO.md)) can be bought on the **website** with Stripe Checkout.
Everything here is **off by default**, **test mode only**, and **web only**: the iOS and Android
apps keep the paywall off and will use store billing (StoreKit, Play Billing) later. Nothing in
this doc changes native behavior.

With the flags off, the site is exactly what it was: every Stripe route is a 404, the Pro sheet
and `/pro` render the same markup (tested), and the mock purchase works as before.

## Architecture

```
/pro or the Pro sheet (web, NEXT_PUBLIC_STRIPE_WEB_PRO=1)
  Get Pro -> POST /api/pro/checkout (Bearer ID token)
          -> Stripe Checkout (hosted) -> back to /pro?checkout=success | cancel
Stripe -> POST /api/stripe/webhook (signed) -> entitlements/{uid} (Admin SDK)
Pro member: Manage subscription -> POST /api/pro/portal -> Stripe customer portal -> /pro
```

| Piece | File |
| --- | --- |
| Flag, secrets, test-key guard, lazy Stripe client | `src/server/stripeConfig.js` |
| Member auth, Checkout, portal, webhook logic | `src/server/stripeBilling.js` |
| Routes | `app/api/pro/checkout/route.js`, `app/api/pro/portal/route.js`, `app/api/stripe/webhook/route.js` |
| Client calls | `requestCheckout`, `requestBillingPortal` in `src/phone/entitlementApi.js` |
| Leaving for Stripe | `src/phone/billingRedirect.js` (https URLs only) |
| UI | `src/phone/ProSheet.jsx`, `src/phone/Paywall.jsx`; new copy in `STRIPE_COPY` (`src/phone/proConfig.js`) |
| Tests | `src/server/stripeConfig.test.js`, `src/server/stripeBilling.test.js`, `src/phone/ProSheet.stripe.test.jsx`, `rules/firestore.rules.test.js` (`stripe web billing`) |

### Checkout: `POST /api/pro/checkout`

1. **404** unless the server config is complete (see [Environment](#environment-variables)).
   `GET` (405 when on) and `OPTIONS` are 404 too. Nothing is read before this check.
2. **401** without a bearer token, or one `verifyIdToken(token, true)` rejects (revoked included).
3. **403** `forbidden` for an anonymous session or a token without a `phone_number` claim
   (`memberAllowed`, the same checks as the mock purchase's `mockBuyerAllowed`), and, while the
   key is a test key, for any member whose uid is not on `STRIPE_TEST_UIDS` (see
   [Test-mode allowlist](#test-mode-allowlist-stripe_test_uids)). Nothing is read before it.
4. **409** `already-pro` when `entitlements/{uid}` is a live plan of any source (Stripe, mock,
   admin, a legacy founder doc). **409** `already-subscribed` when the doc's Stripe subscription
   is still open (`active`, `trialing`, `past_due`, `unpaid`, `paused`) even if the plan has
   lapsed: the sheet sends that member to the portal instead of selling a second subscription.
5. Makes sure the member has **one Stripe customer** (see below), then creates a Checkout
   Session: `mode: 'subscription'`, `customer` = that customer (always passed), one
   `STRIPE_PRICE_ID`, `client_reference_id`, `metadata.uid` and `subscription_data.metadata.uid`
   all set to the **token's** uid (the body is never read), `success_url` / `cancel_url` =
   `STRIPE_WEB_PRO_BASE_URL` + `/pro?checkout=success|cancel`. The request's Origin and Host are
   never used. Returns `{ url }`; the sheet leaves for it.
6. **503** without `FIREBASE_SERVICE_ACCOUNT`; **500** `server` on a Stripe error (logs only its code).

**One customer per uid** (`ensureCustomer`). Without one, parallel Checkouts (two tabs, a double
tap) would each make a customer and then a subscription. When `entitlements/{uid}` has no valid
`stripeCustomerId`, the server makes the customer itself:
`stripe.customers.create({ metadata: { uid } }, { idempotencyKey: 'customer-<uid>' })`. Then in
**one transaction** it re-reads `entitlements/{uid}`: if a customer was stored meanwhile, that one
is used; otherwise it merges `stripeCustomerId` onto `entitlements/{uid}` and writes
`stripeCustomers/{customerId} = { uid }`.

- Stripe keeps an idempotency key for about **24 hours**, so parallel calls in that window get the
  same customer back. The transaction covers the rest (a retry after the key expired, a webhook
  that stored a customer first): whichever customer is stored first wins and every later
  Checkout uses it. A customer made and then not stored is empty and harmless.
- Only `stripeCustomerId` is merged: no plan fields are created or changed. A doc with only
  `stripeCustomerId` reads as **not Pro** (`isProEntitlement` needs `plan`), so the badge, ads
  and Restore treat it as no plan, and the sheet shows Get Pro without Manage subscription
  (tested in `entitlement.test.js` and `ProSheet.stripe.test.jsx`). The webhook later adds the
  plan to that doc as usual.
- A legacy founder doc is never written, not even `stripeCustomerId` (simplest to reason about:
  founder docs stay exactly as they were). A founder gets 409 `already-pro` before this, and the
  transaction refuses one too, for a race.
- The restricted key needs **write** access to Customers for this (see the dashboard setup).

No CORS headers: the route is same-origin, so the native app (which calls the production origin
from `capacitor://localhost` / `https://localhost`) can never start a Checkout.

### Webhook: `POST /api/stripe/webhook`

1. **404** with the feature off.
2. Reads the raw body (`request.text()`) and checks it with
   `stripe.webhooks.constructEvent(body, Stripe-Signature, STRIPE_WEBHOOK_SECRET)` (default 300 s
   tolerance). Any failure, or no header, is a **400** `invalid-signature`, before the database is
   touched.
3. Handles:
   - `checkout.session.completed` (subscription mode only): uid from `metadata.uid`, else
     `client_reference_id`. The session has no period end, so it retrieves the subscription.
   - `customer.subscription.created` / `updated` / `deleted`: also retrieves the subscription
     and uses Stripe's current state, not the event's copy (events arrive late and out of
     order). If Stripe no longer has it (`resource_missing`), the event's copy is used. Any
     other retrieve failure is a 500, so Stripe retries. uid from the current subscription's
     `metadata.uid`, else the event's, else from `stripeCustomers/{customerId}` (see below).
   - Anything else, or an event with no usable uid: **200** no-op, so Stripe stops retrying.
   - With a test key, a uid not on `STRIPE_TEST_UIDS`: never granted (**200** no-op, logged as
     `stripe webhook skipped: <type> not-allowlisted`, nothing written). See
     [Test-mode allowlist](#test-mode-allowlist-stripe_test_uids).
4. **500** when a write fails (Stripe retries with backoff for up to 3 days).

**Where the period end lives.** The installed `stripe` SDK (v23, API version
`2026-09-30.endive`) has no `current_period_end` on the Subscription; it is on each subscription
item (`items.data[].current_period_end`). `periodEndMillis` takes the latest item's, and still
reads the old top-level field, so an endpoint pinned to an older API version works too. A live
subscription with no period end at all is refused (500), never written as a plan without expiry.

**What it writes** (one transaction, Admin SDK):

```
entitlements/{uid}
  plan: 'pro', source: 'stripe', since, expiresAt   // the shape the app already reads
  stripeCustomerId, stripeSubscriptionId,           // for the portal and for ordering
  stripeStatus, stripeEventCreated                  // last applied status and event.created (s)
stripeEvents/{eventId}      { type, created, processedAt }   // server only
stripeCustomers/{customerId} { uid }                         // server only
```

(Checkout itself writes only `stripeCustomerId` onto `entitlements/{uid}` and the
`stripeCustomers` mapping, before the first purchase; see above.)

- **Live** (`active`, `trialing`): `expiresAt` = the period end, so Pro lapses on its own if
  webhooks ever stop. A renewal moves `expiresAt` and keeps `since`.
- **Not live** (`past_due`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, `canceled`):
  the doc stays and `expiresAt` becomes now (or `ended_at` if earlier, never later than it
  already was), so `isProEntitlement` returns false. Nothing is deleted. A failed renewal
  (`past_due`) ends Pro at once; if Stripe's retry then succeeds, `updated` -> `active` brings it
  back. (If a grace period is wanted later, add `past_due` to `LIVE_STATUSES`.)
- **Idempotent.** `stripeEvents/{event.id}` is read and written inside the same transaction as
  the entitlement: a redelivered event changes nothing.
- **Ordered.** For the subscription already on the doc, an event with `created` older than
  `stripeEventCreated` is ignored, and once that subscription is `canceled` or
  `incomplete_expired` (Stripe never revives those) no later event about it grants Pro. So a late
  `updated` can't resurrect a deleted subscription. Every handled event reads the subscription
  fresh, so it is ordered at the time of that read (`max(event.created, now)`); only the
  `resource_missing` fallback is ordered by `event.created`. So a late `past_due` that arrives
  after the retry already succeeded keeps Pro, since Stripe says `active`.
- **Another subscription.** An event about a different subscription than the doc's only takes
  over when it grants Pro; it never ends a plan it did not grant.
- **Legacy founder docs** (`plan: 'founder'`, lifetime) are never written, not even the Stripe ids.
  A founder can't start a Checkout (409 `already-pro`), so this only matters for a race.
- **Other live plans** (mock, admin, a future store plan): **kept** while they last at least as
  long as the Stripe period (an admin plan with no `expiresAt` always), with the Stripe ids and
  status added so the member can still reach the portal. When the Stripe period runs longer, the
  Stripe plan replaces it. A Stripe cancellation never ends a plan Stripe did not grant. Why: the
  member should always end up with the better of the two, and one billing system must not revoke
  what another granted. The renewal event at each period end re-checks, so there is no gap.

**`stripeCustomers/{customerId}`** maps a Stripe customer back to its uid for a subscription
event without `metadata.uid` (one edited in the dashboard, or created outside Checkout). Written
on every applied event, and by Checkout when it makes the customer. Like `stripeEvents`, no rule matches it, so the default deny keeps every
client out (tested).

### Test-mode allowlist (`STRIPE_TEST_UIDS`)

**Why.** Previews share the production Firebase project. A test-card Checkout on a preview
writes a real `entitlements/{uid}` doc that the live app honors, and it renews every month until
someone cancels it. So while the key is a test key, only the testers on `STRIPE_TEST_UIDS` may use
Stripe at all. Like `PRO_MOCK_UIDS` for the mock purchase: comma separated, trimmed, empty
entries ignored, and **empty or unset means nobody**. A live key (`STRIPE_ALLOW_LIVE=1`, out of
scope) is not affected. The check is `stripeUidAllowed` in `src/server/stripeConfig.js`.

- **Checkout and portal:** a verified member off the list gets **403** `forbidden`, before any
  read or Stripe call.
- **Webhook, granting states** (`active`, `trialing`) for a uid off the list: a **200** no-op.
  Nothing is written, **not even `stripeEvents/{eventId}`**: every preview's webhook endpoint
  gets every event of the shared test account, so one preview skipping an event must not mark
  it handled for another preview that has the uid on its list.
- **Webhook, ending states** (`past_due`, `canceled`, ...) for a uid off the list still apply,
  but only to the subscription already on that uid's doc. Why: a tester taken off the list after
  buying must still be able to cancel and lose Pro; refusing those would leave a paid plan that
  only lapses at the period end. An ending event can only lower `expiresAt`
  (`nextEntitlement`), so it can never grant. About any other subscription, nothing is written.
- **Taken off the list after buying:** renewals stop extending Pro (it lapses at the end of the
  paid period); cancel and `past_due` still end it at once. The member can no longer open the
  portal on that preview, so cancel the test subscription in the dashboard.

### Customer portal: `POST /api/pro/portal`

Same 404 / 401 / 403 (allowlist included) as Checkout. Reads the token uid's `entitlements/{uid}.stripeCustomerId`;
none is a **404** `no-customer`. Otherwise creates a billing portal session (`return_url`
`STRIPE_WEB_PRO_BASE_URL/pro`, plus `configuration` when `STRIPE_PORTAL_CONFIGURATION_ID` is set)
and returns `{ url }`. Members cancel, change card and see invoices there; the resulting
subscription events come back through the webhook.

### Client

- `stripeWebProEnabled()` (`NEXT_PUBLIC_STRIPE_WEB_PRO === '1'`) **and** `!isNativeApp()`
  turn the Stripe path on in `ProSheet`. `mobile/vite.config.mjs` always defines the flag as off
  (tested in `mobile/viteConfig.test.js`).
- **Get Pro** (enabled with this flag even without the mock flag) calls `requestCheckout()` and
  leaves for the URL, staying on `Getting you set…`. `already-pro` re-reads the plan (success
  screen); `already-subscribed` opens the portal; anything else shows the existing
  `Couldn’t finish that. Try again.`
- **Back from Checkout.** `/pro?checkout=success`: the main button shows `Getting you set…`
  (disabled; the X and Maybe later still work) while the plan is re-read every 2.5 s, up to 8
  times. The webhook's write arrives through the listener or a re-read and swaps in the success
  screen. After the last try the sheet goes back to normal (Restore purchase still works).
  `?checkout=cancel` shows the sheet as usual. Either way the parameter is removed from the URL.
- **Manage subscription** on the success screen, a muted text link under Back to my bets, for a
  member whose doc has a `stripeCustomerId`. Opens the portal; a failure shows the existing
  error line.
- **Restore purchase**, badges and ad gating need no change: they all use `isProEntitlement`,
  which never looks at `source`, so a live `source: 'stripe'` plan is Pro everywhere and an
  ended one is not (tested).

**Mock purchase and Stripe both on.** Stripe wins on the client: with
`NEXT_PUBLIC_STRIPE_WEB_PRO=1` the sheet never calls the mock route. The mock route itself is
unchanged (still preview-only, allowlisted), except that it now leaves a live Stripe plan alone
and keeps the Stripe ids when it replaces a lapsed one, so a tester's portal link keeps working.
Turn the mock flags off where Stripe is tested, to keep `source` values honest.

### New on-screen copy

Two strings, only with the flag on and only on the web (`STRIPE_COPY`, UX approved them Oct 22).
Everything else reuses `PRO_COPY`.

- `Manage subscription` (`STRIPE_COPY.manage`): a muted text link (`.pro-sheet-manage`) under
  `Back to my bets` on the success screen, not a second button and not green.
- `Pro renews at $3/mo until you cancel.` (`STRIPE_COPY.finePrint`): the sheet's fine print.
  Native apps, and the web with the flag off, keep `PRO_COPY.finePrint`
  (`Pro renews at $3/mo until you cancel in Settings.`).

### Logging

Only event types and error codes (`stripe webhook failed: <type> <code>`,
`stripe checkout failed: <code>`, `stripe webhook: signature check failed`,
`stripe webhook skipped: <type> not-allowlisted`). Never a uid, phone
number, email, Stripe customer or subscription id, or a key (tested).

## Environment variables

Every server variable is read per request; nothing is needed at build time.

| Variable | Where | Purpose |
| --- | --- | --- |
| `STRIPE_WEB_PRO` | Server | `1` turns the routes on. Anything else: every Stripe route is a 404. |
| `STRIPE_SECRET_KEY` | Server, secret | `sk_test_...` or a restricted `rk_test_...` key. A live key (`sk_live_`/`rk_live_`) is refused (routes 404, the client refuses to start) unless `STRIPE_ALLOW_LIVE=1`. A **test** key is refused on `VERCEL_ENV=production`, where anyone could get Pro with a test card. |
| `STRIPE_ALLOW_LIVE` | Server | `1` allows a live key. **Out of scope; do not set.** Going live needs its own review (prices, tax, receipts, refunds, Terms). |
| `STRIPE_WEBHOOK_SECRET` | Server, secret | `whsec_...` of the webhook endpoint (or of `stripe listen` locally). |
| `STRIPE_PRICE_ID` | Server | The test-mode `price_...` of the $3/mo recurring price. |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Server, optional | `bpc_...` portal configuration; unset uses the default one. |
| `STRIPE_TEST_UIDS` | Server | Firebase uids allowed to use Stripe while the key is a test key, comma separated (spaces and empty entries ignored). **Empty or unset: every member gets 403, and the webhook grants nobody.** Ignored with a live key. See [Test-mode allowlist](#test-mode-allowlist-stripe_test_uids). Testers only; never commit real uids. |
| `STRIPE_WEB_PRO_BASE_URL` | Server | Absolute origin Checkout and the portal return to, e.g. `https://www.friendly-bets.com` or the preview's branch URL. https only (http for `localhost`/`127.0.0.1`), no path, query or credentials. Never taken from the request. |
| `NEXT_PUBLIC_STRIPE_WEB_PRO` | Web build | `1` shows the Stripe path in the Pro sheet. Needs `NEXT_PUBLIC_PRO_PAYWALL=1` (the sheet and `/pro` only exist with it). Always off in native builds. |
| `FIREBASE_SERVICE_ACCOUNT` | Server, secret | Already used by the other routes (docs/DEVELOPMENT.md). Without it the Stripe routes answer 503. |

The routes are on only when `STRIPE_WEB_PRO=1`, the key passes the check above, and
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` and a valid `STRIPE_WEB_PRO_BASE_URL` are all set.
Leave `NEXT_PUBLIC_STRIPE_WEB_PRO` off wherever the server side is off, or Get Pro will fail
with the error line.

**Vercel environments.** Preview (and Development for `vercel dev`) only, while this is test
mode. Production: none of these (a test key is refused there anyway). Previews get a new URL per
deploy, so set `STRIPE_WEB_PRO_BASE_URL` as a **branch-specific** Preview variable pointing at
that branch's stable alias, and make sure that host is a Firebase Auth authorized domain (the
member must come back signed in to the same origin). Never commit values: no `.env` file with
any of these goes in the repo.

## Stripe dashboard setup (test mode)

Do all of this with the dashboard's **Test mode** toggle on. Nothing here was done by the code
change; it needs the account owner.

1. **Product and price.** Product catalog > Add product: name `Friendly Pro`, recurring price
   **$3.00 USD per month**. Copy the price id into `STRIPE_PRICE_ID`.
2. **API key.** Developers > API keys: use the test secret key, or better a restricted key
   (`rk_test_`) with write access to Customers, Checkout Sessions and Customer portal, and read
   access to Subscriptions. Put it in `STRIPE_SECRET_KEY` (Vercel, Preview, sensitive).
3. **Webhook endpoint.** Developers > Webhooks > Add endpoint:
   - URL: `https://<preview host>/api/stripe/webhook`. If the preview has Vercel Deployment
     Protection on, Stripe can't reach it: append Vercel's protection bypass
     (`?x-vercel-protection-bypass=<secret>`, Project Settings > Deployment Protection >
     Protection Bypass for Automation).
   - API version: the SDK's, `2026-09-30.endive` (older versions work too, see above).
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`.
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **Customer portal.** Settings > Billing > Customer portal: turn on **Cancel subscriptions**
   (at the end of the billing period), payment method updates and invoice history. Set the
   default redirect to the base URL + `/pro`. To use a non-default configuration, put its
   `bpc_...` id in `STRIPE_PORTAL_CONFIGURATION_ID`.
5. Optional: Settings > Branding, and the business name shown on Checkout.

## Local testing

```bash
# Terminal 1: the app, with the server and client flags (values from your own test account).
STRIPE_WEB_PRO=1 STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID=price_... \
STRIPE_WEBHOOK_SECRET=whsec_from_stripe_listen STRIPE_WEB_PRO_BASE_URL=http://localhost:3000 \
STRIPE_TEST_UIDS=<your test account's uid> \
FIREBASE_SERVICE_ACCOUNT=... NEXT_PUBLIC_PRO_PAYWALL=1 NEXT_PUBLIC_STRIPE_WEB_PRO=1 npm run dev

# Terminal 2: forward test-mode events to the local webhook. It prints the whsec_ to use above.
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted
```

Then sign in with a Firebase test phone number, open `/pro`, Get Pro, pay with `4242 4242 4242
4242` (any future date, any CVC), and watch `entitlements/{uid}` turn Pro. Cancel in the portal
(Manage subscription), then advance time with a test clock or cancel immediately in the dashboard
to see `deleted` end the plan. Card `4000 0000 0000 0341` attaches but fails on renewal, for
`past_due`. `stripe trigger` fixtures carry no `metadata.uid`, so on their own they are no-ops
(200) unless their customer is already in `stripeCustomers`.

Unit tests need none of this: `npm test` mocks Stripe and the Admin SDK and signs webhook payloads
with the real library.

## Rollout checklist (test mode, previews)

1. Dashboard setup above, in test mode.
2. Preview env: `STRIPE_WEB_PRO=1`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_ID`, `STRIPE_WEB_PRO_BASE_URL` (branch alias), `STRIPE_TEST_UIDS` (the testers'
   uids only), `FIREBASE_SERVICE_ACCOUNT`, `NEXT_PUBLIC_PRO_PAYWALL=1`,
   `NEXT_PUBLIC_STRIPE_WEB_PRO=1`. Leave the mock flags off there.
3. The `entitlements` rules from docs/PRO.md are live (or expect a Pro member to need a reload
   or Restore; see the post-deploy notes there). `firestore.rules` needs no change for Stripe:
   `stripeEvents` and `stripeCustomers` are covered by the default deny.
4. Redeploy the preview. `POST /api/pro/checkout` without a token answers 401 (not 404).
5. Allowlist: a member not on `STRIPE_TEST_UIDS` gets the error line on Get Pro (403 in the
   network tab) and nothing in Stripe. Then buy with 4242 as a listed tester: success screen
   within a few seconds; dashboard shows the webhook 200s.
6. Manage subscription > cancel at period end: still Pro, `stripeStatus` active. Cancel
   immediately in the dashboard: `deleted`, not Pro, doc kept.
7. Resend an event from the dashboard: 200, nothing changes.
8. Check Vercel logs hold no uids, phone numbers or Stripe ids.
9. Before any production or live-mode work: Terms and Privacy URLs set, live product and price,
   `STRIPE_ALLOW_LIVE` review, App Store rules for the native apps (docs/PRO.md), and the mock
   [pre-launch cleanup](PRO.md#pre-launch-cleanup).

## Out of scope

- iOS and Android: no Stripe in the apps, ever, without a store-permitted entitlement. They keep
  the paywall off until StoreKit and Play Billing are built (docs/PRO.md).
- Live mode, tax, coupons, trials, refunds UI, multiple plans.
- Moving a subscription to a new uid (a member who changes phone number).
