import { act, fireEvent, render, screen } from '@testing-library/react';
import Landing from './Landing';
import MyBets, { MyBetsList } from './MyBets';
import VoteScreen from './VoteScreen';
import TallyScreen from './TallyScreen';
import EntitlementSync from './EntitlementSync';
import AdThanks from '../ads/AdThanks';
import { subscribeBet, subscribeMyBets } from './api';
import { useIdentity, useSignedInUser } from './identity';
import { subscribeEntitlement } from './entitlementApi';
import { __resetEntitlementForTests } from './useEntitlement';
import { navigation } from 'next/navigation';
import { isNativeApp } from '../platform/runtime';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Go Pro entry points (UX spec, section 10): a muted link under the ad
// thank-you and on Home under Start a bet; on My bets an outlined chip right
// of the heading (signed in), or the muted link under the phone sign-in
// (signed out, where there is no heading). Each only with the paywall on and
// never for a Pro member. Never on the vote or tally page. All go to /pro,
// which opens the Pro sheet on its No ads row.

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./api', () => ({
  subscribeBet: jest.fn(),
  subscribeMyBets: jest.fn(),
  deleteBet: jest.fn(),
  hydrateBet: async (bet) => bet,
  castVote: jest.fn(async () => {}),
  renameVote: jest.fn(async () => {}),
  settleBet: jest.fn(async () => {}),
}));
jest.mock('./identity', () => ({
  useIdentity: jest.fn(),
  useSignedInUser: jest.fn(),
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
jest.mock('../platform/runtime', () => ({
  ...jest.requireActual('../platform/runtime'),
  isNativeApp: jest.fn(() => false),
}));
jest.mock('./FriendlyLoader', () => ({ __esModule: true, default: () => null, useMinHold: () => true }));
jest.mock('./ResultsMenu', () => () => null);

const JACK = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
const ANON = { uid: 'anon-1', isAnonymous: true, providerData: [{ providerId: 'anonymous' }] };
const BET = {
  id: 'abc123', code: 'abc123', schemaVersion: 2, type: 'money-line', question: 'Chiefs cover -3?',
  createdByID: 'jack', createdByName: 'Jack', status: 'open', stake: '$20',
  options: [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }],
  votes: [{ voterId: 'anon-1', name: 'Sam', optionId: 'a' }],
};
const PRO = { plan: 'pro', source: 'mock', expiresAt: null };

const saved = process.env.NEXT_PUBLIC_PRO_PAYWALL;

// paywall: the build flag. pro: whether the signed-in viewer is a Pro member.
function setup({ paywall = true, pro = false, user = JACK } = {}) {
  if (paywall) process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  else delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
  useIdentity.mockReturnValue(user);
  useSignedInUser.mockReturnValue(user);
  subscribeEntitlement.mockImplementation((_uid, onChange) => {
    onChange(pro ? PRO : null);
    return () => {};
  });
  subscribeBet.mockImplementation((_code, onChange) => {
    onChange(BET);
    return () => {};
  });
  subscribeMyBets.mockImplementation((_uid, onChange) => {
    onChange([BET]);
    return () => {};
  });
}

async function show(element) {
  render(<><EntitlementSync />{element}</>);
  await act(async () => {});
}

const goPro = () => screen.queryByRole('link', { name: 'Go Pro' });

beforeEach(() => {
  __resetEntitlementForTests();
  subscribeEntitlement.mockReset();
  navigation.params = { code: 'abc123' };
  navigation.pathname = '/';
});

afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
  else process.env.NEXT_PUBLIC_PRO_PAYWALL = saved;
});

// Each placement: shown with the paywall on for a non-Pro viewer, hidden for
// Pro, hidden with the paywall off.
const PLACEMENTS = [
  ['the ad thank-you', ANON, () => <AdThanks onContinue={() => {}} label="Text the crew" />, 'go-pro-link'],
  ['signed-out My bets', ANON, () => <MyBets />, 'go-pro-link'],
  ['signed-in My bets', JACK, () => <MyBetsList user={JACK} />, 'go-pro-chip'],
  ['Home', ANON, () => <Landing />, 'go-pro-link'],
];

