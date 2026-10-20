import { friendStats, outcomeFor } from './friendStats';
import { buildSettlement } from './settlement';

const options = [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }];
const pick = (voterId, name, optionId) => ({ voterId, name, optionId });

function bet(id, createdAt, votes, patch = {}) {
  return { id, createdByID: 'uid-me', schemaVersion: 2, type: 'money-line', question: id, status: 'open', createdAt, options, votes, ...patch };
}

function settled(id, createdAt, votes, winnerId = 'a', patch = {}) {
  const base = bet(id, createdAt, votes);
  return { ...base, status: 'closed', winnerId, settledAt: createdAt, settlement: buildSettlement(base, winnerId), ...patch };
}

const byName = (friends) => Object.fromEntries(friends.map((friend) => [friend.name, friend]));

const me = (optionId) => pick('uid-me', 'Me', optionId);
const three = [...options, { id: 'c', label: 'Push' }];

test('W and L are the creator against each friend on settled bets, open bets stay pending', () => {
  const friends = byName(friendStats([
    settled('s1', 3, [me('a'), pick('uid-ana', 'Ana', 'b'), pick('uid-ben', 'Ben', 'b')]),
    settled('s2', 2, [me('a'), pick('uid-ana', 'Ana', 'b'), pick('uid-ben', 'Ben', 'a')], 'b'),
    bet('o1', 1, [me('a'), pick('uid-ana', 'Ana', 'b')]),
  ], 'uid-me'));
  expect(friends.Ana).toMatchObject({ voterId: 'uid-ana', betsTogether: 3, wins: 1, losses: 1, none: 0, open: 1, calledOff: 0 });
  expect(friends.Ana.bets.map((item) => item.outcome)).toEqual(['win', 'loss', 'open']);
  expect(friends.Ben).toMatchObject({ betsTogether: 2, wins: 1, losses: 0, none: 1, open: 0 });
});

test('different sides and the creator won: W', () => {
  const [ana] = friendStats([settled('s1', 1, [me('a'), pick('uid-ana', 'Ana', 'b')], 'a')], 'uid-me');
  expect(ana).toMatchObject({ betsTogether: 1, wins: 1, losses: 0, none: 0 });
  expect(ana.bets[0].outcome).toBe('win');
});

test('different sides and the friend won: L', () => {
  const [ana] = friendStats([settled('s1', 1, [me('a'), pick('uid-ana', 'Ana', 'b')], 'b')], 'uid-me');
  expect(ana).toMatchObject({ betsTogether: 1, wins: 0, losses: 1, none: 0 });
  expect(ana.bets[0].outcome).toBe('loss');
});

test.each([['a'], ['b']])('same side gives no W or L, whichever side won (%s)', (winnerId) => {
  const [ana] = friendStats([settled('s1', 1, [me('a'), pick('uid-ana', 'Ana', 'a')], winnerId)], 'uid-me');
  expect(ana).toMatchObject({ betsTogether: 1, wins: 0, losses: 0, none: 1 });
  expect(ana.bets[0].outcome).toBe('none');
});

test("no W or L when the creator didn't pick, even though the friend called it", () => {
  const [ana] = friendStats([settled('s1', 1, [pick('uid-ana', 'Ana', 'a')], 'a')], 'uid-me');
  expect(ana).toMatchObject({ betsTogether: 1, wins: 0, losses: 0, none: 1 });
  expect(ana.bets[0].outcome).toBe('none');
});

test('no W or L when a third option won', () => {
  const votes = [me('a'), pick('uid-ana', 'Ana', 'b')];
  const base = bet('s1', 1, votes, { options: three });
  const third = { ...base, status: 'closed', winnerId: 'c', settledAt: 1, settlement: buildSettlement(base, 'c') };
  const [ana] = friendStats([third], 'uid-me');
  expect(ana).toMatchObject({ betsTogether: 1, wins: 0, losses: 0, none: 1 });
  expect(ana.bets[0].outcome).toBe('none');
});

test('a closed bet with no winner yet is pending, not a loss', () => {
  const [ana] = friendStats([bet('c1', 1, [me('b'), pick('uid-ana', 'Ana', 'a')], { status: 'closed' })], 'uid-me');
  expect(ana).toMatchObject({ wins: 0, losses: 0, none: 0, open: 1 });
  expect(ana.bets[0].outcome).toBe('open');
});

test.each([
  ['calledOff: true on a settled bet', (votes) => settled('x', 1, votes, 'a', { calledOff: true })],
  ['calledOff: true on an open bet', (votes) => bet('x', 1, votes, { calledOff: true })],
  ["status 'called-off'", (votes) => bet('x', 1, votes, { status: 'called-off', winnerId: 'a' })],
])('a called-off bet (%s) is never a win or loss but still counts together', (_label, make) => {
  const [ana, ben] = friendStats([make([me('a'), pick('uid-ana', 'Ana', 'a'), pick('uid-ben', 'Ben', 'b')])], 'uid-me');
  [ana, ben].forEach((friend) => {
    expect(friend).toMatchObject({ betsTogether: 1, wins: 0, losses: 0, none: 0, open: 0, calledOff: 1 });
    expect(friend.bets[0].outcome).toBe('called-off');
  });
});

