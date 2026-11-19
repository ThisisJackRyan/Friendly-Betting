import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Preferences } from '@capacitor/preferences';
import { auth } from '../Config/firebase-config';
import { NativeSettings } from 'capacitor-native-settings';
import {
  acceptPushOptIn,
  checkFirstBet,
  checkPushPermission,
  declinePushOptIn,
  firstBetCheckPossible,
  openPushSettings,
  readPushSettings,
  resetPushOptInForTests,
  resyncAfterResume,
  setPushOn,
  shouldOfferPushOptIn,
  syncPushForUser,
  unregisterBeforeSignOut,
} from './pushOptIn';import {
  getPushDeviceId,
  getPushToken,
  registerPushToken,
  resetPushDeviceIdForTests,
  unregisterPushToken,
} from './pushTokens';

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => false), getPlatform: jest.fn(() => 'web') },
}));
jest.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: {
    getToken: jest.fn(async () => ({ token: 'fcm-secret-token' })),
    requestPermissions: jest.fn(),
    checkPermissions: jest.fn(),
    deleteToken: jest.fn(),
  },
}));
jest.mock('@capacitor/preferences', () => {
  const store = new Map();
  return {
    Preferences: {
      store,
      get: jest.fn(async ({ key }) => ({ value: store.has(key) ? store.get(key) : null })),
      set: jest.fn(async ({ key, value }) => {
        store.set(key, value);
      }),
    },
  };
});
jest.mock('capacitor-native-settings', () => ({
  NativeSettings: { open: jest.fn(async () => ({ status: true })) },
  AndroidSettings: { AppNotification: 'app_notification' },
  IOSSettings: { App: 'app' },
}));jest.mock('../Config/firebase-config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('../platform/runtime', () => ({
  isNativeApp: () => jest.requireMock('@capacitor/core').Capacitor.isNativePlatform(),
  PROD_ORIGIN: 'https://www.friendly-bets.com',
}));

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const user = () => ({ uid: 'anon-1', isAnonymous: true, getIdToken: jest.fn(async () => 'id-token-1') });

function native(platform = 'ios') {
  Capacitor.isNativePlatform.mockReturnValue(true);
  Capacitor.getPlatform.mockReturnValue(platform);
}

beforeEach(() => {
  jest.clearAllMocks();
  Preferences.store.clear();
  resetPushDeviceIdForTests();
  resetPushOptInForTests();  Capacitor.isNativePlatform.mockReturnValue(false);
  Capacitor.getPlatform.mockReturnValue('web');
  auth.currentUser = user();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  if (!global.crypto.randomUUID) global.crypto.randomUUID = () => '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';
});

afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
  delete global.fetch;
});

function expectNothingTouched() {
  expect(FirebaseMessaging.getToken).not.toHaveBeenCalled();
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  expect(FirebaseMessaging.deleteToken).not.toHaveBeenCalled();
  expect(Preferences.get).not.toHaveBeenCalled();
  expect(Preferences.set).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(NativeSettings.open).not.toHaveBeenCalled();
}

// Every entry point of the opt-in module (pushOptIn.js), with push off.
async function runOptIn() {
  const lookup = jest.fn(async () => true);
  const out = {
    possible: firstBetCheckPossible(),
    first: await checkFirstBet(lookup, 'creator-1', 'abc123'),
    offer: await shouldOfferPushOptIn({ firstBet: true }),
    permission: await checkPushPermission(),
    accept: await acceptPushOptIn(),
    settings: await readPushSettings('creator-1'),
    on: await setPushOn('creator-1', true),
    off: await setPushOn('creator-1', false),
    resume: await resyncAfterResume('creator-1', { wantOn: true }),
    sync: await syncPushForUser('creator-1'),
    signOut: await unregisterBeforeSignOut(),
    open: await openPushSettings(),
  };
  declinePushOptIn();
  expect(lookup).not.toHaveBeenCalled();
  return out;
}

const OPT_IN_OFF = {
  possible: false,
  first: false,
  offer: false,
  permission: '',
  accept: '',
  settings: null,
  on: null,
  off: null,
  resume: null,
  sync: false,
  signOut: undefined,
  open: false,
};
async function runAll() {
  return {
    deviceId: await getPushDeviceId(),
    token: await getPushToken(),
    register: await registerPushToken(),
    unregister: await unregisterPushToken(),
  };
}

test.each([undefined, '', '0', 'true'])('flag %p: a native app does nothing at all', async (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  native();
  expect(await runAll()).toEqual({
    deviceId: '',
    token: '',
    register: { ok: false, skipped: 'disabled' },
    unregister: { ok: false, skipped: 'disabled' },
  });
  expectNothingTouched();
  expect(auth.currentUser.getIdToken).not.toHaveBeenCalled();
});

test.each([undefined, '', '0', 'true'])('flag %p: the opt-in module does nothing at all in the native app', async (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  native();
  expect(await runOptIn()).toEqual(OPT_IN_OFF);
  expectNothingTouched();
  expect(auth.currentUser.getIdToken).not.toHaveBeenCalled();
});

