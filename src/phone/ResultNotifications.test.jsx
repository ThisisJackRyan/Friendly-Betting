import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultNotifications from './ResultNotifications';
import { subscribeBet } from './api';
import { useIdentity } from './identity';
import { rememberBet } from './notificationStore';
import { buildSettlement } from './settlement';

jest.mock('next/link');
jest.mock('./api', () => ({ subscribeBet: jest.fn() }));
jest.mock('./identity', () => ({ useIdentity: jest.fn() }));
let uid;
let publish;
let stop;
let round = 0;
let bet;
beforeEach(() => {
  uid = `player-${round++}`;
  localStorage.clear();
  useIdentity.mockReturnValue({ uid });
  bet = {
    code: 'abc123', status: 'open', question: 'Jack breaks 90?', stake: '$20 pot',
    options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }],
    votes: [{ voterId: uid, name: 'Jack', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }],
  };
  stop = jest.fn();
  subscribeBet.mockReset();
  subscribeBet.mockImplementation((_code, callback) => { publish = callback; callback(bet); return stop; });
});
function settle(winnerId = 'a') {
  bet = { ...bet, status: 'closed', winnerId, settledAt: 123, settlement: buildSettlement(bet, winnerId) };
  act(() => publish(bet));
}

test('a joined bet delivers one live winner ping with a result link; dismiss survives reopening', async () => {
  const view = render(<ResultNotifications />);
  expect(screen.queryByRole('button', { name: /Results/ })).not.toBeInTheDocument();
  act(() => rememberBet(uid, 'abc123'));
  settle();
  expect(screen.getByText('You called it.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /You called it/ })).toHaveAttribute('href', '/b/abc123');
  expect(screen.getByRole('button', { name: 'Results 1 new' })).toBeInTheDocument();
  act(() => publish(bet));
  expect(screen.getAllByText('You called it.')).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss result notification' }));
  expect(screen.queryByText('You called it.')).not.toBeInTheDocument();
  view.unmount();
  expect(stop).toHaveBeenCalled();
  render(<ResultNotifications />);
  expect(screen.queryByRole('button', { name: 'Dismiss result notification' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Results' }));
  const inbox = screen.getByRole('region', { name: 'Your results' });
  expect(within(inbox).getByText('Jack won the $20 pot')).toBeInTheDocument();
  expect(within(inbox).queryByLabelText('Unread')).not.toBeInTheDocument();
});

test('returning after an offline settlement delivers a softer ping to the losing side', () => {
  rememberBet(uid, 'abc123');
  bet = { ...bet, status: 'closed', winnerId: 'b', settledAt: 123, settlement: buildSettlement(bet, 'b') };
  render(<ResultNotifications />);
  expect(screen.getByText('This one’s settled.')).toBeInTheDocument();
  expect(screen.getByText('Good game. More friendly bets ahead.')).toBeInTheDocument();
  expect(screen.queryByText('You called it.')).not.toBeInTheDocument();
});

test('switching identities removes the previous participant’s notifications and listeners', () => {
  rememberBet(uid, 'abc123');
  const view = render(<ResultNotifications />);
  settle();
  useIdentity.mockReturnValue({ uid: 'another-person' });
  view.rerender(<ResultNotifications />);
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(stop).toHaveBeenCalled();
});

test('read receipts from another tab clear the unread ping', () => {
  rememberBet(uid, 'abc123');
  render(<ResultNotifications />);
  settle();
  localStorage.setItem(`fb.results.${uid}`, JSON.stringify({ codes: ['abc123'], read: ['abc123:123'] }));
  fireEvent(window, new StorageEvent('storage', { key: `fb.results.${uid}` }));
  expect(screen.queryByText('You called it.')).not.toBeInTheDocument();
});

test('failed subscriptions are visible and can be retried, and Escape closes the inbox', async () => {
  rememberBet(uid, 'abc123');
  subscribeBet.mockImplementationOnce((_code, callback) => { callback(undefined, new Error('offline')); return stop; });
  render(<ResultNotifications />);
  await userEvent.click(screen.getByRole('button', { name: 'Results' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Some results couldn’t load.');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('region', { name: 'Your results' }), { key: 'Escape' });
  expect(screen.queryByRole('region', { name: 'Your results' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Results' })).toHaveFocus();
});
