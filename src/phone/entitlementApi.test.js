import { getDocFromServer, onSnapshot } from 'firebase/firestore';
import * as entitlementApi from './entitlementApi';

const { fetchEntitlement, requestMockPurchase, subscribeEntitlement } = entitlementApi;

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

beforeEach(() => {
  global.fetch = jest.fn();
  mockAuth.currentUser = { getIdToken: jest.fn(async () => 'id-token') };
});

afterEach(() => {
  jest.useRealTimers();
  delete global.fetch;
});

test('only the entitlement reads and the mock purchase: no founder count', () => {
  expect(Object.keys(entitlementApi).sort()).toEqual(['fetchEntitlement', 'requestMockPurchase', 'subscribeEntitlement']);
});

test('a mock purchase posts the plan with the ID token', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, plan: 'pro' }) });
  await expect(requestMockPurchase('pro')).resolves.toEqual({ ok: true, plan: 'pro' });
  expect(fetch).toHaveBeenCalledWith('/api/pro/mock-purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-token' },
    body: JSON.stringify({ plan: 'pro' }),
    signal: expect.any(AbortSignal),
  });
});

test('a refused purchase throws with the route’s error code', async () => {
  fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid-plan' }) });
  await expect(requestMockPurchase('pro')).rejects.toMatchObject({ code: 'invalid-plan' });
  mockAuth.currentUser = null;
  await expect(requestMockPurchase('pro')).rejects.toThrow('Not signed in.');
});

test('a hung purchase is aborted after 20s and throws', async () => {
  jest.useFakeTimers();
  let signal;
  fetch.mockImplementation((_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  });
  const result = requestMockPurchase('pro');
  const settled = jest.fn();
  result.catch(settled);
  await jest.advanceTimersByTimeAsync(19999);
  expect(settled).not.toHaveBeenCalled();
  expect(signal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(signal.aborted).toBe(true);
  await expect(result).rejects.toMatchObject({ code: 'timeout' });
});

test('a hung entitlement read throws after 20s', async () => {
  jest.useFakeTimers();
  getDocFromServer.mockReturnValue(new Promise(() => {}));
  const result = fetchEntitlement('jack');
  const settled = jest.fn();
  result.catch(settled);
  await jest.advanceTimersByTimeAsync(19999);
  expect(settled).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  await expect(result).rejects.toMatchObject({ code: 'timeout' });
});

test('an entitlement read in time clears its timer', async () => {
  jest.useFakeTimers();
  getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({ plan: 'pro' }) });
  await expect(fetchEntitlement('jack')).resolves.toEqual({ plan: 'pro' });
  expect(jest.getTimerCount()).toBe(0);
});

const snapOf = (data) => ({ exists: () => data !== null, data: () => data });
const failure = (code) => Object.assign(new Error(code), { code });

describe('fetchEntitlement', () => {
  test('reads the user’s own doc from the server', async () => {
    getDocFromServer.mockResolvedValue(snapOf({ plan: 'pro', expiresAt: null }));
    await expect(fetchEntitlement('jack')).resolves.toEqual({ plan: 'pro', expiresAt: null });
    expect(getDocFromServer).toHaveBeenCalledWith({ path: 'entitlements/jack' });
  });

  test('a missing doc is no entitlement', async () => {
    getDocFromServer.mockResolvedValue(snapOf(null));
    await expect(fetchEntitlement('jack')).resolves.toBeNull();
  });

  test('permission-denied (rules without the entitlements block) is no entitlement', async () => {
    getDocFromServer.mockRejectedValue(failure('permission-denied'));
    await expect(fetchEntitlement('jack')).resolves.toBeNull();
  });

  test.each(['unavailable', 'deadline-exceeded', 'unauthenticated', 'internal'])('%s still throws', async (code) => {
    getDocFromServer.mockRejectedValue(failure(code));
    await expect(fetchEntitlement('jack')).rejects.toMatchObject({ code });
  });

  test('an error with no code still throws', async () => {
    getDocFromServer.mockRejectedValue(new Error('offline'));
    await expect(fetchEntitlement('jack')).rejects.toThrow('offline');
  });
});

describe('subscribeEntitlement', () => {
  let sink;
  beforeEach(() => {
    onSnapshot.mockReset();
    onSnapshot.mockImplementation((ref, next, error) => {
      sink = { ref, next, error };
      return () => {};
    });
  });

  test('each snapshot is the plan, or null for a missing doc', () => {
    const onChange = jest.fn();
    subscribeEntitlement('jack', onChange);
    expect(sink.ref).toEqual({ path: 'entitlements/jack' });
    sink.next(snapOf({ plan: 'pro' }));
    sink.next(snapOf(null));
    expect(onChange.mock.calls).toEqual([[{ plan: 'pro' }], [null]]);
  });

  test('permission-denied is no entitlement, not an error', () => {
    const onChange = jest.fn();
    subscribeEntitlement('jack', onChange);
    sink.error(failure('permission-denied'));
    expect(onChange.mock.calls).toEqual([[null]]);
  });

  test('any other error is passed on', () => {
    const onChange = jest.fn();
    subscribeEntitlement('jack', onChange);
    const err = failure('unavailable');
    sink.error(err);
    expect(onChange.mock.calls).toEqual([[undefined, err]]);
  });
});
