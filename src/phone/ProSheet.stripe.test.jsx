import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Paywall from './Paywall';
import ProSheet, { CONFIRM_EVERY_MS, CONFIRM_TRIES } from './ProSheet';
import EntitlementSync from './EntitlementSync';
import ProBadge from './ProBadge';
import { fetchEntitlement, requestBillingPortal, requestCheckout, requestMockPurchase, subscribeEntitlement } from './entitlementApi';
import { leaveForBilling } from './billingRedirect';
import { __resetEntitlementForTests, useProBadge } from './useEntitlement';
import { isPro as adServiceIsPro } from '../ads/pro';
import { isNativeApp } from '../platform/runtime';
import { STRIPE_COPY } from './proConfig';

// Web Pro billing with Stripe (docs/STRIPE-WEB-PRO.md) in the Pro sheet and
// /pro. With NEXT_PUBLIC_STRIPE_WEB_PRO off, nothing here may change.

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./identity', () => {
  const jack = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
  return { useIdentity: () => jack, useSignedInUser: () => jack };
});
jest.mock('./billingRedirect', () => ({ leaveForBilling: jest.fn(() => true) }));
jest.mock('../platform/runtime', () => ({ PROD_ORIGIN: 'https://www.friendly-bets.com', isNativeApp: jest.fn(() => false) }));

const GET_PRO = 'Get Pro';
const BUYING = 'Getting you set…';
const COMING_SOON = 'Coming soon';
const ERROR = 'Couldn’t finish that. Try again.';
const OWNED = 'You’re Pro. No more ads.';
const MANAGE = 'Manage subscription';
const FUTURE = () => Date.now() + 30 * 24 * 60 * 60 * 1000;
const stripePlan = () => ({ plan: 'pro', source: 'stripe', since: 1, expiresAt: FUTURE(), stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeStatus: 'active' });

const FLAGS = ['NEXT_PUBLIC_PRO_PAYWALL', 'NEXT_PUBLIC_PRO_MOCK_PURCHASE', 'NEXT_PUBLIC_STRIPE_WEB_PRO'];
const saved = Object.fromEntries(FLAGS.map((flag) => [flag, process.env[flag]]));
let plan;

beforeEach(() => {
  __resetEntitlementForTests();
  plan = null;
  subscribeEntitlement.mockReset();
  subscribeEntitlement.mockImplementation((_uid, onChange) => {
    onChange(plan);
    return () => {};
  });
  fetchEntitlement.mockReset();
  fetchEntitlement.mockResolvedValue(null);
  requestMockPurchase.mockReset();
  requestMockPurchase.mockResolvedValue({ ok: true, plan: 'pro' });
  requestCheckout.mockReset();
  requestCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  requestBillingPortal.mockReset();
  requestBillingPortal.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/bps_1' });
  leaveForBilling.mockReset();
  leaveForBilling.mockReturnValue(true);
  isNativeApp.mockReturnValue(false);
  FLAGS.forEach((flag) => delete process.env[flag]);
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  window.history.replaceState(null, '', '/pro');
});

afterEach(() => {
  jest.useRealTimers();
  FLAGS.forEach((flag) => {
    if (saved[flag] === undefined) delete process.env[flag];
    else process.env[flag] = saved[flag];
  });
});

async function openSheet(props = {}) {
  const onClose = jest.fn();
  render(<><EntitlementSync /><ProSheet onClose={onClose} onDone={() => {}} {...props} /></>);
  await act(async () => {});
  return { onClose };
}

async function openPage() {
  render(<><EntitlementSync /><Paywall /></>);
  await act(async () => {});
}

const main = () => within(screen.getByRole('dialog')).getAllByRole('button').find((b) => b.classList.contains('pro-sheet-main'));

