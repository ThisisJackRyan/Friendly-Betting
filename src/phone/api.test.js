import { runTransaction } from 'firebase/firestore';
import { auth } from '../Config/firebase-config';
import { castVote, saveBet, settleBet } from './api';
import { rememberBet } from './notificationStore';
import { requestResultTexts } from './resultTexts';

jest.mock('../Config/firebase-config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  runTransaction: jest.fn(),
}));
jest.mock('./notificationStore', () => ({ rememberBet: jest.fn() }));
jest.mock('./resultTexts', () => ({ requestResultTexts: jest.fn() }));

let stored;
let tx;
beforeEach(() => {
  stored = {
    schemaVersion: 2, status: 'open', createdByID: 'creator', question: 'Game on?', stake: 'Pizza',
    options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }],
    votes: [{ voterId: 'jack', name: 'Jack', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }],
  };
  auth.currentUser = { uid: 'creator', providerData: [{ providerId: 'phone' }] };
  tx = {
    get: jest.fn(async () => ({ exists: () => Boolean(stored), data: () => JSON.parse(JSON.stringify(stored)) })),
    update: jest.fn((_ref, patch) => { stored = { ...stored, ...patch }; }),
  };
  runTransaction.mockReset();
  runTransaction.mockImplementation(async (_db, run) => run(tx));
  rememberBet.mockClear();
  requestResultTexts.mockReset();
});

test('closing writes one atomic result with both winner and loser recipients', async () => {
  const result = await settleBet('abc123', 'a');
  expect(tx.update).toHaveBeenCalledTimes(1);
  expect(stored).toMatchObject({ status: 'closed', winnerId: 'a', settledAt: expect.any(Number) });
  expect(stored.settlement.recipients).toEqual([{ voterId: 'jack', won: true }, { voterId: 'sam', won: false }]);
  expect(result.settlement.winners).toEqual([{ voterId: 'jack', name: 'Jack' }]);
});

test('retrying the same close preserves the event; a different outcome cannot overwrite it', async () => {
  const first = await settleBet('abc123', 'a');
  expect(await settleBet('abc123', 'a')).toEqual(first);
  expect(tx.update).toHaveBeenCalledTimes(1);
  await expect(settleBet('abc123', 'b')).rejects.toThrow('already settled');
  expect(tx.update).toHaveBeenCalledTimes(1);
});

test.each([null, { uid: 'creator', providerData: [] }, { uid: 'other', providerData: [{ providerId: 'phone' }] }])('rejects an unauthorized settlement: %p', async (actor) => {
  auth.currentUser = actor;
  await expect(settleBet('abc123', 'a')).rejects.toThrow('Only the creator');
  expect(tx.update).not.toHaveBeenCalled();
});

test('an anonymous session with the creator uid cannot settle', async () => {
  auth.currentUser = { uid: 'creator', isAnonymous: true, providerData: [{ providerId: 'anonymous' }] };
  await expect(settleBet('abc123', 'a')).rejects.toThrow('Only the creator can settle this bet.');
  expect(tx.update).not.toHaveBeenCalled();
});

test.each([
  ['no createdByID', { betID: 'ml-1', type: 'Money Line', bet: 'Who wins' }],
  ['an empty createdByID', { betID: 'ml-1', type: 'Money Line', bet: 'Who wins', createdByID: '' }],
])('a legacy bet with %s cannot be settled from the client', async (_label, legacy) => {
  stored = legacy;
  for (const actor of [
    { uid: 'creator', providerData: [{ providerId: 'phone' }] },
    { uid: '', providerData: [{ providerId: 'phone' }] },
    { providerData: [{ providerId: 'phone' }] },
  ]) {
    auth.currentUser = actor;
    await expect(settleBet('legacy1', 'a')).rejects.toThrow('Only the creator can settle this bet.');
  }
  expect(tx.update).not.toHaveBeenCalled();
});

test('invalid and missing bets cannot close or notify', async () => {
  await expect(settleBet('abc123', 'wrong')).rejects.toThrow('Pick one');
  expect(tx.update).not.toHaveBeenCalled();
  stored = null;
  await expect(settleBet('abc123', 'a')).rejects.toThrow('gone');
  expect(tx.update).not.toHaveBeenCalled();
});

