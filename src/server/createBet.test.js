/** @jest-environment node */
import { createBetForCreator, creatorFields, isEarlyType, isRematch } from './createBet';
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
// Many bets: creating is never capped.
const MANY = 25;

// `count` existing bets by creator-1, plus one by someone else.
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
  test('a free creator creates the bet in the shape createBet writes', async () => {
    const db = seeded({ count: 2 });
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

  test.each([
    ['no entitlement', undefined],
    ['an expired plan', EXPIRED],
    ['live Pro', PRO],
    ['a legacy founder', FOUNDER],
  ])('creating is not capped: a creator with %s and many bets still creates', async (_name, entitlement) => {
    const db = seeded({ count: MANY, entitlement });
    await expect(create(db)).resolves.toEqual({ code: 'new001' });
    expect(db.data('bets/new001')).toMatchObject({ question: fields.question, createdByID: 'creator-1' });
  });

  test('a free creator makes one bet after another', async () => {
    const db = seeded();
    for (let i = 0; i < 6; i += 1) {
      await expect(create(db, { newCode: codes(`b${i}`) })).resolves.toEqual({ code: `b${i}` });
    }
    expect(db.paths('bets/b')).toHaveLength(6);
  });

  describe('rematch', () => {
    const rematch = { ...fields, rematchOf: { code: 'old123' } };

    test.each([
      ['no entitlement', undefined],
      ['an expired plan', EXPIRED],
    ])('needs Pro: %s is pro-required, even with no other bets', async (_name, entitlement) => {
      const db = seeded({ count: 0, entitlement });
      await expect(create(db, { fields: rematch })).rejects.toMatchObject({ code: 'pro-required' });
      expect(db.paths('bets/new')).toEqual([]);
    });

    test.each([
      ['live Pro', PRO],
      ['a legacy founder', FOUNDER],
    ])('%s runs it back, link and all', async (_name, entitlement) => {
      const db = seeded({ count: MANY, entitlement });
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
});
