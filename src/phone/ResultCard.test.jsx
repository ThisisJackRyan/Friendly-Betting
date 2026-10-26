import { render, screen, within } from '@testing-library/react';
import ResultCard from './ResultCard';
import { buildSettlement } from './settlement';

// The Close & settle preview (TallyScreen's SettlePicker): what the creator
// sees after picking a side, before Settle & notify.
const base = {
  id: 'abc123',
  code: 'abc123',
  type: 'money-line',
  question: 'Who is late',
  createdByID: 'jack',
  status: 'open',
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
};

function previewOf({ stake = '', votes, winnerId = 'a' }) {
  const bet = { ...base, stake, votes };
  return { ...bet, status: 'closed', winnerId, settlement: buildSettlement(bet, winnerId) };
}

function renderPreview(bet, voterId = 'jack') {
  render(<ResultCard bet={bet} voterId={voterId} preview />);
  const region = screen.getByRole('region', { name: 'Result preview' });
  return {
    headline: within(region).getByRole('heading', { level: 2 }).textContent,
    oneLiner: region.querySelector('.result-one-liner').textContent,
    region,
  };
}

const soloUnnamed = [
  { voterId: 'jack', name: '', optionId: 'a' },
  { voterId: 'sam', name: 'Sam', optionId: 'b' },
];

test.each([
  ['Lunch', 'Lunch is on everyone else.'],
  ['$5', 'Time for everyone else to pay up.'],
  ['Coffee', 'Coffee’s on everyone else.'],
  ['Drinks', 'Drinks are on everyone else.'],
  ['Dinner', 'Dinner’s on everyone else.'],
  ['Bragging rights', 'Bragging rights, secured.'],
  ['', 'Bragging rights, secured.'],
])('an unnamed creator who won alone on %p: You called it., Solo win. and the stake line', (stake, line) => {
  const { headline, oneLiner, region } = renderPreview(previewOf({ stake, votes: soloUnnamed }));
  expect(headline).toBe('You called it.');
  expect(oneLiner).toBe(`Solo win. ${line}`);
  expect(region).not.toHaveTextContent('A friend won');
  // The preview has no separate personal line.
  expect(region.querySelector('.result-personal')).toBeNull();
});

test('a named creator who won alone reads the same', () => {
  const votes = [{ voterId: 'jack', name: 'Jack', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }];
  expect(renderPreview(previewOf({ stake: 'Lunch', votes }))).toMatchObject({
    headline: 'You called it.',
    oneLiner: 'Solo win. Lunch is on everyone else.',
  });
});

test.each([
  ['with one other', [{ voterId: 'maya', name: 'Maya', optionId: 'a' }], 'You & Maya won. Coffee’s on everyone else.'],
  ['with two others', [{ voterId: 'maya', name: 'Maya', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'a' }],
    'You, Maya & Sam won. Coffee’s on everyone else.'],
  ['with an unnamed other', [{ voterId: 'x', name: '', optionId: 'a' }], 'You & 1 other won. Coffee’s on everyone else.'],
])('the creator among several winners (%s) reads as the reveal does', (_label, others, subline) => {
  const votes = [{ voterId: 'jack', name: '', optionId: 'a' }, ...others, { voterId: 'lee', name: 'Lee', optionId: 'b' }];
  expect(renderPreview(previewOf({ stake: 'Coffee', votes }))).toMatchObject({ headline: 'You called it.', oneLiner: subline });
});

test.each([
  ['Lunch', 'Lunch is on everyone else.'],
  ['$5', 'Time for everyone else to pay up.'],
  ['', 'Bragging rights, secured.'],
])('a creator who did not win keeps the winners’ names, over the %p stake line', (stake, line) => {
  const votes = [{ voterId: 'jack', name: '', optionId: 'b' }, { voterId: 'sam', name: 'Sam', optionId: 'a' }];
  expect(renderPreview(previewOf({ stake, votes }))).toMatchObject({ headline: 'Sam won', oneLiner: line });
});

test('a creator who did not pick keeps the winners’ names, over the stake line', () => {
  const votes = [{ voterId: 'sam', name: '', optionId: 'a' }];
  expect(renderPreview(previewOf({ stake: 'Lunch', votes }))).toMatchObject({
    headline: 'A friend won',
    oneLiner: 'Lunch is on everyone else.',
  });
});

test('a pick nobody made still reads as the plot twist', () => {
  const votes = [{ voterId: 'jack', name: 'Jack', optionId: 'b' }];
  expect(renderPreview(previewOf({ stake: 'Lunch', votes }))).toMatchObject({
    headline: 'Nobody called it',
    oneLiner: 'The plot twist wins this round.',
  });
});

test('the settled card (not a preview) is unchanged', () => {
  render(<ResultCard bet={previewOf({ stake: 'Lunch', votes: soloUnnamed })} voterId="jack" />);
  const region = screen.getByRole('region', { name: 'Settled result' });
  expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('A friend won');
  expect(region).toHaveTextContent('Bragging rights, secured.');
  expect(region.querySelector('.result-personal')).toHaveTextContent('You called it.');
});
