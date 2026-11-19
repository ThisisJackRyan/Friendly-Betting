/** @jest-environment node */
import { adminAuth, adminDb, adminMessaging } from './firebaseAdmin';
import * as cronModule from '../../app/api/cron/push-closing/route';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({}));
jest.mock('firebase-admin/messaging', () => ({}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn(), adminMessaging: jest.fn() }));

const { GET } = cronModule;
const savedFlag = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const savedSecret = process.env.CRON_SECRET;
const SECRET = 'cron-secret-XYZ-1234567890';
const PHONE = '+15551234567';
const MIN = 60 * 1000;
const CREATOR_BODY = 'Under an hour left. Nudge anyone who hasn’t picked.';
const SECRETS = ['tok-', 'creator', 'Casey', 'jack', 'Jack', 'dev-', PHONE, SECRET];
let store;
let messaging;
let logs;

function openBet(minutesLeft, overrides = {}) {
  return {
    schemaVersion: 2,
    status: 'open',
    createdByID: 'creator',
    question: 'Who is late',
    closesAt: Date.now() + minutesLeft * MIN,
    options: [{ id: 'a', label: 'Over' }, { id: 'b', label: 'Under' }],
    votes: [{ voterId: 'jack', name: 'Jack', optionId: 'a', phone: PHONE }],
    ...overrides,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  process.env.CRON_SECRET = SECRET;
  store = fakeDb({
    'bets/abc123': openBet(30),
    'bets/later1': openBet(90),
    'bets/settle': openBet(20, { status: 'closed', winnerId: 'a' }),
    'privatePushTokens/creator/devices/dev-c': { token: 'tok-creator', platform: 'ios' },
    'privatePushTokens/jack/devices/dev-j': { token: 'tok-jack', platform: 'android' },
  });
  messaging = { sendEach: jest.fn(async (messages) => ({ responses: messages.map(() => ({ success: true })) })) };
  store.collection = jest.fn(store.collection);
  adminDb.mockReset();
  adminDb.mockReturnValue(store);
  adminAuth.mockReset();
  adminMessaging.mockReset();
  adminMessaging.mockReturnValue(messaging);
  logs = ['log', 'info', 'warn', 'error'].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  logs.forEach((spy) => spy.mockRestore());
  if (savedFlag === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = savedFlag;
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

const logged = () => JSON.stringify(logs.map((spy) => spy.mock.calls));
const sentMessages = () => messaging.sendEach.mock.calls.flatMap(([batch]) => batch);
const claims = () => store.paths('privatePushSends/');

function get({ authorization = `Bearer ${SECRET}`, origin } = {}) {
  const headers = {};
  if (authorization !== null) headers.Authorization = authorization;
  if (origin) headers.Origin = origin;
  return GET(new Request('http://localhost/api/cron/push-closing', { method: 'GET', headers }));
}

test('runs on Node, never cached, with room for a full batch; GET only', () => {
  expect(cronModule.runtime).toBe('nodejs');
  expect(cronModule.dynamic).toBe('force-dynamic');
  expect(cronModule.maxDuration).toBe(60);
  expect(cronModule.POST).toBeUndefined();
  expect(cronModule.OPTIONS).toBeUndefined();
});

test.each([undefined, '', '0', 'true'])('flag %p: a plain 404 before auth, the database or Messaging', async (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  for (const authorization of [`Bearer ${SECRET}`, null, 'Bearer wrong']) {
    const res = await get({ authorization, origin: 'capacitor://localhost' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  }
  expect(adminDb).not.toHaveBeenCalled();
  expect(adminAuth).not.toHaveBeenCalled();
  expect(adminMessaging).not.toHaveBeenCalled();
  expect(messaging.sendEach).not.toHaveBeenCalled();
  expect(claims()).toEqual([]);
});

describe('auth', () => {
  test.each([
    ['no header', null],
    ['an empty header', ''],
    ['a wrong secret', 'Bearer wrong-secret'],
    ['a wrong secret of the same length', `Bearer ${'x'.repeat(SECRET.length)}`],
    ['the secret without Bearer', SECRET],
    ['Basic', `Basic ${SECRET}`],
    ['a blank Bearer', 'Bearer '],
    ['the secret with extra text', `Bearer ${SECRET}x`],
    ['a prefix of the secret', `Bearer ${SECRET.slice(0, -1)}`],
  ])('%s: 401, no database, no send, nothing logged', async (_, authorization) => {
    const res = await get({ authorization });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(adminDb).not.toHaveBeenCalled();
    expect(messaging.sendEach).not.toHaveBeenCalled();
    expect(logged()).toBe('[[],[],[],[]]');
  });

  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('CRON_SECRET %s: 401 for any header, even a matching one', async (_, value) => {
    if (value === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = value;
    for (const authorization of [null, 'Bearer ', 'Bearer undefined', `Bearer ${value ?? ''}`]) {
      const res = await get({ authorization });
      expect(res.status).toBe(401);
    }
    expect(adminDb).not.toHaveBeenCalled();
    expect(messaging.sendEach).not.toHaveBeenCalled();
  });
});

test('the right secret: sends the creator the reminder for the bet in the window, once; counts only', async () => {
  const res = await get();
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const body = await res.json();
  expect(body).toEqual({ processed: 2, notified: 1, sent: 1, failed: 0, skips: { settled: 1 } });
  expect(sentMessages()).toHaveLength(1);
  const [message] = sentMessages();
  expect(message.token).toBe('tok-creator');
  expect(message.notification).toEqual({ title: 'Who is late', body: CREATOR_BODY });
  expect(message.data).toEqual({ code: 'abc123', route: '/b/abc123', event: 'closing' });
  expect(message.android).toEqual({ collapseKey: 'abc123', notification: { tag: 'abc123', channelId: 'bet_updates' } });
  expect(message.apns).toEqual({ headers: { 'apns-collapse-id': 'abc123' }, payload: { aps: { threadId: 'abc123' } } });
  expect(claims()).toEqual(['privatePushSends/closing:abc123']);
  expect(store.collection).toHaveBeenCalledWith('bets');
  const text = JSON.stringify(body) + logged();
  SECRETS.forEach((secret) => expect(text).not.toContain(secret));
  expect(res.headers.get('access-control-allow-origin')).toBeNull();

  const again = await get();
  expect(await again.json()).toEqual({ processed: 2, notified: 0, sent: 0, failed: 0, skips: { 'already-sent': 1, settled: 1 } });
  expect(sentMessages()).toHaveLength(1);
});

test('concurrent cron calls send once', async () => {
  const results = await Promise.all([get(), get(), get()]);
  const bodies = await Promise.all(results.map((res) => res.json()));
  expect(bodies.reduce((sum, body) => sum + body.sent, 0)).toBe(1);
  expect(sentMessages()).toHaveLength(1);
});

test('voters who picked get nothing, even with registered devices', async () => {
  await get();
  expect(sentMessages().map((m) => m.token)).toEqual(['tok-creator']);
});

test('a creator with no device: 200, nothing sent, the claim stays', async () => {
  await store.doc('privatePushTokens/creator/devices/dev-c').delete();
  const res = await get();
  expect(await res.json()).toEqual({ processed: 2, notified: 0, sent: 0, failed: 0, skips: { 'no-devices': 1, settled: 1 } });
  expect(messaging.sendEach).not.toHaveBeenCalled();
  expect(claims()).toEqual(['privatePushSends/closing:abc123']);
});

test('no service account: 503, nothing sent, the setup error code only', async () => {
  adminDb.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'admin-not-configured' }); });
  const res = await get();
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'not-configured' });
  expect(messaging.sendEach).not.toHaveBeenCalled();
});

test('a failing query: 500, logs only the error code', async () => {
  store.collection = jest.fn(() => {
    throw Object.assign(new Error(`creator ${PHONE} tok-abc ${SECRET}`), { code: 'failed-precondition' });
  });
  const res = await get();
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: 'server' });
  expect(logged()).toContain('failed-precondition');
  SECRETS.forEach((secret) => expect(logged()).not.toContain(secret));
  expect(messaging.sendEach).not.toHaveBeenCalled();
});
