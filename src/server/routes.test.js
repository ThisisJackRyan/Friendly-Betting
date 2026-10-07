/** @jest-environment node */
import { adminAuth, adminDb } from './firebaseAdmin';
import { deliverResultTexts, saveVoterNumber } from './resultTexts';
import { sendResultSms } from './sms';
import { POST as saveRoute } from '../../app/api/bets/[code]/result-texts/route';
import * as saveModule from '../../app/api/bets/[code]/result-texts/route';
import { POST as sendRoute } from '../../app/api/bets/[code]/result-texts/send/route';
import * as sendModule from '../../app/api/bets/[code]/result-texts/send/route';

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

test('both routes run on Node and are never cached', () => {
  [saveModule, sendModule].forEach((route) => {
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