test("the creator's own pick is left out", () => {
  const friends = friendStats([settled('s1', 1, [pick('uid-me', 'Me', 'a'), pick('uid-ana', 'Ana', 'a')])], 'uid-me');
  expect(friends.map((friend) => friend.voterId)).toEqual(['uid-ana']);
});

test('shows the latest non-empty name and lists shared bets newest first', () => {
  const [friend] = friendStats([
    bet('old', 1, [pick('uid-ana', 'Ana', 'a')]),
    bet('newest', 5, [pick('uid-ana', '  ', 'a')]),
    bet('mid', 3, [pick('uid-ana', 'Ana B', 'b')]),
  ], 'uid-me');
  expect(friend.name).toBe('Ana B');
  expect(friend.bets.map((item) => item.bet.id)).toEqual(['newest', 'mid', 'old']);
});

test('sorts by bets together, then by name', () => {
  const friends = friendStats([
    bet('b1', 2, [pick('uid-cy', 'Cy', 'a'), pick('uid-bo', 'Bo', 'a'), pick('uid-al', 'Al', 'a')]),
    bet('b2', 1, [pick('uid-cy', 'Cy', 'a')]),
  ], 'uid-me');
  expect(friends.map((friend) => friend.name)).toEqual(['Cy', 'Al', 'Bo']);
});

test('skips votes with no voter id and voters who never gave a name', () => {
  const friends = friendStats([
    bet('b1', 1, [pick('', 'Ghost', 'a'), { name: 'Nobody', optionId: 'a' }, pick('uid-anon', '', 'a'), null, pick('uid-ana', 'Ana', 'a')]),
  ], 'uid-me');
  expect(friends.map((friend) => friend.voterId)).toEqual(['uid-ana']);
});

test('one vote per voter per bet, the last recorded', () => {
  const [ana] = friendStats([settled('s1', 1, [pick('uid-ana', 'Ana', 'b'), pick('uid-ana', 'Ana', 'a'), me('a')])], 'uid-me');
  expect(ana).toMatchObject({ betsTogether: 1, wins: 0, losses: 0, none: 1 });
});

test("the creator's last pick is the one that counts", () => {
  const [ana] = friendStats([settled('s1', 1, [me('a'), pick('uid-ana', 'Ana', 'b'), me('b'), me('a')], 'a')], 'uid-me');
  expect(ana).toMatchObject({ wins: 1, losses: 0 });
  const [ben] = friendStats([settled('s1', 1, [me('a'), pick('uid-ben', 'Ben', 'b'), me('b')], 'a')], 'uid-me');
  expect(ben).toMatchObject({ wins: 0, losses: 0, none: 1 });
});

test('empty input and legacy bets without votes give no friends', () => {
  expect(friendStats(null, 'uid-me')).toEqual([]);
  expect(friendStats([], 'uid-me')).toEqual([]);
  expect(friendStats([{ id: 'legacy', type: 'Money Line', bet: 'Old one', over: 3, under: 1 }, undefined], 'uid-me')).toEqual([]);
});

test('a settled bet with no snapshot still scores from the winning option', () => {
  const legacy = { ...bet('l1', 1, [me('a'), pick('uid-ana', 'Ana', 'a'), pick('uid-ben', 'Ben', 'b')]), status: 'closed', winnerId: 'b' };
  const friends = byName(friendStats([legacy], 'uid-me'));
  expect(friends.Ana).toMatchObject({ wins: 0, losses: 0, none: 1 });
  expect(friends.Ben).toMatchObject({ wins: 0, losses: 1 });
});

test('the settlement snapshot decides who won, for the creator and the friend alike', () => {
  const base = settled('s1', 1, [me('a'), pick('uid-ana', 'Ana', 'b')]);
  // A later change to the votes must not change who won.
  const moved = { ...base, votes: [me('b'), pick('uid-ana', 'Ana', 'a')] };
  expect(outcomeFor(moved, moved.votes[1], moved.votes[0])).toBe('win');
});

test('a snapshot with no recipients falls back to the winning option', () => {
  const base = settled('s1', 1, [me('a'), pick('uid-ana', 'Ana', 'b')], 'b');
  const { recipients, ...settlement } = base.settlement;
  expect(recipients).toHaveLength(2);
  const thin = { ...base, settlement };
  expect(() => outcomeFor(thin, thin.votes[1], thin.votes[0])).not.toThrow();
  expect(outcomeFor(thin, thin.votes[1], thin.votes[0])).toBe('loss');
});
