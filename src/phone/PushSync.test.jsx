import { act, render } from '@testing-library/react';
import { Capacitor } from '@capacitor/core';
import PushSync from './PushSync';
import { syncPushForUser } from './pushOptIn';
import { ensurePushChannel } from './pushChannel';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

const mockAuth = { listener: null };
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listener = onChange;
    return () => {
      mockAuth.listener = null;
    };
  }),
}));
jest.mock('../Config/firebase-config', () => ({ auth: {}, db: {} }));
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => true), getPlatform: jest.fn(() => 'ios') },
}));
jest.mock('./pushOptIn', () => ({ syncPushForUser: jest.fn(async () => true) }));
jest.mock('./pushChannel', () => ({ ensurePushChannel: jest.fn(async () => true) }));
const mockMessaging = { handlers: [], remove: jest.fn(async () => {}) };
jest.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: {
    addListener: jest.fn(async (event, cb) => {
      const entry = { event, cb };
      mockMessaging.handlers.push(entry);
      return {
        remove: () => {
          mockMessaging.handlers = mockMessaging.handlers.filter((h) => h !== entry);
          return mockMessaging.remove();
        },
      };
    }),
  },
}));

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.listener = null;
  mockMessaging.handlers = [];
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  Capacitor.isNativePlatform.mockReturnValue(true);
});

afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

test('re-syncs once per signed-in uid, and never for the local fallback', async () => {
  render(<PushSync />);
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  expect(syncPushForUser).toHaveBeenCalledTimes(1);
  expect(syncPushForUser).toHaveBeenCalledWith('creator-1');
  await act(async () => mockAuth.listener({ uid: 'creator-2' }));
  expect(syncPushForUser).toHaveBeenLastCalledWith('creator-2');
  await act(async () => mockAuth.listener(null));
  await act(async () => mockAuth.listener({ uid: 'local', isLocal: true }));
  expect(syncPushForUser).toHaveBeenCalledTimes(2);
});

test.each([
  ['the flag is off', () => { delete process.env.NEXT_PUBLIC_PUSH_ENABLED; }],
  ['on the web', () => { Capacitor.isNativePlatform.mockReturnValue(false); }],
])('does nothing at all when %s', async (_name, setup) => {
  setup();
  const { container } = render(<PushSync />);
  expect(container).toBeEmptyDOMElement();
  expect(mockAuth.listener).toBeNull();
  expect(syncPushForUser).not.toHaveBeenCalled();
  expect(ensurePushChannel).not.toHaveBeenCalled();
  await act(async () => {});
  expect(FirebaseMessaging.addListener).not.toHaveBeenCalled();
});

test('creates the Android channel once at start, before any sign-in, and not again on auth changes', async () => {
  render(<PushSync />);
  expect(ensurePushChannel).toHaveBeenCalledTimes(1);
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  await act(async () => mockAuth.listener({ uid: 'creator-2' }));
  expect(ensurePushChannel).toHaveBeenCalledTimes(1);
});

test('a failing channel never blocks the auth sync', async () => {
  ensurePushChannel.mockRejectedValueOnce(new Error('boom'));
  render(<PushSync />);
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  expect(syncPushForUser).toHaveBeenCalledWith('creator-1');
});

const TOKEN = 'fcm-token-SECRET-123';
const flush = () => act(async () => {});
const fireRefresh = () =>
  act(async () => {
    mockMessaging.handlers
      .filter((h) => h.event === 'tokenReceived')
      .forEach((h) => h.cb({ token: TOKEN }));
  });

test('adds one tokenReceived listener when native and the flag is on', async () => {
  render(<PushSync />);
  await flush();
  expect(FirebaseMessaging.addListener).toHaveBeenCalledTimes(1);
  expect(FirebaseMessaging.addListener).toHaveBeenCalledWith('tokenReceived', expect.any(Function));
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  await act(async () => mockAuth.listener({ uid: 'creator-2' }));
  expect(FirebaseMessaging.addListener).toHaveBeenCalledTimes(1);
});

test('a token refresh re-syncs the current signed-in uid, never with the token', async () => {
  render(<PushSync />);
  await flush();
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  await act(async () => mockAuth.listener({ uid: 'creator-2' }));
  syncPushForUser.mockClear();
  await fireRefresh();
  expect(syncPushForUser).toHaveBeenCalledTimes(1);
  expect(syncPushForUser).toHaveBeenCalledWith('creator-2');
});

test.each([
  ['signed out', null],
  ['on the local fallback', { uid: 'local', isLocal: true }],
])('a token refresh does nothing when %s', async (_name, user) => {
  render(<PushSync />);
  await flush();
  await act(async () => mockAuth.listener(user));
  await fireRefresh();
  expect(syncPushForUser).not.toHaveBeenCalled();
});

test('a token refresh before any auth state does nothing', async () => {
  render(<PushSync />);
  await flush();
  await fireRefresh();
  expect(syncPushForUser).not.toHaveBeenCalled();
});

test('removes the listener on unmount and does not leak across remounts', async () => {
  const first = render(<PushSync />);
  await flush();
  first.unmount();
  await flush();
  expect(mockMessaging.remove).toHaveBeenCalledTimes(1);
  expect(mockMessaging.handlers).toHaveLength(0);
  render(<PushSync />);
  await flush();
  expect(mockMessaging.handlers).toHaveLength(1);
});

test('removes the listener even when unmounted before addListener resolves', async () => {
  const { unmount } = render(<PushSync />);
  unmount();
  await flush();
  expect(mockMessaging.handlers).toHaveLength(0);
});

test('a throwing addListener is swallowed and never blocks the channel or auth sync', async () => {
  FirebaseMessaging.addListener.mockImplementationOnce(() => {
    throw new Error('boom');
  });
  render(<PushSync />);
  await flush();
  expect(ensurePushChannel).toHaveBeenCalledTimes(1);
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  expect(syncPushForUser).toHaveBeenCalledWith('creator-1');
});

test('a rejecting addListener is swallowed', async () => {
  FirebaseMessaging.addListener.mockRejectedValueOnce(new Error('boom'));
  const { unmount } = render(<PushSync />);
  await flush();
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  expect(syncPushForUser).toHaveBeenCalledWith('creator-1');
  expect(() => unmount()).not.toThrow();
});

test('a failing re-sync on refresh is swallowed', async () => {
  render(<PushSync />);
  await flush();
  await act(async () => mockAuth.listener({ uid: 'creator-1' }));
  syncPushForUser.mockRejectedValueOnce(new Error('boom'));
  await expect(fireRefresh()).resolves.toBeUndefined();
  syncPushForUser.mockImplementationOnce(() => {
    throw new Error('sync boom');
  });
  await expect(fireRefresh()).resolves.toBeUndefined();
});

test('a failing remove() on unmount is swallowed', async () => {
  mockMessaging.remove.mockRejectedValueOnce(new Error('boom'));
  const { unmount } = render(<PushSync />);
  await flush();
  expect(() => unmount()).not.toThrow();
  await flush();
});

test('never logs the token or uid', async () => {
  const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  try {
    syncPushForUser.mockRejectedValueOnce(new Error('boom'));
    render(<PushSync />);
    await flush();
    await act(async () => mockAuth.listener({ uid: 'creator-1' }));
    syncPushForUser.mockRejectedValueOnce(new Error(TOKEN));
    await fireRefresh();
    for (const spy of spies) {
      const logged = JSON.stringify(spy.mock.calls.map((c) => c.map(String)));
      expect(logged).not.toContain(TOKEN);
      expect(logged).not.toContain('creator-1');
    }
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
});
