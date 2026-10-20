import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Paywall from './Paywall';
import EntitlementSync from './EntitlementSync';
import { fetchFounderCount, requestMockPurchase, subscribeEntitlement } from './entitlementApi';
import { __resetEntitlementForTests } from './useEntitlement';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./identity', () => ({ useIdentity: () => ({ uid: 'jack', providerData: [{ providerId: 'phone' }] }) }));

const FLAGS = ['NEXT_PUBLIC_PRO_PAYWALL', 'NEXT_PUBLIC_PRO_MOCK_PURCHASE'];
const saved = Object.fromEntries(FLAGS.map((flag) => [flag, process.env[flag]]));
let emitPlan;

beforeEach(() => {
  __resetEntitlementForTests();
  subscribeEntitlement.mockReset();
  subscribeEntitlement.mockImplementation((_uid, onChange) => {
    emitPlan = (plan) => act(() => onChange(plan));
    onChange(null);
    return () => {};
  });
  fetchFounderCount.mockReset();
  fetchFounderCount.mockResolvedValue(0);
  requestMockPurchase.mockReset();
  requestMockPurchase.mockResolvedValue({ ok: true, plan: 'pro' });
  navigation.back.mockReset();
  navigation.push.mockReset();
  FLAGS.forEach((flag) => delete process.env[flag]);
});

afterEach(() => {
  FLAGS.forEach((flag) => {
    if (saved[flag] === undefined) delete process.env[flag];
    else process.env[flag] = saved[flag];
  });
});

async function open() {
  render(<><EntitlementSync /><Paywall /></>);
  await act(async () => {});
}

test('flag off: /pro is the 404 page and reads nothing', async () => {
  await open();
  expect(screen.getByRole('heading', { name: 'Lost that one.' })).toBeInTheDocument();
  expect(screen.queryByText('Go Pro')).toBeNull();
  expect(fetchFounderCount).not.toHaveBeenCalled();
});

test('flag on: the pricing lines, with the first founder tier', async () => {
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  await open();
  expect(screen.getByRole('heading', { level: 2, name: 'Go Pro' })).toBeInTheDocument();
  expect(screen.getByText('3 free bets, then $3/mo.')).toBeInTheDocument();
  expect(screen.getByText('No ads.')).toBeInTheDocument();
  expect(screen.getByText('Founder: $40 lifetime for the first 100.')).toBeInTheDocument();
  expect(screen.getByText('Picking a side is always free.')).toBeInTheDocument();
  expect(document.title).toBe('Go Pro · Friendly');
});

test('founder price follows the count, and sold out hides the founder button', async () => {
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  fetchFounderCount.mockResolvedValue(100);
  const { unmount } = render(<><EntitlementSync /><Paywall /></>);
  await act(async () => {});
  expect(screen.getByText('Founder: $80 lifetime for the next 500.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Get Founder' })).toBeInTheDocument();
  unmount();

  fetchFounderCount.mockResolvedValue(600);
  await open();
  expect(screen.getByText('Founder spots are sold out.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Get Founder' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Get Pro' })).toBeInTheDocument();
});

test('an unreadable count leaves founder out rather than guess a price', async () => {
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  fetchFounderCount.mockRejectedValue(new Error('offline'));
  await open();
  expect(screen.queryByText(/^Founder/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Get Founder' })).toBeNull();
});

test('without the mock purchase flag the buttons are disabled under Coming soon', async () => {
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  await open();
  expect(screen.getByRole('button', { name: 'Get Pro' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Get Founder' })).toBeDisabled();
  expect(screen.getByText('Coming soon')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Get Pro' }));
  expect(requestMockPurchase).not.toHaveBeenCalled();
});

test('with the mock purchase flag the buttons buy through the route', async () => {
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
  await open();
  expect(screen.queryByText('Coming soon')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Get Pro' }));
  expect(requestMockPurchase).toHaveBeenCalledWith('pro');

  requestMockPurchase.mockResolvedValue({ ok: true, plan: 'founder', founderNumber: 100, founderCount: 100 });
  await userEvent.click(screen.getByRole('button', { name: 'Get Founder' }));
  expect(requestMockPurchase).toHaveBeenLastCalledWith('founder');
  expect(screen.getByText('Founder: $80 lifetime for the next 500.')).toBeInTheDocument();

  // The new plan arrives through the entitlement listener.
  emitPlan({ plan: 'founder', founderNumber: 100, expiresAt: null });
  expect(screen.getByText('Founder #100')).toBeInTheDocument();
  expect(screen.getByText('You’re all set. No ads.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Get Pro' })).toBeNull();
});

test('a failed purchase says so', async () => {
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
  requestMockPurchase.mockRejectedValue(new Error('nope'));
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Get Pro' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t finish that. Try again.');
});

test('Not now leaves the paywall', async () => {
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(navigation.back.mock.calls.length + navigation.push.mock.calls.length).toBe(1);
});
