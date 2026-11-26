import { act, render, screen, within } from '@testing-library/react';
import AppHeader from './AppHeader';
import ResultsMenu, { bellCount, bellLabel } from './ResultsMenu';
import { subscribeBet } from './api';
import { useIdentity } from './identity';
import { rememberBet } from './notificationStore';
import { buildSettlement } from './settlement';

jest.mock('next/link');
jest.mock('next/navigation');
jest.mock('./api', () => ({ subscribeBet: jest.fn() }));
jest.mock('./identity', () => ({ useIdentity: jest.fn() }));
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('../Config/firebase-config', () => ({ auth: null, db: null }));

let uid;
let round = 0;
let width = 320;

// A matchMedia that answers max-width queries for the current `width`.
const listeners = new Set();
function setWidth(next) {
  width = next;
  act(() => listeners.forEach((fn) => fn()));
}
beforeAll(() => {
  window.matchMedia = (media) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(media)?.[1] ?? Infinity);
    return {
      get matches() { return width <= max; },
      media,
      addEventListener: (_type, fn) => listeners.add(fn),
      removeEventListener: (_type, fn) => listeners.delete(fn),
    };
  };
});
afterAll(() => {
  delete window.matchMedia;
});

const phoneUser = () => ({ uid, providerData: [{ providerId: 'phone' }] });

beforeEach(() => {
  uid = `bell-${round++}`;
  width = 320;
  localStorage.clear();
  useIdentity.mockReturnValue(phoneUser());
  subscribeBet.mockReset();
  subscribeBet.mockImplementation((code, callback) => {
    const bet = {
      code, status: 'open', question: `Bet ${code}?`, stake: '$20 pot',
      options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }],
      votes: [{ voterId: uid, name: 'Jack', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }],
    };
    // Codes starting with "s" are settled, so each is one unread result.
    callback(code.startsWith('s')
      ? { ...bet, status: 'closed', winnerId: 'a', settledAt: 100, settlement: buildSettlement(bet, 'a') }
      : bet);
    return () => {};
  });
});

// One remembered bet that is still open, plus `unread` settled ones.
function remember(unread) {
  rememberBet(uid, 'open1');
  for (let i = 0; i < unread; i += 1) rememberBet(uid, `s${i}`);
}
const resultsButton = () => within(screen.getByRole('banner')).getByRole('button', { name: /^Results/ });

test.each([
  [0, '', 'Results'],
  [3, '3', 'Results, 3 new'],
  [9, '9', 'Results, 9 new'],
  [10, '9+', 'Results, 9 or more new'],
  [25, '9+', 'Results, 9 or more new'],
])('with the Account icon at 449px and under, Results is a bell (%i unread)', (unread, pill, label) => {
  remember(unread);
  render(<AppHeader account />);
  expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  const button = resultsButton();
  expect(button).toHaveClass('header-results', 'bell-only');
  expect(button).toHaveAccessibleName(label);
  expect(button).toHaveAttribute('aria-label', label);
  const count = button.querySelector('.bell-count');
  if (pill) {
    expect(count).toHaveTextContent(new RegExp(`^${pill.replace('+', '\\+')}$`));
    expect(count).toHaveAttribute('aria-hidden', 'true');
  } else {
    expect(count).toBeNull();
  }
});

test.each([449, 400, 360, 320])('with the Account icon at %ipx, Results is a bell', (w) => {
  width = w;
  remember(3);
  render(<AppHeader account />);
  const button = resultsButton();
  expect(button).toHaveClass('header-results', 'bell-only');
  expect(button).toHaveAccessibleName('Results, 3 new');
});

test('bell count and label helpers', () => {
  expect([0, 1, 3, 9, 10, 25].map(bellCount)).toEqual(['0', '1', '3', '9', '9+', '9+']);
  expect([0, 1, 3, 9, 10, 25].map(bellLabel)).toEqual([
    'Results', 'Results, 1 new', 'Results, 3 new', 'Results, 9 new',
    'Results, 9 or more new', 'Results, 9 or more new',
  ]);
});

// The full button, as it renders today: the word Results and "N new".
function expectFull(button, unread) {
  expect(button).toHaveAttribute('class', 'header-results press');
  expect(button).not.toHaveAttribute('aria-label');
  expect(button.querySelector('.bell-count')).toBeNull();
  expect(button).toHaveTextContent(unread ? `Results${unread} new` : 'Results');
  expect(button).toHaveAccessibleName(unread ? `Results ${unread} new` : 'Results');
}

test.each([0, 3, 9])('above 449px the Account header keeps the full Results button (%i unread)', (unread) => {
  width = 450;
  remember(unread);
  render(<AppHeader account />);
  expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  expectFull(resultsButton(), unread);
});

test.each([0, 3, 9])('with no Account icon, Results stays full at 320px (%i unread)', (unread) => {
  remember(unread);
  render(<AppHeader />);
  expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  expectFull(resultsButton(), unread);
});

test('account prop on, but no icon for an anonymous web visitor: Results stays full', () => {
  useIdentity.mockReturnValue({ uid, isAnonymous: true, providerData: [] });
  remember(3);
  render(<AppHeader account />);
  expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  expectFull(resultsButton(), 3);
});

test('ResultsMenu on its own (the vote page header) is never bell-only', () => {
  remember(3);
  render(<header><ResultsMenu /></header>);
  expectFull(resultsButton(), 3);
});

test('crossing 449/450px swaps between bell and full button', () => {
  width = 450;
  remember(3);
  render(<AppHeader account />);
  expectFull(resultsButton(), 3);
  setWidth(449);
  expect(resultsButton()).toHaveAccessibleName('Results, 3 new');
  expect(resultsButton()).toHaveClass('bell-only');
  setWidth(800);
  expectFull(resultsButton(), 3);
});

test('without matchMedia (server, old browsers) Results stays full', () => {
  const saved = window.matchMedia;
  delete window.matchMedia;
  try {
    remember(3);
    render(<AppHeader account />);
    expectFull(resultsButton(), 3);
  } finally {
    window.matchMedia = saved;
  }
});
