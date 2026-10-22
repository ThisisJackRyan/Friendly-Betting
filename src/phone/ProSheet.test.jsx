import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Paywall from './Paywall';
import ProSheet, { RESTORE_MIN_BUSY_MS } from './ProSheet';
import EntitlementSync from './EntitlementSync';
import { fetchEntitlement, requestMockPurchase, subscribeEntitlement } from './entitlementApi';
import { __resetEntitlementForTests } from './useEntitlement';
import { isPro as adServiceIsPro } from '../ads/pro';
import { navigation } from 'next/navigation';

// The Pro sheet and /pro (UX spec, Oct 20). Every string below is the spec's,
// byte for byte (curly apostrophes, the … character), but for the no-break
// space that keeps "ads." on the line with "the".
const SPEC = {
  headline: 'All the bets. None of the\u00A0ads.',
  line: 'Friends always play free.',
  benefits: [
    'No ads, ever',
    'A Pro badge on your bets',
    'Run it back in one tap',
    'Head-to-head stats with friends',
    'Early access to new stuff',
  ],
  proPrice: '$3/mo',
  proNote: 'Billed monthly. Cancel anytime.',
  getPro: 'Get Pro',
  buying: 'Getting you set…',
  comingSoon: 'Coming soon',
  later: 'Maybe later',
  finePrint: 'Pro renews at $3/mo until you cancel in Settings.',
  restore: 'Restore purchase',
  restoring: 'Restoring…',
  restored: 'Restored. You’re Pro.',
  nothing: 'Nothing to restore on this account.',
  terms: 'Terms',
  privacy: 'Privacy',
  error: 'Couldn’t finish that. Try again.',
  owned: 'You’re Pro. No more ads.',
  back: 'Back to my bets',
};

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./identity', () => {
  const jack = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
  return { useIdentity: () => jack, useSignedInUser: () => jack };
});

const FLAGS = ['NEXT_PUBLIC_PRO_PAYWALL', 'NEXT_PUBLIC_PRO_MOCK_PURCHASE', 'NEXT_PUBLIC_TERMS_URL', 'NEXT_PUBLIC_PRIVACY_URL'];
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
  fetchEntitlement.mockReset();
  fetchEntitlement.mockResolvedValue(null);
  requestMockPurchase.mockReset();
  requestMockPurchase.mockResolvedValue({ ok: true, plan: 'pro' });
  navigation.back.mockReset();
  navigation.push.mockReset();
  FLAGS.forEach((flag) => delete process.env[flag]);
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
});

afterEach(() => {
  jest.useRealTimers();
  FLAGS.forEach((flag) => {
    if (saved[flag] === undefined) delete process.env[flag];
    else process.env[flag] = saved[flag];
  });
});

async function openPage() {
  render(<><EntitlementSync /><Paywall /></>);
  await act(async () => {});
}

async function openSheet(props = {}) {
  const onClose = jest.fn();
  const onDone = jest.fn();
  render(<><EntitlementSync /><ProSheet onClose={onClose} onDone={onDone} {...props} /></>);
  await act(async () => {});
  return { onClose, onDone };
}

const dialog = () => screen.getByRole('dialog');
const main = () => within(dialog()).getAllByRole('button').find((b) => b.classList.contains('pro-sheet-main'));
const highlighted = () => Array.from(document.querySelectorAll('.pro-benefits li.is-highlighted')).map((li) => li.textContent);

