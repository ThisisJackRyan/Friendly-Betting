import { deleteDoc, getDocs, onSnapshot, runTransaction, writeBatch } from 'firebase/firestore';
import { auth } from '../Config/firebase-config';
import {
  callOffBet, castVote, deleteBet, renameVote, saveBet, settleBet, subscribeBet, subscribeMyBets, undoSettle,
} from './api';
import { rememberBet } from './notificationStore';
import { requestResultTexts } from './resultTexts';

jest.mock('../Config/firebase-config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({
  // bets/{code} -> { collection: 'bets', id }; bets/{code}/votes/{uid} ->
  // { collection: 'bets/{code}/votes', id: uid }.
  doc: (_db, ...path) => ({ collection: path.slice(0, -1).join('/'), id: path[path.length - 1] }),
  collection: (_db, ...path) => ({ path: path.join('/') }),
  query: (ref) => ref,
  where: () => null,
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  writeBatch: jest.fn(),
  runTransaction: jest.fn(),
  deleteDoc: jest.fn(async () => {}),
  serverTimestamp: () => 'SERVER_TIME',
  deleteField: () => 'DELETE_FIELD',
}));
jest.mock('./notificationStore', () => ({ rememberBet: jest.fn() }));
jest.mock('./resultTexts', () => ({
  requestResultTexts: jest.fn(),
  apiUrl: (path) => `https://www.friendly-bets.com${path}`,
}));

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
const isVoteRef = (ref) => /^bets\/[^/]+\/votes$/.test(ref?.collection || ref?.path || '');

let stored;
// bets/abc123/votes/{uid}, by uid.
let voteDocs;
// false: the live rules from before per-voter docs, which deny every read
// and write of bets/{code}/votes.
let voteRules;
let clock;
let tx;
beforeEach(() => {
  stored = {
    schemaVersion: 2, status: 'open', createdByID: 'creator', question: 'Game on?', stake: 'Pizza',
    options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }],
    votes: [{ voterId: 'jack', name: 'Jack', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }],
  };
  voteDocs = {};
  voteRules = true;
  clock = 100;
  auth.currentUser = { uid: 'creator', providerData: [{ providerId: 'phone' }] };
  // Vote doc writes wait for the commit, where rules without per-voter docs refuse them.
  let pending = [];
  tx = {
    get: jest.fn(async (ref) => {
      if (isVoteRef(ref)) {
        if (!voteRules) throw denied();
        const data = voteDocs[ref.id];
        return { exists: () => Boolean(data), data: () => JSON.parse(JSON.stringify(data)) };
      }
      return { exists: () => Boolean(stored), data: () => JSON.parse(JSON.stringify(stored)) };
    }),
    update: jest.fn((ref, patch) => {
      if (isVoteRef(ref)) {
        pending.push(() => { voteDocs[ref.id] = { ...voteDocs[ref.id], ...patch }; });
        return;
      }
      stored = { ...stored, ...patch };
      Object.keys(patch).forEach((key) => { if (patch[key] === 'DELETE_FIELD') delete stored[key]; });
    }),
    set: jest.fn((ref, data) => {
      pending.push(() => {
        clock += 1;
        voteDocs[ref.id] = { ...data, at: data.at === 'SERVER_TIME' ? { seconds: clock, nanoseconds: 0 } : data.at };
      });
    }),
  };
  runTransaction.mockReset();
  runTransaction.mockImplementation(async (_db, run) => {
    pending = [];
    const result = await run(tx);
    if (pending.length && !voteRules) throw denied();
    pending.forEach((apply) => apply());
    return result;
  });
  getDocs.mockReset();
  getDocs.mockImplementation(async (ref) => {
    if (isVoteRef(ref) && !voteRules) throw denied();
    return {
      docs: Object.entries(voteDocs).map(([id, data]) => ({ id, data: () => JSON.parse(JSON.stringify(data)) })),
    };
  });
  rememberBet.mockClear();
  requestResultTexts.mockReset();
});

