/** @jest-environment node */
import { hasProEntitlement, readEntitlement } from './proEntitlement';
import { fakeDb } from './testing/fakeDb';

const NOW = Date.UTC(2026, 10, 16);
const DAY = 24 * 60 * 60 * 1000;
// An Admin SDK Timestamp's shape, as the server reads it.
const timestamp = (ms) => ({ toMillis: () => ms });

function dbWith(entitlement) {
  return fakeDb(entitlement === undefined ? {} : { 'entitlements/u1': entitlement });
}

test('a missing entitlement doc is not Pro', async () => {
  const db = dbWith(undefined);
  await expect(readEntitlement({ db, uid: 'u1' })).resolves.toBeNull();
  await expect(hasProEntitlement({ db, uid: 'u1', now: NOW })).resolves.toBe(false);
});

test('no uid is not Pro and reads nothing', async () => {
  const db = { doc: jest.fn() };
  await expect(hasProEntitlement({ db, uid: '', now: NOW })).resolves.toBe(false);
  expect(db.doc).not.toHaveBeenCalled();
});

test.each([
  ['pro with no expiresAt', true, { plan: 'pro', source: 'admin' }],
  ['pro with expiresAt null', true, { plan: 'pro', source: 'admin', expiresAt: null }],
  ['pro expiring tomorrow (millis)', true, { plan: 'pro', source: 'mock', expiresAt: NOW + DAY }],
  ['pro expiring tomorrow ({ seconds })', true, { plan: 'pro', source: 'mock', expiresAt: { seconds: (NOW + DAY) / 1000, nanoseconds: 0 } }],
  ['pro that expired yesterday', false, { plan: 'pro', source: 'mock', expiresAt: NOW - DAY }],
  ['pro expiring right now', false, { plan: 'pro', source: 'mock', expiresAt: NOW }],
  ['stripe pro, unexpired', true, { plan: 'pro', source: 'stripe', expiresAt: NOW + DAY }],
  ['legacy founder', true, { plan: 'founder', source: 'mock', founderNumber: 7, expiresAt: null }],
  ['legacy founder with a past expiresAt', true, { plan: 'founder', source: 'mock', expiresAt: NOW - DAY }],
  ['an unknown plan', false, { plan: 'gold', source: 'admin' }],
  ['a garbage expiresAt', false, { plan: 'pro', source: 'admin', expiresAt: 'soon' }],
])('%s: Pro is %s', async (_name, expected, entitlement) => {
  await expect(hasProEntitlement({ db: dbWith(entitlement), uid: 'u1', now: NOW })).resolves.toBe(expected);
});

test('an Admin Timestamp expiresAt is read through toMillis', async () => {
  const snap = (data) => ({ exists: true, data: () => data });
  const db = { doc: () => ({ get: async () => snap({ plan: 'pro', expiresAt: timestamp(NOW + 1) }) }) };
  await expect(hasProEntitlement({ db, uid: 'u1', now: NOW })).resolves.toBe(true);
  const lapsed = { doc: () => ({ get: async () => snap({ plan: 'pro', expiresAt: timestamp(NOW - 1) }) }) };
  await expect(hasProEntitlement({ db: lapsed, uid: 'u1', now: NOW })).resolves.toBe(false);
});

test('reads through a transaction when given one, and only the caller\'s doc', async () => {
  const db = fakeDb({ 'entitlements/u1': { plan: 'pro' }, 'entitlements/u2': { plan: 'founder' } });
  const tx = { get: jest.fn((ref) => ref.get()) };
  await expect(hasProEntitlement({ db, uid: 'u1', tx, now: NOW })).resolves.toBe(true);
  expect(tx.get).toHaveBeenCalledTimes(1);
  expect(tx.get.mock.calls[0][0].path).toBe('entitlements/u1');
  await expect(hasProEntitlement({ db, uid: 'u3', now: NOW })).resolves.toBe(false);
});
