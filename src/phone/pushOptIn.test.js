import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Preferences } from '@capacitor/preferences';
import { NativeSettings } from 'capacitor-native-settings';
import { auth } from '../Config/firebase-config';
import { registerPushToken, unregisterPushToken } from './pushTokens';
import {
  acceptPushOptIn,
  checkFirstBet,
  declinePushOptIn,
  decideOptIn,
  firstBetCheckPossible,
  noteOptInShown,
  openPushSettings,
  readPushSettings,
  resetPushOptInForTests,
  resyncAfterResume,
  setPushOn,
  shouldOfferPushOptIn,
  syncPushForUser,
  unregisterBeforeSignOut,
} from './pushOptIn';

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => true), getPlatform: jest.fn(() => 'ios') },
}));
jest.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: {
    requestPermissions: jest.fn(async () => ({ receive: 'granted' })),
    checkPermissions: jest.fn(async () => ({ receive: 'prompt' })),
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
}));
jest.mock('./pushTokens', () => ({
  pushAvailable: jest.fn(),
  firebaseUser: jest.fn(),
  registerPushToken: jest.fn(async () => ({ ok: true })),
  unregisterPushToken: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../Config/firebase-config', () => ({ db: {}, auth: { currentUser: null } }));

const pushTokens = jest.requireMock('./pushTokens');
const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const UID = 'creator-1';

function pushOn() {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  pushTokens.pushAvailable.mockImplementation(
    () => process.env.NEXT_PUBLIC_PUSH_ENABLED === '1' && Capacitor.isNativePlatform(),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  Preferences.store.clear();
  resetPushOptInForTests();
  Capacitor.isNativePlatform.mockReturnValue(true);
  pushOn();
  auth.currentUser = { uid: UID, getIdToken: jest.fn() };
  pushTokens.firebaseUser.mockImplementation(async () => auth.currentUser);
  FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  FirebaseMessaging.requestPermissions.mockResolvedValue({ receive: 'granted' });
});

afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

function expectNoPluginCalls() {
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(Preferences.get).not.toHaveBeenCalled();
  expect(Preferences.set).not.toHaveBeenCalled();
  expect(registerPushToken).not.toHaveBeenCalled();
  expect(unregisterPushToken).not.toHaveBeenCalled();
}

describe('decideOptIn (the whole rule, from gathered facts)', () => {
  const yes = {
    enabled: true, native: true, firstBet: true, hasUser: true, askedThisSession: false, persisted: '', permission: 'prompt',
  };

  test('shows after a first bet, native, flag on, permission still promptable, not yet decided', () => {
    expect(decideOptIn(yes)).toBe(true);
    expect(decideOptIn({ ...yes, permission: 'prompt-with-rationale' })).toBe(true);
  });

  test.each([
    ['the flag is off', { enabled: false }],
    ['on the web', { native: false }],
    ['not a first bet (second or later create, launch, invite or vote link)', { firstBet: false }],
    ['no real Firebase user', { hasUser: false }],
    ['already asked or declined this session', { askedThisSession: true }],
    ['a persisted grant', { persisted: 'granted' }],
    ['a persisted denial', { persisted: 'denied' }],
    ['the OS already granted', { permission: 'granted' }],
    ['the OS denied', { permission: 'denied' }],
    ['the permission could not be read', { permission: '' }],
  ])('does not show when %s', (_name, change) => {
    expect(decideOptIn({ ...yes, ...change })).toBe(false);
  });
});

describe('shouldOfferPushOptIn', () => {
  test('shows after a first bet with everything in place', async () => {
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(true);
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  });

  test('not a first bet (launch, a later create, a vote or invite link): no plugin calls', async () => {
    expect(await shouldOfferPushOptIn({ firstBet: false })).toBe(false);
    expect(await shouldOfferPushOptIn({})).toBe(false);
    expectNoPluginCalls();
  });

  test.each([undefined, '', '0', 'true'])('flag %p: no sheet, no plugin calls', async (value) => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
    else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
    expectNoPluginCalls();
  });

  test('on the web: no sheet, no plugin calls', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false);
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
    expectNoPluginCalls();
  });

  test('with no real Firebase user (none, or the local fallback): no sheet', async () => {
    pushTokens.firebaseUser.mockResolvedValue(null);
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
    expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  });

  test.each(['granted', 'denied'])('a persisted %s means the sheet never shows again', async (value) => {
    Preferences.store.set(`fb.pushAsked.${UID}`, value);
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
    expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  });

  test('another uid’s decision does not carry over', async () => {
    Preferences.store.set('fb.pushAsked.someone-else', 'denied');
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(true);
  });

  test.each(['granted', 'denied'])('the OS already says %s: no sheet', async (receive) => {
    FirebaseMessaging.checkPermissions.mockResolvedValue({ receive });
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
  });

  test('a failed permission check fails closed', async () => {
    FirebaseMessaging.checkPermissions.mockRejectedValue(new Error('nope'));
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
  });

  test('once shown, not again this session', async () => {
    noteOptInShown();
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
    expect(firstBetCheckPossible()).toBe(false);
    expectNoPluginCalls();
  });
});

