/** @jest-environment node */
import { adminAuth, adminDb } from './firebaseAdmin';
import { createStripeClient } from './deleteAccountStripe';
import * as accountModule from '../../app/api/account/route';
import { DELETE, OPTIONS } from '../../app/api/account/route';
import { tombstonePath } from './deleteAccount';
import { numbersPath } from './resultTexts';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'server-time' } }));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn() }));
jest.mock('./deleteAccountStripe', () => {
  const actual = jest.requireActual('./deleteAccountStripe');
  return { ...actual, createStripeClient: jest.fn(() => null) };
});

const UID = 'me-uid';
const PHONE = '+15551234567';
const nowSec = () => Math.floor(Date.now() / 1000);
const TOKENS = {
  good: () => ({ uid: UID, phone_number: PHONE, auth_time: nowSec() - 30, firebase: { sign_in_provider: 'phone' } }),
  stale: () => ({ uid: UID, phone_number: PHONE, auth_time: nowSec() - 601, firebase: { sign_in_provider: 'phone' } }),
  anon: () => ({ uid: UID, auth_time: nowSec(), firebase: { sign_in_provider: 'anonymous' } }),
  nophone: () => ({ uid: UID, auth_time: nowSec(), firebase: { sign_in_provider: 'custom' } }),
};

let db;
let auth;

function seed() {
  return fakeDb({
    'bets/mine': { code: 'mine', createdByID: UID, status: 'open', votes: [] },
    'bets/mine/votes/friend': { voterId: 'friend', name: 'Lee', optionId: 'a', at: 1 },
    'bets/open': { code: 'open', createdByID: 'maya', status: 'open', votes: [] },
    [`bets/open/votes/${UID}`]: { voterId: UID, name: 'Jack', optionId: 'a', at: 1 },
    [`${numbersPath('open')}/n-me`]: { e164: PHONE, voterId: UID, optionId: 'a' },
    [`entitlements/${UID}`]: { plan: 'pro', source: 'stripe', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' },
  });
}

beforeEach(() => {
  db = seed();
  auth = {
    verifyIdToken: jest.fn(async (token) => {
      if (TOKENS[token]) return TOKENS[token]();
      if (token === 'revoked') throw Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
      throw Object.assign(new Error('bad'), { code: 'auth/argument-error' });
    }),
    revokeRefreshTokens: jest.fn(async () => {}),
    deleteUser: jest.fn(async () => {}),
  };
  adminAuth.mockReset();
  adminAuth.mockReturnValue(auth);
  adminDb.mockReset();
  adminDb.mockReturnValue(db);
  createStripeClient.mockReset();
  createStripeClient.mockReturnValue(null);
});

function del({ token, origin } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  return DELETE(new Request('http://localhost/api/account', { method: 'DELETE', headers }));
}

const untouched = () => {
  expect(db.writes).toEqual([]);
  expect(db.data('bets/mine')).toBeTruthy();
  expect(db.data(`entitlements/${UID}`)).toBeTruthy();
  expect(auth.deleteUser).not.toHaveBeenCalled();
};

test('runs on Node, never cached, with a 60 s budget', () => {
  expect(accountModule.runtime).toBe('nodejs');
  expect(accountModule.dynamic).toBe('force-dynamic');
  expect(accountModule.maxDuration).toBe(60);
});

test.each([
  ['no token', undefined, 401, 'unauthorized'],
  ['a forged token', 'forged', 401, 'unauthorized'],
  ['a revoked token', 'revoked', 401, 'unauthorized'],
  ['an anonymous user', 'anon', 403, 'forbidden'],
  ['a user with no phone', 'nophone', 403, 'forbidden'],
])('%s is refused and nothing is written', async (_name, token, status, error) => {
  const res = await del({ token });
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({ error });
  untouched();
});

test('the token is verified with the revocation check', async () => {
  await del({ token: 'good' });
  expect(auth.verifyIdToken).toHaveBeenCalledWith('good', true);
});

test('a sign-in older than 10 minutes gets requires-recent-login and nothing else', async () => {
  const res = await del({ token: 'stale' });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'requires-recent-login' });
  untouched();
  expect(db.data(tombstonePath(UID))).toBeUndefined();
  expect(createStripeClient).not.toHaveBeenCalled();
});

