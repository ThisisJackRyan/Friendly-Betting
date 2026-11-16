/** @jest-environment node */
import { adminAuth, adminDb, adminMessaging } from './firebaseAdmin';
import * as pushModule from '../../app/api/bets/[code]/push/route';
import { BET_PUSH_LIMIT, resetBetPushLimit } from './betPushLimit';
import * as pushEvents from './pushEvents';
import { buildSettlement } from '../phone/settlement';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({}));
jest.mock('firebase-admin/messaging', () => ({}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn(), adminMessaging: jest.fn() }));

const { POST, OPTIONS } = pushModule;
const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const ORIGIN = 'capacitor://localhost';
const CREATOR_TOKEN = 'id-creator-AAAA';
const OTHER_TOKEN = 'id-other-BBBB';
const verifyIdToken = jest.fn();
let store;
let messaging;
let logs;

function settledBet(settledAtMs) {
  const bet = {
    schemaVersion: 2,
    status: 'open',
    createdByID: 'creator',
    question: 'Who is late',
    options: [{ id: 'a', label: 'Over' }, { id: 'b', label: 'Under' }],
    votes: [{ voterId: 'creator', optionId: 'a' }, { voterId: 'jack', optionId: 'a' }],
  };
  return {
    ...bet,
    status: 'closed',
    winnerId: 'a',
    settledAt: { seconds: Math.floor(settledAtMs / 1000), nanoseconds: 0 },
    settlement: buildSettlement(bet, 'a'),
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  store = fakeDb({
    // Past the 35s undo window, so the happy path never waits.
    'bets/abc123': settledBet(Date.now() - 60_000),
    'privatePushTokens/jack/devices/d1': { token: 'tok-jack', platform: 'android' },
    'privatePushTokens/creator/devices/d0': { token: 'tok-creator', platform: 'ios' },
  });
  messaging = { sendEach: jest.fn(async (messages) => ({ responses: messages.map(() => ({ success: true })) })) };
  store.collection = jest.fn(store.collection);
  adminDb.mockReset();
  adminDb.mockReturnValue(store);
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async (token) => {
    if (token === CREATOR_TOKEN) return { uid: 'creator' };
    if (token === OTHER_TOKEN) return { uid: 'jack' };
    throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
  });
  adminAuth.mockReset();
  adminAuth.mockReturnValue({ verifyIdToken });
  resetBetPushLimit();
  adminMessaging.mockReset();
  adminMessaging.mockReturnValue(messaging);
  logs = ['log', 'info', 'warn', 'error'].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  logs.forEach((spy) => spy.mockRestore());
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

const logged = () => JSON.stringify(logs.map((spy) => spy.mock.calls));

function post({ code = 'abc123', origin = ORIGIN, body, token = CREATOR_TOKEN, authorization } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (authorization !== undefined) headers.Authorization = authorization;
  else if (token) headers.Authorization = `Bearer ${token}`;
  return POST(
    new Request(`http://localhost/api/bets/${code}/push`, { method: 'POST', headers, body }),
    { params: Promise.resolve({ code }) },
  );
}

test('runs on Node, never cached, with room for the 35s undo wait', () => {
  expect(pushModule.runtime).toBe('nodejs');
  expect(pushModule.dynamic).toBe('force-dynamic');
  expect(pushModule.maxDuration).toBe(60);
});

test('a bad code is a 404 with CORS, before the database', async () => {
  const res = await post({ code: 'a%2Fb' });
  expect(res.status).toBe(404);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(adminDb).not.toHaveBeenCalled();
});

test('preflight answers without the database', async () => {
  const res = await OPTIONS(new Request('http://localhost/api/bets/abc123/push', {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
  }));
  expect(res.status).toBe(204);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
  expect(adminDb).not.toHaveBeenCalled();
});

test('a denied origin gets no CORS headers', async () => {
  const res = await post({ origin: 'https://evil.example' });
  expect(res.headers.get('access-control-allow-origin')).toBeNull();
  expect(res.headers.get('vary')).toMatch(/\bOrigin\b/);
});

test.each([undefined, '', '0', 'true'])('flag %p: a plain 404, no CORS, no auth, no database, no Messaging', async (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  const res = await post();
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'not-found' });
  expect(res.headers.get('access-control-allow-origin')).toBeNull();
  const pre = await OPTIONS(new Request('http://localhost/api/bets/abc123/push', {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
  }));
  expect(pre.status).toBe(404);
  expect(pre.headers.get('access-control-allow-origin')).toBeNull();
  expect(adminAuth).not.toHaveBeenCalled();
  expect(adminDb).not.toHaveBeenCalled();
  expect(adminMessaging).not.toHaveBeenCalled();
});