describe('/pro', () => {
  test('flag off: the 404 page, and nothing is read', async () => {
    delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
    await openPage();
    expect(screen.getByRole('heading', { name: 'Lost that one.' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('flag on: the sheet, on the No ads row, titled Go Pro', async () => {
    await openPage();
    expect(dialog()).toHaveAccessibleName(SPEC.headline);
    expect(highlighted()).toEqual([SPEC.benefits[0]]);
    expect(document.title).toBe('Go Pro · Friendly');
  });

  test('the page behind /pro is inert while the sheet is up', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    try {
      const { unmount } = render(<><EntitlementSync /><Paywall /></>, { container: root });
      await act(async () => {});
      expect(root.contains(dialog())).toBe(false);
      expect(root).toHaveAttribute('inert');
      unmount();
      expect(root).not.toHaveAttribute('inert');
    } finally {
      root.remove();
    }
  });

  test('the X and Maybe later leave /pro', async () => {
    await openPage();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByRole('button', { name: SPEC.later }));
    expect(navigation.back.mock.calls.length + navigation.push.mock.calls.length).toBe(2);
  });

  test('already Pro: skips the price for the success screen, and Back to my bets goes there', async () => {
    subscribeEntitlement.mockImplementation((_uid, onChange) => {
      onChange({ plan: 'pro', expiresAt: null });
      return () => {};
    });
    await openPage();
    expect(screen.getByRole('heading', { name: SPEC.owned })).toBeInTheDocument();
    expect(document.querySelector('.pro-price')).toBeNull();
    expect(screen.queryByText(SPEC.headline)).toBeNull();
    expect(document.querySelector('.pro-sheet-success-badge .pro-badge')).toHaveTextContent('Pro');
    await userEvent.click(screen.getByRole('button', { name: SPEC.back }));
    expect(navigation.push).toHaveBeenCalledWith('/bets');
  });

  test('a legacy founder plan is Pro: the success screen with the plain Pro badge', async () => {
    subscribeEntitlement.mockImplementation((_uid, onChange) => {
      onChange({ plan: 'founder', source: 'mock', founderNumber: 7, expiresAt: null });
      return () => {};
    });
    await openPage();
    expect(screen.getByRole('heading', { name: SPEC.owned })).toBeInTheDocument();
    expect(document.querySelector('.pro-sheet-success-badge .pro-badge')).toHaveTextContent(/^Pro$/);
    expect(dialog().textContent).not.toMatch(/Founder|#7/);
    expect(adServiceIsPro()).toBe(true);
  });
});

describe('the sheet', () => {
  test('the spec copy, verbatim and in order', async () => {
    await openSheet();
    expect(screen.getByRole('heading', { level: 2, name: SPEC.headline })).toBeInTheDocument();
    expect(screen.getByText(SPEC.line)).toBeInTheDocument();
    expect(document.querySelector('.pro-sheet-badge')).toHaveTextContent(/^Pro$/);
    expect(Array.from(document.querySelectorAll('.pro-benefits li')).map((li) => li.textContent)).toEqual(SPEC.benefits);
    expect(document.querySelector('.pro-benefits').nextElementSibling).toBe(document.querySelector('.pro-price'));
    expect(document.querySelector('.pro-price').textContent).toBe(`${SPEC.proPrice}${SPEC.proNote}`);
    expect(screen.getByText(SPEC.finePrint)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SPEC.restore })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SPEC.later })).toBeInTheDocument();
    // No Best deal chip, no em dash, no straight apostrophes on screen.
    expect(dialog().textContent).not.toMatch(/Best deal|—|'/);
    // One plan, nothing else on offer.
    expect(dialog().textContent).not.toMatch(/Founder|spots left|\bonce\b|one-time payment/);
  });

  test('one plan: the price block has no label and nothing to pick', async () => {
    await openSheet();
    const price = document.querySelector('.pro-price');
    expect(price.querySelector('.pro-price-amount')).toHaveTextContent(/^\$3\/mo$/);
    expect(price.querySelector('.pro-price-note')).toHaveTextContent(/^Billed monthly\. Cancel anytime\.$/);
    expect(price.children).toHaveLength(2);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(dialog().querySelectorAll('input, label, .pro-plan, .pro-plans')).toHaveLength(0);
  });

  test('nothing to load: no skeleton, and Get Pro is ready as soon as the sheet shows', async () => {
    process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
    await openSheet();
    expect(document.querySelector('.pro-skeleton, .is-loading, [aria-busy]')).toBeNull();
    expect(main()).toHaveTextContent(SPEC.getPro);
    expect(main()).toBeEnabled();
    await userEvent.click(main());
    expect(requestMockPurchase).toHaveBeenCalledWith('pro');
  });

  test('purchases off: the main button is a disabled Coming soon and buys nothing', async () => {
    await openSheet();
    expect(main()).toHaveTextContent(SPEC.comingSoon);
    expect(main()).toBeDisabled();
    await userEvent.click(main());
    expect(requestMockPurchase).not.toHaveBeenCalled();
  });

  test('buying: Getting you set…, with the X disabled; then the success screen', async () => {
    process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
    let finish;
    requestMockPurchase.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { onClose } = await openSheet();
    await userEvent.click(main());
    expect(requestMockPurchase).toHaveBeenCalledWith('pro');
    expect(main()).toHaveTextContent(SPEC.buying);
    expect(main()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    fetchEntitlement.mockResolvedValue({ plan: 'pro', expiresAt: null });
    await act(async () => finish({ ok: true, plan: 'pro' }));
    expect(screen.getByRole('heading', { name: SPEC.owned })).toBeInTheDocument();
  });

  test('buying blocks the X, Maybe later, Escape and the scrim; a failure re-enables all four', async () => {
    process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
    let fail;
    requestMockPurchase.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const { onClose } = await openSheet();
    await userEvent.click(main());
    expect(main()).toHaveTextContent(SPEC.buying);
    const x = screen.getByRole('button', { name: 'Close' });
    const later = screen.getByRole('button', { name: SPEC.later });
    expect(x).toBeDisabled();
    expect(later).toBeDisabled();
    await userEvent.click(x);
    await userEvent.click(later);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(document.querySelector('.pro-sheet-scrim'));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => fail(new Error('nope')));
    expect(screen.getByRole('alert')).toHaveTextContent(SPEC.error);
    expect(x).toBeEnabled();
    expect(later).toBeEnabled();
    await userEvent.click(x);
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(later);
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
    await userEvent.click(document.querySelector('.pro-sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  test('a failed purchase: the red error above the button, and the button resets', async () => {
    process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
    requestMockPurchase.mockRejectedValue(new Error('nope'));
    await openSheet();
    await userEvent.click(main());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(SPEC.error);
    expect(alert).toHaveClass('form-error');
    expect(alert.nextElementSibling).toBe(main());
    expect(main()).toHaveTextContent(SPEC.getPro);
    expect(main()).toBeEnabled();
  });

  test('the X, Maybe later and Escape close it', async () => {
    const { onClose } = await openSheet();
    expect(dialog()).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByRole('button', { name: SPEC.later }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test('the app root is inert while the sheet is up, and not after it closes', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const opener = document.createElement('button');
    root.appendChild(opener);
    opener.focus();
    try {
      const { unmount } = render(<><EntitlementSync /><ProSheet onClose={() => {}} /></>);
      await act(async () => {});
      expect(root).toHaveAttribute('inert');
      expect(dialog()).toHaveFocus();
      unmount();
      expect(root).not.toHaveAttribute('inert');
      expect(opener).toHaveFocus();
    } finally {
      root.remove();
    }
  });

  test('a locked feature opens it on its own row', async () => {
    await openSheet({ highlight: 4 });
    expect(highlighted()).toEqual([SPEC.benefits[3]]);
  });
});

describe('Restore purchase', () => {
  test('re-reads the entitlement: Restoring…, then Restored. You’re Pro.', async () => {
    let finish;
    fetchEntitlement.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: SPEC.restore }));
    expect(fetchEntitlement).toHaveBeenCalledWith('jack');
    expect(screen.getByRole('button', { name: SPEC.restoring })).toBeDisabled();
    await act(async () => finish({ plan: 'pro', expiresAt: null }));
    expect(screen.getByRole('heading', { name: SPEC.restored })).toBeInTheDocument();
    // Shared at once: the ad service sees the restored plan.
    expect(adServiceIsPro()).toBe(true);
  });

  test('a restored Pro member: Restored. You’re Pro. under the Pro badge', async () => {
    fetchEntitlement.mockResolvedValue({ plan: 'pro', expiresAt: null });
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: SPEC.restore }));
    const line = screen.getByRole('heading', { level: 2 });
    expect(line.textContent).toBe(SPEC.restored);
    expect(line.textContent).toBe('Restored. You\u2019re Pro.');
    const badge = document.querySelector('.pro-sheet-success-badge');
    expect(badge.querySelector('.pro-badge')).toHaveTextContent(/^Pro$/);
    expect(badge.nextElementSibling).toBe(line);
  });

  test('a legacy founder plan restores as Pro: the plain Pro badge, no number', async () => {
    fetchEntitlement.mockResolvedValue({ plan: 'founder', source: 'mock', founderNumber: 7, expiresAt: null });
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: SPEC.restore }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SPEC.restored);
    expect(document.querySelector('.pro-sheet-success-badge .pro-badge')).toHaveTextContent(/^Pro$/);
    expect(dialog().textContent).not.toMatch(/Founder|#7/);
  });

  test('nothing found: the muted line above the button', async () => {
    fetchEntitlement.mockResolvedValue(null);
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: SPEC.restore }));
    const note = await screen.findByText(SPEC.nothing);
    expect(note).toHaveClass('pro-sheet-note');
    expect(note.nextElementSibling).toBe(main());
    expect(screen.getByRole('button', { name: SPEC.restore })).toBeEnabled();
  });

  test('an expired plan is nothing to restore', async () => {
    fetchEntitlement.mockResolvedValue({ plan: 'pro', expiresAt: 1 });
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: SPEC.restore }));
    expect(await screen.findByText(SPEC.nothing)).toBeInTheDocument();
  });

  test('Restoring… (aria-busy) shows from the tap until the answer, which replaces it', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    let finish;
    fetchEntitlement.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await openSheet();
    await user.click(screen.getByRole('button', { name: SPEC.restore }));
    const busy = screen.getByRole('button', { name: SPEC.restoring });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    // A slow read: still Restoring… seconds later.
    await act(async () => { await jest.advanceTimersByTimeAsync(4000); });
    expect(screen.getByRole('button', { name: SPEC.restoring })).toBeDisabled();
    expect(screen.queryByText(SPEC.nothing)).toBeNull();
    await act(async () => finish(null));
    expect(screen.getByText(SPEC.nothing)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SPEC.restoring })).toBeNull();
    expect(screen.getByRole('button', { name: SPEC.restore })).not.toHaveAttribute('aria-busy');
  });

  test('an answer that comes back at once still shows Restoring… for RESTORE_MIN_BUSY_MS', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    fetchEntitlement.mockResolvedValue(null);
    await openSheet();
    await user.click(screen.getByRole('button', { name: SPEC.restore }));
    await act(async () => { await jest.advanceTimersByTimeAsync(RESTORE_MIN_BUSY_MS - 1); });
    expect(screen.getByRole('button', { name: SPEC.restoring })).toBeDisabled();
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(screen.getByText(SPEC.nothing)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SPEC.restore })).toBeEnabled();
  });

  test('a failed read shows the error and keeps the last known plan', async () => {
    fetchEntitlement.mockRejectedValue(new Error('offline'));
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: SPEC.restore }));
    expect(await screen.findByRole('alert')).toHaveTextContent(SPEC.error);
    expect(screen.getByRole('button', { name: SPEC.restore })).toBeEnabled();
  });
});