test('closing writes one atomic result with both winner and loser recipients', async () => {
  const result = await settleBet('abc123', 'a');
  expect(tx.update).toHaveBeenCalledTimes(1);
  // Server time, so the rules can measure the undo window from it.
  expect(stored).toMatchObject({ status: 'closed', winnerId: 'a', settledAt: 'SERVER_TIME' });
  expect(result.settledAt).toBeNull();
  expect(stored.settlement.recipients).toEqual([{ voterId: 'jack', won: true }, { voterId: 'sam', won: false }]);
  expect(result.settlement.winners).toEqual([{ voterId: 'jack', name: 'Jack' }]);
});

test('retrying the same close preserves the event; a different outcome cannot overwrite it', async () => {
  const first = await settleBet('abc123', 'a');
  // The same result; the retry reads back the stored server settledAt.
  expect({ ...(await settleBet('abc123', 'a')), settledAt: null }).toEqual(first);
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

test('castVote writes only the voter\'s own doc, with a capped name and server time', async () => {
  await castVote('abc123', { voterId: 'maya', name: `  ${'M'.repeat(40)}  `, optionId: 'b' });
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.set).toHaveBeenCalledTimes(1);
  expect(tx.set.mock.calls[0][0]).toEqual({ collection: 'bets/abc123/votes', id: 'maya' });
  expect(tx.set.mock.calls[0][1]).toEqual({ voterId: 'maya', name: 'M'.repeat(30), optionId: 'b', at: 'SERVER_TIME' });
  expect(stored.votes).toHaveLength(2);
  expect(rememberBet).toHaveBeenCalledWith('maya', 'abc123');
});

test('castVote on rules without per-voter docs falls back to the array, the old way', async () => {
  voteRules = false;
  stored.votes = [{ voterId: 'jack', name: 'Jack', optionId: 'a', at: 5 }, { voterId: 'sam', name: 'Sam', optionId: 'b', at: 6 }];
  await castVote('abc123', { voterId: 'jack', name: ' Jackie ', optionId: 'b' });
  expect(voteDocs).toEqual({});
  expect(stored.votes.map((vote) => [vote.voterId, vote.optionId, vote.name])).toEqual([['sam', 'b', 'Sam'], ['jack', 'b', 'Jackie']]);
  expect(Object.keys(stored.votes[1])).toEqual(['voterId', 'name', 'optionId', 'at']);
  expect(rememberBet).toHaveBeenCalledWith('jack', 'abc123');
});

test('castVote falls back only on a permission refusal, never on other errors', async () => {
  runTransaction.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
  await expect(castVote('abc123', { voterId: 'maya', optionId: 'a' })).rejects.toMatchObject({ code: 'unavailable' });
  expect(runTransaction).toHaveBeenCalledTimes(1);
  await expect(castVote('abc123', { voterId: 'maya', optionId: 'zzz' })).rejects.toThrow('Pick one');
  expect(runTransaction).toHaveBeenCalledTimes(2);
});

test('a refusal on both paths (say, the bet closed meanwhile) surfaces the refusal', async () => {
  runTransaction.mockRejectedValue(denied());
  await expect(castVote('abc123', { voterId: 'maya', optionId: 'a' })).rejects.toMatchObject({ code: 'permission-denied' });
  expect(runTransaction).toHaveBeenCalledTimes(2);
  expect(rememberBet).not.toHaveBeenCalled();
});

test('renameVote changes only the name on the voter\'s own doc', async () => {
  voteDocs.jack = { voterId: 'jack', name: '', optionId: 'a', at: { seconds: 5, nanoseconds: 0 } };
  await renameVote('abc123', 'jack', '  John ');
  expect(tx.set).not.toHaveBeenCalled();
  expect(tx.update).toHaveBeenCalledTimes(1);
  expect(tx.update.mock.calls[0]).toEqual([{ collection: 'bets/abc123/votes', id: 'jack' }, { name: 'John' }]);
  expect(voteDocs.jack).toEqual({ voterId: 'jack', name: 'John', optionId: 'a', at: { seconds: 5, nanoseconds: 0 } });
});

test('renameVote caps the name at 30', async () => {
  voteDocs.jack = { voterId: 'jack', name: '', optionId: 'a', at: { seconds: 5, nanoseconds: 0 } };
  await renameVote('abc123', 'jack', 'J'.repeat(31));
  expect(voteDocs.jack.name).toBe('J'.repeat(30));
});

test('renameVote copies a pick still only in the array to the voter\'s doc, same side', async () => {
  await renameVote('abc123', 'jack', 'John');
  expect(tx.set.mock.calls[0][1]).toEqual({ voterId: 'jack', name: 'John', optionId: 'a', at: 'SERVER_TIME' });
  expect(stored.votes[0].name).toBe('Jack');
});

test('renameVote on rules without per-voter docs renames in the array, in place', async () => {
  voteRules = false;
  stored.votes = [{ voterId: 'jack', name: '', optionId: 'a', at: 5 }, { voterId: 'sam', name: 'Sam', optionId: 'b', at: 6 }];
  await renameVote('abc123', 'jack', '  John ');
  expect(tx.update).toHaveBeenCalledTimes(1);
  expect(Object.keys(tx.update.mock.calls[0][1])).toEqual(['votes']);
  expect(stored.votes).toEqual([{ voterId: 'jack', name: 'John', optionId: 'a', at: 5 }, { voterId: 'sam', name: 'Sam', optionId: 'b', at: 6 }]);
});

test('settleBet counts the merged votes: array, vote docs, and a doc over its array entry', async () => {
  voteDocs.sam = { voterId: 'sam', name: 'Sammy', optionId: 'a', at: { seconds: 9, nanoseconds: 0 } };
  voteDocs.maya = { voterId: 'maya', name: 'Maya', optionId: 'b', at: { seconds: 8, nanoseconds: 0 } };
  const result = await settleBet('abc123', 'a');
  expect(stored.settlement.winners).toEqual([{ voterId: 'jack', name: 'Jack' }, { voterId: 'sam', name: 'Sammy' }]);
  expect(stored.settlement.recipients).toEqual([
    { voterId: 'jack', won: true }, { voterId: 'maya', won: false }, { voterId: 'sam', won: true },
  ]);
  expect(result.votes.map((vote) => vote.voterId)).toEqual(['jack', 'maya', 'sam']);
});

test('settleBet on rules without per-voter docs settles from the array', async () => {
  voteRules = false;
  await settleBet('abc123', 'b');
  expect(stored.settlement.winners).toEqual([{ voterId: 'sam', name: 'Sam' }]);
});

test('undo and call off hand back the merged votes', async () => {
  voteDocs.maya = { voterId: 'maya', name: 'Maya', optionId: 'b', at: { seconds: 8, nanoseconds: 0 } };
  const off = await callOffBet('abc123');
  expect(off.votes.map((vote) => vote.voterId)).toEqual(['jack', 'sam', 'maya']);
});

test('renameVote refuses with no pick, on a closed bet, or a gone bet, before writing', async () => {
  await expect(renameVote('abc123', 'nobody', 'John')).rejects.toThrow();
  await expect(renameVote('abc123', '', 'John')).rejects.toThrow();
  await settleBet('abc123', 'a');
  tx.update.mockClear();
  await expect(renameVote('abc123', 'jack', 'John')).rejects.toThrow('closed');
  stored = null;
  await expect(renameVote('abc123', 'jack', 'John')).rejects.toThrow('gone');
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.set).not.toHaveBeenCalled();
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
  expect(tx.set).not.toHaveBeenCalled();
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
  const written = JSON.stringify([...tx.update.mock.calls, ...tx.set.mock.calls].map(([, patch]) => patch));
  expect(written).not.toMatch(/phone|e164|2025550143/i);
  expect(JSON.stringify(stored)).not.toMatch(/phone|e164|2025550143/i);
  expect(JSON.stringify(voteDocs)).not.toMatch(/phone|e164|2025550143/i);
});

