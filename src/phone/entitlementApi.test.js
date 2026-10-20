import { doc, getDoc } from 'firebase/firestore';
import { fetchFounderCount, requestMockPurchase } from './entitlementApi';

jest.unmock('./entitlementApi');
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...segments) => ({ path: segments.join('/') })),
  getDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));
const mockAuth = { currentUser: null };
jest.mock('../Config/firebase-config', () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
}));

const snap = (data) => ({ exists: () => data !== null, data: () => data });

beforeEach(() => {
  global.fetch = jest.fn();
  mockAuth.currentUser = { getIdToken: jest.fn(async () => 'id-token') };
});

afterEach(() => {
  delete global.fetch;
});

test('the founder count reads meta/founders, 0 when missing or junk', async () => {
  getDoc.mockResolvedValueOnce(snap({ count: 42 }));
  await expect(fetchFounderCount()).resolves.toBe(42);
  expect(doc).toHaveBeenLastCalledWith({}, 'meta', 'founders');
  getDoc.mockResolvedValueOnce(snap(null));
  await expect(fetchFounderCount()).resolves.toBe(0);
  getDoc.mockResolvedValueOnce(snap({ count: 'lots' }));
  await expect(fetchFounderCount()).resolves.toBe(0);
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
  fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'sold-out' }) });
  await expect(requestMockPurchase('founder')).rejects.toMatchObject({ code: 'sold-out' });
  mockAuth.currentUser = null;
  await expect(requestMockPurchase('pro')).rejects.toThrow('Not signed in.');
});
