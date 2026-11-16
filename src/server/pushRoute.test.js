/** @jest-environment node */
import { adminAuth, adminDb } from './firebaseAdmin';
import * as tokensModule from '../../app/api/push/tokens/route';
import { MAX_PUSH_DEVICES } from '../phone/pushConfig';
import { PUSH_RATE_LIMIT, PUSH_RATE_WINDOW_MS, saveDeviceToken } from './pushTokens';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({}));
jest.mock('firebase-admin/messaging', () => ({}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn(), adminMessaging: jest.fn() }));

const { POST, DELETE, OPTIONS } = tokensModule;
const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const FCM = 'fcm-secret-token-AAAA';
const PHONE = '+15551234567';
const DEVICE = '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';
const verifyIdToken = jest.fn();
const notConfigured = () => Object.assign(new Error('missing'), { code: 'admin-not-configured' });
let store;
let logs;

beforeEach(() => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async (token) => {
    if (token === 'good') return { uid: 'user-1', phone_number: PHONE };
    if (token === 'other') return { uid: 'user-2' };
    throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
  });
  adminAuth.mockReset();
  adminAuth.mockReturnValue({ verifyIdToken });
  store = fakeDb();
  adminDb.mockReset();
  adminDb.mockReturnValue(store);
  logs = ['log', 'info', 'warn', 'error'].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  logs.forEach((spy) => spy.mockRestore());
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

const logged = () => JSON.stringify(logs.map((spy) => spy.mock.calls));

