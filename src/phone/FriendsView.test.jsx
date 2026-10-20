import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FriendsView from './FriendsView';

jest.mock('next/link');

const options = [
  { id: 'a', label: 'Yes' },
  { id: 'b', label: 'No' },
];
const bet = (id, extra) => ({ id, createdByID: 'creator', schemaVersion: 2, type: 'money-line', question: `${id}?`, options, ...extra });
const friend = (voterId, name, wins, losses, bets = []) => ({ voterId, name, wins, losses, betsTogether: bets.length, bets });

describe('Friends totals', () => {
  test.each([
    [0, '0 wins', 0, '0 losses'],
    [1, '1 win', 1, '1 loss'],
    [3, '3 wins', 2, '2 losses'],
  ])('%i wins read as "%s", %i losses as "%s"', (wins, winLabel, losses, lossLabel) => {
    render(<FriendsView friends={[friend('uid-ana', 'Ana', wins, losses)]} />);
    const row = screen.getByRole('button');
    const win = within(row).getByRole('img', { name: winLabel });
    const loss = within(row).getByRole('img', { name: lossLabel });
    // Visible text is unchanged; the inner number and letter are hidden so
    // the count is read once, from the pill's label.
    expect(win).toHaveTextContent(`${wins} W`);
    expect(loss).toHaveTextContent(`${losses} L`);
    for (const pill of [win, loss]) {
      expect([...pill.children].map((node) => node.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
    }
    expect(row).toHaveAccessibleName(`Ana ${winLabel} ${lossLabel} Bets together 0`);
  });
});

test('per-bet pills are labeled Won and Lost; called off keeps its text', async () => {
  const bets = [
    { bet: bet('won', { status: 'closed', winnerId: 'a' }), outcome: 'win' },
    { bet: bet('lost', { status: 'closed', winnerId: 'b' }), outcome: 'loss' },
    { bet: bet('off', { status: 'called-off' }), outcome: 'called-off' },
    { bet: bet('live', { status: 'open' }), outcome: 'open' },
  ];
  render(<FriendsView friends={[friend('uid-ana', 'Ana', 1, 1, bets)]} />);
  await userEvent.click(screen.getByRole('button'));
  const links = screen.getAllByRole('link');
  expect(within(links[0]).getByRole('img', { name: 'Won' })).toHaveTextContent('W');
  expect(within(links[1]).getByRole('img', { name: 'Lost' })).toHaveTextContent('L');
  const off = links[2].querySelector('.friend-pill');
  expect(off).toHaveTextContent('This bet was called off.');
  expect(off).not.toHaveAttribute('role');
  expect(off).not.toHaveAttribute('aria-label');
  expect(links[3].querySelector('.friend-pill')).toBeNull();
});
