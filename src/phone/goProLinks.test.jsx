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

// The Go Pro entry points: under the ad thank-you, on My bets (signed out,
// under the phone sign-in, and signed in) and on Home under Start a bet. Each
// only with the paywall on and never for a Pro member. Never on the vote or
// tally page.

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
  ['the ad thank-you', ANON, () => <AdThanks onContinue={() => {}} label="Text the crew" />],
  ['signed-out My bets', ANON, () => <MyBets />],
  ['signed-in My bets', JACK, () => <MyBetsList user={JACK} />],
  ['Home', ANON, () => <Landing />],
];

describe.each(PLACEMENTS)('on %s', (_label, user, element) => {
  test('a muted link to /pro with the paywall on, for a non-Pro viewer', async () => {
    setup({ user });
    await show(element());
    const link = goPro();
    expect(link).toHaveAttribute('href', '/pro');
    expect(link).toHaveClass('go-pro-link');
    // A text link, not a button or the green text-link style.
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