describe.each(PLACEMENTS)('on %s', (_label, user, element, kind) => {
  test(`a ${kind} to /pro with the paywall on, for a non-Pro viewer`, async () => {
    setup({ user });
    await show(element());
    const link = goPro();
    expect(link).toHaveAttribute('href', '/pro');
    expect(link).toHaveTextContent(/^Go Pro$/);
    expect(link).toHaveClass(kind);
    // Never a button or the green text-link style.
    expect(link).not.toHaveClass('cta', 'secondary', 'text-link');
  });

  test('hidden for a Pro member', async () => {
    setup({ user, pro: true });
    await show(element());
    expect(goPro()).toBeNull();
  });

  test('hidden with the paywall off', async () => {
    setup({ user, paywall: false });
    await show(element());
    expect(goPro()).toBeNull();
  });

  test('hidden in the native app, even with the paywall on', async () => {
    setup({ user });
    isNativeApp.mockReturnValue(true);
    try {
      await show(element());
      expect(goPro()).toBeNull();
    } finally {
      isNativeApp.mockReturnValue(false);
    }
  });
});

const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

test('the ad thank-you: right under the note, and tapping it never continues', async () => {
  setup({ user: ANON });
  const onContinue = jest.fn();
  await show(<AdThanks onContinue={onContinue} label="Text the crew" />);
  const note = screen.getByText('Thanks for watching. That keeps Friendly free.');
  expect(note.nextElementSibling).toBe(goPro());
  fireEvent.click(goPro());
  expect(onContinue).not.toHaveBeenCalled();
});

test('the ad thank-you: focus starts on its button and Tab reaches the link and back', async () => {
  setup({ user: ANON });
  await show(<AdThanks onContinue={() => {}} label="Text the crew" />);
  const button = screen.getByRole('button', { name: 'Text the crew' });
  expect(button).toHaveFocus();
  fireEvent.keyDown(button, { key: 'Tab' });
  expect(goPro()).toHaveFocus();
  fireEvent.keyDown(goPro(), { key: 'Tab' });
  expect(button).toHaveFocus();
  fireEvent.keyDown(button, { key: 'Tab', shiftKey: true });
  expect(goPro()).toHaveFocus();
});

test('the ad thank-you with no label: the link sits above the cover button', async () => {
  setup({ user: ANON });
  await show(<AdThanks onContinue={() => {}} />);
  expect(goPro()).toHaveClass('ad-thanks-pro');
});

test('signed-out My bets: below the phone sign-in', async () => {
  setup({ user: ANON });
  await show(<MyBets />);
  const send = screen.getByRole('button', { name: /send code/i });
  expect(follows(screen.getByRole('textbox', { name: /phone/i }), goPro())).toBe(true);
  expect(follows(send, goPro())).toBe(true);
});

test('signed-in My bets: an outlined chip right of the heading, not a link under the intro', async () => {
  setup();
  await show(<MyBetsList user={JACK} />);
  const heading = screen.getByRole('heading', { level: 1, name: /My bets/ });
  expect(heading.parentElement).toHaveClass('bets-title-row');
  expect(heading.nextElementSibling).toBe(goPro());
  expect(document.querySelector('.go-pro-link')).toBeNull();
});

test('the chip: 32px to see, 44px to tap, outlined', () => {
  const css = readFileSync(join(__dirname, 'phone.css'), 'utf8');
  const chip = css.match(/\n\.go-pro-chip \{([^}]*)\}/)[1];
  expect(chip).toMatch(/height: 32px;/);
  expect(chip).toMatch(/border: 1\.5px solid var\(--ink\);/);
  expect(chip).not.toMatch(/--accent/);
  const tap = css.match(/\n\.go-pro-chip::after \{([^}]*)\}/)[1];
  // 32px plus 6px above and below, from the border box.
  expect(tap).toMatch(/top: -7\.5px; bottom: -7\.5px;/);
});

test('Home: below Start a bet', async () => {
  setup({ user: ANON });
  await show(<Landing />);
  expect(follows(screen.getByRole('link', { name: /start a bet/i }), goPro())).toBe(true);
});

describe('never on bettor pages, even with the paywall on for a non-Pro viewer', () => {
  test.each([
    ['the vote page, before a pick', { ...BET, votes: [] }, () => <VoteScreen />],
    ['the vote page, after a pick', BET, () => <VoteScreen />],
    ['the tally, as a bettor', BET, () => <TallyScreen />],
  ])('%s', async (_label, bet, element) => {
    setup({ user: ANON });
    subscribeBet.mockImplementation((_code, onChange) => { onChange(bet); return () => {}; });
    await show(element());
    expect(screen.getByText('Chiefs cover -3?')).toBeInTheDocument();
    expect(goPro()).toBeNull();
  });

  test('the tally, as its creator', async () => {
    setup({ user: JACK });
    await show(<TallyScreen />);
    expect(screen.getByText('Chiefs cover -3?')).toBeInTheDocument();
    expect(goPro()).toBeNull();
  });
});
