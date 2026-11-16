/** @jest-environment node */
import { adminAuth, adminDb } from './firebaseAdmin';
import { POST, OPTIONS } from '../../app/api/bets/route';
import * as createModule from '../../app/api/bets/route';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn() }));
// The real list is empty; one made-up type to exercise the early-access check.
jest.mock('../phone/proConfig', () => ({
  ...jest.requireActual('../phone/proConfig'),
  EARLY_ACCESS_TYPES: [{ id: 'test-early', label: 'Test', hint: 'Test' }],
}));

const DAY = 24 * 60 * 60 * 1000;
// Many bets: creating is never capped.
const MANY = 25;
const fields = {
  schemaVersion: 2,
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who wins tonight?',
  stake: 'Pizza',
  options: [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Lions' }],
  createdByID: 'creator-1',
  createdByName: 'Jack',
};
const notConfigured = () => Object.assign(new Error('missing'), { code: 'admin-not-configured' });
const verifyIdToken = jest.fn();
let db;
const savedEnv = { ...process.env };

function seed({ count = 0, entitlement } = {}) {
  const docs = {};
  for (let i = 0; i < count; i += 1) docs[`bets/mine${i}`] = { createdByID: 'creator-1' };
  if (entitlement) docs['entitlements/creator-1'] = entitlement;
  db = fakeDb(docs);
  adminDb.mockReturnValue(db);
}

beforeEach(() => {
  process.env = { ...savedEnv, NEXT_PUBLIC_PRO_PAYWALL: '1' };
  delete process.env.NEXT_PUBLIC_PRO_EARLY_TYPES;
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async (token) => {
    if (token === 'creator') return { uid: 'creator-1', phone_number: '+15551234567' };
    if (token === 'anon') return { uid: 'anon-1', firebase: { sign_in_provider: 'anonymous' } };
    throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
  });
  adminAuth.mockReset();
  adminAuth.mockReturnValue({ verifyIdToken });
  adminDb.mockReset();
  seed();
});

afterAll(() => {
  process.env = savedEnv;
});

