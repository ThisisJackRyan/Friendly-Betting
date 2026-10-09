import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultsMenu from './ResultsMenu';
import AppHeader from './AppHeader';
import { subscribeBet } from './api';
import { useIdentity } from './identity';
import { rememberBet } from './notificationStore';
import { buildSettlement } from './settlement';

jest.mock('next/link');
jest.mock('./api', () => ({ subscribeBet: jest.fn() }));
jest.mock('./identity', () => ({ useIdentity: jest.fn() }));

const root = path.join(__dirname, '..', '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

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
const resultsButton = () => screen.getByRole('button', { name: /^Results/ });
const inbox = () => screen.queryByRole('dialog', { name: 'The final word' });

test('the header shows Results only once a pick is remembered, with no floating toast', () => {
  const { container } = render(<AppHeader />);
  expect(screen.queryByRole('button', { name: /Results/ })).not.toBeInTheDocument();
  act(() => rememberBet(uid, 'abc123'));
  const header = screen.getByRole('banner');
  expect(within(header).getByRole('button', { name: 'Results' })).toBeInTheDocument();
  settle();
  expect(within(header).getByRole('button', { name: 'Results 1 new' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 new result');
  expect(screen.queryByText('You called it.')).not.toBeInTheDocument();
  expect(container.querySelector('.results-trigger, .result-toast, .result-notifications')).toBeNull();
});

test('no identity, no Results', () => {
  useIdentity.mockReturnValue(null);
  rememberBet(uid, 'abc123');
  render(<AppHeader />);
  expect(screen.queryByRole('button', { name: /Results/ })).not.toBeInTheDocument();
});

test('the inbox opens as a dialog, links to the vote page, and reading clears the unread count', async () => {
  rememberBet(uid, 'abc123');
  render(<ResultsMenu />);
  settle();
  await userEvent.click(resultsButton());
  expect(resultsButton()).toHaveAttribute('aria-expanded', 'true');
  expect(inbox()).toHaveFocus();
  expect(within(inbox()).getByText('You called it.')).toBeInTheDocument();
  expect(within(inbox()).getByText('Jack won the $20 pot')).toBeInTheDocument();
  expect(within(inbox()).getByLabelText('Unread')).toBeInTheDocument();
  const link = within(inbox()).getByRole('link', { name: /You called it/ });
  expect(link).toHaveAttribute('href', '/b/abc123');
  await userEvent.click(link);
  expect(inbox()).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Results' })).toBeInTheDocument();
  await userEvent.click(resultsButton());
  expect(within(inbox()).queryByLabelText('Unread')).not.toBeInTheDocument();
});

test('a losing pick gets the softer line', async () => {
  rememberBet(uid, 'abc123');
  bet = { ...bet, status: 'closed', winnerId: 'b', settledAt: 123, settlement: buildSettlement(bet, 'b') };
  render(<ResultsMenu />);
  await userEvent.click(resultsButton());
  expect(within(inbox()).getByText('This one’s settled.')).toBeInTheDocument();
  expect(within(inbox()).getByText('Good game. More friendly bets ahead.')).toBeInTheDocument();
  expect(screen.queryByText('You called it.')).not.toBeInTheDocument();
});

test('an unsettled pick shows the empty line', async () => {
  rememberBet(uid, 'abc123');
  render(<ResultsMenu />);
  await userEvent.click(resultsButton());
  expect(within(inbox()).getByText('Your picks are in. Results land here when your friend settles.')).toBeInTheDocument();
});

test.each([
  ['status called-off', { status: 'called-off' }],
  ['calledOff flag on a settled bet', null],
])('a called-off bet (%s) is no win or loss in the inbox', async (_label, patch) => {
  rememberBet(uid, 'abc123');
  bet = patch
    ? { ...bet, ...patch }
    : { ...bet, status: 'closed', winnerId: 'a', settledAt: 123, settlement: buildSettlement(bet, 'a'), calledOff: true };
  render(<ResultsMenu />);
  expect(resultsButton()).toHaveAccessibleName('Results');
  await userEvent.click(resultsButton());
  expect(within(inbox()).getByText('Your picks are in. Results land here when your friend settles.')).toBeInTheDocument();
  expect(within(inbox()).queryByRole('link')).not.toBeInTheDocument();
  expect(screen.queryByText('You called it.')).not.toBeInTheDocument();
  expect(screen.queryByText('This one’s settled.')).not.toBeInTheDocument();
});

test('switching identities removes the previous participant’s results and listeners', () => {
  rememberBet(uid, 'abc123');
  const view = render(<ResultsMenu />);
  settle();
  useIdentity.mockReturnValue({ uid: 'another-person' });
  view.rerender(<ResultsMenu />);
  expect(screen.queryByRole('button', { name: /Results/ })).not.toBeInTheDocument();
  expect(stop).toHaveBeenCalled();
});

test('read receipts from another tab clear the unread count', () => {
  rememberBet(uid, 'abc123');
  render(<ResultsMenu />);
  settle();
  expect(resultsButton()).toHaveTextContent('1 new');
  localStorage.setItem(`fb.results.${uid}`, JSON.stringify({ codes: ['abc123'], read: ['abc123:123'] }));
  fireEvent(window, new StorageEvent('storage', { key: `fb.results.${uid}` }));
  expect(resultsButton()).not.toHaveTextContent('new');
});

test('failed subscriptions are visible and can be retried; Escape closes and returns focus', async () => {
  rememberBet(uid, 'abc123');
  subscribeBet.mockImplementationOnce((_code, callback) => { callback(undefined, new Error('offline')); return stop; });
  render(<ResultsMenu />);
  await userEvent.click(resultsButton());
  expect(screen.getByRole('alert')).toHaveTextContent('Some results couldn’t load.');
  expect(within(inbox()).getByText('Your picks are still in. Check back in a bit.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.keyDown(inbox(), { key: 'Escape' });
  expect(inbox()).not.toBeInTheDocument();
  expect(resultsButton()).toHaveFocus();
});

test('the close button and a tap outside both close the inbox', async () => {
  rememberBet(uid, 'abc123');
  render(<><p>Elsewhere</p><ResultsMenu /></>);
  await userEvent.click(resultsButton());
  await userEvent.click(screen.getByRole('button', { name: 'Close results' }));
  expect(inbox()).not.toBeInTheDocument();
  expect(resultsButton()).toHaveFocus();
  await userEvent.click(resultsButton());
  await userEvent.click(screen.getByText('Elsewhere'));
  expect(inbox()).not.toBeInTheDocument();
});

test('no global floating Results mount and no floating trigger styles remain', () => {
  expect(source('app/layout.js')).not.toMatch(/ResultNotifications|ResultsMenu/);
  expect(source('mobile/App.jsx')).not.toMatch(/ResultNotifications|ResultsMenu/);
  expect(fs.existsSync(path.join(__dirname, 'ResultNotifications.jsx'))).toBe(false);
  expect(source('src/phone/AppHeader.jsx')).toMatch(/<ResultsMenu \/>/);
  expect(source('src/phone/VoteScreen.jsx')).toMatch(/<ResultsMenu \/>/);
  const css = source('src/phone/phone.css');
  expect(css).not.toMatch(/\.results-trigger|\.result-toast|\.result-notifications/);
  const results = css.slice(css.indexOf('/* Results:'), css.indexOf('/* Who picked'));
  expect(results).not.toMatch(/position: fixed/);
});