describe('auth', () => {
  test.each([
    ['no header', { token: null }],
    ['a blank Bearer', { authorization: 'Bearer   ' }],
    ['not Bearer', { authorization: `Basic ${CREATOR_TOKEN}` }],
  ])('%s: 401 before verify, the database or a send', async (_, opts) => {
    const res = await post(opts);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb).not.toHaveBeenCalled();
    expect(messaging.sendEach).not.toHaveBeenCalled();
  });

  test('an invalid token: 401, no database, no send, nothing logged', async () => {
    const res = await post({ token: 'forged-CCCC' });
    expect(res.status).toBe(401);
    expect(verifyIdToken).toHaveBeenCalledTimes(1);
    expect(adminDb).not.toHaveBeenCalled();
    expect(messaging.sendEach).not.toHaveBeenCalled();
    expect(logged().includes('forged-CCCC')).toBe(false);
  });

  test('admin not configured at verify is a 503', async () => {
    adminAuth.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'admin-not-configured' }); });
    const res = await post();
    expect(res.status).toBe(503);
    expect(adminDb).not.toHaveBeenCalled();
  });

  test('a signed-in non-creator: 403 after reading only the bet doc; no votes, no wait, no send', async () => {
    // Inside the undo window: a delivery would wait 35s and time the test out.
    const fresh = fakeDb({ 'bets/abc123': settledBet(Date.now() - 1000) });
    fresh.collection = jest.fn(fresh.collection);
    adminDb.mockReturnValue(fresh);
    const deliver = jest.spyOn(pushEvents, 'deliverBetPush');
    try {
      const res = await post({ token: OTHER_TOKEN });
      const body = await res.text();
      expect(res.status).toBe(403);
      expect(JSON.parse(body)).toEqual({ error: 'forbidden' });
      expect(fresh.collection).not.toHaveBeenCalled();
      expect(deliver).not.toHaveBeenCalled();
      expect(adminMessaging).not.toHaveBeenCalled();
      expect(fresh.paths('privatePushSends/')).toEqual([]);
      const text = logged() + body;
      [OTHER_TOKEN, 'jack'].forEach((secret) => expect(text.includes(secret)).toBe(false));
    } finally {
      deliver.mockRestore();
    }
  });

  test('the creator gets through to the send', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, failed: 0 });
    expect(verifyIdToken).toHaveBeenCalledWith(CREATOR_TOKEN);
  });

  test(`more than ${BET_PUSH_LIMIT} posts from one uid are throttled with a 429; nothing logged`, async () => {
    for (let i = 0; i < BET_PUSH_LIMIT; i += 1) {
      expect((await post()).status).toBe(200);
    }
    const reads = adminDb.mock.calls.length;
    const res = await post();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate-limited' });
    expect(adminDb.mock.calls.length).toBe(reads);
    // Another uid has its own budget.
    expect((await post({ token: OTHER_TOKEN })).status).toBe(403);
    [CREATOR_TOKEN, 'creator'].forEach((secret) => expect(logged().includes(secret)).toBe(false));
  });
});

test('happy path: sends to the voter, not the creator, once; ignores any body', async () => {
  let res = await post({ body: JSON.stringify({ recipients: ['creator'], uid: 'creator' }) });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: 1, failed: 0 });
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  const messages = messaging.sendEach.mock.calls.flatMap(([batch]) => batch);
  expect(messages.map((m) => m.token)).toEqual(['tok-jack']);
  expect(messages[0].notification).toEqual({ title: 'Who is late', body: 'Over won. See who called it.' });
  expect(messages[0].data.route).toBe('/b/abc123');

  res = await post();
  const body = await res.text();
  expect(JSON.parse(body)).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
  expect(messaging.sendEach).toHaveBeenCalledTimes(1);
  const text = logged() + JSON.stringify(Array.from(res.headers.entries())) + body;
  ['tok-', 'jack', 'creator', CREATOR_TOKEN].forEach((secret) => expect(text.includes(secret)).toBe(false));
});

test('an unknown bet is skipped, not an error, after a valid token', async () => {
  const res = await post({ code: 'nope42' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: 0, failed: 0, skipped: 'not-found' });
  expect(store.collection).not.toHaveBeenCalled();
});

test('admin not configured is a 503; any other failure a 500 that logs only the code', async () => {
  adminDb.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'admin-not-configured' }); });
  let res = await post();
  expect(res.status).toBe(503);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  adminDb.mockReset();
  adminDb.mockReturnValue({
    doc: () => ({ get: async () => { throw Object.assign(new Error('jack tok-x'), { code: 'unavailable' }); } }),
    collection: () => ({}),
  });
  res = await post();
  expect(res.status).toBe(500);
  const text = logged();
  expect(text).toContain('abc123');
  expect(text).toContain('unavailable');
  expect(text).not.toMatch(/jack|tok-|creator|id-creator/);
});
