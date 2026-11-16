// Pure helpers for entitlements/{uid} (docs/PRO.md). No Firebase imports, so
// the ad service, the server route and tests can all use them.
//
//   { plan: 'pro', source, since, expiresAt? }
//
// A Pro plan with no expiresAt never lapses. Pro is the only plan sold. Docs
// granted before the founder tier was dropped have plan 'founder' (with a
// founderNumber and expiresAt null): they still read as lifetime Pro, with
// the plain Pro badge.

// Millis from a Firestore Timestamp (client or Admin), a Date, a number or
// a { seconds, nanoseconds } object. null for none, NaN for anything else.
export function toMillis(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
  return NaN;
}

const LEGACY_FOUNDER_PLAN = 'founder';

export function isProEntitlement(ent, now = Date.now()) {
  if (!ent || typeof ent !== 'object') return false;
  if (ent.plan === LEGACY_FOUNDER_PLAN) return true;
  if (ent.plan !== 'pro') return false;
  const expires = toMillis(ent.expiresAt);
  if (expires === null) return true;
  return Number.isFinite(expires) && expires > now;
}

// The badge next to the member's own name, or null for no badge. Every plan,
// legacy founder docs included, gets the same Pro badge.
export function badgeFor(ent, now = Date.now()) {
  return isProEntitlement(ent, now) ? { kind: 'pro' } : null;
}

// Stripe web Pro (docs/STRIPE-WEB-PRO.md): after a failed renewal
// (past_due) Pro stays on for this many days from the first failure, then
// ends. The webhook stores that first failure as stripePastDueAt (server
// time, never the client's) and sets expiresAt to its end, so
// isProEntitlement ends Pro on its own when the grace runs out: no cron, no
// further webhook needed. Retries never move stripePastDueAt.
export const STRIPE_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
export const STRIPE_GRACE_MS = STRIPE_GRACE_DAYS * DAY_MS;
// How long My bets says Pro ended after a grace ran out.
export const STRIPE_GRACE_ENDED_NOTICE_DAYS = 14;

// When this doc's Stripe grace ends (millis), or null without one.
export function stripeGraceEndsAt(ent) {
  const since = toMillis(ent?.stripePastDueAt);
  return Number.isFinite(since) ? since + STRIPE_GRACE_MS : null;
}

// Which Stripe billing notice My bets shows, from the member's own doc:
// 'grace' while a failed payment is in its grace period (still Pro),
// 'ended' for STRIPE_GRACE_ENDED_NOTICE_DAYS after that grace ran out and
// Pro ended, otherwise null. Only a Stripe plan with a stored
// stripePastDueAt ever gets one, so free members, founders and anyone whose
// Pro ended some other way (a cancel, even during the grace) never do; and
// being Pro again (a recovery, a new subscription, another plan) ends it.
export function stripeGraceNotice(ent, now = Date.now()) {
  if (!ent || ent.plan !== 'pro' || ent.source !== 'stripe') return null;
  const endsAt = stripeGraceEndsAt(ent);
  if (endsAt === null) return null;
  if (isProEntitlement(ent, now)) return ent.stripeStatus === 'past_due' && now < endsAt ? 'grace' : null;
  return now >= endsAt && now < endsAt + STRIPE_GRACE_ENDED_NOTICE_DAYS * DAY_MS ? 'ended' : null;
}