test('a fresh sign-in deletes the account', async () => {
  const res = await del({ token: 'good' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ deleted: true });
  expect(db.paths('bets/mine')).toEqual([]);
  expect(db.data(`bets/open/votes/${UID}`)).toBeUndefined();
  expect(db.data(`${numbersPath('open')}/n-me`)).toBeUndefined();
  expect(db.data(`entitlements/${UID}`)).toBeUndefined();
  expect(db.data(tombstonePath(UID))).toEqual({ at: 'server-time' });
  expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
  expect(auth.deleteUser).toHaveBeenCalledWith(UID);
});

test('a Stripe failure is a 503 with bets, entitlement and Auth intact', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const fail = () => Promise.reject(Object.assign(new Error('Stripe request failed.'), { code: 'stripe-failed' }));
  createStripeClient.mockReturnValue({
    retrieveSubscription: async () => ({ id: 'sub_1', status: 'active' }),
    cancelSubscription: fail,
    listSubscriptions: async () => [],
    deleteCustomer: async () => ({}),
  });
  const res = await del({ token: 'good' });
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'billing-unavailable' });
  expect(db.data('bets/mine')).toBeTruthy();
  expect(db.data(`bets/open/votes/${UID}`)).toBeTruthy();
  expect(db.data(`entitlements/${UID}`)).toBeTruthy();
  expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  expect(auth.deleteUser).not.toHaveBeenCalled();
  const logged = JSON.stringify(error.mock.calls);
  [UID, PHONE, 'cus_1', 'sub_1', 'Jack'].forEach((secret) => expect(logged).not.toContain(secret));
  error.mockRestore();
});

test('an unexpected failure is a 500 that logs only the error code', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  auth.deleteUser.mockRejectedValue(Object.assign(new Error(`user ${UID} ${PHONE}`), { code: 'auth/internal-error' }));
  const res = await del({ token: 'good' });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: 'server' });
  const logged = JSON.stringify(error.mock.calls);
  expect(logged).toContain('auth/internal-error');
  [UID, PHONE, 'good', 'Jack'].forEach((secret) => expect(logged).not.toContain(secret));
  error.mockRestore();
});

test('a deleteUser failure is a 500 with tokens unrevoked, and a retry with the same token succeeds', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  // Model real revocation: once revoked, the same ID token fails the check.
  let revoked = false;
  const verify = auth.verifyIdToken.getMockImplementation();
  auth.verifyIdToken.mockImplementation(async (token, checkRevoked) => {
    if (revoked && checkRevoked) throw Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
    return verify(token);
  });
  auth.revokeRefreshTokens.mockImplementation(async () => {
    revoked = true;
  });
  auth.deleteUser.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/internal-error' }));

  let res = await del({ token: 'good' });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: 'server' });
  expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  expect(db.data(`entitlements/${UID}`)).toBeUndefined();

  res = await del({ token: 'good' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ deleted: true });
  expect(auth.deleteUser).toHaveBeenCalledTimes(2);
  expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(1);
  expect(auth.verifyIdToken.mock.calls).toEqual([['good', true], ['good', true]]);
  error.mockRestore();
});

test('missing admin credentials are a 503', async () => {
  adminAuth.mockImplementation(() => {
    throw Object.assign(new Error('missing'), { code: 'admin-not-configured' });
  });
  const res = await del({ token: 'good' });
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'not-configured' });
});

describe('CORS', () => {
  test('an allowed origin gets DELETE, OPTIONS on responses and preflight', async () => {
    const origin = 'capacitor://localhost';
    let res = await del({ token: 'good', origin });
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    expect(res.headers.get('access-control-allow-methods')).toBe('DELETE, OPTIONS');
    expect(res.headers.get('cache-control')).toBe('no-store');
    res = await del({ origin });
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    res = OPTIONS(new Request('http://localhost/api/account', { method: 'OPTIONS', headers: { Origin: origin } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe('DELETE, OPTIONS');
    expect(adminAuth).toHaveBeenCalledTimes(1);
  });

  test('another origin gets no CORS headers', async () => {
    const res = await del({ token: 'forged', origin: 'https://evil.example' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
