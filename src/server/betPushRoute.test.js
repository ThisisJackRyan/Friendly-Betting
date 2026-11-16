/** @jest-environment node */
import { adminDb, adminMessaging } from './firebaseAdmin';
import * as pushModule from '../../app/api/bets/[code]/push/route';
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
  adminDb.mockReset();
  adminDb.mockReturnValue(store);
  adminMessaging.mockReset();
  adminMessaging.mockReturnValue(messaging);
  logs = ['log', 'info', 'warn', 'error'].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  logs.forEach((spy) => spy.mockRestore());
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

function post({ code = 'abc123', origin = ORIGIN, body } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
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

test.each([undefined, '', '0', 'true'])('flag %p: skipped, no database, no Messaging', async (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  const res = await post();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: 0, failed: 0, skipped: 'disabled' });
  expect(adminDb).not.toHaveBeenCalled();
  expect(adminMessaging).not.toHaveBeenCalled();
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
  expect(await res.json()).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
  expect(messaging.sendEach).toHaveBeenCalledTimes(1);
  const text = JSON.stringify(logs.map((spy) => spy.mock.calls));
  ['tok-', 'jack', 'creator'].forEach((secret) => expect(text).not.toContain(secret));
});

test('an unknown bet is skipped, not an error', async () => {
  const res = await post({ code: 'nope42' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: 0, failed: 0, skipped: 'not-found' });
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
  const text = JSON.stringify(logs.map((spy) => spy.mock.calls));
  expect(text).toContain('abc123');
  expect(text).toContain('unavailable');
  expect(text).not.toMatch(/jack|tok-/);
});
