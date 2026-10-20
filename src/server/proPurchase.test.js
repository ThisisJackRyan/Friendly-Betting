/** @jest-environment node */
import { adminAuth, adminDb } from './firebaseAdmin';
import { fakeDb } from './testing/fakeDb';
import {
  authorizeMockBuyer,
  grantMockEntitlement,
  mockBuyerAllowed,
  mockPurchaseAllowed,
  mockPurchaseUids,
} from './proPurchase';
import * as route from '../../app/api/pro/mock-purchase/route';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TIME' },
  Timestamp: { fromMillis: (ms) => ({ ts: ms }) },
}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const ENV_KEYS = ['PRO_MOCK_PURCHASE', 'PRO_MOCK_UIDS', 'VERCEL_ENV', 'NODE_ENV'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const verifyIdToken = jest.fn();
let db;

// A phone-verified user. The claim's value is never a real number.
function phoneUser(uid) {
  return { uid, phone_number: 'present', firebase: { sign_in_provider: 'phone' } };
}

function setEnv(env) {
  ENV_KEYS.forEach((key) => {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  });
}

beforeEach(() => {
  setEnv({ PRO_MOCK_PURCHASE: '1', PRO_MOCK_UIDS: 'jack,maya', VERCEL_ENV: 'preview', NODE_ENV: 'production' });
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async (token) => {
    if (token === 'jack-token') return phoneUser('jack');
    if (token === 'maya-token') return phoneUser('maya');
    if (token === 'sam-token') return phoneUser('sam');
    if (token === 'anon-token') return { uid: 'jack', firebase: { sign_in_provider: 'anonymous' } };
    if (token === 'nophone-token') return { uid: 'jack', firebase: { sign_in_provider: 'custom' } };
    if (token === 'revoked-token') throw Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
    throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
  });
  adminAuth.mockReset();
  adminAuth.mockReturnValue({ verifyIdToken });
  db = fakeDb();
  adminDb.mockReset();
  adminDb.mockImplementation(() => db);
});

afterAll(() => setEnv(savedEnv));

