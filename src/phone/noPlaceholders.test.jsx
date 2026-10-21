import fs from 'fs';
import path from 'path';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoteScreen from './VoteScreen';
import TallyScreen from './TallyScreen';
import ResultsMenu from './ResultsMenu';
import { MyBetsList } from './MyBets';
import { subscribeBet, subscribeMyBets } from './api';
import { useIdentity } from './identity';
import { rememberBet } from './notificationStore';
import { navigation } from 'next/navigation';
import { buildSettlement } from './settlement';
import { REVEAL_COPY, buildReveal, winnerPhrase } from './reveal';
import * as voters from './voters';
import * as inviteCopy from './inviteCopy';
import * as resultTextCopy from './resultTextCopy';
import { AUTH_COPY } from './creatorSession';

// No placeholder copy ("TODO_UX: ...") may reach a screen, a copy table, or
// any shipped source file.
const MARKER = 'TODO_UX';

jest.mock('next/navigation');
jest.mock('next/link');

jest.mock('./api', () => ({
  subscribeBet: jest.fn(),
  subscribeMyBets: jest.fn(),
  deleteBet: jest.fn(),
  hydrateBet: async (bet) => bet,
  castVote: jest.fn(async () => {}),
  settleBet: jest.fn(async () => {}),
}));

jest.mock('./identity', () => ({
  useIdentity: jest.fn(),
  rememberName: jest.fn(),
  savedName: () => '',
  creatorName: () => 'Jack',
}));

jest.mock('./creatorAuth', () => ({
  signOutCreator: jest.fn(),
  sendPhoneCode: jest.fn(),
  verifyPhoneCode: jest.fn(),
  mountPhoneCheck: jest.fn(() => Promise.resolve()),
  releasePhoneCheck: jest.fn(),
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'manual'),
  hasShareSheet: jest.fn(() => false),
  openShareSheet: jest.fn(async () => 'aborted'),
}));

const OPTIONS = [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }];

function makeBet({ winners = [], losers = [], ...rest } = {}) {
  const pick = (optionId) => ([voterId, name]) => ({ voterId, name, optionId });
  return {
    id: 'abc123', code: 'abc123', schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line',
    question: 'Chiefs cover -3?', createdByID: 'jack', createdByName: 'Jack', status: 'open',
    stake: '$20', options: OPTIONS,
    votes: [...winners.map(pick('a')), ...losers.map(pick('b'))],
    ...rest,
  };
}

function settled(input, winnerId = 'a') {
  const bet = makeBet(input);
  return { ...bet, status: 'closed', winnerId, settledAt: 1, settlement: buildSettlement(bet, winnerId) };
}

const unnamed = (count) => Array.from({ length: count }, (_, index) => [`u${index}`, '']);
const crew = { winners: [['jack', 'Jack'], ['maya', 'Maya']], losers: [['bart', 'Bart'], ['u9', '']] };

const BETS = {
  open: makeBet(crew),
  winner: settled(crew),
  loser: settled({ ...crew, losers: [['me', 'Pat']] }),
  'one unnamed winner': settled({ winners: unnamed(1), losers: [['bart', 'Bart']] }),
  'several unnamed winners': settled({ winners: unnamed(4), losers: [['bart', 'Bart']] }),
  'mixed named and unnamed winners': settled({ winners: [['jack', 'Jack'], ...unnamed(3)], losers: [['bart', 'Bart']] }),
  'nobody won': settled({ losers: [['bart', 'Bart']] }),
  'called off': { ...settled(crew), calledOff: true },
  'status called-off': makeBet({ ...crew, status: 'called-off' }),
};

const as = (uid, phone = false) => useIdentity.mockReturnValue(
  phone ? { uid, phoneNumber: '+15551234567', providerData: [{ providerId: 'phone' }] } : { uid, isAnonymous: true, providerData: [] },
);
const feed = (bet) => subscribeBet.mockImplementation((_code, onChange) => { onChange(bet); return () => {}; });

async function renderAt(route, element) {
  navigation.pathname = route;
  navigation.params = { code: 'abc123' };
  jest.useFakeTimers();
  try {
    render(element);
    act(() => { jest.advanceTimersByTime(450); });
  } finally {
    jest.useRealTimers();
  }
  await act(async () => {});
}

const pageText = () => document.body.textContent;
const pageLabels = () => [...document.querySelectorAll('[aria-label], [placeholder], [title]')]
  .flatMap((node) => ['aria-label', 'placeholder', 'title'].map((attr) => node.getAttribute(attr) || ''));

function expectNoMarker() {
  expect(pageText()).not.toContain(MARKER);
  pageLabels().forEach((label) => expect(label).not.toContain(MARKER));
}

beforeEach(() => {
  localStorage.clear();
});

