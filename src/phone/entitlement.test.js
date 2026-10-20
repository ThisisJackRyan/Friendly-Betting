import { badgeFor, isProEntitlement, toMillis } from './entitlement';

const NOW = 1_000_000;

test('founder is always Pro, whatever expiresAt says', () => {
  expect(isProEntitlement({ plan: 'founder' }, NOW)).toBe(true);
  expect(isProEntitlement({ plan: 'founder', expiresAt: NOW - 1 }, NOW)).toBe(true);
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

test('badgeFor names the plan and the founder number', () => {
  expect(badgeFor({ plan: 'pro' }, NOW)).toEqual({ kind: 'pro' });
  expect(badgeFor({ plan: 'founder', founderNumber: 12 }, NOW)).toEqual({ kind: 'founder', number: 12 });
  expect(badgeFor({ plan: 'founder' }, NOW)).toEqual({ kind: 'founder' });
  expect(badgeFor({ plan: 'founder', founderNumber: 0 }, NOW)).toEqual({ kind: 'founder' });
  expect(badgeFor({ plan: 'founder', founderNumber: 'x' }, NOW)).toEqual({ kind: 'founder' });
});

test('badgeFor is null without a live plan', () => {
  expect(badgeFor(null, NOW)).toBeNull();
  expect(badgeFor({ plan: 'pro', expiresAt: NOW - 1 }, NOW)).toBeNull();
});