test('on the web the opt-in module does nothing, even with the flag on', async () => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  expect(await runOptIn()).toEqual(OPT_IN_OFF);
  expectNothingTouched();
});
test('on the web the flag changes nothing: no plugin calls, no fetch', async () => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  expect(await runAll()).toEqual({
    deviceId: '',
    token: '',
    register: { ok: false, skipped: 'disabled' },
    unregister: { ok: false, skipped: 'disabled' },
  });
  expectNothingTouched();
});

test.each([
  ['no Firebase user', () => null],
  ['the local fallback user', () => ({ uid: 'local-friend', isLocal: true })],
])('with %s, register and unregister skip without plugin calls or fetch', async (_name, make) => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  native();
  auth.currentUser = make();
  expect(await registerPushToken()).toEqual({ ok: false, skipped: 'no-user' });
  expect(await unregisterPushToken()).toEqual({ ok: false, skipped: 'no-user' });
  expectNothingTouched();
});

test('with the flag on in the native app, register posts the token for this install', async () => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  native('android');
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const result = await registerPushToken();
  expect(result).toEqual({ ok: true });
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  const deviceId = Preferences.store.get('fb.pushDeviceId');
  expect(deviceId).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith('https://www.friendly-bets.com/api/push/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-token-1' },
    body: JSON.stringify({ deviceId, token: 'fcm-secret-token', platform: 'android' }),
  });
  expect(JSON.stringify(result)).not.toMatch(/fcm-secret-token|anon-1/);
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});

test('the device id is stable across calls and reloads', async () => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  native();
  const first = await getPushDeviceId();
  expect(await getPushDeviceId()).toBe(first);
  resetPushDeviceIdForTests();
  expect(await getPushDeviceId()).toBe(first);
  expect(Preferences.set).toHaveBeenCalledTimes(1);
});

test('unregister deletes this install only, by device id', async () => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  native();
  Preferences.store.set('fb.pushDeviceId', 'device-abc-123');
  expect(await unregisterPushToken()).toEqual({ ok: true });
  expect(FirebaseMessaging.getToken).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith('https://www.friendly-bets.com/api/push/tokens', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-token-1' },
    body: JSON.stringify({ deviceId: 'device-abc-123' }),
  });
});

test('failures resolve with an error code and never throw', async () => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  native();
  fetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: 'rate-limited' }) });
  expect(await registerPushToken()).toEqual({ ok: false, error: 'rate-limited' });
  fetch.mockRejectedValueOnce(new Error('offline'));
  expect(await registerPushToken()).toEqual({ ok: false, error: 'network' });
  FirebaseMessaging.getToken.mockRejectedValueOnce(new Error('no APNs fcm-secret-token'));
  const result = await registerPushToken();
  expect(result).toEqual({ ok: false, error: 'register-failed' });
  FirebaseMessaging.getToken.mockResolvedValueOnce({ token: '' });
  expect(await registerPushToken()).toEqual({ ok: false, error: 'no-token' });
});

function appSources() {  const fs = require('fs');
  const path = require('path');
  const repo = path.join(__dirname, '..', '..');
  const files = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'e2e', 'server'].includes(entry.name)) walk(full);
      } else if (/\.(jsx?|mjs)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) {
        files.push(full);
      }
    });
  };
  ['src', 'mobile'].forEach((dir) => walk(path.join(repo, dir)));
  return files.map((file) => ({ file: path.relative(repo, file), text: fs.readFileSync(file, 'utf8') }));
}

const hitsFor = (pattern) => appSources().filter(({ text }) => pattern.test(text)).map(({ file }) => file).sort();

test('only the opt-in modules and the channel helper reach the push plumbing, the messaging plugin or the settings plugin', () => {
  expect(hitsFor(/pushTokens['"]|@capacitor-firebase\/messaging|capacitor-native-settings/)).toEqual([
    'src/phone/PushSettingsRow.jsx',
    'src/phone/PushSync.jsx',
    'src/phone/pushChannel.js',
    'src/phone/pushOptIn.js',
    'src/phone/pushTokens.js',
  ]);
});

test('the channel helper is only used by the app-start sync', () => {
  expect(hitsFor(/from '\.\/pushChannel'/)).toEqual(['src/phone/PushSync.jsx']);
});

test('the opt-in module is only used by the first-bet path, the row, the auth sync and log out', () => {
  expect(hitsFor(/from '\.\/pushOptIn'/)).toEqual([
    'src/phone/CreateForm.jsx',
    'src/phone/PushOptInSheet.jsx',
    'src/phone/PushSettingsRow.jsx',
    'src/phone/PushSync.jsx',
    'src/phone/TallyScreen.jsx',
    'src/phone/creatorAuth.js',
  ]);
  // Never the vote page.
  const vote = appSources().find(({ file }) => file === 'src/phone/VoteScreen.jsx');
  expect(vote.text).not.toMatch(/push/i);});