async function call(method, body, { token, origin, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const request = new Request('http://localhost/api/push/tokens', {
    method,
    headers,
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
  const res = await (method === 'POST' ? POST : DELETE)(request);
  res.raw = await res.clone().text();
  return res;
}

const register = (body = {}, opts = { token: 'good' }) =>
  call('POST', { deviceId: DEVICE, token: FCM, platform: 'ios', ...body }, opts);
const unregister = (body = {}, opts = { token: 'good' }) => call('DELETE', { deviceId: DEVICE, ...body }, opts);

async function expectClean(res) {
  const text = res.raw;
  [FCM, PHONE, 'user-1', 'good'].forEach((secret) => {
    expect(text).not.toContain(secret);
    expect(logged()).not.toContain(secret);
  });
}

test('runs on Node and is never cached', () => {
  expect(tokensModule.runtime).toBe('nodejs');
  expect(tokensModule.dynamic).toBe('force-dynamic');
});

describe('flag off', () => {
  test.each([undefined, '', '0', 'true'])('flag %p: every method is a plain 404 that touches nothing', async (value) => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
    else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
    const origin = 'capacitor://localhost';
    const responses = [
      await register({}, { token: 'good', origin }),
      await unregister({}, { token: 'good', origin }),
      await OPTIONS(new Request('http://localhost/api/push/tokens', { method: 'OPTIONS', headers: { Origin: origin } })),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not-found' });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
    expect(adminAuth).not.toHaveBeenCalled();
    expect(adminDb).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });
});

describe('auth', () => {
  test.each(['POST', 'DELETE'])('%s without or with an invalid ID token is a 401 and writes nothing', async (method) => {
    const fn = method === 'POST' ? register : unregister;
    for (const opts of [{}, { token: 'forged' }]) {
      const res = await fn({}, opts);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(store.writes).toEqual([]);
  });

  test.each(['POST', 'DELETE'])('%s without admin credentials is a 503', async (method) => {
    adminAuth.mockImplementation(() => {
      throw notConfigured();
    });
    const res = await (method === 'POST' ? register() : unregister());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not-configured' });
    await expectClean(res);
  });

  test('a 503 also comes back when only the database is unconfigured', async () => {
    adminDb.mockImplementation(() => {
      throw notConfigured();
    });
    const res = await register();
    expect(res.status).toBe(503);
  });
});

describe('register', () => {
  test.each([
    ['no body', null],
    ['an empty token', { token: '' }],
    ['a token with spaces', { token: 'two words' }],
    ['a missing token', { token: undefined }],
    ['a web platform', { platform: 'web' }],
    ['a missing platform', { platform: undefined }],
    ['a short device id', { deviceId: 'abc' }],
    ['a device id with a slash', { deviceId: 'abcdefgh/ijkl' }],
    ['a missing device id', { deviceId: undefined }],
  ])('%s is a 400', async (_name, body) => {
    const res = body === null ? await call('POST', null, { token: 'good', raw: 'not json' }) : await register(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid' });
    expect(store.writes).toEqual([]);
  });

  test('writes the token uid’s device doc, never a uid from the body', async () => {
    const res = await register({ uid: 'someone-else', platform: 'android' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(store.data(`privatePushTokens/user-1/devices/${DEVICE}`)).toEqual({
      token: FCM,
      platform: 'android',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    expect(store.paths('privatePushTokens/someone-else')).toEqual([]);
    await expectClean(res);
  });

  test('re-posting the same device and token is a 200 that only moves updatedAt', async () => {
    const path = `privatePushTokens/user-1/devices/${DEVICE}`;
    await saveDeviceToken({ db: store, uid: 'user-1', deviceId: DEVICE, token: FCM, platform: 'ios', now: 1000 });
    const res = await register();
    expect(res.status).toBe(200);
    const doc = store.data(path);
    expect(doc).toMatchObject({ token: FCM, platform: 'ios', createdAt: 1000 });
    expect(doc.updatedAt).toBeGreaterThan(1000);
    expect(store.paths('privatePushTokens/user-1/devices/')).toEqual([path]);
  });

  test('a refreshed token replaces the old one on the same device', async () => {
    await register();
    await register({ token: 'fcm-new-token-BBBB' });
    expect(store.data(`privatePushTokens/user-1/devices/${DEVICE}`).token).toBe('fcm-new-token-BBBB');
    expect(store.paths('privatePushTokens/user-1/devices/')).toHaveLength(1);
  });

  test('the same token under a new device id (a reinstall) drops the old doc', async () => {
    await saveDeviceToken({ db: store, uid: 'user-1', deviceId: 'old-device-1', token: FCM, platform: 'ios', now: 1 });
    await register();
    expect(store.paths('privatePushTokens/user-1/devices/')).toEqual([`privatePushTokens/user-1/devices/${DEVICE}`]);
  });

  test(`keeps at most ${MAX_PUSH_DEVICES} devices and evicts the oldest updatedAt`, async () => {
    // Saved out of order: device-03 is the oldest.
    const ages = [5, 9, 1, 7, 3, 8, 2, 6, 4, 10];
    for (let i = 0; i < MAX_PUSH_DEVICES; i += 1) {
      store.store.set(`privatePushTokens/user-1/devices/device-${String(i + 1).padStart(2, '0')}`, {
        data: { token: `t-${i}`, platform: 'ios', createdAt: ages[i], updatedAt: ages[i] },
        version: 1,
      });
    }
    let res = await register();
    expect(res.status).toBe(200);
    let ids = store.paths('privatePushTokens/user-1/devices/').map((p) => p.split('/').pop());
    expect(ids).toHaveLength(MAX_PUSH_DEVICES);
    expect(ids).not.toContain('device-03');
    expect(ids).toContain(DEVICE);

    // Next oldest (updatedAt 2) goes next; refreshing a kept device evicts nothing.
    res = await register({ deviceId: 'device-11-new', token: 'fcm-other-CCCC' });
    ids = store.paths('privatePushTokens/user-1/devices/').map((p) => p.split('/').pop());
    expect(ids).toHaveLength(MAX_PUSH_DEVICES);
    expect(ids).not.toContain('device-07');
    await register({ deviceId: 'device-01', token: 't-0' });
    expect(store.paths('privatePushTokens/user-1/devices/')).toHaveLength(MAX_PUSH_DEVICES);
  });

  test('another user’s devices are untouched', async () => {
    await register({}, { token: 'other' });
    await register();
    expect(store.paths('privatePushTokens/user-2/devices/')).toHaveLength(1);
    expect(store.paths('privatePushTokens/user-1/devices/')).toHaveLength(1);
  });
});

describe('unregister', () => {
  test('deletes that device doc, and deleting again is still a 200', async () => {
    await register();
    await register({ deviceId: 'keep-this-device', token: 'fcm-keep-DDDD' });
    let res = await unregister();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.data(`privatePushTokens/user-1/devices/${DEVICE}`)).toBeUndefined();
    expect(store.data('privatePushTokens/user-1/devices/keep-this-device')).toBeTruthy();
    res = await unregister();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await expectClean(res);
  });

  test('a missing doc is a 200; a bad device id is a 400', async () => {
    expect((await unregister({ deviceId: 'never-registered' })).status).toBe(200);
    for (const deviceId of [undefined, '', 'a/b/c/d/e/f/g', 'x']) {
      const res = await unregister({ deviceId });
      expect(res.status).toBe(400);
    }
  });

  test('a uid only deletes its own devices', async () => {
    await register();
    await unregister({}, { token: 'other' });
    expect(store.data(`privatePushTokens/user-1/devices/${DEVICE}`)).toBeTruthy();
  });
});

describe('rate limit', () => {
  test(`after ${PUSH_RATE_LIMIT} calls in the window, register and unregister are 429 and write nothing`, async () => {
    for (let i = 0; i < PUSH_RATE_LIMIT; i += 1) {
      const res = await (i % 2 ? unregister() : register());
      expect(res.status).toBe(200);
    }
    const writes = store.writes.length;
    let res = await register();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate-limited' });
    res = await unregister();
    expect(res.status).toBe(429);
    expect(store.writes.length).toBe(writes);
    // Another uid has its own window.
    expect((await register({}, { token: 'other' })).status).toBe(200);
    await expectClean(res);
  });

  test('a new window starts after the window length', async () => {
    store.store.set('privatePushTokens/user-1', {
      data: { windowStart: Date.now() - PUSH_RATE_WINDOW_MS - 1, count: PUSH_RATE_LIMIT },
      version: 1,
    });
    expect((await register()).status).toBe(200);
    expect(store.data('privatePushTokens/user-1').count).toBe(1);
  });
});

test('an unexpected failure is a 500 that logs only an error code', async () => {
  adminDb.mockReturnValue({
    ...store,
    runTransaction: async () => {
      throw Object.assign(new Error(`boom ${FCM} user-1 ${PHONE}`), { code: 'unavailable' });
    },
  });
  const res = await register();
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: 'server' });
  expect(logged()).toContain('unavailable');
  await expectClean(res);
});

describe('CORS', () => {
  const ALLOWED = ['capacitor://localhost', 'https://localhost', 'https://www.friendly-bets.com'];
  const DENIED = ['https://evil.example', 'http://localhost', 'null', undefined];
  const corsHeaders = (res) => [...res.headers.keys()].filter((key) => key.startsWith('access-control-'));

  const options = (origin) => {
    const headers = { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' };
    if (origin) headers.Origin = origin;
    return OPTIONS(new Request('http://localhost/api/push/tokens', { method: 'OPTIONS', headers }));
  };

  test.each(ALLOWED)('%s gets CORS on preflight, success and errors', async (origin) => {
    for (const res of [
      await options(origin),
      await register({}, { token: 'good', origin }),
      await register({}, { origin }),
      await unregister({}, { token: 'good', origin }),
    ]) {
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('access-control-allow-methods')).toBe('POST, DELETE, OPTIONS');
      expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
      expect(res.headers.get('vary')).toMatch(/\bOrigin\b/);
    }
    expect(verifyIdToken).toHaveBeenCalledTimes(2);
  });

  test('preflight touches neither auth nor the database', async () => {
    const res = await options('capacitor://localhost');
    expect(res.status).toBe(204);
    expect(adminAuth).not.toHaveBeenCalled();
    expect(adminDb).not.toHaveBeenCalled();
  });

  test.each(DENIED)('%s gets no CORS headers but still varies on Origin', async (origin) => {
    for (const res of [await options(origin), await register({}, { token: 'good', origin })]) {
      expect(corsHeaders(res)).toEqual([]);
      expect(res.headers.get('vary')).toMatch(/\bOrigin\b/);
    }
  });
});
