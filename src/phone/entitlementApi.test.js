import * as entitlementApi from './entitlementApi';

const { requestMockPurchase } = entitlementApi;

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
  });
});

test('a refused purchase throws with the route’s error code', async () => {
  fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid-plan' }) });
  await expect(requestMockPurchase('pro')).rejects.toMatchObject({ code: 'invalid-plan' });
  mockAuth.currentUser = null;
  await expect(requestMockPurchase('pro')).rejects.toThrow('Not signed in.');
});
