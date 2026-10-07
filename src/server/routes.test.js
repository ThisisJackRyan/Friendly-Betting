/** @jest-environment node */
import { adminAuth, adminDb } from './firebaseAdmin';
import { deliverResultTexts, saveVoterNumber } from './resultTexts';
import { sendResultSms } from './sms';
import { POST as saveRoute } from '../../app/api/bets/[code]/result-texts/route';
import * as saveModule from '../../app/api/bets/[code]/result-texts/route';
import { POST as sendRoute } from '../../app/api/bets/[code]/result-texts/send/route';
import * as sendModule from '../../app/api/bets/[code]/result-texts/send/route';
import { DELETE as deleteRoute } from '../../app/api/bets/[code]/route';
import * as deleteModule from '../../app/api/bets/[code]/route';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn() }));
jest.mock('./resultTexts', () => {
  const actual = jest.requireActual('./resultTexts');
  return { ...actual, saveVoterNumber: jest.fn(actual.saveVoterNumber), deliverResultTexts: jest.fn() };
});

const db = { name: 'admin-db' };
const verifyIdToken = jest.fn();
const notConfigured = () => Object.assign(new Error('missing'), { code: 'admin-not-configured' });

beforeEach(() => {
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async (token) => {
    if (token === 'good') return { uid: 'anon-1' };
    throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
  });
  adminAuth.mockReset();
  adminAuth.mockReturnValue({ verifyIdToken });
  adminDb.mockReset();
  adminDb.mockReturnValue(db);
  saveVoterNumber.mockClear();
  saveVoterNumber.mockImplementation(async () => {});
  deliverResultTexts.mockReset();
});

