import { render, screen, within } from '@testing-library/react';
import TallyScreen from './TallyScreen';
import VoteScreen from './VoteScreen';
import { MyBetsList } from './MyBets';
import EntitlementSync from './EntitlementSync';
import { subscribeBet, subscribeMyBets } from './api';
import { useIdentity } from './identity';
import { subscribeEntitlement } from './entitlementApi';
import { __resetEntitlementForTests } from './useEntitlement';
import { buildSettlement } from './settlement';
import { navigation } from 'next/navigation';

// The badge only ever follows the viewer's own name: clients can read only
// their own entitlement, so nobody else's plan is known.

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
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'manual'),
  hasShareSheet: jest.fn(() => false),
  openShareSheet: jest.fn(async () => 'aborted'),
}));
jest.mock('./FriendlyLoader', () => ({ __esModule: true, default: () => null, useMinHold: () => true }));
jest.mock('./ResultsMenu', () => () => null);

const JACK = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
const MAYA = { uid: 'maya', isAnonymous: true, providerData: [] };
const OPTIONS = [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }];
const OPEN = {
  id: 'abc123', code: 'abc123', schemaVersion: 2, type: 'money-line', question: 'Chiefs cover -3?',
  createdByID: 'jack', createdByName: 'Jack', status: 'open', stake: '$20', options: OPTIONS,
  votes: [
    { voterId: 'maya', name: 'Maya', optionId: 'a' },
    { voterId: 'jack', name: 'Jack', optionId: 'a' },
    { voterId: 'sam', name: 'Sam', optionId: 'b' },
  ],
};
const SETTLED = { ...OPEN, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(OPEN, 'a') };

const PLANS = {
  pro: { plan: 'pro', source: 'mock', expiresAt: null },
  founder: { plan: 'founder', source: 'mock', founderNumber: 7, expiresAt: null },
  expired: { plan: 'pro', source: 'mock', expiresAt: 1 },
};

function setup({ user, plan, bet }) {
  useIdentity.mockReturnValue(user);
  subscribeEntitlement.mockImplementation((uid, onChange) => {
    onChange(uid === user.uid ? PLANS[plan] || null : null);
    return () => {};
  });
  subscribeBet.mockImplementation((_code, onChange) => {
    onChange(bet);
    return () => {};
  });
  subscribeMyBets.mockImplementation((_uid, onChange) => {
    onChange([bet]);
    return () => {};
  });
}

function show(screenElement) {
  render(<><EntitlementSync />{screenElement}</>);
}

beforeEach(() => {
  __resetEntitlementForTests();
  subscribeEntitlement.mockReset();
  navigation.params = { code: 'abc123' };
});

const badges = () => document.querySelectorAll('.pro-badge');

describe('tally', () => {
  test('a Pro viewer gets the badge on their own name in the voter list, nobody else', () => {
    setup({ user: JACK, plan: 'pro', bet: OPEN });
    show(<TallyScreen />);
    expect(badges()).toHaveLength(1);
    const own = screen.getByTitle('Jack');
    expect(within(own).getByText('Pro')).toBeInTheDocument();
    expect(screen.getByTitle('Maya')).toHaveTextContent(/^Maya$/);
    expect(screen.getByTitle('Sam')).toHaveTextContent(/^Sam$/);
  });

  test('a founder number shows on the tally', () => {
    setup({ user: JACK, plan: 'founder', bet: OPEN });
    show(<TallyScreen />);
    expect(within(screen.getByTitle('Jack')).getByText('Founder #7')).toBeInTheDocument();
  });

  test('no badge without a live plan', () => {
    setup({ user: JACK, plan: 'expired', bet: OPEN });
    show(<TallyScreen />);
    expect(badges()).toHaveLength(0);
  });

  test('a Pro viewer who never picked shows no badge on anyone', () => {
    setup({ user: { uid: 'zed', providerData: [] }, plan: 'pro', bet: OPEN });
    show(<TallyScreen />);
    expect(badges()).toHaveLength(0);
  });

  test('the reveal badges the viewer when the headline is about them', () => {
    setup({ user: JACK, plan: 'pro', bet: SETTLED });
    show(<TallyScreen />);
    const headline = screen.getByRole('heading', { name: /You called it\./ });
    expect(within(headline).getByText('Pro')).toBeInTheDocument();
    expect(badges()).toHaveLength(1);
  });

  test('the reveal never badges a headline naming other people', () => {
    setup({ user: { uid: 'sam', providerData: [] }, plan: 'pro', bet: SETTLED });
    show(<TallyScreen />);
    expect(screen.getByRole('heading', { name: 'Maya & Jack won.' })).toBeInTheDocument();
    expect(badges()).toHaveLength(0);
  });
});

describe('vote page', () => {
  test('the creator viewing their own bet gets the badge on the inviter line', () => {
    setup({ user: JACK, plan: 'founder', bet: OPEN });
    show(<VoteScreen />);
    const inviter = document.querySelector('.inviter');
    expect(inviter).toHaveTextContent('JackFounder #7');
    expect(badges()).toHaveLength(1);
  });

  test('a Pro voter does not badge the creator’s name', () => {
    setup({ user: MAYA, plan: 'pro', bet: OPEN });
    show(<VoteScreen />);
    expect(document.querySelector('.inviter')).toHaveTextContent(/^Jack$/);
    expect(badges()).toHaveLength(0);
  });

  test('a Pro winner sees their badge on the reveal', () => {
    setup({ user: MAYA, plan: 'pro', bet: SETTLED });
    show(<VoteScreen />);
    const headline = screen.getByRole('heading', { name: /You called it\./ });
    expect(within(headline).getByText('Pro')).toBeInTheDocument();
    expect(badges()).toHaveLength(1);
  });
});

describe('My bets', () => {
  test('the heading carries the member’s badge', () => {
    setup({ user: JACK, plan: 'pro', bet: OPEN });
    show(<MyBetsList user={JACK} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('My betsPro');
    expect(badges()).toHaveLength(1);
  });

  test('no badge for a member without a plan', () => {
    setup({ user: JACK, plan: null, bet: OPEN });
    show(<MyBetsList user={JACK} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^My bets$/);
  });

  test('no badge when the list is for someone other than the loaded entitlement', () => {
    setup({ user: JACK, plan: 'pro', bet: OPEN });
    show(<MyBetsList user={{ uid: 'other', providerData: [{ providerId: 'phone' }] }} />);
    expect(badges()).toHaveLength(0);
  });
});

describe('Go Pro link on My bets', () => {
  const flag = process.env.NEXT_PUBLIC_PRO_PAYWALL;
  afterEach(() => {
    if (flag === undefined) delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
    else process.env.NEXT_PUBLIC_PRO_PAYWALL = flag;
  });

  test('hidden with the paywall flag off', () => {
    delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
    setup({ user: JACK, plan: null, bet: OPEN });
    show(<MyBetsList user={JACK} />);
    expect(screen.queryByRole('link', { name: 'Go Pro' })).toBeNull();
  });

  test('shown to a creator without Pro, linking to /pro, with the flag on', () => {
    process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
    setup({ user: JACK, plan: null, bet: OPEN });
    show(<MyBetsList user={JACK} />);
    expect(screen.getByRole('link', { name: 'Go Pro' })).toHaveAttribute('href', '/pro');
  });

  test('hidden for a Pro member', () => {
    process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
    setup({ user: JACK, plan: 'pro', bet: OPEN });
    show(<MyBetsList user={JACK} />);
    expect(screen.queryByRole('link', { name: 'Go Pro' })).toBeNull();
  });
});
