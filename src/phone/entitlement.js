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
