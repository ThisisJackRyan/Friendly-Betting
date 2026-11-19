/** @jest-environment node */
import {
  RECENT_LOGIN_SECONDS,
  authorizeAccountDeletion,
  deleteAccount,
  isAccountDeleted,
  isMissingIndex,
  tombstonePath,
} from './deleteAccount';
import { createStripeClient } from './deleteAccountStripe';
import { numbersPath } from './resultTexts';
import { fakeDb } from './testing/fakeDb';

const UID = 'me-uid';
const PHONE = '+15551234567';
const NOW = 1_800_000_000_000;
const options = [
  { id: 'a', label: 'Yes' },
  { id: 'b', label: 'No' },
];

const settled = {
  code: 'settled',
  createdByID: 'maya',
  createdByName: 'Maya',
  status: 'closed',
  winnerId: 'a',
  options,
  votes: [
    { voterId: UID, name: 'Jack', optionId: 'a', at: 1 },
    { voterId: 'sam', name: 'Sam', optionId: 'a', at: 2 },
  ],
  settlement: {
    version: 1,
    optionId: 'a',
    optionLabel: 'Yes',
    winners: [{ voterId: UID, name: 'Jack' }, { voterId: 'sam', name: 'Sam' }],
    recipients: [{ voterId: UID, won: true }, { voterId: 'sam', won: true }],
  },
};

