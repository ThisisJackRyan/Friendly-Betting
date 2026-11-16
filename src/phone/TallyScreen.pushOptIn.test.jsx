import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Preferences } from '@capacitor/preferences';
import TallyScreen from './TallyScreen';
import { openShareSheet } from './share';
import { markFreshBet } from './freshBet';
import { registerPushToken } from './pushTokens';
import { resetPushOptInForTests } from './pushOptIn';
import { PUSH_COPY } from './pushCopy';

jest.mock('next/navigation');
jest.mock('next/link');

const mockAuth = { currentUser: null, listener: null };

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listener = onChange;
    return () => {
      mockAuth.listener = null;
    };
  }),
  signInAnonymously: jest.fn(async () => ({ user: mockAuth.currentUser })),
}));

jest.mock('../Config/firebase-config', () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
}));

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
jest.mock('./pushTokens', () => ({
  ...jest.requireActual('./pushTokens'),
  registerPushToken: jest.fn(async () => ({ ok: true })),
  unregisterPushToken: jest.fn(async () => ({ ok: true })),
}));

const openBet = {
  id: 'abc123',
  code: 'abc123',
  schemaVersion: 2,
  type: 'money-line',
  question: 'Who is late',
  stake: '$5',
  createdByName: 'Maya',
  createdByID: 'creator-1',
  status: 'open',
  winnerId: null,
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  votes: [],
};

const mockBet = { current: openBet };

jest.mock('./api', () => ({
  subscribeBet: jest.fn((_code, onChange) => {
    onChange(mockBet.current);
    return () => {};
  }),
  settleBet: jest.fn(),
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
  hasShareSheet: jest.fn(() => true),
  openShareSheet: jest.fn(async () => 'aborted'),
}));

const creator = {
  uid: 'creator-1',
  phoneNumber: '+15551234567',
  providerData: [{ providerId: 'phone' }],
  getIdToken: jest.fn(async () => 'id-token'),
};
const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;

beforeEach(() => {
  mockBet.current = openBet;
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  Capacitor.isNativePlatform.mockReturnValue(true);
  FirebaseMessaging.checkPermissions.mockClear();
  FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  FirebaseMessaging.requestPermissions.mockClear();
  FirebaseMessaging.requestPermissions.mockResolvedValue({ receive: 'granted' });
  Preferences.get.mockClear();
  Preferences.set.mockClear();
  Preferences.store.clear();
  registerPushToken.mockClear();
  openShareSheet.mockClear();
  openShareSheet.mockResolvedValue('aborted');
  resetPushOptInForTests();
  mockAuth.currentUser = creator;
  const { navigation } = jest.requireMock('next/navigation');
  navigation.pathname = '/t/abc123';
  navigation.params = { code: 'abc123' };
  window.sessionStorage.clear();
});

afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

async function renderTally({ strict = false } = {}) {
  jest.useFakeTimers();
  try {
    const tree = (
      <div className="phone">
        <TallyScreen />
      </div>
    );
    render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    act(() => {
      jest.advanceTimersByTime(450);
    });
  } finally {
    jest.useRealTimers();
  }
  await act(async () => {
    mockAuth.listener?.(creator);
  });
  // Let the opt-in check (dynamic imports, Preferences, permission) settle.
  await settle();
}

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {});
  }
}

const sheet = () => screen.queryByRole('dialog', { name: PUSH_COPY.sheetTitle });

function expectNoPushCalls() {
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(Preferences.get).not.toHaveBeenCalled();
  expect(Preferences.set).not.toHaveBeenCalled();
  expect(registerPushToken).not.toHaveBeenCalled();
}

test('after the first bet: the sheet shows first, and the share sheet waits until "Not now"', async () => {
  markFreshBet('abc123', { first: true });
  await renderTally();
  expect(sheet()).toBeInTheDocument();
  expect(screen.getByText(PUSH_COPY.sheetBody)).toBeInTheDocument();
  expect(openShareSheet).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: PUSH_COPY.notNow }));
  expect(sheet()).not.toBeInTheDocument();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(registerPushToken).not.toHaveBeenCalled();
  expect(Preferences.set).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem('friendly.freshBetFirst')).toBeNull();

  // The same first-bet arrival again this session (a remount): no sheet.
  cleanup();
  markFreshBet('abc123', { first: true });
  await renderTally();
  expect(sheet()).not.toBeInTheDocument();
  expect(openShareSheet).toHaveBeenCalledTimes(2);
});