describe('deleteBet', () => {
  const respond = (status, body) => {
    global.fetch = jest.fn(async () => ({
      ok: status < 300,
      status,
      json: async () => {
        if (body === undefined) throw new SyntaxError('no json');
        return body;
      },
    }));
  };

  beforeEach(() => {
    auth.currentUser = { uid: 'creator', providerData: [{ providerId: 'phone' }], getIdToken: jest.fn(async () => 'id-token') };
    deleteDoc.mockClear();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('calls the delete route with the ID token, through the shared API base', async () => {
    respond(200, { deleted: true });
    await deleteBet('abc123');
    expect(global.fetch).toHaveBeenCalledWith('https://www.friendly-bets.com/api/bets/abc123', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer id-token' },
    });
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  test('without server credentials it falls back to the rules-checked client delete', async () => {
    respond(503, { error: 'not-configured' });
    await deleteBet('abc123');
    expect(deleteDoc).toHaveBeenCalledWith({ collection: 'bets', id: 'abc123' });
  });

  test('the client fallback deletes the vote docs in one batch with the bet', async () => {
    respond(503, { error: 'not-configured' });
    voteDocs.maya = { voterId: 'maya', name: 'Maya', optionId: 'b', at: { seconds: 8, nanoseconds: 0 } };
    const batch = { delete: jest.fn(), commit: jest.fn(async () => {}) };
    writeBatch.mockReturnValue(batch);
    await deleteBet('abc123');
    expect(batch.delete.mock.calls).toEqual([
      [{ collection: 'bets/abc123/votes', id: 'maya' }],
      [{ collection: 'bets', id: 'abc123' }],
    ]);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  test.each([
    [403, { error: 'forbidden' }],
    [401, { error: 'unauthorized' }],
    [500, { error: 'server' }],
    [503, {}],
  ])('a %i fails and deletes nothing client-side', async (status, body) => {
    respond(status, body);
    await expect(deleteBet('abc123')).rejects.toThrow();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  test('a network failure throws and deletes nothing', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(deleteBet('abc123')).rejects.toThrow();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  describe('error tagging', () => {
    const goOffline = () => jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    afterEach(() => jest.restoreAllMocks());

    test('a rejected fetch is tagged offline', async () => {
      global.fetch = jest.fn(async () => {
        throw new TypeError('Failed to fetch');
      });
      await expect(deleteBet('abc123')).rejects.toMatchObject({ code: 'offline' });
    });

    test.each([
      [401, { error: 'unauthorized' }],
      [403, { error: 'forbidden' }],
      [404, { error: 'not-found' }],
      [500, { error: 'server' }],
      [500, undefined],
    ])('a %i is not tagged offline', async (status, body) => {
      respond(status, body);
      const err = await deleteBet('abc123').catch((caught) => caught);
      expect(err).toBeInstanceOf(Error);
      expect(err.code).not.toBe('offline');
    });

    test('an HTTP failure while the browser reports offline is tagged offline', async () => {
      goOffline();
      respond(500, { error: 'server' });
      await expect(deleteBet('abc123')).rejects.toMatchObject({ code: 'offline' });
    });

    test('a failed fallback client delete is not tagged offline', async () => {
      respond(503, { error: 'not-configured' });
      deleteDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
      await expect(deleteBet('abc123')).rejects.toMatchObject({ code: 'permission-denied' });
    });

    test('a failed fallback client delete while offline is tagged offline', async () => {
      goOffline();
      respond(503, { error: 'not-configured' });
      deleteDoc.mockRejectedValueOnce(new Error('unavailable'));
      await expect(deleteBet('abc123')).rejects.toMatchObject({ code: 'offline' });
    });

    test('a token refresh that hits the network is tagged offline', async () => {
      auth.currentUser.getIdToken = jest.fn(async () => {
        throw Object.assign(new Error('net'), { code: 'auth/network-request-failed' });
      });
      respond(200, {});
      await expect(deleteBet('abc123')).rejects.toMatchObject({ code: 'offline' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('signed out is not tagged offline', async () => {
      auth.currentUser = null;
      const err = await deleteBet('abc123').catch((caught) => caught);
      expect(err.code).not.toBe('offline');
    });
  });

  test('signed out never calls the route', async () => {
    auth.currentUser = null;
    respond(200, {});
    await expect(deleteBet('abc123')).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('called-off bets', () => {
  test.each([
    ['status called-off', { status: 'called-off' }],
    ['calledOff flag', { calledOff: true }],
  ])('%s: castVote refuses before writing', async (_label, patch) => {
    stored = { ...stored, ...patch };
    await expect(castVote('abc123', { voterId: 'maya', optionId: 'a' })).rejects.toThrow('This bet is closed.');
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.set).not.toHaveBeenCalled();
    expect(rememberBet).not.toHaveBeenCalled();
  });

  test.each([
    ['status called-off', { status: 'called-off' }],
    ['calledOff flag', { calledOff: true }],
  ])('%s: the creator cannot settle or edit it', async (_label, patch) => {
    stored = { ...stored, ...patch };
    await expect(settleBet('abc123', 'a')).rejects.toThrow('This bet is closed.');
    await expect(saveBet('abc123', { stake: '$200' })).rejects.toThrow('settled');
    expect(tx.update).not.toHaveBeenCalled();
    expect(requestResultTexts).not.toHaveBeenCalled();
  });
});

describe('undoSettle', () => {
  // The plain form, since the fake transaction reads back through JSON.
  const at = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
  beforeEach(async () => {
    await settleBet('abc123', 'a');
    stored = { ...stored, settledAt: at(Date.now() - 5000), calledOff: false };
    tx.update.mockClear();
    requestResultTexts.mockReset();
  });

  test('within the window it reopens the bet in one write that only touches result fields', async () => {
    const reopened = await undoSettle('abc123');
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update.mock.calls[0][1]).toEqual({
      status: 'open', winnerId: null, settledAt: 'DELETE_FIELD', settlement: 'DELETE_FIELD', calledOff: 'DELETE_FIELD',
    });
    expect(stored).toMatchObject({ status: 'open', winnerId: null, question: 'Game on?' });
    expect(stored).not.toHaveProperty('settledAt');
    expect(stored).not.toHaveProperty('settlement');
    expect(reopened).toMatchObject({ status: 'open', winnerId: null, votes: stored.votes });
    expect(reopened).not.toHaveProperty('settlement');
    expect(requestResultTexts).not.toHaveBeenCalled();
  });

  test('after the 35s rules window it refuses without writing', async () => {
    stored = { ...stored, settledAt: at(Date.now() - 36000) };
    await expect(undoSettle('abc123')).rejects.toThrow('Too late to undo.');
    expect(tx.update).not.toHaveBeenCalled();
  });

  test.each([
    ['an older number settledAt', (bet) => ({ ...bet, settledAt: Date.now() })],
    ['an open bet', (bet) => ({ ...bet, status: 'open', winnerId: null })],
    ['a called-off bet', (bet) => ({ ...bet, calledOff: true })],
  ])('refuses %s', async (_label, patch) => {
    stored = patch(stored);
    await expect(undoSettle('abc123')).rejects.toThrow('Too late to undo.');
    expect(tx.update).not.toHaveBeenCalled();
  });

  test.each([null, { uid: 'creator', providerData: [] }, { uid: 'other', providerData: [{ providerId: 'phone' }] }])('only the creator can undo: %p', async (actor) => {
    auth.currentUser = actor;
    await expect(undoSettle('abc123')).rejects.toThrow('Only the creator');
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe('callOffBet', () => {
  test('calls off an open bet with no winner and a server settledAt, then asks for the texts', async () => {
    const off = await callOffBet('abc123');
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update.mock.calls[0][1]).toEqual({ status: 'closed', calledOff: true, settledAt: 'SERVER_TIME' });
    expect(off).toMatchObject({ status: 'closed', calledOff: true, settledAt: null });
    expect(off).not.toHaveProperty('settlement');
    expect(requestResultTexts).toHaveBeenCalledWith('abc123');
  });

  test('calling off twice writes once', async () => {
    await callOffBet('abc123');
    await callOffBet('abc123');
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  test('a settled bet cannot be called off', async () => {
    await settleBet('abc123', 'a');
    tx.update.mockClear();
    await expect(callOffBet('abc123')).rejects.toThrow('already settled');
    expect(tx.update).not.toHaveBeenCalled();
  });

  test.each([null, { uid: 'creator', isAnonymous: true, providerData: [{ providerId: 'anonymous' }] }, { uid: 'other', providerData: [{ providerId: 'phone' }] }])('only the creator can call off: %p', async (actor) => {
    auth.currentUser = actor;
    await expect(callOffBet('abc123')).rejects.toThrow('Only the creator can call off this bet.');
    expect(tx.update).not.toHaveBeenCalled();
    expect(requestResultTexts).not.toHaveBeenCalled();
  });

  test('a called-off bet takes no votes', async () => {
    await callOffBet('abc123');
    await expect(castVote('abc123', { voterId: 'lee', name: 'Lee', optionId: 'a' })).rejects.toThrow('This bet is closed.');
  });
});

describe('live listeners merge the bet with its vote docs', () => {
  // onSnapshot by target: the bet doc or a votes collection.
  let listeners;
  beforeEach(() => {
    listeners = [];
    onSnapshot.mockReset();
    onSnapshot.mockImplementation((ref, next, error) => {
      const entry = { ref, next, error, stopped: false };
      listeners.push(entry);
      return () => { entry.stopped = true; };
    });
  });
  const betListener = () => listeners.find((item) => item.ref.collection === 'bets');
  const votesListener = (code = 'abc123') => listeners.find((item) => item.ref.path === `bets/${code}/votes`);
  const betSnap = (data, fromCache = false) => ({
    id: 'abc123', exists: () => Boolean(data), data: () => data, metadata: { fromCache },
  });
  const voteSnap = (docs) => ({
    docs: Object.entries(docs).map(([id, data]) => ({ id, data: () => data })),
  });

  test('subscribeBet waits for both, then merges; a vote doc wins over its array entry', () => {
    const onChange = jest.fn();
    const stop = subscribeBet('abc123', onChange);
    betListener().next(betSnap(stored));
    expect(onChange).not.toHaveBeenCalled();
    votesListener().next(voteSnap({ sam: { voterId: 'sam', name: 'Sammy', optionId: 'a', at: { seconds: 9, nanoseconds: 0 } } }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].votes).toEqual([
      { voterId: 'jack', name: 'Jack', optionId: 'a' },
      { voterId: 'sam', name: 'Sammy', optionId: 'a', at: 9000 },
    ]);
    votesListener().next(voteSnap({}));
    expect(onChange.mock.calls[1][0].votes).toEqual(stored.votes);
    stop();
    expect(listeners.every((item) => item.stopped)).toBe(true);
  });

  test('subscribeBet on rules without per-voter docs shows the array once the votes listen is refused', () => {
    const onChange = jest.fn();
    subscribeBet('abc123', onChange);
    votesListener().error(denied());
    betListener().next(betSnap(stored));
    expect(onChange).toHaveBeenCalledWith({ id: 'abc123', ...stored }, undefined, { fromCache: false });
  });

  test('subscribeBet still reports a gone bet and a bet listen error', () => {
    const onChange = jest.fn();
    subscribeBet('abc123', onChange);
    votesListener().next(voteSnap({}));
    betListener().next(betSnap(null));
    expect(onChange).toHaveBeenLastCalledWith(null, undefined, { fromCache: false });
    const err = new Error('offline');
    betListener().error(err);
    expect(onChange).toHaveBeenLastCalledWith(undefined, err);
  });

  test('subscribeMyBets merges each bet\'s vote docs and closes listeners with the list', () => {
    const onChange = jest.fn();
    const stop = subscribeMyBets('creator', onChange);
    const list = listeners[0];
    list.next({ docs: [
      { id: 'one', data: () => ({ createdAt: 1, votes: [{ voterId: 'jack', name: 'Jack', optionId: 'a', at: 1 }] }) },
      { id: 'two', data: () => ({ createdAt: 2, votes: [] }) },
    ] });
    expect(onChange.mock.calls[0][0].map((bet) => bet.id)).toEqual(['two', 'one']);
    votesListener('one').next(voteSnap({ maya: { voterId: 'maya', name: 'Maya', optionId: 'b', at: { seconds: 2, nanoseconds: 0 } } }));
    expect(onChange.mock.calls[1][0][1].votes.map((vote) => vote.voterId)).toEqual(['jack', 'maya']);
    list.next({ docs: [{ id: 'two', data: () => ({ createdAt: 2, votes: [] }) }] });
    expect(votesListener('one').stopped).toBe(true);
    stop();
    expect(listeners.every((item) => item.stopped)).toBe(true);
  });
});