describe('flag off: today’s sheet, unchanged', () => {
  test('no purchase flags: Coming soon, disabled, and no Stripe call', async () => {
    await openSheet();
    expect(main()).toHaveTextContent(COMING_SOON);
    expect(main()).toBeDisabled();
    await userEvent.click(main());
    expect(requestCheckout).not.toHaveBeenCalled();
    expect(screen.queryByText(MANAGE)).toBeNull();
  });

  test('the mock purchase still runs the mock route, never Checkout', async () => {
    process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
    await openSheet();
    await userEvent.click(main());
    expect(requestMockPurchase).toHaveBeenCalledWith('pro');
    expect(requestCheckout).not.toHaveBeenCalled();
    expect(leaveForBilling).not.toHaveBeenCalled();
  });

  test('a Stripe member’s success screen has no Manage subscription, and no new copy anywhere', async () => {
    plan = stripePlan();
    await openSheet();
    expect(screen.getByRole('heading', { name: OWNED })).toBeInTheDocument();
    const footer = document.querySelector('.pro-sheet-success .pro-sheet-footer');
    expect(footer.children).toHaveLength(1);
    Object.values(STRIPE_COPY).forEach((text) => expect(document.body.textContent).not.toContain(text));
  });

  test('/pro?checkout=success is left alone: the URL stays and nothing waits', async () => {
    process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
    window.history.replaceState(null, '', '/pro?checkout=success');
    await openPage();
    expect(window.location.search).toBe('?checkout=success');
    expect(main()).toHaveTextContent(GET_PRO);
    expect(main()).toBeEnabled();
    expect(fetchEntitlement).not.toHaveBeenCalled();
  });

  test('the sheet renders the same markup with the flag unset or set to anything but 1', async () => {
    const { unmount } = render(<ProSheet onClose={() => {}} />);
    await act(async () => {});
    const layer = () => document.querySelector('.pro-sheet-layer').outerHTML;
    const off = layer();
    unmount();
    process.env.NEXT_PUBLIC_STRIPE_WEB_PRO = 'true';
    render(<ProSheet onClose={() => {}} />);
    await act(async () => {});
    expect(layer()).toBe(off);
  });
});

describe('flag on (web)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRIPE_WEB_PRO = '1';
  });

  test('Get Pro is enabled without the mock flag and goes to Checkout', async () => {
    await openSheet();
    expect(main()).toHaveTextContent(GET_PRO);
    expect(main()).toBeEnabled();
    await userEvent.click(main());
    expect(requestCheckout).toHaveBeenCalledTimes(1);
    expect(leaveForBilling).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
    // Still Getting you set… while the page leaves.
    expect(main()).toHaveTextContent(BUYING);
    expect(main()).toBeDisabled();
  });

  test('with the mock flag on too, Stripe wins: the mock route is never called', async () => {
    process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
    await openSheet();
    await userEvent.click(main());
    expect(requestCheckout).toHaveBeenCalledTimes(1);
    expect(requestMockPurchase).not.toHaveBeenCalled();
  });

  test('a failed Checkout shows the existing error line and resets the button', async () => {
    requestCheckout.mockRejectedValue(Object.assign(new Error('nope'), { code: 'server' }));
    await openSheet();
    await userEvent.click(main());
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR);
    expect(main()).toHaveTextContent(GET_PRO);
    expect(main()).toBeEnabled();
  });

  test('a URL the redirect refuses is an error, not a stuck button', async () => {
    leaveForBilling.mockReturnValue(false);
    await openSheet();
    await userEvent.click(main());
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR);
    expect(main()).toBeEnabled();
  });

  test('already Pro on the server: reads the plan and shows the success screen', async () => {
    requestCheckout.mockRejectedValue(Object.assign(new Error('no'), { code: 'already-pro' }));
    fetchEntitlement.mockResolvedValue(stripePlan());
    await openSheet();
    await userEvent.click(main());
    expect(screen.getByRole('heading', { name: OWNED })).toBeInTheDocument();
    expect(leaveForBilling).not.toHaveBeenCalled();
  });

  test('a subscription that is still open goes to the portal, not a second Checkout', async () => {
    requestCheckout.mockRejectedValue(Object.assign(new Error('no'), { code: 'already-subscribed' }));
    await openSheet();
    await userEvent.click(main());
    expect(requestBillingPortal).toHaveBeenCalledTimes(1);
    expect(leaveForBilling).toHaveBeenCalledWith('https://billing.stripe.com/p/session/bps_1');
  });

  test('Manage subscription on a Stripe member’s success screen opens the portal', async () => {
    plan = stripePlan();
    await openSheet();
    expect(screen.getByRole('heading', { name: OWNED })).toBeInTheDocument();
    const manage = screen.getByRole('button', { name: MANAGE });
    await userEvent.click(manage);
    expect(requestBillingPortal).toHaveBeenCalledTimes(1);
    expect(leaveForBilling).toHaveBeenCalledWith('https://billing.stripe.com/p/session/bps_1');
    expect(manage).toBeDisabled();
  });

  test('a failed portal shows the existing error line and re-enables the button', async () => {
    plan = stripePlan();
    requestBillingPortal.mockRejectedValue(Object.assign(new Error('no'), { code: 'no-customer' }));
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: MANAGE }));
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR);
    expect(screen.getByRole('button', { name: MANAGE })).toBeEnabled();
  });

  test('no Manage subscription for a plan without a Stripe customer', async () => {
    plan = { plan: 'pro', source: 'mock', since: 1, expiresAt: FUTURE() };
    await openSheet();
    expect(screen.getByRole('heading', { name: OWNED })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MANAGE })).toBeNull();
  });

  test('new copy has no em dash, TODO or straight apostrophe', () => {
    Object.values(STRIPE_COPY).forEach((text) => {
      expect(text).not.toMatch(/—|TODO|'/);
    });
  });

  describe('back from Checkout', () => {
    test('?checkout=success: Getting you set… until the plan arrives, then the success screen', async () => {
      jest.useFakeTimers();
      window.history.replaceState(null, '', '/pro?checkout=success');
      fetchEntitlement.mockResolvedValueOnce(null).mockResolvedValue(stripePlan());
      await openPage();
      expect(window.location.search).toBe('');
      expect(main()).toHaveTextContent(BUYING);
      expect(main()).toBeDisabled();
      // The member can still leave while it waits.
      expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
      await act(async () => { await jest.advanceTimersByTimeAsync(CONFIRM_EVERY_MS); });
      expect(screen.getByRole('heading', { name: OWNED })).toBeInTheDocument();
      expect(adServiceIsPro()).toBe(true);
    });

    test('gives up after the last try and offers Get Pro again', async () => {
      jest.useFakeTimers();
      window.history.replaceState(null, '', '/pro?checkout=success');
      await openPage();
      expect(main()).toHaveTextContent(BUYING);
      await act(async () => { await jest.advanceTimersByTimeAsync(CONFIRM_EVERY_MS * CONFIRM_TRIES); });
      expect(fetchEntitlement).toHaveBeenCalledTimes(CONFIRM_TRIES);
      expect(main()).toHaveTextContent(GET_PRO);
      expect(main()).toBeEnabled();
    });

    test('?checkout=cancel: the sheet as usual, the URL cleaned up, and no new copy', async () => {
      window.history.replaceState(null, '', '/pro?checkout=cancel&x=1#top');
      await openPage();
      expect(window.location.search).toBe('?x=1');
      expect(window.location.hash).toBe('#top');
      expect(main()).toHaveTextContent(GET_PRO);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
      expect(fetchEntitlement).not.toHaveBeenCalled();
    });
  });

  describe('in the native app the flag does nothing', () => {
    beforeEach(() => isNativeApp.mockReturnValue(true));

    test('Coming soon, no Checkout, no Manage subscription', async () => {
      await openSheet();
      expect(main()).toHaveTextContent(COMING_SOON);
      await userEvent.click(main());
      expect(requestCheckout).not.toHaveBeenCalled();
    });

    test('a Stripe member sees no Manage subscription', async () => {
      plan = stripePlan();
      await openSheet();
      expect(screen.queryByRole('button', { name: MANAGE })).toBeNull();
    });

    test('?checkout=success is ignored', async () => {
      window.history.replaceState(null, '', '/pro?checkout=success');
      await openPage();
      expect(window.location.search).toBe('?checkout=success');
      expect(fetchEntitlement).not.toHaveBeenCalled();
    });
  });
});