function buy(body, { token, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  return route.POST(new Request('http://localhost/api/pro/mock-purchase', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

test('runs on Node and is never cached', () => {
  expect(route.runtime).toBe('nodejs');
  expect(route.dynamic).toBe('force-dynamic');
});

describe('guards', () => {
  test.each([
    ['flag unset, preview', { VERCEL_ENV: 'preview', NODE_ENV: 'production' }],
    ['flag not exactly 1', { PRO_MOCK_PURCHASE: 'true', VERCEL_ENV: 'preview', NODE_ENV: 'production' }],
    ['flag set, Vercel production', { PRO_MOCK_PURCHASE: '1', VERCEL_ENV: 'production', NODE_ENV: 'production' }],
    ['flag set, Vercel production even with NODE_ENV development', { PRO_MOCK_PURCHASE: '1', VERCEL_ENV: 'production', NODE_ENV: 'development' }],
    ['flag set, an unknown Vercel env', { PRO_MOCK_PURCHASE: '1', VERCEL_ENV: 'staging', NODE_ENV: 'production' }],
    ['flag set, off Vercel with NODE_ENV production', { PRO_MOCK_PURCHASE: '1', NODE_ENV: 'production' }],
  ])('404 with %s, before any auth or write', async (_name, env) => {
    setEnv(env);
    const res = await buy({ plan: 'pro' }, { token: 'jack-token' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect(route.OPTIONS(new Request('http://localhost/x', { method: 'OPTIONS' })).status).toBe(404);
    expect(adminAuth).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  test('allowed only on preview, Vercel development, or local non-production', () => {
    expect(mockPurchaseAllowed({ PRO_MOCK_PURCHASE: '1', VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(true);
    expect(mockPurchaseAllowed({ PRO_MOCK_PURCHASE: '1', VERCEL_ENV: 'development', NODE_ENV: 'development' })).toBe(true);
    expect(mockPurchaseAllowed({ PRO_MOCK_PURCHASE: '1', NODE_ENV: 'development' })).toBe(true);
    expect(mockPurchaseAllowed({ PRO_MOCK_PURCHASE: '1', NODE_ENV: 'test' })).toBe(true);
    expect(mockPurchaseAllowed({ PRO_MOCK_PURCHASE: '1', VERCEL_ENV: 'production', NODE_ENV: 'production' })).toBe(false);
    expect(mockPurchaseAllowed({ VERCEL_ENV: 'preview' })).toBe(false);
  });

  test('401 without a token or with a bad one', async () => {
    let res = await buy({ plan: 'pro' });
    expect(res.status).toBe(401);
    res = await buy({ plan: 'pro' }, { token: 'forged' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(db.writes).toEqual([]);
  });

  test.each([[{}], [{ plan: 'free' }], [{ plan: 'PRO' }], [{ plan: ['pro'] }], ['not json']])('400 for plan %j', async (body) => {
    const res = await buy(body, { token: 'jack-token' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-plan' });
    expect(db.writes).toEqual([]);
  });

  test('503 without admin credentials', async () => {
    adminAuth.mockImplementation(() => {
      throw Object.assign(new Error('missing'), { code: 'admin-not-configured' });
    });
    const res = await buy({ plan: 'pro' }, { token: 'jack-token' });
    expect(res.status).toBe(503);
  });

  test('CORS answers the native app the same way as the other routes', async () => {
    const res = await buy({ plan: 'pro' }, { token: 'jack-token', origin: 'capacitor://localhost' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
    const denied = await buy({ plan: 'pro' }, { token: 'jack-token', origin: 'https://evil.example' });
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const pre = route.OPTIONS(new Request('http://localhost/x', { method: 'OPTIONS', headers: { Origin: 'https://localhost' } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
  });
});

describe('who may buy', () => {
  test.each([
    ['an anonymous session', 'anon-token'],
    ['a token without a phone number', 'nophone-token'],
    ['a phone user not on the allowlist', 'sam-token'],
  ])('403 for %s, with no write', async (_name, token) => {
    const res = await buy({ plan: 'founder' }, { token });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(db.writes).toEqual([]);
  });

  test.each([['unset', undefined], ['empty', ''], ['only commas and spaces', ' , ,']])(
    '403 for everyone when PRO_MOCK_UIDS is %s',
    async (_name, uids) => {
      setEnv({ PRO_MOCK_PURCHASE: '1', PRO_MOCK_UIDS: uids, VERCEL_ENV: 'preview', NODE_ENV: 'production' });
      const res = await buy({ plan: 'pro' }, { token: 'jack-token' });
      expect(res.status).toBe(403);
      expect(db.writes).toEqual([]);
    },
  );

  test('401 for a revoked token, checked with checkRevoked', async () => {
    const res = await buy({ plan: 'pro' }, { token: 'revoked-token' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(verifyIdToken).toHaveBeenCalledWith('revoked-token', true);
    expect(db.writes).toEqual([]);
  });

  test('an allowlisted phone user buys, and the token is verified with checkRevoked', async () => {
    const res = await buy({ plan: 'pro' }, { token: 'jack-token' });
    expect(res.status).toBe(200);
    expect(verifyIdToken).toHaveBeenCalledWith('jack-token', true);
    expect(db.data('entitlements/jack').plan).toBe('pro');
  });

  test('PRO_MOCK_UIDS: comma separated, trimmed, empty entries ignored', () => {
    expect(mockPurchaseUids({ PRO_MOCK_UIDS: ' jack , ,maya,, ' })).toEqual(['jack', 'maya']);
    expect(mockPurchaseUids({ PRO_MOCK_UIDS: 'jack' })).toEqual(['jack']);
    expect(mockPurchaseUids({ PRO_MOCK_UIDS: '' })).toEqual([]);
    expect(mockPurchaseUids({ PRO_MOCK_UIDS: ' , ' })).toEqual([]);
    expect(mockPurchaseUids({})).toEqual([]);
  });

  test('mockBuyerAllowed', () => {
    const env = { PRO_MOCK_UIDS: 'jack' };
    const forbidden = { ok: false, status: 403, error: 'forbidden' };
    expect(mockBuyerAllowed(phoneUser('jack'), env)).toEqual({ ok: true, uid: 'jack' });
    expect(mockBuyerAllowed({ ...phoneUser('jack'), firebase: { sign_in_provider: 'anonymous' } }, env)).toEqual(forbidden);
    expect(mockBuyerAllowed({ uid: 'jack' }, env)).toEqual(forbidden);
    expect(mockBuyerAllowed({ ...phoneUser('jack'), phone_number: '' }, env)).toEqual(forbidden);
    expect(mockBuyerAllowed(phoneUser('maya'), env)).toEqual(forbidden);
    expect(mockBuyerAllowed(phoneUser('jack'), {})).toEqual(forbidden);
    expect(mockBuyerAllowed(null, env)).toEqual(forbidden);
  });

  describe('authorizeMockBuyer', () => {
    const env = { PRO_MOCK_UIDS: 'jack' };
    const authWith = (impl) => ({ verifyIdToken: jest.fn(impl) });

    test('allows an allowlisted phone user', async () => {
      const auth = authWith(async () => phoneUser('jack'));
      expect(await authorizeMockBuyer({ token: 't', auth, env })).toEqual({ ok: true, uid: 'jack' });
      expect(auth.verifyIdToken).toHaveBeenCalledWith('t', true);
    });

    test('401 without a token, for a revoked token and for an invalid one', async () => {
      const unauthorized = { ok: false, status: 401, error: 'unauthorized' };
      const auth = authWith(async () => phoneUser('jack'));
      expect(await authorizeMockBuyer({ token: '', auth, env })).toEqual(unauthorized);
      expect(auth.verifyIdToken).not.toHaveBeenCalled();
      for (const code of ['auth/id-token-revoked', 'auth/argument-error', undefined]) {
        const failing = authWith(async () => { throw Object.assign(new Error('no'), { code }); });
        expect(await authorizeMockBuyer({ token: 't', auth: failing, env })).toEqual(unauthorized);
      }
    });

    test('403 for anonymous, no phone, or not allowlisted', async () => {
      for (const decoded of [
        { uid: 'jack', phone_number: 'present', firebase: { sign_in_provider: 'anonymous' } },
        { uid: 'jack' },
        phoneUser('maya'),
      ]) {
        const result = await authorizeMockBuyer({ token: 't', auth: authWith(async () => decoded), env });
        expect(result).toEqual({ ok: false, status: 403, error: 'forbidden' });
      }
    });

    test('rethrows admin-not-configured', async () => {
      const auth = authWith(async () => { throw Object.assign(new Error('missing'), { code: 'admin-not-configured' }); });
      await expect(authorizeMockBuyer({ token: 't', auth, env })).rejects.toMatchObject({ code: 'admin-not-configured' });
    });
  });
});

describe('purchases', () => {
  test('pro: a 30 day mock plan for the token uid, never a uid from the body', async () => {
    const before = Date.now();
    const res = await buy({ plan: 'pro', uid: 'maya' }, { token: 'jack-token' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, plan: 'pro' });
    const saved = db.data('entitlements/jack');
    expect(saved).toEqual({ plan: 'pro', source: 'mock', since: 'SERVER_TIME', expiresAt: { ts: body.expiresAt } });
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(body.expiresAt).toBeLessThanOrEqual(Date.now() + 30 * DAY);
    expect(db.data('entitlements/maya')).toBeUndefined();
    expect(db.data('meta/founders')).toBeUndefined();
  });

  test('founders are numbered in order from the counter', async () => {
    let res = await buy({ plan: 'founder' }, { token: 'jack-token' });
    expect(await res.json()).toEqual({ ok: true, plan: 'founder', founderNumber: 1, founderCount: 1 });
    expect(db.data('entitlements/jack')).toEqual({
      plan: 'founder', source: 'mock', since: 'SERVER_TIME', founderNumber: 1, expiresAt: null,
    });
    res = await buy({ plan: 'founder' }, { token: 'maya-token' });
    expect((await res.json()).founderNumber).toBe(2);
    expect(db.data('meta/founders')).toEqual({ count: 2 });
  });

  test('a founder buying again keeps their number and takes no new spot', async () => {
    await buy({ plan: 'founder' }, { token: 'jack-token' });
    const again = await buy({ plan: 'founder' }, { token: 'jack-token' });
    expect(await again.json()).toMatchObject({ plan: 'founder', founderNumber: 1, unchanged: true });
    const pro = await buy({ plan: 'pro' }, { token: 'jack-token' });
    expect(await pro.json()).toMatchObject({ plan: 'founder', unchanged: true });
    expect(db.data('meta/founders')).toEqual({ count: 1 });
    expect(db.data('entitlements/jack').plan).toBe('founder');
  });

  test('spot #600 is the last; after it founder is sold out (409) and Pro still sells', async () => {
    db = fakeDb({ 'meta/founders': { count: 599 } });
    let res = await buy({ plan: 'founder' }, { token: 'jack-token' });
    expect((await res.json()).founderNumber).toBe(600);
    res = await buy({ plan: 'founder' }, { token: 'maya-token' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'sold-out' });
    expect(db.data('entitlements/maya')).toBeUndefined();
    expect(db.data('meta/founders')).toEqual({ count: 600 });
    res = await buy({ plan: 'pro' }, { token: 'maya-token' });
    expect(res.status).toBe(200);
  });

  test('two founders at once never share a number', async () => {
    db = fakeDb({ 'meta/founders': { count: 99 } });
    const [a, b] = await Promise.all([
      grantMockEntitlement({ db, uid: 'a', plan: 'founder', since: 'T' }),
      grantMockEntitlement({ db, uid: 'b', plan: 'founder', since: 'T' }),
    ]);
    expect([a.founderNumber, b.founderNumber].sort()).toEqual([100, 101]);
    expect(db.data('meta/founders')).toEqual({ count: 101 });
  });

  test('an unexpected failure is a 500 that logs no details', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    db = { doc: () => ({}), runTransaction: async () => { throw new Error('boom'); } };
    const res = await buy({ plan: 'pro' }, { token: 'jack-token' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server' });
    expect(error).toHaveBeenCalledWith('mock purchase failed: error');
    error.mockRestore();
  });
});