test('under Strict Mode (both apps use it) the sheet still shows, and the share still follows', async () => {
  markFreshBet('abc123', { first: true });
  await renderTally({ strict: true });
  expect(sheet()).toBeInTheDocument();
  expect(openShareSheet).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: PUSH_COPY.notNow }));
  expect(openShareSheet).toHaveBeenCalledTimes(1);
});

test('"Turn on notifications" asks, registers on a grant, then the share sheet opens', async () => {
  markFreshBet('abc123', { first: true });
  await renderTally();
  await userEvent.click(screen.getByRole('button', { name: PUSH_COPY.turnOn }));
  await settle();
  expect(FirebaseMessaging.requestPermissions).toHaveBeenCalledTimes(1);
  expect(registerPushToken).toHaveBeenCalledTimes(1);
  expect(Preferences.store.get('fb.pushAsked.creator-1')).toBe('granted');
  expect(sheet()).not.toBeInTheDocument();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
});

test('a system denial closes the sheet with no extra dialog, saves it, and the share follows', async () => {
  FirebaseMessaging.requestPermissions.mockResolvedValue({ receive: 'denied' });
  markFreshBet('abc123', { first: true });
  await renderTally();
  await userEvent.click(screen.getByRole('button', { name: PUSH_COPY.turnOn }));
  await settle();
  expect(registerPushToken).not.toHaveBeenCalled();
  expect(Preferences.store.get('fb.pushAsked.creator-1')).toBe('denied');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
});

test('a failed request does not crash or get stuck: the sheet goes and the share follows', async () => {
  FirebaseMessaging.requestPermissions.mockRejectedValue(new Error('boom'));
  markFreshBet('abc123', { first: true });
  await renderTally();
  await userEvent.click(screen.getByRole('button', { name: PUSH_COPY.turnOn }));
  await settle();
  expect(sheet()).not.toBeInTheDocument();
  expect(Preferences.set).not.toHaveBeenCalled();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
});

test('Escape is a soft decline', async () => {
  markFreshBet('abc123', { first: true });
  await renderTally();
  await userEvent.keyboard('{Escape}');
  expect(sheet()).not.toBeInTheDocument();
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
});

test('a second or later create: no sheet, no push calls, and the share opens as today', async () => {
  markFreshBet('abc123');
  await renderTally();
  expect(sheet()).not.toBeInTheDocument();
  expectNoPushCalls();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
});

test('a tally that is not a fresh arrival (launch, a link, a reload): no sheet, no push calls', async () => {
  await renderTally();
  expect(sheet()).not.toBeInTheDocument();
  expectNoPushCalls();
  expect(openShareSheet).not.toHaveBeenCalled();
});

test('a first-bet note for another bet does not count', async () => {
  markFreshBet('zzz999', { first: true });
  await renderTally();
  expect(sheet()).not.toBeInTheDocument();
  expectNoPushCalls();
});

test.each([
  ['the flag is off', () => { delete process.env.NEXT_PUBLIC_PUSH_ENABLED; }],
  ['the flag is not exactly 1', () => { process.env.NEXT_PUBLIC_PUSH_ENABLED = 'true'; }],
  ['on the web', () => { Capacitor.isNativePlatform.mockReturnValue(false); }],
])('when %s: no sheet even after a first bet, no push calls, share as today', async (_name, setup) => {
  setup();
  markFreshBet('abc123', { first: true });
  await renderTally();
  expect(sheet()).not.toBeInTheDocument();
  expectNoPushCalls();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
});

test.each([
  ['the OS already granted', () => FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'granted' })],
  ['the OS denied', () => FirebaseMessaging.checkPermissions.mockResolvedValue({ receive: 'denied' })],
  ['a saved grant', () => Preferences.store.set('fb.pushAsked.creator-1', 'granted')],
  ['a saved denial', () => Preferences.store.set('fb.pushAsked.creator-1', 'denied')],
])('with %s: no sheet, and the share opens', async (_name, setup) => {
  setup();
  markFreshBet('abc123', { first: true });
  await renderTally();
  expect(sheet()).not.toBeInTheDocument();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
});