describe('a Stripe plan is Pro everywhere', () => {
  function Badge() {
    return <ProBadge badge={useProBadge('jack')} />;
  }

  test('the listener: Pro badge, ad service off, success screen', async () => {
    plan = stripePlan();
    render(<><EntitlementSync /><Badge /><ProSheet onClose={() => {}} /></>);
    await act(async () => {});
    expect(adServiceIsPro()).toBe(true);
    expect(document.querySelector('.pro-badge')).toHaveTextContent('Pro');
    expect(screen.getByRole('heading', { name: OWNED })).toBeInTheDocument();
  });

  test('Restore purchase finds a Stripe plan', async () => {
    fetchEntitlement.mockResolvedValue(stripePlan());
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Restore purchase' }));
    expect(screen.getByRole('heading', { name: 'Restored. You’re Pro.' })).toBeInTheDocument();
    expect(adServiceIsPro()).toBe(true);
  });

  test('an ended Stripe plan is not Pro, and Restore finds nothing', async () => {
    plan = { ...stripePlan(), stripeStatus: 'canceled', expiresAt: Date.now() - 1000 };
    fetchEntitlement.mockResolvedValue(plan);
    await openSheet();
    expect(adServiceIsPro()).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Restore purchase' }));
    expect(await screen.findByText('Nothing to restore on this account.')).toBeInTheDocument();
  });
});