describe('rendered screens never show TODO_UX', () => {
  test.each(Object.keys(BETS))('reveal data: %s', (label) => {
    for (const viewerId of [undefined, 'outsider', 'jack', 'me', 'u0', 'bart']) {
      const reveal = buildReveal({ bet: BETS[label], viewerId });
      if (reveal) Object.values(reveal).forEach((value) => expect(String(value)).not.toContain(MARKER));
    }
  });

  test.each(Object.keys(BETS))('VoteScreen and TallyScreen: %s', async (label) => {
    feed(BETS[label]);
    for (const [route, Screen, uid, phone] of [
      ['/b/abc123', VoteScreen, 'outsider', false],
      ['/b/abc123', VoteScreen, 'me', false],
      ['/b/abc123', VoteScreen, 'u0', false],
      ['/t/abc123', TallyScreen, 'jack', true],
    ]) {
      as(uid, phone);
      await renderAt(route, <Screen />);
      expectNoMarker();
      cleanup();
    }
  });

  test('the unnamed-winner reveal reads as a friends count', async () => {
    as('outsider');
    feed(BETS['one unnamed winner']);
    await renderAt('/b/abc123', <VoteScreen />);
    const card = screen.getByRole('region', { name: 'Settled result' });
    expect([...card.children].map((node) => node.textContent)).toEqual([
      'Chiefs -3 won', 'One friend called it.', 'Time for everyone else to pay up.', 'Stakes: $20',
    ]);
    cleanup();
    feed(BETS['several unnamed winners']);
    as('jack', true);
    await renderAt('/t/abc123', <TallyScreen />);
    expect(screen.getByRole('heading', { name: '4 friends called it.' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Settled result' })).toHaveTextContent('Time for everyone else to pay up.');
  });

  test('MyBets in every filter', async () => {
    const user = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
    as('jack', true);
    subscribeMyBets.mockImplementation((_uid, publish) => {
      publish(Object.entries(BETS).map(([label, bet]) => ({ ...bet, id: label.replace(/\W+/g, '-'), code: undefined })));
      return () => {};
    });
    await renderAt('/my-bets', <MyBetsList user={user} />);
    expect(screen.getAllByText('Chiefs cover -3?').length).toBeGreaterThan(1);
    expectNoMarker();
    for (const button of screen.getByRole('group', { name: 'Filter bets by status' }).querySelectorAll('button')) {
      await userEvent.click(button);
      expectNoMarker();
    }
  });

  // Each settled bet seen by a winner and by a loser, so the inbox has a row.
  // Called-off bets are no win or loss, so they never get one.
  test.each([
    ['winner', 'jack'], ['winner', 'bart'], ['loser', 'me'],
    ['one unnamed winner', 'u0'], ['one unnamed winner', 'bart'],
    ['several unnamed winners', 'u2'], ['several unnamed winners', 'bart'],
    ['mixed named and unnamed winners', 'u1'], ['mixed named and unnamed winners', 'bart'],
    ['nobody won', 'bart'], ['called off', 'jack', false],
  ])('ResultsMenu inbox: %s, seen by %s', async (label, uid, listed = true) => {
    useIdentity.mockReturnValue({ uid });
    feed(BETS[label]);
    rememberBet(uid, 'abc123');
    render(<ResultsMenu />);
    expectNoMarker();
    await userEvent.click(screen.getByRole('button', { name: /^Results/ }));
    const inbox = screen.getByRole('dialog', { name: 'The final word' });
    if (listed) expect(inbox).toHaveTextContent('Chiefs cover -3?');
    else expect(inbox).not.toHaveTextContent('Chiefs cover -3?');
    expectNoMarker();
  });
});

describe('copy modules never hold TODO_UX', () => {
  // Every string a copy table can produce: plain values, nested tables, and
  // functions called with a word, one, and many.
  function strings(value) {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') {
      return [['X'], [1], [3], ['Maya', 'Sam']].flatMap((args) => {
        try {
          return strings(value(...args));
        } catch {
          return [];
        }
      });
    }
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
  }

  test.each([
    ['REVEAL_COPY', REVEAL_COPY],
    ['voters', voters],
    ['inviteCopy', inviteCopy],
    ['resultTextCopy', resultTextCopy],
    ['AUTH_COPY', AUTH_COPY],
  ])('%s', (_label, copy) => {
    const all = strings(copy);
    expect(all.length).toBeGreaterThan(0);
    all.forEach((text) => expect(text).not.toContain(MARKER));
  });

  test('reveal helpers for unnamed winners', () => {
    expect(winnerPhrase([{ name: '' }, { name: ' ' }])).toBe('');
    expect(REVEAL_COPY.friends(1)).toBe('One friend called it.');
    expect(REVEAL_COPY.friends(2)).toBe('2 friends called it.');
    expect(voters.voterListLabel(['Jake'], 2, 1)).not.toContain(MARKER);
  });
});

test('no shipped source file under src/, app/ or mobile/ contains TODO_UX', () => {
  const root = path.join(__dirname, '..', '..');
  const skip = new Set(['node_modules', 'dist', 'build', '.next', 'e2e']);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(full);
      } else if (/\.(jsx?|mjs|tsx?|css|html|json)$/.test(entry.name) && !/\.test\.(jsx?|mjs|tsx?)$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  ['src', 'app', 'mobile'].forEach((dir) => walk(path.join(root, dir)));
  expect(files.length).toBeGreaterThan(20);
  const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes(MARKER));
  expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
});
