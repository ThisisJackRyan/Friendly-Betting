import { isProEntitlement, toMillis } from '../phone/entitlement';
import { stripeUidAllowed } from './stripeConfig';

// Web Pro billing with Stripe (docs/STRIPE-WEB-PRO.md): Checkout, the
// customer portal and the webhook that writes entitlements/{uid}. The Stripe
// client, the Admin db and the clock are passed in, so tests stub them.
// Never logs a uid, phone number, email or Stripe id.

function failure(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

const FORBIDDEN = { ok: false, status: 403, error: 'forbidden' };
const UNAUTHORIZED = { ok: false, status: 401, error: 'unauthorized' };

// Like mockBuyerAllowed (proPurchase.js) without the tester allowlist: a
// phone-verified member, never an anonymous bettor session.
export function memberAllowed(decoded) {
  if (!decoded?.uid) return FORBIDDEN;
  if (decoded.firebase?.sign_in_provider === 'anonymous') return FORBIDDEN;
  if (!decoded.phone_number) return FORBIDDEN;
  return { ok: true, uid: decoded.uid };
}

// Verifies the ID token (revoked tokens fail too), then the member, then the
// test-mode allowlist (stripeUidAllowed: with a test key, only uids on
// STRIPE_TEST_UIDS). Returns { ok: true, uid } or { ok: false, status,
// error }. The uid only ever comes from the token.
export async function authorizeMember({ token, auth, config }) {
  if (!token) return UNAUTHORIZED;
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token, true);
  } catch (err) {
    if (err?.code === 'admin-not-configured') throw err;
    return UNAUTHORIZED;
  }
  const member = memberAllowed(decoded);
  if (member.ok && !stripeUidAllowed(config, member.uid)) return FORBIDDEN;
  return member;
}

export function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

// Subscription statuses that grant Pro. Anything else (past_due, unpaid,
// incomplete, paused, canceled, ...) ends it. Trials are not offered, but a
// trial would be Pro.
export const LIVE_STATUSES = new Set(['active', 'trialing']);
// A subscription in one of these never comes back, so no later event about
// it may grant Pro again.
export const ENDED_STATUSES = new Set(['canceled', 'incomplete_expired']);
// A member with one of these already has a subscription to fix or keep in the
// portal: Checkout would sell them a second one.
const SUBSCRIBED_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

// Firebase uids and Stripe ids become doc ids, so only their plain shapes.
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CUSTOMER_PATTERN = /^cus_[A-Za-z0-9]{1,255}$/;
const EVENT_PATTERN = /^evt_[A-Za-z0-9]{1,255}$/;
const validUid = (uid) => typeof uid === 'string' && UID_PATTERN.test(uid);
const validCustomer = (id) => typeof id === 'string' && CUSTOMER_PATTERN.test(id);
const idOf = (value) => (typeof value === 'string' ? value : value?.id || '');

const SECOND = 1000;

// Checkout -----------------------------------------------------------------

