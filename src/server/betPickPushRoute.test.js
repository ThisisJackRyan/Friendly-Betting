/** @jest-environment node */
import { adminAuth, adminDb, adminMessaging } from './firebaseAdmin';
import * as pickModule from '../../app/api/bets/[code]/push/pick/route';
import * as settleModule from '../../app/api/bets/[code]/push/route';
import { BET_PUSH_LIMIT, resetBetPushLimit } from './betPushLimit';
import * as pushEvents from './pushEvents';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({}));
jest.mock('firebase-admin/messaging', () => ({}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn(), adminMessaging: jest.fn() }));

const { POST, OPTIONS } = pickModule;
const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const ORIGIN = 'capacitor://localhost';
const CREATOR_TOKEN = 'id-creator-AAAA';
const MAYA_TOKEN = 'id-maya-BBBB';
const STRANGER_TOKEN = 'id-stranger-CCCC';
const PHONE = '+15551234567';
const verifyIdToken = jest.fn();
const at = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
let store;
let messaging;
let logs;

function openBet() {
  return {
    schemaVersion: 2,
    status: 'open',
    createdByID: 'creator',
    question: 'Who is late',
    options: [{ id: 'a', label: 'Over' }, { id: 'b', label: 'Under' }],
    votes: [{ voterId: 'creator', name: 'Casey', optionId: 'a', phone: PHONE }],
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  store = fakeDb({
    'bets/abc123': openBet(),
    'bets/abc123/votes/maya': { voterId: 'maya', name: 'Maya', optionId: 'b', at: at(Date.now() - 1000) },
    'privatePushTokens/creator/devices/d0': { token: 'tok-creator', platform: 'ios' },
    'privatePushTokens/maya/devices/d1': { token: 'tok-maya', platform: 'android' },
    'privatePushTokens/stranger/devices/d2': { token: 'tok-stranger', platform: 'android' },
  });
  messaging = { sendEach: jest.fn(async (messages) => ({ responses: messages.map(() => ({ success: true })) })) };
  store.collection = jest.fn(store.collection);
  adminDb.mockReset();
  adminDb.mockReturnValue(store);
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async (token) => {
    if (token === CREATOR_TOKEN) return { uid: 'creator' };
    if (token === MAYA_TOKEN) return { uid: 'maya' };
    if (token === STRANGER_TOKEN) return { uid: 'stranger' };
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
const sentMessages = () => messaging.sendEach.mock.calls.flatMap(([batch]) => batch);
const SECRETS = ['tok-', 'maya', 'Maya', 'creator', 'stranger', CREATOR_TOKEN, MAYA_TOKEN, STRANGER_TOKEN, PHONE];

function post({ code = 'abc123', origin = ORIGIN, body, token = MAYA_TOKEN, authorization } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (authorization !== undefined) headers.Authorization = authorization;
  else if (token) headers.Authorization = `Bearer ${token}`;
  return POST(
    new Request(`http://localhost/api/bets/${code}/push/pick`, { method: 'POST', headers, body }),
    { params: Promise.resolve({ code }) },
  );
}

const preflightRequest = () => new Request('http://localhost/api/bets/abc123/push/pick', {
  method: 'OPTIONS',
  headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' },
});

test('runs on Node, never cached, with no long maxDuration (nothing to wait for)', () => {
  expect(pickModule.runtime).toBe('nodejs');
  expect(pickModule.dynamic).toBe('force-dynamic');
  expect(pickModule.maxDuration).toBeUndefined();
});

test('a bad code is a 404 with CORS, before auth or the database', async () => {
  const res = await post({ code: 'a%2Fb' });
  expect(res.status).toBe(404);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(verifyIdToken).not.toHaveBeenCalled();
  expect(adminDb).not.toHaveBeenCalled();
});

test('preflight allows POST and the Authorization header, without the database', async () => {
  const res = await OPTIONS(preflightRequest());
  expect(res.status).toBe(204);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
  expect(res.headers.get('access-control-allow-headers')).toMatch(/Authorization/);
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
  const pre = await OPTIONS(preflightRequest());
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
    ['not Bearer', { authorization: `Basic ${MAYA_TOKEN}` }],
  ])('%s: 401 before verify, the database or a send', async (_, opts) => {
    const res = await post(opts);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb).not.toHaveBeenCalled();
    expect(messaging.sendEach).not.toHaveBeenCalled();
    expect(logged()).toBe('[[],[],[],[]]');
  });

  test('an invalid token: 401, no database, no send, nothing logged', async () => {
    const res = await post({ token: 'forged-DDDD' });
    expect(res.status).toBe(401);
    expect(verifyIdToken).toHaveBeenCalledTimes(1);
    expect(adminDb).not.toHaveBeenCalled();
    expect(messaging.sendEach).not.toHaveBeenCalled();
    expect(logged()).toBe('[[],[],[],[]]');
  });

  test('admin not configured at verify is a 503', async () => {
    adminAuth.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'admin-not-configured' }); });
    const res = await post();
    expect(res.status).toBe(503);
    expect(adminDb).not.toHaveBeenCalled();
  });

  test('a signed-in uid with no pick on the bet: 403, no send, no claim', async () => {
    const deliver = jest.spyOn(pushEvents, 'deliverPickPush');
    try {
      const res = await post({ token: STRANGER_TOKEN });
      const body = await res.text();
      expect(res.status).toBe(403);
      expect(JSON.parse(body)).toEqual({ error: 'forbidden' });
      expect(deliver).not.toHaveBeenCalled();
      expect(messaging.sendEach).not.toHaveBeenCalled();
      expect(store.paths('privatePushSends/')).toEqual([]);
      const text = logged() + body;
      SECRETS.forEach((secret) => expect(text.includes(secret)).toBe(false));
    } finally {
      deliver.mockRestore();
    }
  });

  test('a voter entry with no side is not a pick: 403', async () => {
    await store.doc('bets/abc123/votes/stranger').set({ voterId: 'stranger', name: 'S' });
    const res = await post({ token: STRANGER_TOKEN });
    expect(res.status).toBe(403);
    expect(messaging.sendEach).not.toHaveBeenCalled();
  });

  test('the creator’s own pick: 200 skipped self, no send, no claim', async () => {
    const res = await post({ token: CREATOR_TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, failed: 0, skipped: 'self' });
    expect(messaging.sendEach).not.toHaveBeenCalled();
    expect(store.paths('privatePushSends/')).toEqual([]);
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
    expect(messaging.sendEach).toHaveBeenCalledTimes(1);
    // Another uid has its own budget.
    expect((await post({ token: STRANGER_TOKEN })).status).toBe(403);
    SECRETS.forEach((secret) => expect(logged().includes(secret)).toBe(false));
  });
});

