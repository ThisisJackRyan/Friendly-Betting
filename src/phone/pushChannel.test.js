import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Preferences } from '@capacitor/preferences';
import { ensurePushChannel } from './pushChannel';

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => true), getPlatform: jest.fn(() => 'android') },
}));
jest.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: {
    createChannel: jest.fn(async () => {}),
    requestPermissions: jest.fn(),
    checkPermissions: jest.fn(),
    getToken: jest.fn(),
  },
}));
jest.mock('@capacitor/preferences', () => ({ Preferences: { get: jest.fn(), set: jest.fn() } }));
jest.mock('../Config/firebase-config', () => ({ auth: { currentUser: null }, db: {} }));

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  Capacitor.isNativePlatform.mockReturnValue(true);
  Capacitor.getPlatform.mockReturnValue('android');
});

afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

function expectNoOtherPluginCalls() {
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  expect(FirebaseMessaging.getToken).not.toHaveBeenCalled();
  expect(Preferences.get).not.toHaveBeenCalled();
  expect(Preferences.set).not.toHaveBeenCalled();
}

test('Android with push on: creates the bet_updates channel with the UX name and description', async () => {
  expect(await ensurePushChannel()).toBe(true);
  expect(FirebaseMessaging.createChannel).toHaveBeenCalledTimes(1);
  expect(FirebaseMessaging.createChannel).toHaveBeenCalledWith({
    id: 'bet_updates',
    name: 'Bet updates',
    description: 'Picks, results, and closing reminders on your bets.',
    importance: 3,
  });
  expectNoOtherPluginCalls();
});

test.each([
  ['the flag is off', () => { delete process.env.NEXT_PUBLIC_PUSH_ENABLED; }],
  ['the flag is not exactly 1', () => { process.env.NEXT_PUBLIC_PUSH_ENABLED = 'true'; }],
  ['on the web', () => { Capacitor.isNativePlatform.mockReturnValue(false); Capacitor.getPlatform.mockReturnValue('web'); }],
  ['on iOS', () => { Capacitor.getPlatform.mockReturnValue('ios'); }],
])('does not create a channel when %s', async (_name, setup) => {
  setup();
  expect(await ensurePushChannel()).toBe(false);
  expect(FirebaseMessaging.createChannel).not.toHaveBeenCalled();
  expectNoOtherPluginCalls();
});

test('a createChannel error is swallowed', async () => {
  FirebaseMessaging.createChannel.mockRejectedValueOnce(new Error('Not available on this SDK'));
  await expect(ensurePushChannel()).resolves.toBe(false);
});

test('a platform check that throws is swallowed too', async () => {
  Capacitor.getPlatform.mockImplementationOnce(() => { throw new Error('bridge gone'); });
  await expect(ensurePushChannel()).resolves.toBe(false);
});
