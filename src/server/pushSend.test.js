/** @jest-environment node */
import { adminDb, adminMessaging } from './firebaseAdmin';
import { buildMessage, sendToUser } from './pushSend';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({}));
jest.mock('firebase-admin/messaging', () => ({}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn(), adminMessaging: jest.fn() }));

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const UID = 'user-1';
const PHONE = '+15551234567';
const DEVICES = `privatePushTokens/${UID}/devices`;
const payload = { title: 'Title from the caller', body: 'Body from the caller', data: { code: 'abc123', route: '/b/abc123', n: 2 } };
let store;
let messaging;
let logs;

beforeEach(() => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  store = fakeDb({
    [`${DEVICES}/phone-a`]: { token: 'tok-ios-AAAA', platform: 'ios', createdAt: 1, updatedAt: 1 },
    [`${DEVICES}/phone-b`]: { token: 'tok-android-BBBB', platform: 'android', createdAt: 2, updatedAt: 2 },
    [`${DEVICES}/phone-c`]: { token: 'tok-gone-CCCC', platform: 'ios', createdAt: 3, updatedAt: 3 },
    'privatePushTokens/user-2/devices/x': { token: 'tok-other-user', platform: 'ios', createdAt: 1, updatedAt: 1 },
  });
  messaging = {
    sendEach: jest.fn(async (messages) => ({
      responses: messages.map(() => ({ success: true, messageId: 'm' })),
      successCount: messages.length,
      failureCount: 0,
    })),
  };
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

const logged = () => JSON.stringify(logs.map((spy) => spy.mock.calls));
function expectNoSecretsLogged() {
  ['tok-', UID, PHONE].forEach((secret) => expect(logged()).not.toContain(secret));
}

test.each([undefined, '', '0', 'true'])('flag %p: no-ops without touching Firestore or FCM', async (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  expect(await sendToUser(UID, payload)).toEqual({ sent: 0, failed: 0, removed: 0, skipped: 'disabled' });
  expect(adminDb).not.toHaveBeenCalled();
  expect(adminMessaging).not.toHaveBeenCalled();
  expect(messaging.sendEach).not.toHaveBeenCalled();
});

test('no uid or no devices sends nothing', async () => {
  expect(await sendToUser('', payload)).toMatchObject({ sent: 0, skipped: 'no-user' });
  expect(await sendToUser('nobody', payload)).toMatchObject({ sent: 0, skipped: 'no-devices' });
  expect(messaging.sendEach).not.toHaveBeenCalled();
});

test('sends once to each of that uid’s devices with the caller’s title, body and string data', async () => {
  const result = await sendToUser(UID, payload);
  expect(result).toEqual({ sent: 3, failed: 0, removed: 0 });
  expect(adminMessaging).toHaveBeenCalledTimes(1);
  const [messages] = messaging.sendEach.mock.calls[0];
  expect(messages.map((m) => m.token).sort()).toEqual(['tok-android-BBBB', 'tok-gone-CCCC', 'tok-ios-AAAA']);
  messages.forEach((m) => {
    expect(m.notification).toEqual({ title: 'Title from the caller', body: 'Body from the caller' });
    expect(m.data).toEqual({ code: 'abc123', route: '/b/abc123', n: '2' });
    expect(m.android).toBeUndefined();
    expect(m.apns).toBeUndefined();
  });
  expect(JSON.stringify(result)).not.toMatch(/tok-|user-1/);
  expectNoSecretsLogged();
});

test('collapseKey and threadId set Android collapse, the iOS collapse id and aps thread-id', async () => {
  await sendToUser(UID, payload, { collapseKey: 'abc123', threadId: 'abc123' });
  const [messages] = messaging.sendEach.mock.calls[0];
  messages.forEach((m) => {
    expect(m.android).toEqual({ collapseKey: 'abc123', notification: { tag: 'abc123' } });
    expect(m.apns).toEqual({ headers: { 'apns-collapse-id': 'abc123' }, payload: { aps: { threadId: 'abc123' } } });
  });
});

test('threadId alone groups on iOS without collapsing', () => {
  const m = buildMessage('t', { title: 'x' }, { threadId: 'abc123' });
  expect(m.android).toBeUndefined();
  expect(m.apns).toEqual({ payload: { aps: { threadId: 'abc123' } } });
});

test('unregistered and invalid tokens lose their device doc; other failures keep it', async () => {
  messaging.sendEach.mockImplementation(async (messages) => ({
    responses: messages.map((m) => {
      if (m.token === 'tok-gone-CCCC') return { success: false, error: { code: 'messaging/registration-token-not-registered', message: `gone ${m.token}` } };
      if (m.token === 'tok-ios-AAAA') return { success: false, error: { code: 'messaging/invalid-registration-token' } };
      return { success: false, error: { code: 'messaging/internal-error' } };
    }),
  }));
  const result = await sendToUser(UID, payload, { code: 'abc123' });
  expect(result).toEqual({ sent: 0, failed: 3, removed: 2 });
  expect(store.data(`${DEVICES}/phone-c`)).toBeUndefined();
  expect(store.data(`${DEVICES}/phone-a`)).toBeUndefined();
  expect(store.data(`${DEVICES}/phone-b`)).toBeTruthy();
  expect(store.data('privatePushTokens/user-2/devices/x')).toBeTruthy();
  expect(logged()).toContain('abc123');
  expect(logged()).toContain('messaging/internal-error');
  expectNoSecretsLogged();
});

test('a dead token is kept if the device re-registered a new one meanwhile', async () => {
  messaging.sendEach.mockImplementation(async (messages) => {
    await store.doc(`${DEVICES}/phone-c`).set({ token: 'tok-fresh-DDDD', platform: 'ios', createdAt: 3, updatedAt: 9 });
    return {
      responses: messages.map((m) =>
        m.token === 'tok-gone-CCCC' ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true },
      ),
    };
  });
  expect(await sendToUser(UID, payload)).toEqual({ sent: 2, failed: 1, removed: 0 });
  expect(store.data(`${DEVICES}/phone-c`).token).toBe('tok-fresh-DDDD');
});

test('a whole-batch FCM failure counts every device as failed and logs only the code', async () => {
  messaging.sendEach.mockRejectedValue(Object.assign(new Error(`bad tok-ios-AAAA for ${UID} ${PHONE}`), { code: 'app/invalid-credential' }));
  expect(await sendToUser(UID, payload)).toEqual({ sent: 0, failed: 3, removed: 0 });
  expect(logged()).toContain('app/invalid-credential');
  expectNoSecretsLogged();
  expect(store.paths(`${DEVICES}/`)).toHaveLength(3);
});

test('an unsafe bet code is left out of the logs', async () => {
  messaging.sendEach.mockRejectedValue(Object.assign(new Error('x'), { code: 'boom' }));
  await sendToUser(UID, payload, { code: `${PHONE} ${UID}` });
  expectNoSecretsLogged();
});