function post(body = { fields }, { token = 'creator', origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  return POST(new Request('http://localhost/api/bets', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

const betsBy = (uid) => db.paths('bets/').filter((path) => db.data(path)?.createdByID === uid);

test('runs on Node and is never cached', () => {
  expect(createModule.runtime).toBe('nodejs');
  expect(createModule.dynamic).toBe('force-dynamic');
});

describe('paywall off', () => {
  test.each([undefined, '', '0', 'true'])('NEXT_PUBLIC_PRO_PAYWALL=%p: a 404 that touches nothing', async (flag) => {
    if (flag === undefined) delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
    else process.env.NEXT_PUBLIC_PRO_PAYWALL = flag;
    let res = await post();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    res = await OPTIONS(new Request('http://localhost/api/bets', { method: 'OPTIONS', headers: { Origin: 'https://www.friendly-bets.com' } }));
    expect(res.status).toBe(404);
    expect(adminAuth).not.toHaveBeenCalled();
    expect(adminDb).not.toHaveBeenCalled();
  });
});

describe('paywall on', () => {
  test('a phone-verified creator under the limit creates a bet in their own name', async () => {
    const res = await post({ fields: { ...fields, createdByID: undefined } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { code } = await res.json();
    expect(code).toMatch(/^[a-z2-9]{6}$/);
    expect(db.data(`bets/${code}`)).toMatchObject({ ...fields, code, status: 'open', winnerId: null, votes: [] });
  });

  test('requires a valid ID token', async () => {
    let res = await post(undefined, { token: '' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    res = await post(undefined, { token: 'forged' });
    expect(res.status).toBe(401);
    expect(db.writes).toEqual([]);
  });

  test('an anonymous bettor (no phone number) is forbidden', async () => {
    const res = await post({ fields: { ...fields, createdByID: 'anon-1' } }, { token: 'anon' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(db.writes).toEqual([]);
  });

  test('the creator comes from the token, never the body', async () => {
    const res = await post({ fields: { ...fields, createdByID: 'someone-else' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(db.writes).toEqual([]);
  });

  test.each([
    ['no body', 'not json'],
    ['no fields', {}],
    ['fields that are not an object', { fields: ['x'] }],
  ])('%s is a 400', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-bet' });
  });

  test.each([
    ['no entitlement doc', undefined],
    ['an expired plan', { plan: 'pro', source: 'mock', expiresAt: Date.now() - DAY }],
  ])('a free creator (%s) with many bets still creates with the paywall on', async (_name, entitlement) => {
    seed({ count: MANY, entitlement });
    for (let i = 0; i < 3; i += 1) {
      const res = await post();
      expect(res.status).toBe(200);
      const { code } = await res.json();
      expect(db.data(`bets/${code}`)).toMatchObject({ createdByID: 'creator-1', status: 'open' });
    }
    expect(betsBy('creator-1')).toHaveLength(MANY + 3);
  });

  test.each([
    ['live Pro', { plan: 'pro', source: 'mock', expiresAt: Date.now() + DAY }],
    ['a legacy founder', { plan: 'founder', source: 'mock', founderNumber: 2, expiresAt: null }],
  ])('%s creates and can run it back', async (_name, entitlement) => {
    seed({ count: MANY, entitlement });
    expect((await post()).status).toBe(200);
    const res = await post({ fields: { ...fields, rematchOf: { code: 'old123' } } });
    expect(res.status).toBe(200);
    const { code } = await res.json();
    expect(db.data(`bets/${code}`).rematchOf).toEqual({ code: 'old123' });
  });

  test('a rematch without Pro is pro-required', async () => {
    const res = await post({ fields: { ...fields, rematchOf: { code: 'old123' } } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'pro-required' });
    expect(db.writes).toEqual([]);
  });

  test('a rematch on an expired plan is pro-required', async () => {
    seed({ entitlement: { plan: 'pro', source: 'mock', expiresAt: Date.now() - DAY } });
    const res = await post({ fields: { ...fields, rematchOf: { code: 'old123' } } });
    expect(await res.json()).toEqual({ error: 'pro-required' });
  });

  test('an early-access type needs NEXT_PUBLIC_PRO_EARLY_TYPES=1 and Pro', async () => {
    const early = { fields: { ...fields, type: 'test-early' } };
    seed({ entitlement: { plan: 'pro', source: 'mock', expiresAt: Date.now() + DAY } });
    let res = await post(early);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'pro-required' });
    process.env.NEXT_PUBLIC_PRO_EARLY_TYPES = '1';
    expect((await post(early)).status).toBe(200);
    seed();
    res = await post(early);
    expect(await res.json()).toEqual({ error: 'pro-required' });
    seed({ entitlement: { plan: 'pro', source: 'mock', expiresAt: Date.now() - DAY } });
    res = await post(early);
    expect(await res.json()).toEqual({ error: 'pro-required' });
  });

  test('missing admin credentials are a 503, nothing written', async () => {
    adminAuth.mockImplementation(() => {
      throw notConfigured();
    });
    let res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not-configured' });
    adminAuth.mockReturnValue({ verifyIdToken });
    adminDb.mockImplementation(() => {
      throw notConfigured();
    });
    res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not-configured' });
  });

  test('an unexpected failure is a 500 that logs only the error code', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    adminDb.mockReturnValue({ ...db, runTransaction: async () => { throw Object.assign(new Error('boom +15551234567'), { code: 'unavailable' }); } });
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server' });
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/555|creator-1/);
    error.mockRestore();
  });

  describe('CORS', () => {
    test.each(['capacitor://localhost', 'https://localhost', 'https://www.friendly-bets.com'])('%s gets CORS on success, errors and preflight', async (origin) => {
      let res = await post(undefined, { origin });
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
      res = await post(undefined, { origin, token: '' });
      expect(res.status).toBe(401);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      res = await OPTIONS(new Request('http://localhost/api/bets', { method: 'OPTIONS', headers: { Origin: origin } }));
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(adminAuth).toHaveBeenCalledTimes(1);
    });

    test('any other origin gets no CORS headers', async () => {
      const res = await post(undefined, { origin: 'https://evil.example' });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });
});
