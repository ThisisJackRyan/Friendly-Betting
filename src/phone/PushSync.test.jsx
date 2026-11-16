import { act, render } from '@testing-library/react';
import { Capacitor } from '@capacitor/core';
import PushSync from './PushSync';
import { syncPushForUser } from './pushOptIn';

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

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.listener = null;
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
});