test('happy path: tells only the creator, once, with the live vote; ignores any body', async () => {
  let res = await post({
    body: JSON.stringify({ recipient: 'stranger', uid: 'stranger', name: 'Mallory', side: 'a', optionId: 'a' }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: 1, failed: 0 });
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  const messages = sentMessages();
  expect(messages.map((m) => m.token)).toEqual(['tok-creator']);
  expect(messages[0].notification).toEqual({ title: 'Who is late', body: 'Maya picked Under.' });
  expect(messages[0].data).toEqual({ code: 'abc123', route: '/b/abc123', event: 'pick' });
  expect(messages[0].apns.headers['apns-collapse-id']).toBe('abc123');
  expect(messages[0].android).toEqual({ collapseKey: 'abc123', notification: { tag: 'abc123', channelId: 'bet_updates' } });
  expect(store.paths('privatePushSends/').sort()).toEqual(['privatePushSends/pick:abc123:maya', 'privatePushSends/pickcount:abc123']);

  // A side change and a rename later: the claim holds, nothing more is sent.
  await store.doc('bets/abc123/votes/maya').set({ voterId: 'maya', name: 'May', optionId: 'a', at: at(Date.now()) });
  res = await post();
  const body = await res.text();
  expect(JSON.parse(body)).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
  expect(messaging.sendEach).toHaveBeenCalledTimes(1);
  const text = logged() + JSON.stringify(Array.from(res.headers.entries())) + body;
  SECRETS.forEach((secret) => expect(text.includes(secret)).toBe(false));
});

test('an unnamed first pick from the legacy array gets the unnamed body', async () => {
  await store.doc('bets/abc123').set({ ...openBet(), votes: [...openBet().votes, { voterId: 'stranger', name: '  ', optionId: 'a', at: Date.now() }] });
  const res = await post({ token: STRANGER_TOKEN });
  expect(await res.json()).toEqual({ sent: 1, failed: 0 });
  expect(sentMessages()[0].notification).toEqual({ title: 'Who is late', body: 'A friend picked Over.' });
});

test('a stale pick is skipped and not claimed', async () => {
  await store.doc('bets/abc123/votes/maya').set({ voterId: 'maya', name: 'Maya', optionId: 'b', at: at(Date.now() - 11 * 60 * 1000) });
  const res = await post();
  expect(await res.json()).toEqual({ sent: 0, failed: 0, skipped: 'stale' });
  expect(messaging.sendEach).not.toHaveBeenCalled();
  expect(store.paths('privatePushSends/')).toEqual([]);
});

test('a creator with no registered device (push off in the app): 200, no send, the claim stays', async () => {
  await store.doc('privatePushTokens/creator/devices/d0').delete();
  const res = await post();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: 0, failed: 0 });
  expect(messaging.sendEach).not.toHaveBeenCalled();
  expect(store.paths('privatePushSends/').sort()).toEqual(['privatePushSends/pick:abc123:maya', 'privatePushSends/pickcount:abc123']);
});

test('an unknown bet is skipped, not an error, after a valid token', async () => {
  const res = await post({ code: 'nope42' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: 0, failed: 0, skipped: 'not-found' });
  expect(messaging.sendEach).not.toHaveBeenCalled();
});

test('admin not configured is a 503; any other failure a 500 that logs only the code', async () => {
  adminDb.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'admin-not-configured' }); });
  let res = await post();
  expect(res.status).toBe(503);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  adminDb.mockReset();
  adminDb.mockReturnValue({
    doc: () => ({ get: async () => { throw Object.assign(new Error(`maya tok-x ${PHONE}`), { code: 'unavailable' }); } }),
    collection: () => ({}),
  });
  res = await post();
  expect(res.status).toBe(500);
  const text = logged();
  expect(text).toContain('abc123');
  expect(text).toContain('unavailable');
  SECRETS.forEach((secret) => expect(text.includes(secret)).toBe(false));
});

test('the settle route is unchanged: a voter still cannot trigger it', async () => {
  const res = await settleModule.POST(
    new Request('http://localhost/api/bets/abc123/push', { method: 'POST', headers: { Authorization: `Bearer ${MAYA_TOKEN}` } }),
    { params: Promise.resolve({ code: 'abc123' }) },
  );
  expect(res.status).toBe(403);
  expect(settleModule.maxDuration).toBe(60);
  expect(messaging.sendEach).not.toHaveBeenCalled();
});
