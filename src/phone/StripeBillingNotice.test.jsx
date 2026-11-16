import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyBetsList } from './MyBets';
import EntitlementSync from './EntitlementSync';
import { subscribeMyBets } from './api';
import { useIdentity, useSignedInUser } from './identity';
import { requestBillingPortal, requestDismissGraceEndedNotice, requestGraceEndedNotice, subscribeEntitlement } from './entitlementApi';
import { leaveForBilling } from './billingRedirect';
import { __resetEntitlementForTests } from './useEntitlement';
import { __resetBillingNoticeForTests } from './StripeBillingNotice';
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
const MAYA = { uid: 'maya', providerData: [{ providerId: 'phone' }] };
const FLAGS = ['NEXT_PUBLIC_PRO_PAYWALL', 'NEXT_PUBLIC_STRIPE_WEB_PRO'];
const saved = Object.fromEntries(FLAGS.map((flag) => [flag, process.env[flag]]));

// A Stripe plan whose first failed payment was `ago` ms before now, as the
// webhook writes it (stripePastDueAt + 3 days = expiresAt).
const pastDue = (ago, status = 'past_due') => {
  const since = Date.now() - ago;
  return { plan: 'pro', source: 'stripe', since: 1, stripeStatus: status, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripePastDueAt: since, expiresAt: since + STRIPE_GRACE_DAYS * DAY };
};