describe('the first-bet lookup', () => {
  test('true only when the lookup says the bet is the creator’s only one', async () => {
    const lookup = jest.fn(async () => true);
    expect(await checkFirstBet(lookup, UID, 'abc123')).toBe(true);
    expect(lookup).toHaveBeenCalledWith(UID, 'abc123');
    expect(await checkFirstBet(async () => false, UID, 'abc123')).toBe(false);
  });

  test('fails closed on an error or a slow answer', async () => {
    expect(await checkFirstBet(async () => { throw new Error('denied'); }, UID, 'abc123')).toBe(false);
    expect(await checkFirstBet(() => new Promise(() => {}), UID, 'abc123', 10)).toBe(false);
  });

  test('skips the lookup with push off or after this session already asked', async () => {
    const lookup = jest.fn(async () => true);
    delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
    expect(firstBetCheckPossible()).toBe(false);
    expect(await checkFirstBet(lookup, UID, 'abc123')).toBe(false);
    pushOn();
    declinePushOptIn();
    expect(await checkFirstBet(lookup, UID, 'abc123')).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('the sheet’s answers', () => {
  test('"Not now" asks nothing, saves nothing, and suppresses the rest of the session', async () => {
    declinePushOptIn();
    expectNoPluginCalls();
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
    // In memory only: a new session (here, a reset) can ask again.
    resetPushOptInForTests();
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(true);
  });

  test('"Turn on notifications" asks the OS, then on a grant saves it and registers', async () => {
    expect(await acceptPushOptIn()).toBe('granted');
    expect(FirebaseMessaging.requestPermissions).toHaveBeenCalledTimes(1);
    expect(FirebaseMessaging.requestPermissions.mock.invocationCallOrder[0])
      .toBeLessThan(registerPushToken.mock.invocationCallOrder[0]);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(Preferences.store.get(`fb.pushAsked.${UID}`)).toBe('granted');
    expect(Preferences.store.get(`fb.pushPref.${UID}`)).toBe('on');
    resetPushOptInForTests();
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
  });

  test('a system denial saves denied, registers nothing, and the sheet never shows again', async () => {
    FirebaseMessaging.requestPermissions.mockResolvedValue({ receive: 'denied' });
    expect(await acceptPushOptIn()).toBe('denied');
    expect(registerPushToken).not.toHaveBeenCalled();
    expect(Preferences.store.get(`fb.pushAsked.${UID}`)).toBe('denied');
    expect(Preferences.store.has(`fb.pushPref.${UID}`)).toBe(false);
    resetPushOptInForTests();
    expect(await shouldOfferPushOptIn({ firstBet: true })).toBe(false);
  });

  test('a failed request fails soft: no throw, nothing saved, no register', async () => {
    FirebaseMessaging.requestPermissions.mockRejectedValue(new Error('boom'));
    await expect(acceptPushOptIn()).resolves.toBe('');
    expect(Preferences.set).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  test('a Preferences failure does not stop the register', async () => {
    Preferences.set.mockRejectedValueOnce(new Error('disk'));
    expect(await acceptPushOptIn()).toBe('granted');
    expect(registerPushToken).toHaveBeenCalledTimes(1);
  });
});

describe('the Notifications row', () => {
  test('reads the OS permission and this uid’s in-app choice', async () => {
    FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'granted' });
    expect(await readPushSettings(UID)).toEqual({ permission: 'granted', on: false });
    Preferences.store.set(`fb.pushPref.${UID}`, 'on');
    expect(await readPushSettings(UID)).toEqual({ permission: 'granted', on: true });
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  });

  test('granted: on registers, off unregisters, and the choice is saved', async () => {
    FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'granted' });
    expect(await setPushOn(UID, true)).toEqual({ permission: 'granted', on: true });
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(Preferences.store.get(`fb.pushPref.${UID}`)).toBe('on');
    expect(await setPushOn(UID, false)).toEqual({ permission: 'granted', on: false });
    expect(unregisterPushToken).toHaveBeenCalledTimes(1);
    expect(Preferences.store.get(`fb.pushPref.${UID}`)).toBe('off');
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  });

  test('denied: the toggle never asks the OS and never registers', async () => {
    FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'denied' });
    expect(await setPushOn(UID, true)).toEqual({ permission: 'denied', on: false });
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  test('still promptable: the toggle is the opt-in path, so it asks, then registers on a grant', async () => {
    expect(await setPushOn(UID, true)).toEqual({ permission: 'granted', on: true });
    expect(FirebaseMessaging.requestPermissions).toHaveBeenCalledTimes(1);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
  });

  test('still promptable, then denied at the OS prompt: off, saved as denied', async () => {
    FirebaseMessaging.requestPermissions.mockResolvedValue({ receive: 'denied' });
    expect(await setPushOn(UID, true)).toEqual({ permission: 'denied', on: false });
    expect(Preferences.store.get(`fb.pushAsked.${UID}`)).toBe('denied');
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  test('back from Settings with a grant: registers when the choice is on or the user went there to turn it on', async () => {
    FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'granted' });
    expect(await resyncAfterResume(UID)).toEqual({ permission: 'granted', on: false });
    expect(registerPushToken).not.toHaveBeenCalled();
    expect(await resyncAfterResume(UID, { wantOn: true })).toEqual({ permission: 'granted', on: true });
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(Preferences.store.get(`fb.pushPref.${UID}`)).toBe('on');
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  });

  test('back from Settings still denied: nothing registers, nothing asks', async () => {
    FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'denied' });
    Preferences.store.set(`fb.pushPref.${UID}`, 'on');
    expect(await resyncAfterResume(UID, { wantOn: true })).toEqual({ permission: 'denied', on: true });
    expect(registerPushToken).not.toHaveBeenCalled();
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  });

  test('Open Settings opens Android app notification settings or the iOS app page', async () => {
    expect(await openPushSettings()).toBe(true);
    expect(NativeSettings.open).toHaveBeenCalledWith({ optionAndroid: 'app_notification', optionIOS: 'app' });
    NativeSettings.open.mockRejectedValueOnce(new Error('no'));
    expect(await openPushSettings()).toBe(false);
  });
});

