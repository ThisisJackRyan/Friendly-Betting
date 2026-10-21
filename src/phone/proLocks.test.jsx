import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunItBack from './RunItBack';
import { MyBetsList } from './MyBets';
import EntitlementSync from './EntitlementSync';
import { saveBet, subscribeMyBets } from './api';
import { subscribeEntitlement } from './entitlementApi';
import { __resetEntitlementForTests } from './useEntitlement';
import { buildSettlement } from './settlement';
import { navigation } from 'next/navigation';

// Pro-only features (UX spec, section 11): Run it back and head-to-head stats
// (the Friends filter on My bets). With the paywall on and no Pro, the control
// keeps its look plus a small outlined Pro chip, and a tap opens the Pro
// sheet on that feature's row. Paywall off or a Pro member: as before.

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./api', () => ({
  subscribeMyBets: jest.fn(),
  deleteBet: jest.fn(),
  saveBet: jest.fn(async () => 'new123'),
}));
jest.mock('./identity', () => {
  const maya = { uid: 'creator-1', displayName: 'Maya', providerData: [{ providerId: 'phone' }] };
  return {
    useIdentity: () => maya,
    useSignedInUser: () => maya,
    creatorName: () => 'Maya',
  };
});
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('./FriendlyLoader', () => ({ __esModule: true, default: () => null, useMinHold: () => true }));

const MAYA = { uid: 'creator-1', displayName: 'Maya', providerData: [{ providerId: 'phone' }] };
const open = {
  id: 'old123', code: 'old123', schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line',
  question: 'Who is late', stake: '$5', createdByName: 'Maya', createdByID: 'creator-1',
  status: 'open', winnerId: null,
  options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }],
  votes: [{ voterId: 'anon-1', name: 'Sam', optionId: 'a' }],
};
const SETTLED = { ...open, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(open, 'a') };
const PRO = { plan: 'pro', source: 'mock', expiresAt: null };
const ROW_3 = 'Run it back in one tap';
const ROW_4 = 'Head-to-head stats with friends';

const saved = process.env.NEXT_PUBLIC_PRO_PAYWALL;

function setup({ paywall = true, pro = false } = {}) {
  if (paywall) process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  else delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
  subscribeEntitlement.mockImplementation((_uid, onChange) => {
    onChange(pro ? PRO : null);
    return () => {};
  });
}

async function show(element) {
  render(<><EntitlementSync />{element}</>);
  await act(async () => {});
}

const highlighted = () => Array.from(document.querySelectorAll('.pro-benefits li.is-highlighted')).map((li) => li.textContent);
const chip = (control) => control.querySelector('.pro-lock-chip');

beforeEach(() => {
  __resetEntitlementForTests();
  subscribeEntitlement.mockReset();
  saveBet.mockClear();
  navigation.push.mockReset();
  subscribeMyBets.mockImplementation((_uid, onChange) => {
    onChange([SETTLED]);
    return () => {};
  });
});

afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
  else process.env.NEXT_PUBLIC_PRO_PAYWALL = saved;
});

describe('Run it back', () => {
  const button = () => screen.getByRole('button', { name: /^Run it back/ });

  test('locked: a Pro chip, and a tap opens the sheet on row 3 without saving', async () => {
    setup();
    await show(<RunItBack bet={SETTLED} code="old123" user={MAYA} />);
    expect(button()).toHaveClass('secondary');
    expect(chip(button())).toHaveTextContent(/^Pro$/);
    expect(button()).toHaveTextContent(/^Run it backPro$/);
    await userEvent.click(button());
    expect(screen.getByRole('dialog', { name: 'All the bets. None of the ads.' })).toBeInTheDocument();
    expect(highlighted()).toEqual([ROW_3]);
    expect(saveBet).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button()).toHaveFocus();
  });

  test('paywall off: no chip, it runs it back as today', async () => {
    setup({ paywall: false });
    await show(<RunItBack bet={SETTLED} code="old123" user={MAYA} />);
    expect(chip(button())).toBeNull();
    await userEvent.click(button());
    expect(saveBet).toHaveBeenCalledTimes(1);
    expect(navigation.push).toHaveBeenCalledWith('/t/new123');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('a Pro member: no chip, it runs it back', async () => {
    setup({ pro: true });
    await show(<RunItBack bet={SETTLED} code="old123" user={MAYA} />);
    expect(chip(button())).toBeNull();
    await userEvent.click(button());
    expect(saveBet).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('head-to-head stats (Friends on My bets)', () => {
  const filters = () => screen.getByRole('group', { name: 'Filter bets by status' });
  const friends = () => within(filters()).getByRole('button', { name: /^Friends/ });

  test('locked: a Pro chip, and a tap opens the sheet on row 4 without showing the stats', async () => {
    setup();
    await show(<MyBetsList user={MAYA} />);
    expect(chip(friends())).toHaveTextContent(/^Pro$/);
    await userEvent.click(friends());
    expect(screen.getByRole('dialog', { name: 'All the bets. None of the ads.' })).toBeInTheDocument();
    expect(highlighted()).toEqual([ROW_4]);
    expect(friends()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Head to head')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(friends()).toHaveFocus();
  });

  test('the other filters stay free', async () => {
    setup();
    await show(<MyBetsList user={MAYA} />);
    for (const name of ['All', 'Open', 'Closed', 'Settled']) {
      const filter = within(filters()).getByRole('button', { name: new RegExp(`^${name}`) });
      expect(chip(filter)).toBeNull();
    }
    await userEvent.click(within(filters()).getByRole('button', { name: /^Settled/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test.each([
    ['paywall off', { paywall: false }],
    ['a Pro member', { pro: true }],
  ])('%s: no chip, the stats open', async (_label, options) => {
    setup(options);
    await show(<MyBetsList user={MAYA} />);
    expect(chip(friends())).toBeNull();
    await userEvent.click(friends());
    expect(friends()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Head to head')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
