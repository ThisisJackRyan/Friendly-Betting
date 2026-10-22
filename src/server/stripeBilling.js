import { isProEntitlement, toMillis } from '../phone/entitlement';

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

// Verifies the ID token (revoked tokens fail too). Returns { ok: true, uid }
// or { ok: false, status, error }. The uid only ever comes from the token.
export async function authorizeMember({ token, auth }) {
  if (!token) return UNAUTHORIZED;
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token, true);
  } catch (err) {
    if (err?.code === 'admin-not-configured') throw err;
    return UNAUTHORIZED;
  }
  return memberAllowed(decoded);
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

// A Checkout Session for $3/mo Pro, for the verified uid only. Throws
// { code: 'already-pro' } for a live plan of any source, and
// { code: 'already-subscribed' } for a Stripe subscription that is still
// open (renewal pending, payment failing). Reuses the member's Stripe
// customer when entitlements/{uid} has one.
export async function createCheckout({ db, stripe, config, uid, now = Date.now() }) {
  const snap = await db.doc(`entitlements/${uid}`).get();
  const ent = snap.exists ? snap.data() : null;
  if (isProEntitlement(ent, now)) throw failure('already-pro');
  if (ent?.stripeSubscriptionId && SUBSCRIBED_STATUSES.has(ent.stripeStatus)) throw failure('already-subscribed');
  const params = {
    mode: 'subscription',
    line_items: [{ price: config.priceId, quantity: 1 }],
    client_reference_id: uid,
    metadata: { uid },
    subscription_data: { metadata: { uid } },
    success_url: `${config.baseUrl}/pro?checkout=success`,
    cancel_url: `${config.baseUrl}/pro?checkout=cancel`,
  };
  if (validCustomer(ent?.stripeCustomerId)) params.customer = ent.stripeCustomerId;
  const session = await stripe.checkout.sessions.create(params);
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
export async function applySubscriptionEvent({ db, event, uid, state, eventCreated, now, since, toTimestamp }) {
  const eventRef = db.doc(`stripeEvents/${event.id}`);
  const entitlementRef = db.doc(`entitlements/${uid}`);
  return db.runTransaction(async (tx) => {
    const seen = await tx.get(eventRef);
    if (seen.exists) return { duplicate: true };
    const snap = await tx.get(entitlementRef);
    const existing = snap.exists ? snap.data() : null;
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

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

// One verified webhook event. Returns { handled, ... } and never throws for
// an event it can't use (an unknown type, no uid): those are a 200 no-op so
// Stripe stops retrying. Throws for anything worth a retry.
export async function handleStripeEvent({ db, stripe, event, now = Date.now(), since, toTimestamp }) {
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
    const result = await applySubscriptionEvent({ db, event, uid, state, eventCreated, now, since, toTimestamp });
    return { handled: true, ...result };
  }

  const state = subscriptionState(object, now);
  const uid = validUid(object?.metadata?.uid) ? object.metadata.uid : await uidForCustomer(db, state.customerId);
  if (!uid) return { handled: false, reason: 'no-uid' };
  const result = await applySubscriptionEvent({ db, event, uid, state, eventCreated: event.created, now, since, toTimestamp });
  return { handled: true, ...result };
}
