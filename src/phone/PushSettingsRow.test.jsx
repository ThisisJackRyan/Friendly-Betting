import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Preferences } from '@capacitor/preferences';
import { NativeSettings } from 'capacitor-native-settings';
import PushSettingsRow from './PushSettingsRow';
import { registerPushToken, unregisterPushToken } from './pushTokens';
import { resetPushOptInForTests } from './pushOptIn';

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => true), getPlatform: jest.fn(() => 'ios') },
}));
jest.mock('@capacitor/app', () => {
  const listeners = {};
  return {
    App: {
      listeners,
      addListener: jest.fn(async (eventName, handler) => {
        listeners[eventName] = handler;
        return { remove: jest.fn() };
      }),
    },
  };
});
jest.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: {
    requestPermissions: jest.fn(async () => ({ receive: 'granted' })),
    checkPermissions: jest.fn(async () => ({ receive: 'granted' })),
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
jest.mock('../Config/firebase-config', () => ({
  db: {},
  auth: { currentUser: { uid: 'creator-1', getIdToken: async () => 'id-token' } },
}));
jest.mock('./pushTokens', () => ({
  ...jest.requireActual('./pushTokens'),
  registerPushToken: jest.fn(async () => ({ ok: true })),
  unregisterPushToken: jest.fn(async () => ({ ok: true })),
}));

const UID = 'creator-1';
const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;

beforeEach(() => {
  jest.clearAllMocks();
  Preferences.store.clear();
  resetPushOptInForTests();
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  Capacitor.isNativePlatform.mockReturnValue(true);
  FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'granted' });
  FirebaseMessaging.requestPermissions.mockResolvedValue({ receive: 'granted' });
  delete App.listeners.resume;
});

afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

async function settle() {
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {});
  }
}

async function renderRow(uid = UID) {
  const view = render(<PushSettingsRow uid={uid} />);
  await settle();
  return view;
}

const toggle = () => screen.getByRole('switch', { name: 'Notifications' });

function expectNoPluginCalls() {
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(Preferences.get).not.toHaveBeenCalled();
  expect(Preferences.set).not.toHaveBeenCalled();
  expect(App.addListener).not.toHaveBeenCalled();
  expect(NativeSettings.open).not.toHaveBeenCalled();
  expect(registerPushToken).not.toHaveBeenCalled();
  expect(unregisterPushToken).not.toHaveBeenCalled();
}

test.each([
  ['the flag is off', () => { delete process.env.NEXT_PUBLIC_PUSH_ENABLED; }],
  ['the flag is not exactly 1', () => { process.env.NEXT_PUBLIC_PUSH_ENABLED = '0'; }],
  ['on the web', () => { Capacitor.isNativePlatform.mockReturnValue(false); }],
  ['there is no signed-in creator', () => {}],
])('renders nothing and calls no plugin when %s', async (name, setup) => {
  setup();
  const { container } = await renderRow(name.includes('creator') ? '' : UID);
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  expectNoPluginCalls();
});

test('granted: label, helper, and a toggle that registers and unregisters', async () => {
  await renderRow();
  expect(screen.getByText('Notifications')).toBeInTheDocument();
  expect(screen.getByText('Picks, results, and closing reminders.')).toBeInTheDocument();
  expect(toggle()).toHaveAccessibleDescription('Picks, results, and closing reminders.');
  expect(screen.queryByRole('button', { name: 'Open Settings' })).not.toBeInTheDocument();
  expect(toggle()).toHaveAttribute('aria-checked', 'false');

  await userEvent.click(toggle());
  await settle();
  expect(registerPushToken).toHaveBeenCalledTimes(1);
  expect(toggle()).toHaveAttribute('aria-checked', 'true');
  expect(Preferences.store.get(`fb.pushPref.${UID}`)).toBe('on');

  await userEvent.click(toggle());
  await settle();
  expect(unregisterPushToken).toHaveBeenCalledTimes(1);
  expect(toggle()).toHaveAttribute('aria-checked', 'false');
  expect(Preferences.store.get(`fb.pushPref.${UID}`)).toBe('off');
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
});

test('granted with the choice saved on: shows on, and loading never registers or asks', async () => {
  Preferences.store.set(`fb.pushPref.${UID}`, 'on');
  await renderRow();
  expect(toggle()).toHaveAttribute('aria-checked', 'true');
  expect(registerPushToken).not.toHaveBeenCalled();
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
});

test('OS permission off: the helper and a muted Open Settings link, and the toggle cannot turn it on', async () => {
  FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'denied' });
  Preferences.store.set(`fb.pushPref.${UID}`, 'on');
  await renderRow();
  expect(screen.getByText('Turned off in your phone’s settings.')).toBeInTheDocument();
  expect(screen.queryByText('Picks, results, and closing reminders.')).not.toBeInTheDocument();
  const link = screen.getByRole('button', { name: 'Open Settings' });
  expect(link).toHaveClass('push-row-settings');
  expect(toggle()).toHaveAttribute('aria-checked', 'false');
  expect(toggle()).toBeDisabled();
  await userEvent.click(toggle());
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(registerPushToken).not.toHaveBeenCalled();

  await userEvent.click(link);
  expect(NativeSettings.open).toHaveBeenCalledWith({ optionAndroid: 'app_notification', optionIOS: 'app' });
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
});

test('back from Settings with a grant: the row updates and registers', async () => {
  FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'denied' });
  await renderRow();
  await userEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
  FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'granted' });
  await act(async () => App.listeners.resume());
  await settle();
  expect(screen.getByText('Picks, results, and closing reminders.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Settings' })).not.toBeInTheDocument();
  expect(toggle()).toHaveAttribute('aria-checked', 'true');
  expect(registerPushToken).toHaveBeenCalledTimes(1);
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
});

test('a resume with no change and the choice off registers nothing', async () => {
  await renderRow();
  await act(async () => App.listeners.resume());
  await settle();
  expect(registerPushToken).not.toHaveBeenCalled();
  expect(toggle()).toHaveAttribute('aria-checked', 'false');
});

test('still promptable (never saw the sheet): the toggle asks from the tap, then registers', async () => {
  FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  await renderRow();
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(screen.getByText('Picks, results, and closing reminders.')).toBeInTheDocument();
  expect(toggle()).toBeEnabled();
  await userEvent.click(toggle());
  await settle();
  expect(FirebaseMessaging.requestPermissions).toHaveBeenCalledTimes(1);
  expect(registerPushToken).toHaveBeenCalledTimes(1);
  expect(toggle()).toHaveAttribute('aria-checked', 'true');
});

test('still promptable, then denied at the prompt: the off state, nothing registered', async () => {
  FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  FirebaseMessaging.requestPermissions.mockResolvedValue({ receive: 'denied' });
  await renderRow();
  await userEvent.click(toggle());
  await settle();
  expect(registerPushToken).not.toHaveBeenCalled();
  expect(screen.getByText('Turned off in your phone’s settings.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open Settings' })).toBeInTheDocument();
});
