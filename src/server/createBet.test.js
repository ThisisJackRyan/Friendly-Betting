/** @jest-environment node */
import { createBetForCreator, creatorFields, isEarlyType, isRematch } from './createBet';
import { FREE_BETS } from '../phone/proConfig';
import { fakeDb } from './testing/fakeDb';

const PHONE = '+15551234567';
const NOW = Date.UTC(2026, 10, 16);
const DAY = 24 * 60 * 60 * 1000;
const fields = {
  schemaVersion: 2,
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who wins tonight?',
  stake: 'Pizza',
  closesAt: NOW + DAY,
  options: [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Lions' }],
  line: null,
  createdByID: 'creator-1',
  createdByName: 'Jack',
};
const PRO = { plan: 'pro', source: 'mock', expiresAt: NOW + DAY };
const EXPIRED = { plan: 'pro', source: 'mock', expiresAt: NOW - DAY };
const FOUNDER = { plan: 'founder', source: 'mock', founderNumber: 3, expiresAt: null };

// `count` existing bets by creator-1, plus one by someone else that never counts.
function seeded({ count = 0, entitlement } = {}) {
  const docs = { 'bets/theirs': { createdByID: 'someone-else', status: 'open' } };
  for (let i = 0; i < count; i += 1) docs[`bets/mine${i}`] = { createdByID: 'creator-1', status: i ? 'open' : 'closed' };
  if (entitlement) docs['entitlements/creator-1'] = entitlement;
  return fakeDb(docs);
}

const codes = (...list) => {
  const next = [...list];
  return () => next.shift();
};

function create(db, extra = {}) {
  return createBetForCreator({
    db, uid: 'creator-1', phoneNumber: PHONE, fields, now: NOW, newCode: codes('new001', 'new002'), ...extra,
  });
}

describe('creatorFields', () => {
  test('keeps the creator\'s fields in their own name and drops result keys', () => {
    const clean = creatorFields({ ...fields, settledAt: 1, settlement: {}, calledOff: true }, 'creator-1');
    expect(clean).toEqual(fields);
  });

  test('fills in a missing createdByID and refuses someone else\'s', () => {
    const { createdByID, ...rest } = fields;
    expect(creatorFields(rest, 'creator-1').createdByID).toBe('creator-1');
    expect(() => creatorFields({ ...fields, createdByID: 'someone-else' }, 'creator-1')).toThrow(expect.objectContaining({ code: 'forbidden' }));
  });

  test.each([undefined, null, 'bet', 7, [fields]])('refuses %p as fields', (value) => {
    expect(() => creatorFields(value, 'creator-1')).toThrow(expect.objectContaining({ code: 'invalid-bet' }));
  });

  test('isRematch and isEarlyType', () => {
    expect(isRematch(fields)).toBe(false);
    expect(isRematch({ ...fields, rematchOf: { code: 'old123' } })).toBe(true);
    expect(isRematch({ ...fields, rematchOf: null })).toBe(false);
    expect(isEarlyType('money-line')).toBe(false);
    expect(isEarlyType('parlay', [{ id: 'parlay' }])).toBe(true);
    expect(isEarlyType(undefined, [{ id: 'parlay' }])).toBe(false);
  });
});

describe('createBetForCreator', () => {
  test('a free creator under the limit creates the bet in the shape createBet writes', async () => {
    const db = seeded({ count: FREE_BETS - 1 });
    await expect(create(db, { fields: { ...fields, status: 'closed', winnerId: 'a', votes: [{ voterId: 'x' }], code: 'zzz', createdAt: 1 } }))
      .resolves.toEqual({ code: 'new001' });
    expect(db.data('bets/new001')).toEqual({
      ...fields,
      schemaVersion: 2,
      code: 'new001',
      status: 'open',
      winnerId: null,
      votes: [],
      createdAt: NOW,
    });
  });

  test('FREE_BETS is 3: the 1st, 2nd and 3rd bets save, the 4th does not', async () => {
    expect(FREE_BETS).toBe(3);
    const db = seeded();
    for (let i = 0; i < FREE_BETS; i += 1) {
      await expect(create(db, { newCode: codes(`b${i}`) })).resolves.toEqual({ code: `b${i}` });
    }
    await expect(create(db, { newCode: codes('b9') })).rejects.toMatchObject({ code: 'free-bet-limit' });
    expect(db.data('bets/b9')).toBeUndefined();
  });

  test.each([
    ['at', FREE_BETS],
    ['over', FREE_BETS + 2],
  ])('a free creator %s the limit gets free-bet-limit and nothing is written', async (_name, count) => {
    const db = seeded({ count });
    const before = db.writes.length;
    await expect(create(db)).rejects.toMatchObject({ code: 'free-bet-limit' });
    expect(db.writes.length).toBe(before);
  });

  test('deleted bets don\'t count: only bets that still exist', async () => {
    const db = seeded({ count: FREE_BETS });
    db.store.delete('bets/mine0');
    await expect(create(db)).resolves.toEqual({ code: 'new001' });
  });

  test('an expired Pro plan is free: the limit applies', async () => {
    await expect(create(seeded({ count: FREE_BETS, entitlement: EXPIRED }))).rejects.toMatchObject({ code: 'free-bet-limit' });
  });

  test.each([
    ['live Pro', PRO],
    ['Pro with no expiry', { plan: 'pro', source: 'admin' }],
    ['a legacy founder', FOUNDER],
  ])('%s is unlimited', async (_name, entitlement) => {
    const db = seeded({ count: FREE_BETS + 5, entitlement });
    await expect(create(db)).resolves.toEqual({ code: 'new001' });
  });

  test('another creator\'s bets and entitlement never count', async () => {
    const db = seeded({ count: 0 });
    db.store.set('entitlements/someone-else', { data: PRO, version: 99 });
    for (let i = 0; i < FREE_BETS; i += 1) db.store.set(`bets/x${i}`, { data: { createdByID: 'someone-else' }, version: 99 });
    await expect(create(db)).resolves.toEqual({ code: 'new001' });
  });

  describe('rematch', () => {
    const rematch = { ...fields, rematchOf: { code: 'old123' } };

    test.each([
      ['no entitlement', undefined],
      ['an expired plan', EXPIRED],
    ])('needs Pro: %s is pro-required, even under the free limit', async (_name, entitlement) => {
      const db = seeded({ count: 0, entitlement });
      await expect(create(db, { fields: rematch })).rejects.toMatchObject({ code: 'pro-required' });
      expect(db.paths('bets/new')).toEqual([]);
    });

    test.each([
      ['live Pro', PRO],
      ['a legacy founder', FOUNDER],
    ])('%s runs it back, link and all, past the free limit', async (_name, entitlement) => {
      const db = seeded({ count: FREE_BETS + 1, entitlement });
      await expect(create(db, { fields: rematch })).resolves.toEqual({ code: 'new001' });
      expect(db.data('bets/new001').rematchOf).toEqual({ code: 'old123' });
    });
  });

  describe('early-access types', () => {
    const early = { ...fields, type: 'parlay' };
    const earlyTypes = [{ id: 'parlay', label: 'Parlay', hint: 'x' }];

    test('need the early-types flag and Pro', async () => {
      await expect(create(seeded({ entitlement: PRO }), { fields: early, earlyTypes, earlyTypesOn: false }))
        .rejects.toMatchObject({ code: 'pro-required' });
      await expect(create(seeded(), { fields: early, earlyTypes, earlyTypesOn: true }))
        .rejects.toMatchObject({ code: 'pro-required' });
      await expect(create(seeded({ entitlement: EXPIRED }), { fields: early, earlyTypes, earlyTypesOn: true }))
        .rejects.toMatchObject({ code: 'pro-required' });
      await expect(create(seeded({ entitlement: FOUNDER }), { fields: early, earlyTypes, earlyTypesOn: true }))
        .resolves.toEqual({ code: 'new001' });
    });

    test('the real list is empty, so no type is early access today', async () => {
      await expect(create(seeded(), { fields: early, earlyTypesOn: true })).resolves.toEqual({ code: 'new001' });
    });
  });

  test.each([
    ['no uid', { uid: '' }],
    ['no phone number (an anonymous bettor)', { phoneNumber: undefined }],
    ['someone else\'s createdByID', { fields: { ...fields, createdByID: 'someone-else' } }],
  ])('%s is forbidden and reads nothing', async (_name, extra) => {
    const db = seeded();
    const spy = jest.spyOn(db, 'runTransaction');
    await expect(create(db, extra)).rejects.toMatchObject({ code: 'forbidden' });
    expect(spy).not.toHaveBeenCalled();
  });

  test('a code collision picks a new code and leaves the existing bet alone', async () => {
    const db = seeded({ entitlement: PRO });
    db.store.set('bets/new001', { data: { createdByID: 'someone-else', question: 'Theirs' }, version: 99 });
    await expect(create(db)).resolves.toEqual({ code: 'new002' });
    expect(db.data('bets/new001')).toEqual({ createdByID: 'someone-else', question: 'Theirs' });
  });

  test('five collisions in a row give up', async () => {
    const db = seeded({ entitlement: PRO });
    db.store.set('bets/same', { data: {}, version: 99 });
    await expect(create(db, { newCode: () => 'same' })).rejects.toMatchObject({ code: 'collision' });
  });

  test('two creates at once can\'t both take the last free bet', async () => {
    const db = seeded({ count: FREE_BETS - 1 });
    const results = await Promise.allSettled([
      create(db, { newCode: codes('race1') }),
      create(db, { newCode: codes('race2') }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')[0].reason.code).toBe('free-bet-limit');
    expect(db.paths('bets/race')).toHaveLength(1);
  });
});
