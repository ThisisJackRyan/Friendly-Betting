import { badgeFor, isProEntitlement, toMillis } from './entitlement';

const NOW = 1_000_000;

// Docs granted before the founder tier was dropped: lifetime Pro, plain badge.
test('a legacy founder entitlement still reads as Pro, whatever expiresAt says', () => {
  const legacy = { plan: 'founder', source: 'mock', since: { seconds: 1, nanoseconds: 0 }, founderNumber: 12, expiresAt: null };
  expect(isProEntitlement(legacy, NOW)).toBe(true);
  expect(isProEntitlement({ plan: 'founder' }, NOW)).toBe(true);
  expect(isProEntitlement({ plan: 'founder', expiresAt: NOW - 1 }, NOW)).toBe(true);
  expect(badgeFor(legacy, NOW)).toEqual({ kind: 'pro' });
  expect(badgeFor({ plan: 'founder' }, NOW)).toEqual({ kind: 'pro' });
});

test('pro is Pro with no expiresAt or one still ahead', () => {
  expect(isProEntitlement({ plan: 'pro' }, NOW)).toBe(true);
  expect(isProEntitlement({ plan: 'pro', expiresAt: null }, NOW)).toBe(true);
  expect(isProEntitlement({ plan: 'pro', expiresAt: NOW + 1 }, NOW)).toBe(true);
  expect(isProEntitlement({ plan: 'pro', expiresAt: NOW }, NOW)).toBe(false);
  expect(isProEntitlement({ plan: 'pro', expiresAt: NOW - 1 }, NOW)).toBe(false);
});

test('expiresAt may be a Firestore Timestamp, a Date or seconds', () => {
  expect(isProEntitlement({ plan: 'pro', expiresAt: { toMillis: () => NOW + 5 } }, NOW)).toBe(true);
  expect(isProEntitlement({ plan: 'pro', expiresAt: new Date(NOW - 5) }, NOW)).toBe(false);
  expect(isProEntitlement({ plan: 'pro', expiresAt: { seconds: 2000, nanoseconds: 0 } }, NOW)).toBe(true);
  expect(toMillis({ seconds: 1, nanoseconds: 500000000 })).toBe(1500);
});

test('anything else is not Pro', () => {
  [null, undefined, 'pro', {}, { plan: 'free' }, { plan: 'PRO' }, { plan: 'pro', expiresAt: 'soon' }].forEach((ent) => {
    expect(isProEntitlement(ent, NOW)).toBe(false);
  });
});

test('badgeFor is the Pro badge for any live plan', () => {
  expect(badgeFor({ plan: 'pro' }, NOW)).toEqual({ kind: 'pro' });
  expect(badgeFor({ plan: 'pro', expiresAt: NOW + 1 }, NOW)).toEqual({ kind: 'pro' });
});

test('badgeFor is null without a live plan', () => {
  expect(badgeFor(null, NOW)).toBeNull();
  expect(badgeFor({ plan: 'pro', expiresAt: NOW - 1 }, NOW)).toBeNull();
});

// Web Pro billing (docs/STRIPE-WEB-PRO.md): the webhook writes the same shape
// with source 'stripe' and the Stripe ids. Nothing reads the source.
test('a Stripe plan is Pro until its period end, and not after', () => {
  const stripe = { plan: 'pro', source: 'stripe', since: 1, expiresAt: NOW + 1, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeStatus: 'active' };
  expect(isProEntitlement(stripe, NOW)).toBe(true);
  expect(badgeFor(stripe, NOW)).toEqual({ kind: 'pro' });
  expect(isProEntitlement({ ...stripe, expiresAt: { toMillis: () => NOW + 1 } }, NOW)).toBe(true);
  const ended = { ...stripe, stripeStatus: 'canceled', expiresAt: NOW };
  expect(isProEntitlement(ended, NOW)).toBe(false);
  expect(badgeFor(ended, NOW)).toBeNull();
  expect(isProEntitlement({ ...stripe, expiresAt: { seconds: NOW / 1000 - 1, nanoseconds: 0 } }, NOW)).toBe(false);
});

test('Stripe ids alone, with no plan, are not Pro', () => {
  expect(isProEntitlement({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeStatus: 'incomplete' }, NOW)).toBe(false);
});

test('a doc with only a Stripe customer (made before the first Checkout) is not Pro and has no badge', () => {
  expect(isProEntitlement({ stripeCustomerId: 'cus_1' }, NOW)).toBe(false);
  expect(badgeFor({ stripeCustomerId: 'cus_1' }, NOW)).toBeNull();
});