function save(body, { token, code = 'abc123' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request(`http://localhost/api/bets/${code}/result-texts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return saveRoute(request, { params: Promise.resolve({ code }) });
}

test('all routes run on Node and are never cached', () => {
  [saveModule, sendModule, deleteModule].forEach((route) => {
    expect(route.runtime).toBe('nodejs');
    expect(route.dynamic).toBe('force-dynamic');
  });
});

test('saving requires a valid ID token', async () => {
  let res = await save({ phone: '2025550143' });
  expect(res.status).toBe(401);
  res = await save({ phone: '2025550143' }, { token: 'forged' });
  expect(res.status).toBe(401);
  expect(saveVoterNumber).not.toHaveBeenCalled();
});

test('a valid token saves for the token uid, never a uid from the body', async () => {
  const res = await save({ phone: '(202) 555-0143', uid: 'someone-else', voterId: 'x', optionId: 'b' }, { token: 'good' });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ ok: true });
  expect(JSON.stringify(body)).not.toMatch(/555/);
  expect(saveVoterNumber).toHaveBeenCalledWith({ db, code: 'abc123', uid: 'anon-1', phone: '(202) 555-0143' });
});

test('an invalid number is a 400 from the real validation', async () => {
  saveVoterNumber.mockImplementation(jest.requireActual('./resultTexts').saveVoterNumber);
  const res = await save({ phone: '555' }, { token: 'good' });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'invalid-phone' });
});

test.each([
  ['not-found', 404, { error: 'not-found' }],
  ['closed', 409, { error: 'closed' }],
  ['no-vote', 409, { error: 'no-vote' }],
  ['too-many', 409, { error: 'too-many' }],
  ['boom', 500, { error: 'server' }],
])('maps %s to %i', async (code, status, body) => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  saveVoterNumber.mockRejectedValue(Object.assign(new Error('nope 2025550143'), { code }));
  const res = await save({ phone: '2025550143' }, { token: 'good' });
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual(body);
  expect(JSON.stringify(error.mock.calls)).not.toMatch(/555/);
  error.mockRestore();
});

test('missing admin credentials are a 503', async () => {
  adminAuth.mockImplementation(() => {
    throw notConfigured();
  });
  const res = await save({ phone: '2025550143' }, { token: 'good' });
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'not-configured' });
});

test('a malformed bet code is rejected before any work', async () => {
  const res = await save({ phone: '2025550143' }, { token: 'good', code: 'a%2Fb' });
  expect(res.status).toBe(404);
  expect(adminAuth).not.toHaveBeenCalled();
});

test('the send route delivers through the SMS hook and returns counts only', async () => {
  deliverResultTexts.mockResolvedValue({ sent: 2, failed: 1 });
  const res = await sendRoute(new Request('http://localhost/x', { method: 'POST' }), {
    params: Promise.resolve({ code: 'abc123' }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: 2, failed: 1 });
  expect(deliverResultTexts).toHaveBeenCalledWith({ db, code: 'abc123', sendSms: sendResultSms });
});

test('the send route returns zero counts for an unsettled bet and 503 without credentials', async () => {
  deliverResultTexts.mockResolvedValue({ sent: 0, skipped: 'not-settled' });
  const params = { params: Promise.resolve({ code: 'abc123' }) };
  let res = await sendRoute(new Request('http://localhost/x', { method: 'POST' }), params);
  expect(await res.json()).toEqual({ sent: 0, failed: 0 });
  adminDb.mockImplementation(() => {
    throw notConfigured();
  });
  res = await sendRoute(new Request('http://localhost/x', { method: 'POST' }), {
    params: Promise.resolve({ code: 'abc123' }),
  });
  expect(res.status).toBe(503);
});

test('the SMS hook is a TODO that fails clearly', async () => {
  await expect(sendResultSms('+12025550143', 'hi')).rejects.toMatchObject({ code: 'sms-not-configured' });
});

describe('CORS for the native app', () => {
  const ALLOWED = ['capacitor://localhost', 'https://localhost', 'https://www.friendly-bets.com'];
  const DENIED = [
    'https://evil.example',
    'http://localhost',
    'https://friendly-bets.com',
    'https://friendly-betting-teal.vercel.app',
    'null',
    undefined,
  ];
  const corsHeaders = (res) => [...res.headers.keys()].filter((key) => key.startsWith('access-control-'));
  const params = (code = 'abc123') => ({ params: Promise.resolve({ code }) });

  function post(route, { origin, token, code = 'abc123' } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (origin) headers.Origin = origin;
    if (token) headers.Authorization = `Bearer ${token}`;
    const request = new Request(`http://localhost/api/bets/${code}/result-texts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: '2025550143' }),
    });
    return route(request, params(code));
  }

  function options(route, origin) {
    const headers = { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' };
    if (origin) headers.Origin = origin;
    return route(new Request('http://localhost/api/bets/abc123/result-texts', { method: 'OPTIONS', headers }));
  }

  function expectCors(res, origin) {
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    expect(res.headers.get('vary')).toMatch(/\bOrigin\b/);
    expect(res.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
    expect(res.headers.get('access-control-max-age')).toBe('600');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  }

  describe.each(ALLOWED)('allowed origin %s', (origin) => {
    test('save responses carry CORS headers on success and errors', async () => {
      let res = await post(saveRoute, { origin, token: 'good' });
      expect(res.status).toBe(200);
      expectCors(res, origin);
      expect(res.headers.get('cache-control')).toBe('no-store');

      res = await post(saveRoute, { origin, token: 'good', code: 'a%2Fb' });
      expect(res.status).toBe(404);
      expectCors(res, origin);

      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      saveVoterNumber.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'boom' }));
      res = await post(saveRoute, { origin, token: 'good' });
      expect(res.status).toBe(500);
      expectCors(res, origin);
      error.mockRestore();
    });

    test('save still requires a token', async () => {
      let res = await post(saveRoute, { origin });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
      expectCors(res, origin);
      res = await post(saveRoute, { origin, token: 'forged' });
      expect(res.status).toBe(401);
      expectCors(res, origin);
      expect(saveVoterNumber).not.toHaveBeenCalled();
    });

    test('send responses carry CORS headers on success and errors', async () => {
      deliverResultTexts.mockResolvedValue({ sent: 1, failed: 0 });
      let res = await post(sendRoute, { origin });
      expect(res.status).toBe(200);
      expectCors(res, origin);

      res = await post(sendRoute, { origin, code: 'a%2Fb' });
      expect(res.status).toBe(404);
      expectCors(res, origin);

      adminDb.mockImplementation(() => {
        throw notConfigured();
      });
      res = await post(sendRoute, { origin });
      expect(res.status).toBe(503);
      expectCors(res, origin);
    });

    test.each([
      ['save', saveModule],
      ['send', sendModule],
    ])('%s preflight answers without auth or the database', async (_name, route) => {
      const res = await options(route.OPTIONS, origin);
      expect(res.status).toBe(204);
      expectCors(res, origin);
      expect(res.headers.get('access-control-allow-headers')).toMatch(/Authorization/);
      expect(res.headers.get('access-control-allow-headers')).toMatch(/Content-Type/);
      expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
      expect(adminAuth).not.toHaveBeenCalled();
      expect(adminDb).not.toHaveBeenCalled();
      expect(verifyIdToken).not.toHaveBeenCalled();
    });
  });

  describe.each(DENIED)('denied origin %s', (origin) => {
    test('POST responses get no CORS headers but still vary on Origin', async () => {
      deliverResultTexts.mockResolvedValue({ sent: 0, failed: 0 });
      for (const res of [
        await post(saveRoute, { origin, token: 'good' }),
        await post(saveRoute, { origin }),
        await post(sendRoute, { origin }),
      ]) {
        expect(corsHeaders(res)).toEqual([]);
        expect(res.headers.get('vary')).toMatch(/\bOrigin\b/);
      }
    });

    test('preflight gets no CORS headers and touches nothing', async () => {
      for (const route of [saveModule, sendModule]) {
        const res = await options(route.OPTIONS, origin);
        expect(res.status).toBe(204);
        expect(corsHeaders(res)).toEqual([]);
      }
      expect(adminAuth).not.toHaveBeenCalled();
      expect(adminDb).not.toHaveBeenCalled();
    });
  });
});