let plan;
let pushPlan;
// The server's stripeNoticeDismissals: uid -> the stripePastDueAt whose
// ended banner that account dismissed. The mocked calls answer for the
// signed-in account (the ID token), like /api/pro/billing-notice.
let serverDismissals;
let signedIn;
const signIn = (user) => {
  signedIn = user;
  useIdentity.mockReturnValue(user);
  useSignedInUser.mockReturnValue(user);
};
beforeEach(() => {
  __resetEntitlementForTests();
  __resetBillingNoticeForTests();
  plan = null;
  pushPlan = null;
  serverDismissals = new Map();
  FLAGS.forEach((flag) => {
    process.env[flag] = '1';
  });
  signIn(JACK);
  subscribeMyBets.mockImplementation((_uid, onChange) => {
    onChange([]);
    return () => {};
  });
  subscribeEntitlement.mockReset();
  subscribeEntitlement.mockImplementation((_uid, onChange) => {
    pushPlan = onChange;
    onChange(plan);
    return () => {};
  });
  requestGraceEndedNotice.mockReset();
  requestGraceEndedNotice.mockImplementation(async () => ({ dismissed: serverDismissals.get(signedIn.uid) === plan?.stripePastDueAt }));
  requestDismissGraceEndedNotice.mockReset();
  requestDismissGraceEndedNotice.mockImplementation(async () => {
    serverDismissals.set(signedIn.uid, plan.stripePastDueAt);
    return { dismissed: true };
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

async function show(entitlement, user = JACK) {
  plan = entitlement;
  const view = render(<><EntitlementSync /><MyBetsList user={user} /></>);
  await act(async () => {});
  return view;
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
  const first = await show(pastDue(DAY));
  expect(banner()).toBeNull();
  // A fresh load with the ended plan: unmount first, so resetting the shared
  // entitlement store notifies no mounted component (outside act).
  first.unmount();
  __resetEntitlementForTests();
  await show(pastDue(STRIPE_GRACE_DAYS * DAY + 1000));
  expect(banner()).toBeNull();
});

describe('dismissing the Pro ended banner', () => {
  const endedPlan = (extra = 0) => pastDue(STRIPE_GRACE_DAYS * DAY + 1000 + extra);
  const dismissButton = () => screen.queryByRole('button', { name: 'Dismiss' });
  // A reload: everything unmounted, and the session's module state gone.
  const reload = async (view, entitlement, user) => {
    view.unmount();
    __resetEntitlementForTests();
    __resetBillingNoticeForTests();
    return show(entitlement, user);
  };

  test('the ended banner has a muted, icon-only X labelled exactly Dismiss', async () => {
    await show(endedPlan());
    const button = within(banner()).getByRole('button', { name: 'Dismiss' });
    expect(button).toHaveAttribute('aria-label', 'Dismiss');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('billing-notice-dismiss');
    // Icon only: no visible text, and the icon is hidden from assistive tech.
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // The approved copy is unchanged.
    expect(banner()).toHaveTextContent(`${ENDED} Go Pro`);
  });

  test('the in-grace banner has no dismiss', async () => {
    await show(pastDue(DAY));
    expect(banner()).toHaveTextContent(GRACE);
    expect(dismissButton()).toBeNull();
    expect(requestGraceEndedNotice).not.toHaveBeenCalled();
  });

  test('Dismiss hides the banner at once and saves it on the server for the account', async () => {
    await show(endedPlan());
    await userEvent.click(dismissButton());
    expect(banner()).toBeNull();
    expect(screen.queryByText(ENDED)).toBeNull();
    expect(requestDismissGraceEndedNotice).toHaveBeenCalledTimes(1);
    expect(serverDismissals.get('jack')).toBe(plan.stripePastDueAt);
  });

  test('stays hidden after a remount and after a reload, for that account only', async () => {
    let view = await show(endedPlan());
    await userEvent.click(dismissButton());
    // Leaving My bets and coming back.
    view.unmount();
    view = await show(plan);
    expect(banner()).toBeNull();
    // A reload: nothing kept on the device; the server still says dismissed.
    requestGraceEndedNotice.mockClear();
    view = await reload(view, plan);
    expect(requestGraceEndedNotice).toHaveBeenCalledTimes(1);
    expect(banner()).toBeNull();
    expect(screen.queryByText(ENDED)).toBeNull();
    // Another account on the same device still sees its own ended banner.
    signIn(MAYA);
    await reload(view, endedPlan(), MAYA);
    expect(banner()).toHaveTextContent(ENDED);
    expect(dismissButton()).not.toBeNull();
  });

  test('nothing flashes while the server is asked; a failed read shows the banner', async () => {
    let answer;
    requestGraceEndedNotice.mockImplementation(() => new Promise((resolve, reject) => {
      answer = { resolve, reject };
    }));
    await show(endedPlan());
    expect(banner()).toBeNull();
    await act(async () => answer.reject(new Error('offline')));
    expect(banner()).toHaveTextContent(ENDED);
  });

  test('a failed save still hides it now; the next load shows it again', async () => {
    requestDismissGraceEndedNotice.mockRejectedValue(new Error('offline'));
    const view = await show(endedPlan());
    await userEvent.click(dismissButton());
    expect(banner()).toBeNull();
    await reload(view, plan);
    expect(banner()).toHaveTextContent(ENDED);
  });

  test('hides once the member is Pro again, and a later grace’s ended banner shows again', async () => {
    await show(endedPlan());
    expect(banner()).toHaveTextContent(ENDED);
    // Pro again (a new subscription): no banner, no dismiss.
    await act(async () => pushPlan({ plan: 'pro', source: 'stripe', since: 2, stripeStatus: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_2', expiresAt: Date.now() + 30 * DAY }));
    expect(banner()).toBeNull();
    expect(dismissButton()).toBeNull();
    // A dismissed ended banner stays hidden while Pro again too.
    plan = endedPlan(-1000);
    await act(async () => pushPlan(plan));
    await userEvent.click(dismissButton());
    expect(banner()).toBeNull();
    await act(async () => pushPlan({ ...plan, stripeStatus: 'active', stripePastDueAt: undefined, expiresAt: Date.now() + 30 * DAY }));
    expect(banner()).toBeNull();
    // A new grace that runs out later has its own banner.
    plan = endedPlan(5000);
    await act(async () => pushPlan(plan));
    expect(banner()).toHaveTextContent(ENDED);
  });
});
