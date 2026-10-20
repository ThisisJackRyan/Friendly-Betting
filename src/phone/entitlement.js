// Pure helpers for entitlements/{uid} (docs/PRO.md). No Firebase imports, so
// the ad service, the server route and tests can all use them.
//
//   { plan: 'pro' | 'founder', source, since, founderNumber?, expiresAt? }
//
// Founder is lifetime Pro. A Pro plan with no expiresAt never lapses.

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

export function isProEntitlement(ent, now = Date.now()) {
  if (!ent || typeof ent !== 'object') return false;
  if (ent.plan === 'founder') return true;
  if (ent.plan !== 'pro') return false;
  const expires = toMillis(ent.expiresAt);
  if (expires === null) return true;
  return Number.isFinite(expires) && expires > now;
}

// What the badge next to the member's own name says, or null for no badge.
export function badgeFor(ent, now = Date.now()) {
  if (!isProEntitlement(ent, now)) return null;
  if (ent.plan !== 'founder') return { kind: 'pro' };
  const number = Number(ent.founderNumber);
  return Number.isInteger(number) && number > 0 ? { kind: 'founder', number } : { kind: 'founder' };
}