describe('delete route', () => {
  const PHONE_CLAIMS = { phone_number: '+15551234567' };
  const NUMBERS = 'privateResultTexts/abc123/numbers';
  let store;

  beforeEach(() => {
    verifyIdToken.mockImplementation(async (token) => {
      if (token === 'creator') return { uid: 'creator-1', ...PHONE_CLAIMS };
      if (token === 'other') return { uid: 'creator-9', ...PHONE_CLAIMS };
      if (token === 'anon') return { uid: 'creator-1' };
      throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
    });
    store = fakeDb({
      'bets/abc123': { code: 'abc123', createdByID: 'creator-1', votes: [{ voterId: 'anon-1', optionId: 'a' }] },
      'bets/legacy1': { betID: 'ml-1', type: 'Money Line', bet: 'Who wins' },
      'privateResultTexts/abc123': { parent: true },
      [`${NUMBERS}/n1`]: { e164: '+12025550143', voterId: 'anon-1', optionId: 'a' },
      [`${NUMBERS}/n2`]: { e164: '+12025550144', voterId: 'anon-2', optionId: 'b' },
    });
    adminDb.mockReturnValue(store);
  });

  function remove({ token, code = 'abc123', origin } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    return deleteRoute(new Request(`http://localhost/api/bets/${code}`, { method: 'DELETE', headers }), {
      params: Promise.resolve({ code }),
    });
  }

  test('a missing or invalid token is a 401 and deletes nothing', async () => {
    for (const token of [undefined, 'forged']) {
      const res = await remove({ token });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(store.writes).toEqual([]);
  });

  test('a non-creator, or the creator uid without a phone claim, is a 403', async () => {
    for (const token of ['other', 'anon']) {
      const res = await remove({ token });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden' });
    }
    expect(store.writes).toEqual([]);
    expect(store.data('bets/abc123')).toBeTruthy();
  });

  test('a bet with no creator uid is a 403 for everyone', async () => {
    for (const token of ['creator', 'other']) {
      const res = await remove({ token, code: 'legacy1' });
      expect(res.status).toBe(403);
    }
    expect(store.data('bets/legacy1')).toBeTruthy();
  });

  test('the creator deletes the numbers, their parent and the bet', async () => {
    const res = await remove({ token: 'creator' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ deleted: true });
    expect(store.paths('privateResultTexts/abc123')).toEqual([]);
    expect(store.data('bets/abc123')).toBeUndefined();
    // One commit; numbers and their parent are queued before the bet.
    expect(store.writes.map(([op, path]) => `${op} ${path}`)).toEqual([
      `delete ${NUMBERS}/n1`,
      `delete ${NUMBERS}/n2`,
      'delete privateResultTexts/abc123',
      'delete bets/abc123',
    ]);
  });

  test('running it twice succeeds; a bet that is already gone is a 200', async () => {
    expect((await remove({ token: 'creator' })).status).toBe(200);
    const writes = store.writes.length;
    const res = await remove({ token: 'creator' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(store.writes.length).toBe(writes);
  });

  test('missing admin credentials are a 503, a malformed code a 404, other failures a 500', async () => {
    adminAuth.mockImplementation(() => {
      throw notConfigured();
    });
    let res = await remove({ token: 'creator' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not-configured' });

    adminAuth.mockReturnValue({ verifyIdToken });
    adminAuth.mockClear();
    res = await remove({ token: 'creator', code: 'a%2Fb' });
    expect(res.status).toBe(404);
    expect(adminAuth).not.toHaveBeenCalled();

    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    adminDb.mockReturnValue({ ...store, runTransaction: async () => { throw new Error('boom'); } });
    res = await remove({ token: 'creator' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server' });
    error.mockRestore();
  });

  describe('CORS', () => {
    const ALLOWED = ['capacitor://localhost', 'https://localhost', 'https://www.friendly-bets.com'];
    const DENIED = ['https://evil.example', 'http://localhost', 'https://friendly-bets.com', 'null', undefined];
    const corsHeaders = (res) => [...res.headers.keys()].filter((key) => key.startsWith('access-control-'));

    function options(origin) {
      const headers = { 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'authorization' };
      if (origin) headers.Origin = origin;
      return deleteModule.OPTIONS(new Request('http://localhost/api/bets/abc123', { method: 'OPTIONS', headers }));
    }

    function expectCors(res, origin) {
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('vary')).toMatch(/\bOrigin\b/);
      expect(res.headers.get('access-control-allow-methods')).toBe('DELETE, OPTIONS');
      expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
      expect(res.headers.get('access-control-max-age')).toBe('600');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    }

    test.each(ALLOWED)('%s gets CORS on preflight without auth or the database', async (origin) => {
      const res = await options(origin);
      expect(res.status).toBe(204);
      expectCors(res, origin);
      expect(adminAuth).not.toHaveBeenCalled();
      expect(adminDb).not.toHaveBeenCalled();
    });

    test.each(ALLOWED)('%s gets CORS on success and errors', async (origin) => {
      let res = await remove({ origin });
      expect(res.status).toBe(401);
      expectCors(res, origin);
      res = await remove({ origin, token: 'other' });
      expect(res.status).toBe(403);
      expectCors(res, origin);
      res = await remove({ origin, token: 'creator' });
      expect(res.status).toBe(200);
      expectCors(res, origin);
    });

    test.each(DENIED)('%s gets no CORS headers but still varies on Origin', async (origin) => {
      for (const res of [await options(origin), await remove({ origin }), await remove({ origin, token: 'creator' })]) {
        expect(corsHeaders(res)).toEqual([]);
        expect(res.headers.get('vary')).toMatch(/\bOrigin\b/);
      }
    });
  });
});
