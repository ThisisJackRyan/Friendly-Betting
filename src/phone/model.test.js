import { buildDraft, formatSms, statusLabel, tallyCounts } from './model';

test('formats a multiline text and drops an empty stake', () => {
  expect(formatSms({
    name: 'Maya',
    question: 'Who is late?',
    choices: ['Yes', 'No'],
    stake: '',
    url: 'https://example.com/b/abc',
  })).toBe('FRIENDLY · You in?\nWho is late?\n1. Yes\n2. No\nMake your call: https://example.com/b/abc');

  expect(formatSms({
    name: 'Maya',
    question: 'Who is late',
    choices: ['Over 3.5', 'Under 3.5'],
    stake: 'a coffee',
    url: 'https://example.com/b/abc',
  })).toBe('FRIENDLY · You in?\nWho is late?\n1. Over 3.5\n2. Under 3.5\nAt stake: a coffee\nMake your call: https://example.com/b/abc');

  expect(formatSms({
    name: 'Jack',
    question: 'Who will succeed the most this winter arc!',
    choices: ['Jack', 'Mike', 'Benton', 'Gage'],
    stake: 'Winner gets the Best Body!',
    url: 'https://example.com/b/abc',
  })).toBe(
    'FRIENDLY · You in?\nWho will succeed the most this winter arc!\n1. Jack\n2. Mike\n3. Benton\n4. Gage\nAt stake: Winner gets the Best Body!\nMake your call: https://example.com/b/abc',
  );

  expect(formatSms({
    question: 'Who shows up last?',
    choices: ['Yes', 'No'],
    stake: '   ',
    url: 'https://example.com/b/abc',
  })).toBe('FRIENDLY · You in?\nWho shows up last?\n1. Yes\n2. No\nMake your call: https://example.com/b/abc');
});

test('builds all three bet types', () => {
  const money = buildDraft('money-line', {
    question: 'Movie night?',
    optionA: '',
    optionB: '',
    stake: '  ',
  });
  expect(money.ok).toBe(true);
  expect(money.fields.options.map((option) => option.label)).toEqual(['Yes', 'No']);
  expect(money.fields.stake).toBe('');

  const line = buildDraft('over-under', {
    question: 'Rolls',
    line: '13.5',
    overLabel: 'Over',
    underLabel: 'Under',
  });
  expect(line.ok).toBe(true);
  expect(line.fields.line).toBe(13.5);
  expect(line.fields.typeLabel).toBe('Over-Under');

  const prop = buildDraft('prop', {
    question: 'Who is last?',
    propOptions: ['Maya', '', 'Sam', 'Ada'],
  });
  expect(prop.ok).toBe(true);
  expect(prop.fields.options).toHaveLength(3);

  expect(buildDraft('prop', { question: 'Who?', propOptions: ['Only'] }).ok).toBe(false);
  expect(buildDraft('over-under', { question: 'Rolls', line: '' }).ok).toBe(false);
  expect(buildDraft('money-line', { question: '  ' }).ok).toBe(false);
});

test('counts votes and marks settled bets closed', () => {
  const bet = {
    schemaVersion: 2,
    status: 'open',
    options: [
      { id: 'a', label: 'Yes' },
      { id: 'b', label: 'No' },
    ],
    votes: [
      { voterId: '1', optionId: 'a' },
      { voterId: '2', optionId: 'a' },
    ],
  };
  expect(tallyCounts(bet).map((row) => row.count)).toEqual([2, 0]);
  expect(statusLabel({ ...bet, status: 'closed', winnerId: 'a' })).toBe('Settled');
});