describe('auth changes and log out', () => {
  test('re-registers for the signed-in user only when their choice is on and the OS allows it', async () => {
    FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'granted' });
    expect(await syncPushForUser(UID)).toBe(false);
    Preferences.store.set(`fb.pushPref.${UID}`, 'on');
    expect(await syncPushForUser(UID)).toBe(true);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    Preferences.store.set(`fb.pushPref.${UID}`, 'off');
    expect(await syncPushForUser(UID)).toBe(false);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  });

  test('does not register when the OS permission is not granted, and never asks', async () => {
    Preferences.store.set(`fb.pushPref.${UID}`, 'on');
    expect(await syncPushForUser(UID)).toBe(false);
    expect(registerPushToken).not.toHaveBeenCalled();
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  });

  test('does not register a uid that is no longer the signed-in one', async () => {
    Preferences.store.set('fb.pushPref.old-uid', 'on');
    FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'granted' });
    expect(await syncPushForUser('old-uid')).toBe(false);
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  test('log out unregisters this install for a user who had it on, and keeps the choice', async () => {
    Preferences.store.set(`fb.pushPref.${UID}`, 'on');
    await unregisterBeforeSignOut();
    expect(unregisterPushToken).toHaveBeenCalledTimes(1);
    expect(Preferences.store.get(`fb.pushPref.${UID}`)).toBe('on');
  });

  test('log out skips unregister for a user who never turned it on', async () => {
    await unregisterBeforeSignOut();
    expect(unregisterPushToken).not.toHaveBeenCalled();
  });

  test('log out never waits forever and never throws', async () => {
    Preferences.store.set(`fb.pushPref.${UID}`, 'on');
    unregisterPushToken.mockImplementationOnce(() => new Promise(() => {}));
    await expect(unregisterBeforeSignOut(10)).resolves.toBeUndefined();
    unregisterPushToken.mockRejectedValueOnce(new Error('offline'));
    await expect(unregisterBeforeSignOut(10)).resolves.toBeUndefined();
  });
});

test('never logs the uid', async () => {
  const spies = ['log', 'info', 'warn', 'error'].map((name) => jest.spyOn(console, name).mockImplementation(() => {}));
  FirebaseMessaging.requestPermissions.mockRejectedValueOnce(new Error('boom'));
  await acceptPushOptIn();
  await setPushOn(UID, true);
  await unregisterBeforeSignOut();
  spies.forEach((spy) => {
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
