import { buildSettlement, formatResultMessage, notificationFor, resultHeadline, settlementOf } from './settlement';

const bet = {
  id: 'abc123', code: 'abc123', question: 'Will Jack break 90?', stake: '$20 pot',
  options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
  votes: [
    { voterId: 'jack', name: 'Jack', optionId: 'yes' },
    { voterId: 'maya', name: 'Maya', optionId: 'yes' },
    { voterId: 'sam', name: 'Sam', optionId: 'no' },
  ],
};
function settled(input = bet, winnerId = 'yes') {
  return { ...input, status: 'closed', winnerId, settledAt: 1234, settlement: buildSettlement(input, winnerId) };
}

test('all winning participants are named, with a gentler notification for other players', () => {
  const result = settled();
  for (const uid of ['jack', 'maya']) {
    expect(notificationFor(result, uid)).toMatchObject({
      title: 'You called it.', outcome: 'Jack & Maya won the $20 pot', stake: '$20 pot', won: true,
    });
  }
  expect(notificationFor(result, 'sam')).toMatchObject({
    title: 'This one’s settled.', oneLiner: 'Good game. More friendly bets ahead.', won: false,
  });
  expect(notificationFor(result, 'spectator')).toBeNull();
});

test('names, stake and winning option are frozen at settlement', () => {
  const result = settled();
  const changed = { ...result, stake: '$500', votes: [], options: [] };
  expect(settlementOf(changed)).toEqual(result.settlement);
  expect(notificationFor(changed, 'jack').stake).toBe('$20 pot');
});

test('does not invent a pot or payout for cash, noncash or empty stakes', () => {
  for (const stake of ['$5', 'Pizza on Sam', '']) {
    const result = settled({ ...bet, stake });
    expect(resultHeadline(result.settlement)).toBe('Jack & Maya won');
    expect(result.settlement.stake).toBe(stake || 'Bragging rights');
    expect(formatResultMessage(result, '/b/abc123')).not.toMatch(/pot|each|paid/i);
  }
});

test('handles unnamed winners, nobody on the winning side, and no participants', () => {
  const unnamed = settled({ ...bet, votes: [{ voterId: 'jack', optionId: 'yes' }, { voterId: 'sam', optionId: 'yes' }] });
  expect(resultHeadline(unnamed.settlement)).toBe('2 friends won the $20 pot');
  const nobody = settled({ ...bet, votes: [{ voterId: 'sam', optionId: 'no' }] });
  expect(resultHeadline(nobody.settlement)).toBe('Nobody called it');
  expect(notificationFor(nobody, 'sam').won).toBe(false);
  expect(resultHeadline(settled({ ...bet, votes: [] }).settlement)).toBe('Yes takes it');
});

test('over-under outcomes keep the line, and prop option names are not mistaken for winning voters', () => {
  const line = settled({ ...bet, type: 'over-under', line: 90.5, options: [{ id: 'yes', label: 'Over' }] });
  expect(line.settlement.optionLabel).toBe('Over 90.5');
  const prop = settled({ ...bet, type: 'prop', options: [{ id: 'yes', label: 'Alex' }] });
  expect(resultHeadline(prop.settlement)).toBe('Jack & Maya won the $20 pot');
  expect(prop.settlement.optionLabel).toBe('Alex');
});

test('settled sharing includes the result and deep link instead of a fresh invitation', () => {
  expect(formatResultMessage(settled(), 'https://example.com/b/abc123')).toBe([
    'FRIENDLY · Closed · Jack & Maya won the $20 pot',
    'Will Jack break 90?', 'Winning pick: Yes', 'At stake: $20 pot',
    'Bragging rights, secured.', 'The final word: https://example.com/b/abc123',
  ].join('\n'));
});

test('legacy settled bets still render but do not create historical notification spam', () => {
  const legacy = { ...bet, status: 'closed', winnerId: 'yes', settledAt: 100 };
  expect(settlementOf(legacy).winners).toHaveLength(2);
  expect(notificationFor(legacy, 'jack')).toBeNull();
  expect(settlementOf({ ...legacy, winnerId: null })).toBeNull();
  expect(settlementOf({ ...legacy, winnerId: 'missing' })).toBeNull();
});