function seeded(extra = {}, dbOptions = {}) {
  return fakeDb({
    // A bet this member created, with a friend's pick and number.
    'bets/mine': { code: 'mine', createdByID: UID, createdByName: 'Jack', status: 'open', options, votes: [] },
    'bets/mine/votes/friend': { voterId: 'friend', name: 'Lee', optionId: 'a', at: 1 },
    'privateResultTexts/mine': { note: 'parent' },
    [`${numbersPath('mine')}/n-friend`]: { e164: '+12025550100', voterId: 'friend', optionId: 'a' },
    // Settled, someone else's.
    'bets/settled': settled,
    [`bets/settled/votes/${UID}`]: { voterId: UID, name: 'Jack', optionId: 'a', at: 1 },
    'bets/settled/votes/sam': { voterId: 'sam', name: 'Sam', optionId: 'a', at: 2 },
    [`${numbersPath('settled')}/n-me`]: { e164: PHONE, voterId: UID, optionId: 'a' },
    [`${numbersPath('settled')}/n-sam`]: { e164: '+12025550101', voterId: 'sam', optionId: 'a' },
    // Called off, someone else's.
    'bets/off': {
      code: 'off', createdByID: 'maya', status: 'closed', calledOff: true, options,
      votes: [{ voterId: UID, name: 'Jack', optionId: 'b', at: 1 }],
    },
    [`bets/off/votes/${UID}`]: { voterId: UID, name: 'Jack', optionId: 'b', at: 1 },
    // Open, someone else's.
    'bets/open': {
      code: 'open', createdByID: 'maya', status: 'open', options,
      votes: [{ voterId: UID, name: 'Jack', optionId: 'a', at: 1 }, { voterId: 'sam', name: 'Sam', optionId: 'b', at: 2 }],
    },
    [`bets/open/votes/${UID}`]: { voterId: UID, name: 'Jack', optionId: 'a', at: 1 },
    'bets/open/votes/sam': { voterId: 'sam', name: 'Sam', optionId: 'b', at: 2 },
    [`${numbersPath('open')}/n-me`]: { e164: PHONE, voterId: UID, optionId: 'a' },
    // Billing.
    [`entitlements/${UID}`]: { plan: 'pro', source: 'stripe', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' },
    'stripeCustomers/cus_1': { uid: UID },
    [`stripeNoticeDismissals/${UID}`]: { at: 1 },
    // Push.
    [`privatePushTokens/${UID}`]: { windowStart: 1, count: 2 },
    [`privatePushTokens/${UID}/devices/d1`]: { token: 'fcm-1', platform: 'ios' },
    [`privatePushTokens/${UID}/devices/d2`]: { token: 'fcm-2', platform: 'android' },
    'privatePushDevices/d1': { uid: UID },
    'privatePushDevices/d2': { uid: 'someone-else' },
    'privatePushDevices/d3': { uid: UID },
    [`privatePushSends/pick:open:${UID}`]: { code: 'open', at: 1 },
    [`privatePushSends/pick:settled:${UID}`]: { code: 'settled', at: 1 },
    'privatePushSends/pick:open:sam': { code: 'open', at: 1 },
    'privatePushSends/closing:mine': { at: 1 },
    'privatePushSends/pickcount:mine': { at: 1 },
    'privatePushSends/pickcount:open': { at: 1 },
    // Someone else's account.
    'entitlements/sam': { plan: 'pro', source: 'mock' },
    'privatePushTokens/sam': { windowStart: 1, count: 1 },
    ...extra,
  }, dbOptions);
}

function fakeAuth({ missing = false } = {}) {
  const gone = () => Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
  return {
    revokeRefreshTokens: jest.fn(async () => {
      if (missing) throw gone();
    }),
    deleteUser: jest.fn(async () => {
      if (missing) throw gone();
    }),
  };
}

function fakeStripe({ subs = [{ id: 'sub_1', status: 'active' }, { id: 'sub_2', status: 'trialing' }, { id: 'sub_3', status: 'canceled' }] } = {}) {
  return {
    retrieveSubscription: jest.fn(async (id) => subs.find((sub) => sub.id === id) || null),
    cancelSubscription: jest.fn(async (id) => ({ id, status: 'canceled' })),
    listSubscriptions: jest.fn(async () => subs),
    deleteCustomer: jest.fn(async (id) => ({ id, deleted: true })),
  };
}

const run = (db, more = {}) => deleteAccount({ db, auth: fakeAuth(), uid: UID, phoneNumber: PHONE, at: NOW, ...more });

describe('authorizeAccountDeletion', () => {
  const nowSec = NOW / 1000;
  const claims = (extra = {}) => ({
    uid: UID, phone_number: PHONE, auth_time: nowSec - 60, firebase: { sign_in_provider: 'phone' }, ...extra,
  });
  const auth = (result) => ({
    verifyIdToken: jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  });

  test('no token is unauthorized', async () => {
    await expect(authorizeAccountDeletion({ token: '', auth: auth(claims()), now: NOW })).resolves.toEqual({
      ok: false, status: 401, error: 'unauthorized',
    });
  });

  test('checks revocation and turns a revoked or bad token into 401', async () => {
    const revoked = auth(Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' }));
    await expect(authorizeAccountDeletion({ token: 't', auth: revoked, now: NOW })).resolves.toMatchObject({ status: 401, error: 'unauthorized' });
    expect(revoked.verifyIdToken).toHaveBeenCalledWith('t', true);
  });

  test('missing admin config is thrown for the route to map', async () => {
    const broken = auth(Object.assign(new Error('x'), { code: 'admin-not-configured' }));
    await expect(authorizeAccountDeletion({ token: 't', auth: broken, now: NOW })).rejects.toMatchObject({ code: 'admin-not-configured' });
  });

  test.each([
    ['anonymous', { firebase: { sign_in_provider: 'anonymous' }, phone_number: undefined }],
    ['no phone number', { phone_number: undefined }],
    ['anonymous provider even with a phone claim', { firebase: { sign_in_provider: 'anonymous' } }],
  ])('%s is forbidden', async (_name, extra) => {
    await expect(authorizeAccountDeletion({ token: 't', auth: auth(claims(extra)), now: NOW })).resolves.toEqual({
      ok: false, status: 403, error: 'forbidden',
    });
  });

  test('a sign-in older than 10 minutes needs a recent login', async () => {
    const stale = claims({ auth_time: nowSec - RECENT_LOGIN_SECONDS - 1 });
    await expect(authorizeAccountDeletion({ token: 't', auth: auth(stale), now: NOW })).resolves.toEqual({
      ok: false, status: 401, error: 'requires-recent-login',
    });
    const noTime = claims({ auth_time: undefined });
    await expect(authorizeAccountDeletion({ token: 't', auth: auth(noTime), now: NOW })).resolves.toMatchObject({ error: 'requires-recent-login' });
  });

  test('a fresh sign-in passes with the token uid and phone', async () => {
    const fresh = claims({ auth_time: nowSec - RECENT_LOGIN_SECONDS + 5 });
    await expect(authorizeAccountDeletion({ token: 't', auth: auth(fresh), now: NOW })).resolves.toEqual({
      ok: true, uid: UID, phoneNumber: PHONE,
    });
  });
});

describe('deleteAccount', () => {
  test('deletes the bets they created through deleteBet, votes and numbers included', async () => {
    const db = seeded();
    await expect(run(db)).resolves.toEqual({ deleted: true });
    expect(db.paths('bets/mine')).toEqual([]);
    expect(db.paths('privateResultTexts/mine')).toEqual([]);
    expect(db.data('privatePushSends/closing:mine')).toBeUndefined();
    expect(db.data('privatePushSends/pickcount:mine')).toBeUndefined();
    expect(db.data('privatePushSends/pickcount:open')).toBeTruthy();
  });

  test('a settled bet keeps the pick and who won but loses the name, everywhere', async () => {
    const db = seeded();
    await run(db);
    expect(db.data(`bets/settled/votes/${UID}`)).toEqual({ voterId: UID, name: '', optionId: 'a', at: 1 });
    expect(db.data('bets/settled/votes/sam').name).toBe('Sam');
    const bet = db.data('bets/settled');
    expect(bet.votes).toEqual([
      { voterId: UID, name: '', optionId: 'a', at: 1 },
      { voterId: 'sam', name: 'Sam', optionId: 'a', at: 2 },
    ]);
    expect(bet.settlement.winners).toEqual([{ voterId: UID, name: '' }, { voterId: 'sam', name: 'Sam' }]);
    expect(bet.settlement.recipients).toEqual(settled.settlement.recipients);
    expect(bet.winnerId).toBe('a');
    expect(bet.settlement.optionLabel).toBe('Yes');
  });

  test('a called-off bet keeps the pick and loses the name', async () => {
    const db = seeded();
    await run(db);
    expect(db.data(`bets/off/votes/${UID}`)).toEqual({ voterId: UID, name: '', optionId: 'b', at: 1 });
    expect(db.data('bets/off').votes).toEqual([{ voterId: UID, name: '', optionId: 'b', at: 1 }]);
  });

  test('an open bet loses the pick: vote doc and legacy entry', async () => {
    const db = seeded();
    await run(db);
    expect(db.data(`bets/open/votes/${UID}`)).toBeUndefined();
    expect(db.data('bets/open/votes/sam')).toBeTruthy();
    expect(db.data('bets/open').votes).toEqual([{ voterId: 'sam', name: 'Sam', optionId: 'b', at: 2 }]);
  });

  test('deletes their result-text numbers on any bet, and only theirs', async () => {
    const db = seeded();
    await run(db);
    expect(db.data(`${numbersPath('settled')}/n-me`)).toBeUndefined();
    expect(db.data(`${numbersPath('open')}/n-me`)).toBeUndefined();
    expect(db.data(`${numbersPath('settled')}/n-sam`)).toBeTruthy();
  });

  test('deletes entitlement, push data, pick claims, Stripe mapping and dismissal', async () => {
    const db = seeded();
    await run(db);
    expect(db.data(`entitlements/${UID}`)).toBeUndefined();
    expect(db.data('stripeCustomers/cus_1')).toBeUndefined();
    expect(db.data(`stripeNoticeDismissals/${UID}`)).toBeUndefined();
    expect(db.paths(`privatePushTokens/${UID}`)).toEqual([]);
    expect(db.data('privatePushDevices/d1')).toBeUndefined();
    expect(db.data('privatePushDevices/d3')).toBeUndefined();
    // A device that now belongs to someone else keeps its owner doc.
    expect(db.data('privatePushDevices/d2')).toEqual({ uid: 'someone-else' });
    expect(db.data(`privatePushSends/pick:open:${UID}`)).toBeUndefined();
    expect(db.data(`privatePushSends/pick:settled:${UID}`)).toBeUndefined();
    expect(db.data('privatePushSends/pick:open:sam')).toBeTruthy();
    expect(db.data('entitlements/sam')).toBeTruthy();
    expect(db.data('privatePushTokens/sam')).toBeTruthy();
  });

  test('writes the tombstone first and keeps it', async () => {
    const db = seeded();
    await run(db);
    expect(db.writes[0]).toEqual(['set', tombstonePath(UID)]);
    expect(db.data(tombstonePath(UID))).toEqual({ at: NOW });
  });

  test('an existing tombstone is kept as it is', async () => {
    const db = seeded({ [tombstonePath(UID)]: { at: 5 } });
    await run(db);
    expect(db.data(tombstonePath(UID))).toEqual({ at: 5 });
  });

  test('deletes the Auth user, then revokes tokens, last', async () => {
    const db = seeded();
    const auth = fakeAuth();
    const order = [];
    auth.revokeRefreshTokens.mockImplementation(async () => order.push(['revoke', db.data(`entitlements/${UID}`)]));
    auth.deleteUser.mockImplementation(async () => order.push(['delete', db.data(`entitlements/${UID}`)]));
    await run(db, { auth });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
    expect(order).toEqual([['delete', undefined], ['revoke', undefined]]);
  });

  test('a revoke failure after the user is deleted is still success', async () => {
    const db = seeded();
    const auth = fakeAuth();
    auth.revokeRefreshTokens.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/internal-error' }));
    await expect(run(db, { auth })).resolves.toEqual({ deleted: true });
    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
  });

  test('an Auth user that is already gone and missing docs are success', async () => {
    const db = fakeDb();
    await expect(run(db, { auth: fakeAuth({ missing: true }) })).resolves.toEqual({ deleted: true });
    expect(db.data(tombstonePath(UID))).toEqual({ at: NOW });
  });

  test('a deleteUser failure other than not-found fails the request after the data is gone, with nothing revoked', async () => {
    const db = seeded();
    const auth = fakeAuth();
    auth.deleteUser.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/internal-error' }));
    await expect(run(db, { auth })).rejects.toMatchObject({ code: 'auth/internal-error' });
    expect(db.data(`entitlements/${UID}`)).toBeUndefined();
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  test('a retry is a no-op success', async () => {
    const db = seeded();
    await run(db);
    const before = JSON.stringify(Array.from(db.store.entries()).map(([key, value]) => [key, value.data]));
    await expect(run(db, { at: NOW + 1 })).resolves.toEqual({ deleted: true });
    const after = JSON.stringify(Array.from(db.store.entries()).map(([key, value]) => [key, value.data]));
    expect(after).toBe(before);
  });

  test('a vote doc whose bet is gone is cleaned up', async () => {
    const db = fakeDb({ [`bets/gone/votes/${UID}`]: { voterId: UID, name: 'Jack', optionId: 'a', at: 1 } });
    await run(db);
    expect(db.paths('bets/gone')).toEqual([]);
  });

  test('without phone or uid nothing is touched', async () => {
    const db = seeded();
    await expect(deleteAccount({ db, auth: fakeAuth(), uid: UID, phoneNumber: '' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(db.writes).toEqual([]);
  });

  describe('legacy picks found through a number', () => {
    // A pick only in bets/{code}.votes[] (no vote doc), plus their number.
    const legacyOnly = (code, extra = {}) => ({
      [`bets/${code}`]: {
        code, createdByID: 'maya', status: 'open', options,
        votes: [{ voterId: UID, name: 'Jack', optionId: 'a', at: 1 }, { voterId: 'sam', name: 'Sam', optionId: 'b', at: 2 }],
        ...extra,
      },
      [`${numbersPath(code)}/n-me`]: { e164: PHONE, voterId: UID, optionId: 'a' },
      [`${numbersPath(code)}/n-sam`]: { e164: '+12025550101', voterId: 'sam', optionId: 'b' },
    });

    test('an open bet loses the entry and the number; the other voter keeps theirs', async () => {
      const db = fakeDb(legacyOnly('old'));
      await run(db);
      expect(db.data('bets/old').votes).toEqual([{ voterId: 'sam', name: 'Sam', optionId: 'b', at: 2 }]);
      expect(db.data(`${numbersPath('old')}/n-me`)).toBeUndefined();
      expect(db.data(`${numbersPath('old')}/n-sam`)).toBeTruthy();
    });

    test('a settled bet keeps the pick with the name cleared and loses the number', async () => {
      const db = fakeDb(legacyOnly('old', { status: 'closed', winnerId: 'a' }));
      await run(db);
      expect(db.data('bets/old').votes).toEqual([
        { voterId: UID, name: '', optionId: 'a', at: 1 },
        { voterId: 'sam', name: 'Sam', optionId: 'b', at: 2 },
      ]);
      expect(db.data(`${numbersPath('old')}/n-me`)).toBeUndefined();
      expect(db.data(`${numbersPath('old')}/n-sam`)).toBeTruthy();
    });

    test('a "numbers" collection under any other parent is left alone', async () => {
      const db = fakeDb({
        'someOther/x/numbers/n-me': { e164: PHONE, voterId: UID },
        'privateResultTexts/x/deeper/y/numbers/n-me': { e164: PHONE, voterId: UID },
      });
      await run(db);
      expect(db.data('someOther/x/numbers/n-me')).toBeTruthy();
      expect(db.data('privateResultTexts/x/deeper/y/numbers/n-me')).toBeTruthy();
      expect(db.writes.filter(([, path]) => path.includes('/x/') || path.includes(':x:'))).toEqual([]);
    });

    test('pick claims on bets found through a number go too', async () => {
      const db = fakeDb({ ...legacyOnly('old'), [`privatePushSends/pick:old:${UID}`]: { code: 'old', at: 1 } });
      await run(db);
      expect(db.data(`privatePushSends/pick:old:${UID}`)).toBeUndefined();
    });
  });

  describe('a missing index', () => {
    test.each(['votes', 'numbers'])('on %s fails before Stripe or any delete, with only the tombstone written', async (group) => {
      const db = seeded({}, { failCollectionGroup: { [group]: Object.assign(new Error('needs an index'), { code: 9 }) } });
      const stripe = fakeStripe();
      const auth = fakeAuth();
      await expect(run(db, { stripe, auth })).rejects.toMatchObject({ code: 'missing-index' });
      Object.values(stripe).forEach((fn) => expect(fn).not.toHaveBeenCalled());
      expect(auth.deleteUser).not.toHaveBeenCalled();
      expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
      expect(db.writes).toEqual([['set', tombstonePath(UID)]]);
      expect(db.data('bets/mine')).toBeTruthy();
      expect(db.data(`bets/open/votes/${UID}`)).toBeTruthy();
      expect(db.data(`${numbersPath('open')}/n-me`)).toBeTruthy();
      expect(db.data(`entitlements/${UID}`)).toBeTruthy();
      expect(db.data(`privatePushTokens/${UID}`)).toBeTruthy();
    });

    test('the string form of the code is caught too', async () => {
      const db = seeded({}, { failCollectionGroup: { votes: { code: 'failed-precondition' } } });
      await expect(run(db)).rejects.toMatchObject({ code: 'missing-index' });
      expect(db.writes).toEqual([['set', tombstonePath(UID)]]);
    });

    test('isMissingIndex knows the Admin SDK codes', () => {
      expect(isMissingIndex({ code: 9 })).toBe(true);
      expect(isMissingIndex({ code: 'failed-precondition' })).toBe(true);
      expect(isMissingIndex({ code: 'missing-index' })).toBe(true);
      expect(isMissingIndex({ code: 'stripe-failed' })).toBe(false);
      expect(isMissingIndex(null)).toBe(false);
    });
  });

  describe('Stripe', () => {
    test('present: cancels the open subscriptions now, then deletes the customer', async () => {
      const db = seeded();
      const stripe = fakeStripe();
      await run(db, { stripe });
      expect(stripe.retrieveSubscription).toHaveBeenCalledWith('sub_1');
      expect(stripe.cancelSubscription.mock.calls).toEqual([['sub_1'], ['sub_2']]);
      expect(stripe.listSubscriptions).toHaveBeenCalledWith('cus_1');
      expect(stripe.deleteCustomer).toHaveBeenCalledWith('cus_1');
      expect(db.data(`entitlements/${UID}`)).toBeUndefined();
    });

    test('an already canceled subscription is not canceled again', async () => {
      const db = seeded();
      const stripe = fakeStripe({ subs: [{ id: 'sub_1', status: 'canceled' }] });
      await run(db, { stripe });
      expect(stripe.cancelSubscription).not.toHaveBeenCalled();
      expect(stripe.deleteCustomer).toHaveBeenCalledWith('cus_1');
    });

    test('a failed cancel stops before bets, entitlement or Auth are touched', async () => {
      const db = seeded();
      const stripe = fakeStripe();
      stripe.cancelSubscription.mockRejectedValue(Object.assign(new Error('Stripe request failed.'), { code: 'stripe-failed' }));
      const auth = fakeAuth();
      await expect(run(db, { stripe, auth })).rejects.toMatchObject({ code: 'stripe-failed' });
      expect(db.data('bets/mine')).toBeTruthy();
      expect(db.data(`bets/open/votes/${UID}`)).toBeTruthy();
      expect(db.data(`entitlements/${UID}`)).toBeTruthy();
      expect(db.data('stripeCustomers/cus_1')).toBeTruthy();
      expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
      expect(auth.deleteUser).not.toHaveBeenCalled();
      // Only the tombstone was written.
      expect(db.writes).toEqual([['set', tombstonePath(UID)]]);
    });

    test('absent: skips Stripe and still deletes the entitlement and mapping', async () => {
      const db = seeded();
      await run(db, { stripe: null });
      expect(db.data(`entitlements/${UID}`)).toBeUndefined();
      expect(db.data('stripeCustomers/cus_1')).toBeUndefined();
      expect(db.data(`stripeNoticeDismissals/${UID}`)).toBeUndefined();
    });

    test('a member with no Stripe ids never calls Stripe', async () => {
      const db = seeded({ [`entitlements/${UID}`]: { plan: 'pro', source: 'mock' } });
      const stripe = fakeStripe();
      await run(db, { stripe });
      Object.values(stripe).forEach((fn) => expect(fn).not.toHaveBeenCalled());
      expect(db.data(`entitlements/${UID}`)).toBeUndefined();
    });

    test('a mapping that names another uid is left alone', async () => {
      const db = seeded({ 'stripeCustomers/cus_1': { uid: 'someone-else' } });
      await run(db);
      expect(db.data('stripeCustomers/cus_1')).toEqual({ uid: 'someone-else' });
    });
  });

  test('logs nothing personal', async () => {
    const spies = ['log', 'info', 'warn', 'error'].map((name) => jest.spyOn(console, name).mockImplementation(() => {}));
    const db = seeded();
    const stripe = fakeStripe();
    await run(db, { stripe });
    stripe.cancelSubscription.mockRejectedValue(Object.assign(new Error('x'), { code: 'stripe-failed' }));
    await run(seeded(), { stripe }).catch(() => {});
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    [UID, PHONE, '5551234567', 'Jack', 'cus_1', 'sub_1', 'fcm-1'].forEach((secret) => expect(logged).not.toContain(secret));
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe('isAccountDeleted (for the Stripe webhook guard)', () => {
  test('true only once the tombstone exists', async () => {
    const db = seeded();
    await expect(isAccountDeleted(db, UID)).resolves.toBe(false);
    await run(db);
    await expect(isAccountDeleted(db, UID)).resolves.toBe(true);
    await expect(isAccountDeleted(db, 'sam')).resolves.toBe(false);
    await expect(isAccountDeleted(db, '')).resolves.toBe(false);
  });

  test('the tombstone is written before a failed Stripe step, so a late webhook still sees it', async () => {
    const db = seeded();
    const stripe = fakeStripe();
    stripe.deleteCustomer.mockRejectedValue(Object.assign(new Error('x'), { code: 'stripe-failed' }));
    await run(db, { stripe }).catch(() => {});
    await expect(isAccountDeleted(db, UID)).resolves.toBe(true);
  });
});

describe('createStripeClient', () => {
  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  test('is null without a secret key', () => {
    expect(createStripeClient({ key: '' })).toBeNull();
    expect(createStripeClient({ key: '   ' })).toBeNull();
  });

  test('calls the REST API with a Bearer key, form encoded', async () => {
    const fetchImpl = jest.fn(async () => response(200, { data: [{ id: 'sub_9', status: 'active' }] }));
    const stripe = createStripeClient({ key: 'sk_test_x', fetchImpl });
    await expect(stripe.listSubscriptions('cus_1')).resolves.toEqual([{ id: 'sub_9', status: 'active' }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/subscriptions?customer=cus_1&status=all&limit=100');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer sk_test_x');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    await stripe.cancelSubscription('sub_9');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://api.stripe.com/v1/subscriptions/sub_9');
    expect(fetchImpl.mock.calls[1][1].method).toBe('DELETE');
    await stripe.deleteCustomer('cus_1');
    expect(fetchImpl.mock.calls[2][0]).toBe('https://api.stripe.com/v1/customers/cus_1');
    expect(fetchImpl.mock.calls[2][1].method).toBe('DELETE');
  });

  test('a 404 is null (already gone); other failures throw stripe-failed without ids', async () => {
    let stripe = createStripeClient({ key: 'k', fetchImpl: async () => response(404, {}) });
    await expect(stripe.deleteCustomer('cus_1')).resolves.toBeNull();
    await expect(stripe.listSubscriptions('cus_1')).resolves.toEqual([]);
    stripe = createStripeClient({ key: 'k', fetchImpl: async () => response(500, { error: { message: 'cus_1' } }) });
    const err = await stripe.cancelSubscription('sub_1').catch((e) => e);
    expect(err.code).toBe('stripe-failed');
    expect(err.message).not.toMatch(/sub_1|cus_1/);
    stripe = createStripeClient({ key: 'k', fetchImpl: async () => { throw new Error('network'); } });
    await expect(stripe.retrieveSubscription('sub_1')).rejects.toMatchObject({ code: 'stripe-failed' });
  });
});