describe('Terms and Privacy', () => {
  const links = () => document.querySelector('.pro-sheet-links');

  test('hidden without their URLs: Restore purchase alone, no dots', async () => {
    await openSheet();
    expect(screen.queryByRole('link', { name: SPEC.terms })).toBeNull();
    expect(screen.queryByRole('link', { name: SPEC.privacy })).toBeNull();
    expect(links().textContent).toBe(SPEC.restore);
  });

  test('both set: Restore purchase · Terms · Privacy, opening the real pages', async () => {
    process.env.NEXT_PUBLIC_TERMS_URL = 'https://example.com/terms';
    process.env.NEXT_PUBLIC_PRIVACY_URL = 'https://example.com/privacy';
    await openSheet();
    expect(links().textContent).toBe(`${SPEC.restore}·${SPEC.terms}·${SPEC.privacy}`);
    expect(screen.getByRole('link', { name: SPEC.terms })).toHaveAttribute('href', 'https://example.com/terms');
    expect(screen.getByRole('link', { name: SPEC.privacy })).toHaveAttribute('href', 'https://example.com/privacy');
    document.querySelectorAll('.pro-sheet-dot').forEach((dot) => expect(dot).toHaveAttribute('aria-hidden', 'true'));
  });

  test.each([
    ['only Terms', 'NEXT_PUBLIC_TERMS_URL', SPEC.terms, SPEC.privacy],
    ['only Privacy', 'NEXT_PUBLIC_PRIVACY_URL', SPEC.privacy, SPEC.terms],
  ])('%s: one dot, no dangling ones', async (_label, flag, shown, hidden) => {
    process.env[flag] = 'https://example.com/page';
    await openSheet();
    expect(links().textContent).toBe(`${SPEC.restore}·${shown}`);
    expect(screen.getByRole('link', { name: shown })).toHaveAttribute('href', 'https://example.com/page');
    expect(screen.queryByRole('link', { name: hidden })).toBeNull();
  });

  test('a blank URL counts as unset', async () => {
    process.env.NEXT_PUBLIC_TERMS_URL = '  ';
    await openSheet();
    expect(links().textContent).toBe(SPEC.restore);
  });
});