test('a retried transaction includes the final vote committed before closure', async () => {
  runTransaction.mockImplementationOnce(async (_db, run) => {
    // Firestore discards a conflicted attempt and invokes the callback again.
    await run({ ...tx, update: jest.fn() });
    stored.votes.push({ voterId: 'maya', name: 'Maya', optionId: 'a' });
    return run(tx);
  });
  const result = await settleBet('abc123', 'a');
  expect(result.settlement.winners.map((winner) => winner.name)).toEqual(['Jack', 'Maya']);
  expect(tx.update).toHaveBeenCalledTimes(1);
});

test('only a committed pick subscribes the participant to results', async () => {
  const vote = { voterId: 'maya', name: 'Maya', optionId: 'a' };
  runTransaction.mockRejectedValueOnce(new Error('offline'));
  await expect(castVote('abc123', vote)).rejects.toThrow('offline');
  expect(rememberBet).not.toHaveBeenCalled();
  await castVote('abc123', vote);
  expect(rememberBet).toHaveBeenCalledWith('maya', 'abc123');
  await settleBet('abc123', 'a');
  await expect(castVote('abc123', { ...vote, optionId: 'b' })).rejects.toThrow('closed');
});

test('invalid picks and late edits cannot alter the final result', async () => {
  await expect(castVote('abc123', { voterId: 'sam', optionId: 'missing' })).rejects.toThrow('Pick one');
  await settleBet('abc123', 'a');
  await expect(saveBet('abc123', { stake: '$200' })).rejects.toThrow('settled');
  expect(stored.settlement.stake).toBe('Pizza');
});

test('legacy option data is read inside the same closing transaction', async () => {
  stored = { ...stored, schemaVersion: 1, type: 'Money Line', betID: 'legacy' };
  delete stored.options;
  tx.get.mockImplementation(async (ref) => ({
    exists: () => true,
    data: () => ref.collection === 'bets' ? stored : { contestant1: 'Lakers', contestant2: 'Bulls' },
  }));
  const result = await settleBet('abc123', 'b');
  expect(tx.get).toHaveBeenCalledWith({ collection: 'MoneyLineBets', id: 'legacy' });
  expect(result.settlement.optionLabel).toBe('Bulls');
  expect(result.settlement.winners).toEqual([{ voterId: 'sam', name: 'Sam' }]);
});

test('deadline expiry blocks new picks but still lets the creator settle', async () => {
  stored.closesAt = 1;
  await expect(castVote('abc123', { voterId: 'late', optionId: 'a' })).rejects.toThrow('closed');
  expect(rememberBet).not.toHaveBeenCalled();
  expect(tx.update).not.toHaveBeenCalled();
  const result = await settleBet('abc123', 'a');
  expect(result.status).toBe('closed');
  expect(result.settlement.recipients).toHaveLength(2);
});

test('a committed settle asks the server for result texts once, after the write', async () => {
  requestResultTexts.mockImplementation(() => {
    expect(stored.status).toBe('closed');
  });
  await settleBet('abc123', 'a');
  expect(requestResultTexts).toHaveBeenCalledTimes(1);
  expect(requestResultTexts).toHaveBeenCalledWith('abc123');
  // A same-winner retry re-requests; the server claims each number only once.
  await settleBet('abc123', 'a');
  expect(requestResultTexts).toHaveBeenCalledTimes(2);
});

test('a failed settle never asks for result texts', async () => {
  auth.currentUser = null;
  await expect(settleBet('abc123', 'a')).rejects.toThrow('Only the creator');
  auth.currentUser = { uid: 'creator', providerData: [{ providerId: 'phone' }] };
  runTransaction.mockRejectedValueOnce(new Error('offline'));
  await expect(settleBet('abc123', 'a')).rejects.toThrow('offline');
  await settleBet('abc123', 'a');
  await expect(settleBet('abc123', 'b')).rejects.toThrow('already settled');
  expect(requestResultTexts).toHaveBeenCalledTimes(1);
});

test('votes and settlements never carry a phone number', async () => {
  await castVote('abc123', { voterId: 'maya', name: 'Maya', optionId: 'a', phone: '+12025550143' });
  await settleBet('abc123', 'a');
  const written = JSON.stringify(tx.update.mock.calls.map(([, patch]) => patch));
  expect(written).not.toMatch(/phone|e164|2025550143/i);
  expect(JSON.stringify(stored)).not.toMatch(/phone|e164|2025550143/i);
});
