import { buildSettlement, formatResultMessage, notificationFor, resultHeadline, settlementOf, winnerNames } from './settlement';

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

test('settled sharing is the settled text with the ?s=settled link alone on the last line', () => {
  expect(formatResultMessage(settled(), 'https://example.com/b/abc123')).toBe(
    'Bet settled:\nWill Jack break 90?\n\nWinning pick:\nYes\n\nStakes:\n$20 pot\n\nSee who called it:\nhttps://example.com/b/abc123?s=settled',
  );
});

test.each([
  ['empty', ''],
  ['whitespace-only', '  \n\t '],
  ['missing', undefined],
])('a bet with %s stakes drops the Stakes block, not "Bragging rights"', (_label, stake) => {
  const result = settled({ ...bet, stake });
  expect(result.settlement.stake).toBe('Bragging rights');
  expect(formatResultMessage(result, 'https://example.com/b/abc123')).toBe(
    'Bet settled:\nWill Jack break 90?\n\nWinning pick:\nYes\n\nSee who called it:\nhttps://example.com/b/abc123?s=settled',
  );
});

test('a creator who picked the Bragging rights chip keeps it as the stakes', () => {
  expect(formatResultMessage(settled({ ...bet, stake: 'Bragging rights' }), 'u')).toContain('\n\nStakes:\nBragging rights\n\n');
});

test('question, side and stakes are trimmed with their whitespace collapsed; the side is as written', () => {
  const messy = {
    ...bet,
    question: '  Will   Jack\nbreak\t90?  ',
    stake: ' $20 \n pot ',
    options: [{ id: 'yes', label: '  Jack   (obviously) ' }, { id: 'no', label: 'No' }],
  };
  expect(formatResultMessage(settled(messy), ' https://example.com/b/abc123 ')).toBe(
    'Bet settled:\nWill Jack break 90?\n\nWinning pick:\nJack (obviously)\n\nStakes:\n$20 pot\n\nSee who called it:\nhttps://example.com/b/abc123?s=settled',
  );
});

test('a called-off bet shares the called-off text with ?s=off', () => {
  expect(formatResultMessage({ ...bet, status: 'closed', calledOff: true }, 'https://example.com/b/abc123')).toBe(
    'Bet called off:\nWill Jack break 90?\n\nNobody won this one.\n\nSee the bet:\nhttps://example.com/b/abc123?s=off',
  );
});

test('a closed bet with no readable result keeps the picks-closed line, now with Friendly Bets', () => {
  expect(formatResultMessage({ ...bet, status: 'closed', winnerId: 'missing' }, 'https://example.com/b/abc123')).toBe(
    'Friendly Bets · Picks are closed.\nWill Jack break 90?\nResult to come: https://example.com/b/abc123',
  );
});

test('the settled and called-off texts have no old header, stats or trailing newline', () => {
  for (const text of [
    formatResultMessage(settled(), 'https://example.com/b/abc123'),
    formatResultMessage({ ...bet, calledOff: true }, 'https://example.com/b/abc123'),
  ]) {
    expect(text).not.toMatch(/FRIENDLY|Closed|won the|Bragging rights, secured|The final word|\d+ (picks|votes)/);
    expect(text.endsWith('\n')).toBe(false);
    expect(text.split('\n').at(-1)).toMatch(/^https:\/\/example\.com\/b\/abc123\?s=(settled|off)$/);
  }
});

test('legacy settled bets still render but do not create historical notification spam', () => {
  const legacy = { ...bet, status: 'closed', winnerId: 'yes', settledAt: 100 };
  expect(settlementOf(legacy).winners).toHaveLength(2);
  expect(notificationFor(legacy, 'jack')).toBeNull();
  expect(settlementOf({ ...legacy, winnerId: null })).toBeNull();
  expect(settlementOf({ ...legacy, winnerId: 'missing' })).toBeNull();
});

test.each([
  ['status called-off', { ...bet, status: 'called-off' }],
  ['calledOff flag on a settled bet', { ...settled(), calledOff: true }],
])('a called-off bet (%s) has no result and no notification', (_label, off) => {
  expect(settlementOf(off)).toBeNull();
  for (const uid of ['jack', 'sam', 'spectator']) expect(notificationFor(off, uid)).toBeNull();
});

test('a server Timestamp settledAt gives the same numeric id and time as a number', () => {
  const stamped = { ...settled(), settledAt: { toMillis: () => 1234 } };
  expect(notificationFor(stamped, 'jack')).toMatchObject({ id: 'abc123:1234', at: 1234 });
  expect(notificationFor({ ...settled(), settledAt: null }, 'jack')).toBeNull();
});

test.each([
  ['a lone cleared name', [''], 'A friend won'],
  ['a name and a cleared one', ['Maya', ''], 'Maya & a friend won'],
  ['two cleared names', ['', '  '], '2 friends won'],
  ['a name and two cleared ones', ['', 'Maya', ''], 'Maya & 2 friends won'],
])('cleared winner names (deleted accounts) read as friends: %s', (_label, names, headline) => {
  const result = {
    stake: 'Coffee', optionLabel: 'Yes',
    winners: names.map((name, i) => ({ voterId: `v${i}`, name })),
    recipients: names.map((_name, i) => ({ voterId: `v${i}`, won: true })),
  };
  expect(resultHeadline(result)).toBe(headline);
  expect(winnerNames(result)).toBe(headline.replace(/ won$/, ''));
});
