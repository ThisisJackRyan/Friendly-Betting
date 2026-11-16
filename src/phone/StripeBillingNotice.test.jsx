import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyBetsList } from './MyBets';
import EntitlementSync from './EntitlementSync';
import { subscribeMyBets } from './api';
import { useIdentity, useSignedInUser } from './identity';
import { requestBillingPortal, subscribeEntitlement } from './entitlementApi';
import { leaveForBilling } from './billingRedirect';
import { __resetEntitlementForTests } from './useEntitlement';
import { STRIPE_GRACE_DAYS, STRIPE_GRACE_ENDED_NOTICE_DAYS } from './entitlement';
import { STRIPE_COPY } from './proConfig';
import { isNativeApp } from '../platform/runtime';

// The Stripe past_due grace banner at the top of My bets
// (docs/STRIPE-WEB-PRO.md): web only, behind the paywall and Stripe web Pro
// flags, and only for a member whose own Stripe plan is in, or just ran out
// of, a grace.

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./api', () => ({ subscribeMyBets: jest.fn(), deleteBet: jest.fn() }));
jest.mock('./identity', () => ({ useIdentity: jest.fn(), useSignedInUser: jest.fn() }));
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('./billingRedirect', () => ({ leaveForBilling: jest.fn(() => true) }));
jest.mock('../platform/runtime', () => ({ ...jest.requireActual('../platform/runtime'), isNativeApp: jest.fn(() => false) }));
jest.mock('./FriendlyLoader', () => ({ __esModule: true, default: () => null, useMinHold: () => true }));

// The approved copy, verbatim (curly apostrophes).
const GRACE = 'Your payment didn’t go through. Update it to keep Pro.';
const UPDATE = 'Update payment';
const ENDED = 'Pro ended. Your bets are all still here.';
const ERROR = 'Couldn’t finish that. Try again.';

const DAY = 24 * 60 * 60 * 1000;
const JACK = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
const FLAGS = ['NEXT_PUBLIC_PRO_PAYWALL', 'NEXT_PUBLIC_STRIPE_WEB_PRO'];
const saved = Object.fromEntries(FLAGS.map((flag) => [flag, process.env[flag]]));

// A Stripe plan whose first failed payment was `ago` ms before now, as the
// webhook writes it (stripePastDueAt + 3 days = expiresAt).
const pastDue = (ago, status = 'past_due') => {
  const since = Date.now() - ago;
  return { plan: 'pro', source: 'stripe', since: 1, stripeStatus: status, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripePastDueAt: since, expiresAt: since + STRIPE_GRACE_DAYS * DAY };
};

let plan;
beforeEach(() => {
  __resetEntitlementForTests();
  plan = null;
  FLAGS.forEach((flag) => {
    process.env[flag] = '1';
  });
  useIdentity.mockReturnValue(JACK);
  useSignedInUser.mockReturnValue(JACK);
  subscribeMyBets.mockImplementation((_uid, onChange) => {
    onChange([]);
    return () => {};
  });
  subscribeEntitlement.mockReset();
  subscribeEntitlement.mockImplementation((_uid, onChange) => {
    onChange(plan);
    return () => {};
  });
  requestBillingPortal.mockReset();
  requestBillingPortal.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/bps_1' });
  leaveForBilling.mockReset();
  leaveForBilling.mockReturnValue(true);
  isNativeApp.mockReturnValue(false);
});

afterEach(() => {
  FLAGS.forEach((flag) => {
    if (saved[flag] === undefined) delete process.env[flag];
    else process.env[flag] = saved[flag];
  });
});

async function show(entitlement) {
  plan = entitlement;
  render(<><EntitlementSync /><MyBetsList user={JACK} /></>);
  await act(async () => {});
}

const banner = () => document.querySelector('.billing-notice');

test('the strings are the approved copy', () => {
  expect(STRIPE_COPY.graceNotice).toBe(GRACE);
  expect(STRIPE_COPY.updatePayment).toBe(UPDATE);
  expect(STRIPE_COPY.graceEnded).toBe(ENDED);
});

test('during the grace: a muted banner above the heading; Update payment opens the existing portal', async () => {
  await show(pastDue(DAY));
  const notice = banner();
  expect(notice).toHaveTextContent(`${GRACE} ${UPDATE}`);
  expect(notice.compareDocumentPosition(screen.getByRole('heading', { name: /My bets/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.click(within(notice).getByRole('button', { name: UPDATE }));
  expect(requestBillingPortal).toHaveBeenCalledTimes(1);
  expect(leaveForBilling).toHaveBeenCalledWith('https://billing.stripe.com/p/session/bps_1');
  expect(screen.queryByText(ENDED)).toBeNull();
});

test('a portal failure shows the existing error line', async () => {
  requestBillingPortal.mockRejectedValue(Object.assign(new Error('x'), { code: 'server' }));
  await show(pastDue(DAY));
  await userEvent.click(screen.getByRole('button', { name: UPDATE }));
  expect(screen.getByRole('alert')).toHaveTextContent(ERROR);
  expect(screen.getByRole('button', { name: UPDATE })).toBeEnabled();
});

test('after the grace ran out (no new webhook): Pro ended, with Go Pro to /pro', async () => {
  await show(pastDue(STRIPE_GRACE_DAYS * DAY + 1000));
  const notice = banner();
  expect(notice).toHaveTextContent(`${ENDED} Go Pro`);
  expect(within(notice).getByRole('link', { name: 'Go Pro' })).toHaveAttribute('href', '/pro');
  expect(screen.queryByText(GRACE)).toBeNull();
});

test('the ended banner stays after Stripe moves on to canceled or unpaid', async () => {
  await show(pastDue(STRIPE_GRACE_DAYS * DAY + DAY, 'canceled'));
  expect(banner()).toHaveTextContent(ENDED);
});

test.each([
  ['a free member', null],
  ['a member with only a Stripe customer', { stripeCustomerId: 'cus_1' }],
  ['a legacy founder', { plan: 'founder', source: 'mock', expiresAt: null }],
  ['an active Stripe member', { plan: 'pro', source: 'stripe', stripeStatus: 'active', expiresAt: Date.now() + 30 * DAY, stripeCustomerId: 'cus_1' }],
  ['a Stripe member who canceled (no grace ran out)', { plan: 'pro', source: 'stripe', stripeStatus: 'canceled', expiresAt: Date.now() - DAY, stripeCustomerId: 'cus_1' }],
  ['a recovered member (Pro again)', { ...pastDue(DAY), stripeStatus: 'active', stripePastDueAt: undefined, expiresAt: Date.now() + 30 * DAY }],
  ['a member long after the ended notice', pastDue((STRIPE_GRACE_DAYS + STRIPE_GRACE_ENDED_NOTICE_DAYS) * DAY + 1000)],
])('no banner for %s', async (_label, entitlement) => {
  await show(entitlement);
  expect(banner()).toBeNull();
  expect(screen.queryByText(GRACE)).toBeNull();
  expect(screen.queryByText(ENDED)).toBeNull();
});

test.each([
  ['the Stripe web Pro flag off', () => delete process.env.NEXT_PUBLIC_STRIPE_WEB_PRO],
  ['the paywall off', () => delete process.env.NEXT_PUBLIC_PRO_PAYWALL],
  ['the native app', () => isNativeApp.mockReturnValue(true)],
])('nothing with %s', async (_label, turnOff) => {
  turnOff();
  await show(pastDue(DAY));
  expect(banner()).toBeNull();
  plan = pastDue(STRIPE_GRACE_DAYS * DAY + 1000);
  __resetEntitlementForTests();
  await show(plan);
  expect(banner()).toBeNull();
});
