/** @jest-environment node */
import { deleteBet } from './deleteBet';
import { numberId, numbersPath, saveVoterNumber } from './resultTexts';
import { fakeDb } from './testing/fakeDb';

const PHONE = '+15551234567';
const bet = {
  code: 'abc123',
  createdByID: 'creator-1',
  status: 'open',
  votes: [{ voterId: 'anon-1', optionId: 'a' }],
};

function seeded(extra = {}) {
  return fakeDb({
    'bets/abc123': bet,
    'privateResultTexts/abc123': { note: 'parent' },
    [`${numbersPath('abc123')}/n1`]: { e164: '+12025550143', voterId: 'anon-1', optionId: 'a' },
    [`${numbersPath('abc123')}/n2`]: { e164: '+12025550144', voterId: 'anon-2', optionId: 'b' },
    'bets/other': { ...bet, code: 'other' },
    [`${numbersPath('other')}/n9`]: { e164: '+12025550199', voterId: 'anon-9', optionId: 'a' },
    'MoneyLineBets/ml-1': { bet: 'Who wins' },
    ...extra,
  });
}

test('the creator deletes the bet, its numbers and the numbers parent, and nothing else', async () => {
  const db = seeded();
  await expect(deleteBet({ db, code: 'abc123', uid: 'creator-1', phoneNumber: PHONE })).resolves.toEqual({ deleted: true });
  expect(db.paths('bets/abc123')).toEqual([]);
  expect(db.paths('privateResultTexts/abc123')).toEqual([]);
  expect(db.data('bets/other')).toBeTruthy();
  expect(db.paths(numbersPath('other'))).toHaveLength(1);
  expect(db.data('MoneyLineBets/ml-1')).toBeTruthy();
});

test('running it twice succeeds and the second run writes nothing', async () => {
  const db = seeded();
  await deleteBet({ db, code: 'abc123', uid: 'creator-1', phoneNumber: PHONE });
  const writes = db.writes.length;
  await expect(deleteBet({ db, code: 'abc123', uid: 'creator-1', phoneNumber: PHONE })).resolves.toEqual({ deleted: true });
  expect(db.writes.length).toBe(writes);
});

test('a missing bet is a no-op success, even for someone else', async () => {
  const db = seeded();
  await expect(deleteBet({ db, code: 'gone99', uid: 'creator-9', phoneNumber: PHONE })).resolves.toEqual({ deleted: true });
  expect(db.writes).toEqual([]);
});

test.each([
  ['another phone user', 'creator-9', PHONE],
  ['the creator uid without a phone claim', 'creator-1', undefined],
  ['no uid', '', PHONE],
])('%s is forbidden and nothing is deleted', async (_name, uid, phoneNumber) => {
  const db = seeded();
  await expect(deleteBet({ db, code: 'abc123', uid, phoneNumber })).rejects.toMatchObject({ code: 'forbidden' });
  expect(db.writes).toEqual([]);
  expect(db.data('bets/abc123')).toBeTruthy();
});

test('a bet with no creator uid cannot be deleted by anyone', async () => {
  const db = seeded({ 'bets/legacy1': { betID: 'ml-1', type: 'Money Line' }, 'bets/legacy2': { createdByID: '' } });
  for (const code of ['legacy1', 'legacy2']) {
    await expect(deleteBet({ db, code, uid: 'creator-1', phoneNumber: PHONE })).rejects.toMatchObject({ code: 'forbidden' });
  }
  expect(db.writes).toEqual([]);
});

test('a number saved while the delete runs is deleted with the bet or refused', async () => {
  const db = seeded();
  await Promise.allSettled([
    deleteBet({ db, code: 'abc123', uid: 'creator-1', phoneNumber: PHONE }),
    saveVoterNumber({ db, code: 'abc123', uid: 'anon-1', phone: '2025550177' }),
  ]);
  expect(db.data('bets/abc123')).toBeUndefined();
  expect(db.data(`${numbersPath('abc123')}/${numberId('+12025550177')}`)).toBeUndefined();
  expect(db.paths('privateResultTexts/abc123')).toEqual([]);
});
