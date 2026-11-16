import { STRIPE_GRACE_DAYS, STRIPE_GRACE_ENDED_NOTICE_DAYS, badgeFor, isProEntitlement, stripeGraceEndsAt, stripeGraceNotice, toMillis } from './entitlement';

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

describe('Stripe past_due grace (read time)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const GRACE = STRIPE_GRACE_DAYS * DAY;
  const START = 10 * DAY;
  // What the webhook writes for a first failed payment at START.
  const inGrace = { plan: 'pro', source: 'stripe', since: 1, stripeStatus: 'past_due', stripePastDueAt: { seconds: START / 1000, nanoseconds: 0 }, expiresAt: START + GRACE };

  test('3 days from the stored first failure', () => {
    expect(STRIPE_GRACE_DAYS).toBe(3);
    expect(stripeGraceEndsAt(inGrace)).toBe(START + GRACE);
    expect(stripeGraceEndsAt({ plan: 'pro' })).toBeNull();
  });

  test('Pro and the grace notice during the grace, not Pro and the ended notice after it', () => {
    expect(isProEntitlement(inGrace, START + GRACE - 1)).toBe(true);
    expect(stripeGraceNotice(inGrace, START + 1)).toBe('grace');
    expect(isProEntitlement(inGrace, START + GRACE)).toBe(false);
    expect(stripeGraceNotice(inGrace, START + GRACE)).toBe('ended');
    expect(stripeGraceNotice(inGrace, START + GRACE + STRIPE_GRACE_ENDED_NOTICE_DAYS * DAY - 1)).toBe('ended');
    expect(stripeGraceNotice(inGrace, START + GRACE + STRIPE_GRACE_ENDED_NOTICE_DAYS * DAY)).toBeNull();
  });

  test('an unpaid or canceled subscription after the grace ran out still reads as ended', () => {
    expect(stripeGraceNotice({ ...inGrace, stripeStatus: 'unpaid' }, START + GRACE + DAY)).toBe('ended');
    expect(stripeGraceNotice({ ...inGrace, stripeStatus: 'canceled' }, START + GRACE + DAY)).toBe('ended');
  });

  test('no notice for free members, founders, other plans, or a Stripe plan without a grace', () => {
    expect(stripeGraceNotice(null, START)).toBeNull();
    expect(stripeGraceNotice({ stripeCustomerId: 'cus_1' }, START)).toBeNull();
    expect(stripeGraceNotice({ plan: 'founder', expiresAt: null, stripePastDueAt: START }, START + GRACE + 1)).toBeNull();
    expect(stripeGraceNotice({ ...inGrace, source: 'mock', expiresAt: START + GRACE + DAY }, START + GRACE + 1)).toBeNull();
    expect(stripeGraceNotice({ plan: 'pro', source: 'stripe', stripeStatus: 'canceled', expiresAt: START }, START + 1)).toBeNull();
    expect(stripeGraceNotice({ plan: 'pro', source: 'stripe', stripeStatus: 'active', expiresAt: START + 30 * DAY }, START)).toBeNull();
  });

  test('Pro again (a later period with the field left over) shows nothing', () => {
    expect(stripeGraceNotice({ ...inGrace, stripeStatus: 'active', expiresAt: START + 30 * DAY }, START + GRACE + 1)).toBeNull();
  });
});