describe('layout rules (phone.css)', () => {
  const css = readFileSync(join(__dirname, 'phone.css'), 'utf8');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`\\n${escaped} \\{([^}]*)\\}`))[1];
  };

  test('the X: the shared overlay close, 44px to tap, a 36px soft circle, full ink', () => {
    expect(screen.queryByRole('dialog')).toBeNull();
    const close = rule('.overlay-close.pro-sheet-close');
    expect(close).toMatch(/color: var\(--ink\);/);
    expect(close).toMatch(/right: calc\(env\(safe-area-inset-right, 0px\) \+ 8px\);/);
    expect(close).not.toMatch(/muted|opacity: 0/);
    const circle = rule('.overlay-close.pro-sheet-close::before');
    expect(circle).toMatch(/width: 36px;/);
    expect(circle).toMatch(/height: 36px;/);
    expect(rule('.overlay-close')).toMatch(/width: 44px;[\s\S]*height: 44px;/);
  });

  test('sizes: hero 200px, headline 32px, 24px sides; 180px, 28px, 20px at 360', () => {
    expect(rule('.pro-sheet-hero')).toMatch(/height: 200px;/);
    expect(rule('.pro-sheet-hero')).toMatch(/background: #007a45;/);
    expect(rule('.pro-sheet .pro-sheet-headline')).toMatch(/font-size: 32px;/);
    expect(rule('.pro-sheet')).toMatch(/--pro-pad: 24px;/);
    const small = css.match(/@media \(max-width: 374px\) \{\n  \.pro-sheet \{[^@]*?\n\}/)[0];
    expect(small).toMatch(/--pro-pad: 20px;/);
    expect(small).toMatch(/\.pro-sheet-hero \{ height: 180px; \}/);
    expect(small).toMatch(/font-size: 28px;/);
  });

  test('the headline wraps balanced, and "ads." never sits alone on a line', async () => {
    expect(rule('.pro-sheet .pro-sheet-headline')).toMatch(/text-wrap: balance;/);
    await openSheet();
    const headline = screen.getByRole('heading', { level: 2 }).textContent;
    expect(headline.match(/\u00A0/g)).toEqual(['\u00A0']);
    expect(headline).toMatch(/the\u00A0ads\.$/);
    // The same words the spec has.
    expect(headline.replace('\u00A0', ' ')).toBe('All the bets. None of the ads.');
  });

  test('rows 44px with 24px icons, the price block, main button 56px, Maybe later 44px', () => {
    expect(rule('.pro-benefits li')).toMatch(/height: 44px;/);
    expect(rule('.pro-price-amount')).toMatch(/font-size: 22px;/);
    expect(css).not.toMatch(/\.pro-plan|\.pro-skeleton|\.pro-sold-out/);
    expect(rule('.pro-sheet .pro-sheet-main')).toMatch(/height: 56px;/);
    expect(rule('.pro-sheet-later')).toMatch(/min-height: 44px;/);
    expect(rule('.pro-fine-print')).toMatch(/font-size: 13px;/);
    expect(rule('.pro-benefits li.is-highlighted')).toMatch(/font-weight: 800;/);
    expect(rule('.pro-sheet-footer')).toMatch(/env\(safe-area-inset-bottom/);
  });
});