// The member's one Stripe customer, made on the server before their first
// Checkout so parallel Checkouts can't each make a customer (and then a
// subscription) of their own. Stripe's idempotency key (kept ~24h) makes
// parallel calls return the same customer; the transaction covers the rest:
// whichever customer is stored first wins, and every later call uses it.
// Only stripeCustomerId is merged onto entitlements/{uid}, so a doc with no
// plan yet stays not Pro and any plan fields are never touched. A legacy
// founder doc is never written (it is lifetime Pro: 'already-pro').
export async function ensureCustomer({ db, stripe, uid }) {
  const created = await stripe.customers.create({ metadata: { uid } }, { idempotencyKey: `customer-${uid}` });
  if (!validCustomer(created?.id)) throw failure('no-customer-id');
  const entitlementRef = db.doc(`entitlements/${uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(entitlementRef);
    const current = snap.exists ? snap.data() : null;
    if (validCustomer(current?.stripeCustomerId)) return current.stripeCustomerId;
    if (current?.plan === 'founder') throw failure('already-pro');
    tx.set(entitlementRef, { stripeCustomerId: created.id }, { merge: true });
    tx.set(db.doc(`stripeCustomers/${created.id}`), { uid });
    return created.id;
  });
}

// A Checkout Session for $3/mo Pro, for the verified uid only. Throws
// { code: 'already-pro' } for a live plan of any source, and
// { code: 'already-subscribed' } for a Stripe subscription that is still
// open (renewal pending, payment failing). Always for the member's one
// Stripe customer: the one on entitlements/{uid}, or a new one
// (ensureCustomer).
export async function createCheckout({ db, stripe, config, uid, now = Date.now() }) {
  const snap = await db.doc(`entitlements/${uid}`).get();
  const ent = snap.exists ? snap.data() : null;
  if (isProEntitlement(ent, now)) throw failure('already-pro');
  if (ent?.stripeSubscriptionId && SUBSCRIBED_STATUSES.has(ent.stripeStatus)) throw failure('already-subscribed');
  const customer = validCustomer(ent?.stripeCustomerId) ? ent.stripeCustomerId : await ensureCustomer({ db, stripe, uid });
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: config.priceId, quantity: 1 }],
    client_reference_id: uid,
    metadata: { uid },
    subscription_data: { metadata: { uid } },
    success_url: `${config.baseUrl}/pro?checkout=success`,
    cancel_url: `${config.baseUrl}/pro?checkout=cancel`,
  });
  if (!session?.url) throw failure('no-session-url');
  return { url: session.url };
}

// Customer portal ----------------------------------------------------------

// A portal session for the member's stored Stripe customer. Throws
// { code: 'no-customer' } when entitlements/{uid} has none.
export async function createPortal({ db, stripe, config, uid }) {
  const snap = await db.doc(`entitlements/${uid}`).get();
  const customer = snap.exists ? snap.data()?.stripeCustomerId : '';
  if (!validCustomer(customer)) throw failure('no-customer');
  const params = { customer, return_url: `${config.baseUrl}/pro` };
  if (config.portalConfigurationId) params.configuration = config.portalConfigurationId;
  const session = await stripe.billingPortal.sessions.create(params);
  if (!session?.url) throw failure('no-session-url');
  return { url: session.url };
}

// Webhook ------------------------------------------------------------------

// The end of the paid period, in millis. Newer API versions (the installed
// SDK's 2026-09-30) only have current_period_end on the subscription items;
// older ones have it on the subscription. The latest item wins.
export function periodEndMillis(subscription) {
  const items = subscription?.items?.data || [];
  const ends = items.map((item) => item?.current_period_end).filter((value) => Number.isFinite(value));
  if (Number.isFinite(subscription?.current_period_end)) ends.push(subscription.current_period_end);
  return ends.length ? Math.max(...ends) * SECOND : null;
}

// What one subscription says about Pro, read from the Stripe object.
export function subscriptionState(subscription, now) {
  const status = String(subscription?.status || '');
  const live = LIVE_STATUSES.has(status);
  const periodEnd = periodEndMillis(subscription);
  // A live subscription without a period end would be Pro forever: refuse
  // it, so Stripe retries and the dashboard shows the failure.
  if (live && !periodEnd) throw failure('no-period-end');
  const endedAt = Number.isFinite(subscription?.ended_at) ? subscription.ended_at * SECOND : now;
  return {
    subscriptionId: idOf(subscription),
    customerId: idOf(subscription?.customer),
    status,
    live,
    // Live: the end of the paid period, so Pro lapses on its own if webhooks
    // stop. Otherwise: now, or when it ended if that was earlier.
    expiresAt: live ? periodEnd : Math.min(now, endedAt),
  };
}

const stripeFields = (state, eventCreated) => ({
  stripeCustomerId: state.customerId,
  stripeSubscriptionId: state.subscriptionId,
  stripeStatus: state.status,
  stripeEventCreated: eventCreated,
});

// The next entitlements/{uid} doc for a subscription state, or null to
// leave it as it is. Pure, so every case is tested on its own.
//
// - A legacy founder doc (lifetime) is never touched.
// - Events about the subscription on the doc apply in order: one created
//   before the last applied event is stale, and an ended subscription never
//   grants Pro again.
// - An event about another subscription only takes over the doc when it
//   grants Pro; otherwise it would end a plan it never granted.
// - A live plan from another source (mock, admin, a store) is kept while it
//   lasts at least as long as the Stripe period; the Stripe ids are still
//   stored, so the member can manage the subscription. Stripe never ends a
//   plan it did not grant.
// - Otherwise the plan is the Stripe one: { plan: 'pro', source: 'stripe',
//   since, expiresAt }. A subscription that is not live sets expiresAt to
//   now (or when it ended), so the doc stays and reads as not Pro.
export function nextEntitlement({ existing, state, eventCreated, now, since, toTimestamp = (ms) => ms }) {
  if (existing?.plan === 'founder') return null;
  const sameSubscription = existing?.stripeSubscriptionId && existing.stripeSubscriptionId === state.subscriptionId;
  if (sameSubscription) {
    if (Number(existing.stripeEventCreated) > eventCreated) return null;
    if (ENDED_STATUSES.has(existing.stripeStatus)) return null;
  } else if (existing?.stripeSubscriptionId && !state.live) {
    return null;
  }

  const base = { ...(existing || {}), ...stripeFields(state, eventCreated) };
  const fromStripe = existing?.source === 'stripe';
  const otherLivePlan = existing && !fromStripe && isProEntitlement(existing, now);

  if (state.live) {
    if (otherLivePlan) {
      const otherEnds = toMillis(existing.expiresAt);
      if (otherEnds === null || otherEnds === undefined || otherEnds >= state.expiresAt) return base;
    }
    // A renewal keeps the original grant time.
    const keepSince = fromStripe && sameSubscription && existing.since !== undefined;
    return {
      ...base,
      plan: 'pro',
      source: 'stripe',
      since: keepSince ? existing.since : since,
      expiresAt: toTimestamp(state.expiresAt),
    };
  }

  // Not live: end a Stripe plan; leave any other plan (or no plan) alone.
  if (!fromStripe) return base;
  const current = toMillis(existing.expiresAt);
  const expiresAt = Number.isFinite(current) && current < state.expiresAt ? current : state.expiresAt;
  return { ...base, expiresAt: toTimestamp(expiresAt) };
}

// Applies one subscription state for `uid` in one transaction, with the
// event id recorded in stripeEvents/{eventId} (server only) so a redelivered
// event changes nothing. stripeCustomers/{customerId} maps a customer back to
// its uid for events without one.
//
// With `allowed` false (a test key and a uid not on STRIPE_TEST_UIDS) a live
// state never grants: nothing is written. A state that is not live still
// applies to the subscription already on the doc, so a member taken off the
// list can still cancel and lose Pro; about any other subscription nothing
// is written. "Nothing" includes stripeEvents: every preview's endpoint gets
// every event of the shared test account, and one that skips an event must
// not mark it handled for a preview that has the uid on its list.
export async function applySubscriptionEvent({ db, event, uid, state, eventCreated, now, since, toTimestamp, allowed = true }) {
  if (!allowed && state.live) return { applied: false, reason: 'not-allowlisted' };
  const eventRef = db.doc(`stripeEvents/${event.id}`);
  const entitlementRef = db.doc(`entitlements/${uid}`);
  return db.runTransaction(async (tx) => {
    const seen = await tx.get(eventRef);
    if (seen.exists) return { duplicate: true };
    const snap = await tx.get(entitlementRef);
    const existing = snap.exists ? snap.data() : null;
    if (!allowed && existing?.stripeSubscriptionId !== state.subscriptionId) return { applied: false, reason: 'not-allowlisted' };
    const next = nextEntitlement({ existing, state, eventCreated, now, since, toTimestamp });
    tx.set(eventRef, { type: event.type, created: event.created, processedAt: since });
    if (validCustomer(state.customerId)) tx.set(db.doc(`stripeCustomers/${state.customerId}`), { uid });
    if (next) tx.set(entitlementRef, next);
    return { applied: Boolean(next) };
  });
}

async function uidForCustomer(db, customerId) {
  if (!validCustomer(customerId)) return '';
  const snap = await db.doc(`stripeCustomers/${customerId}`).get();
  const uid = snap.exists ? snap.data()?.uid : '';
  return validUid(uid) ? uid : '';
}

// The subscription as Stripe has it now, or null when Stripe no longer has
// it. Any other failure throws, so the webhook answers 500 and Stripe retries.
async function retrieveSubscription(stripe, id) {
  if (!id) return null;
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (err) {
    if (err?.code === 'resource_missing') return null;
    throw err;
  }
}

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

// One verified webhook event. Returns { handled, ... } and never throws for
// an event it can't use (an unknown type, no uid, a uid off the test-mode
// allowlist): those are a 200 no-op so Stripe stops retrying. Throws for
// anything worth a retry. `config` is the stripeWebProConfig() result, for
// the allowlist; without one nothing is granted.
export async function handleStripeEvent({ db, stripe, config, event, now = Date.now(), since, toTimestamp }) {
  if (!HANDLED_EVENTS.includes(event?.type)) return { handled: false, reason: 'ignored-type' };
  if (!EVENT_PATTERN.test(String(event.id)) || !Number.isFinite(event.created)) return { handled: false, reason: 'malformed' };
  const object = event.data?.object;

  if (event.type === 'checkout.session.completed') {
    if (object?.mode !== 'subscription') return { handled: false, reason: 'not-subscription' };
    const uid = [object.metadata?.uid, object.client_reference_id].find(validUid);
    const subscriptionId = idOf(object.subscription);
    if (!uid) return { handled: false, reason: 'no-uid' };
    if (!subscriptionId) return { handled: false, reason: 'no-subscription' };
    // The session has no period end, so read the subscription. That read is
    // newer than the event, so it is ordered at the time it was made.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const state = subscriptionState(subscription, now);
    if (!state.customerId) state.customerId = idOf(object.customer);
    const eventCreated = Math.max(event.created, Math.floor(now / SECOND));
    const allowed = stripeUidAllowed(config, uid);
    const result = await applySubscriptionEvent({ db, event, uid, state, eventCreated, now, since, toTimestamp, allowed });
    return result.reason ? { handled: false, ...result } : { handled: true, ...result };
  }

  // Events can arrive late and out of order, so read the subscription fresh,
  // like checkout.session.completed, and order it at the time of that read.
  // A subscription Stripe no longer has (resource_missing) falls back to the
  // event's copy, ordered by event.created.
  const fresh = await retrieveSubscription(stripe, idOf(object));
  const subscription = fresh || object;
  const eventCreated = fresh ? Math.max(event.created, Math.floor(now / SECOND)) : event.created;
  const state = subscriptionState(subscription, now);
  if (!state.customerId) state.customerId = idOf(object?.customer);
  const metadataUid = [subscription?.metadata?.uid, object?.metadata?.uid].find(validUid);
  const uid = metadataUid || (await uidForCustomer(db, state.customerId));
  if (!uid) return { handled: false, reason: 'no-uid' };
  const allowed = stripeUidAllowed(config, uid);
  const result = await applySubscriptionEvent({ db, event, uid, state, eventCreated, now, since, toTimestamp, allowed });
  return result.reason ? { handled: false, ...result } : { handled: true, ...result };
}
