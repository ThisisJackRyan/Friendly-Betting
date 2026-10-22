import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDocFromServer, onSnapshot } from 'firebase/firestore';
import Paywall from './Paywall';
import ProSheet, { RESTORE_MIN_BUSY_MS } from './ProSheet';
import EntitlementSync from './EntitlementSync';
import { __resetEntitlementForTests } from './useEntitlement';
import { __resetDeniedForTests } from './entitlementApi';
import { isPro as adServiceIsPro } from '../ads/pro';

// Restore purchase end to end: the sheet, refreshEntitlement and the real
// entitlementApi on a fake Firestore. Covers both rule states: the live rules
// (no entitlements block, so every read is permission-denied) and the epic's
// (a member reads their own doc, which is missing until they buy).
jest.unmock('./entitlementApi');
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...segments) => ({ path: segments.join('/') })),
  getDocFromServer: jest.fn(),
  onSnapshot: jest.fn(),
}));
const mockAuth = { currentUser: null };
jest.mock('../Config/firebase-config', () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
}));
jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./identity', () => {
  const jack = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
  return { useIdentity: () => jack, useSignedInUser: () => jack };
});

const NOTHING = 'Nothing to restore on this account.';
const ERROR = 'Couldn’t finish that. Try again.';
const RESTORE = 'Restore purchase';
const RESTORING = 'Restoring…';
const OWNED = 'You’re Pro. No more ads.';

const failure = (code) => Object.assign(new Error(code), { code });
const missing = { exists: () => false, data: () => undefined };

// How the listener answers: 'denied' (live rules) or 'missing' (no plan yet).
let listen;

beforeEach(() => {
  __resetEntitlementForTests();
  __resetDeniedForTests();
  listen = 'denied';
  onSnapshot.mockReset();
  onSnapshot.mockImplementation((_ref, next, error) => {
    if (listen === 'denied') error(failure('permission-denied'));
    else next(missing);
    return () => {};
  });
  getDocFromServer.mockReset();
  process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
  mockAuth.currentUser = { getIdToken: jest.fn(async () => 'id-token') };
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true, plan: 'pro' }) }));
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
  delete process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE;
  delete global.fetch;
  jest.useRealTimers();
});

const SURFACES = [
  ['/pro', () => <Paywall />],
  ['the sheet over My bets', () => <ProSheet onClose={() => {}} onDone={() => {}} />],
];

async function open(surface) {
  render(<><EntitlementSync />{surface()}</>);
  await act(async () => {});
}

describe.each(SURFACES)('%s', (_name, surface) => {
  test('live rules: the listener is denied, and the sheet shows as for any free member', async () => {
    await open(surface);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(NOTHING)).toBeNull();
    expect(document.querySelector('.pro-price')).not.toBeNull();
    expect(screen.getByRole('button', { name: RESTORE })).toBeEnabled();
    expect(adServiceIsPro()).toBe(false);
  });

  test('listener missing, read denied: Restoring… until the answer, then Nothing to restore on this account.', async () => {
    listen = 'missing';
    let deny;
    getDocFromServer.mockReturnValue(new Promise((_resolve, reject) => { deny = reject; }));
    await open(surface);
    await userEvent.click(screen.getByRole('button', { name: RESTORE }));
    expect(getDocFromServer).toHaveBeenCalledWith({ path: 'entitlements/jack' });
    const busy = screen.getByRole('button', { name: RESTORING });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await act(async () => deny(failure('permission-denied')));
    expect(await screen.findByRole('status')).toHaveTextContent(NOTHING);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: RESTORE })).toBeEnabled();
    expect(screen.getByRole('button', { name: RESTORE })).not.toHaveAttribute('aria-busy');
  });

  test('listener denied (live rules): no second server read, Restoring… then Nothing to restore', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await open(surface);
    await user.click(screen.getByRole('button', { name: RESTORE }));
    expect(getDocFromServer).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(RESTORE_MIN_BUSY_MS - 50); });
    expect(screen.getByRole('button', { name: RESTORING })).toBeDisabled();
    expect(screen.queryByText(NOTHING)).toBeNull();
    await act(async () => { await jest.advanceTimersByTimeAsync(50); });
    expect(screen.getByRole('status')).toHaveTextContent(NOTHING);
    expect(screen.getByRole('button', { name: RESTORE })).toBeEnabled();
  });

  test.each(['denied', 'missing'])('listener %s, doc missing: Nothing to restore on this account.', async (state) => {
    listen = state;
    getDocFromServer.mockResolvedValue(missing);
    await open(surface);
    await userEvent.click(screen.getByRole('button', { name: RESTORE }));
    expect(await screen.findByRole('status')).toHaveTextContent(NOTHING);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test.each(['unavailable', 'deadline-exceeded', 'internal'])('a read that fails with %s: Couldn’t finish that. Try again.', async (code) => {
    listen = 'missing';
    getDocFromServer.mockRejectedValue(failure(code));
    await open(surface);
    await userEvent.click(screen.getByRole('button', { name: RESTORE }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR);
    expect(screen.queryByText(NOTHING)).toBeNull();
    expect(screen.getByRole('button', { name: RESTORE })).toBeEnabled();
  });

  test('a read that never answers times out: Couldn’t finish that. Try again.', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    listen = 'missing';
    getDocFromServer.mockReturnValue(new Promise(() => {}));
    await open(surface);
    await user.click(screen.getByRole('button', { name: RESTORE }));
    expect(screen.getByRole('button', { name: RESTORING })).toBeDisabled();
    await act(async () => { await jest.advanceTimersByTimeAsync(20000); });
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR);
    expect(screen.queryByText(NOTHING)).toBeNull();
  });
});

describe('Get Pro (mock purchase), then the fresh read', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE = '1';
  });

  test('read denied: no error, and the button is ready again', async () => {
    listen = 'missing';
    getDocFromServer.mockRejectedValue(failure('permission-denied'));
    await open(SURFACES[1][1]);
    await userEvent.click(screen.getByRole('button', { name: 'Get Pro' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getDocFromServer).toHaveBeenCalledWith({ path: 'entitlements/jack' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Get Pro' })).toBeEnabled();
  });

  test('read failed: still no error, since the purchase went through', async () => {
    getDocFromServer.mockRejectedValue(failure('unavailable'));
    await open(SURFACES[1][1]);
    await userEvent.click(screen.getByRole('button', { name: 'Get Pro' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Get Pro' })).toBeEnabled();
  });

  test('read finds the plan: the success screen', async () => {
    listen = 'missing';
    getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({ plan: 'pro', expiresAt: null }) });
    await open(SURFACES[1][1]);
    await userEvent.click(screen.getByRole('button', { name: 'Get Pro' }));
    expect(screen.getByRole('heading', { name: OWNED })).toBeInTheDocument();
    expect(adServiceIsPro()).toBe(true);
  });
});
