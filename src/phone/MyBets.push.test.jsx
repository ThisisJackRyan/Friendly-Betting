import { act, render, screen } from '@testing-library/react';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Preferences } from '@capacitor/preferences';
import MyBets, { MyBetsList } from './MyBets';
import { subscribeMyBets } from './api';

jest.mock('next/navigation');
jest.mock('next/link');
const mockIdentity = { user: null };
jest.mock('./identity', () => ({ useIdentity: () => mockIdentity.user }));
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('./api', () => ({ subscribeMyBets: jest.fn(), deleteBet: jest.fn() }));
jest.mock('./AuthSlides', () => ({ __esModule: true, default: () => <p>Phone gate</p> }));
jest.mock('./FriendlyLoader', () => ({
  __esModule: true,
  default: () => <p>Loading</p>,
  useMinHold: () => true,
}));
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => true), getPlatform: jest.fn(() => 'ios') },
}));
jest.mock('@capacitor/app', () => ({
  App: { addListener: jest.fn(async () => ({ remove: jest.fn() })) },
}));
jest.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: {
    requestPermissions: jest.fn(),
    checkPermissions: jest.fn(async () => ({ receive: 'granted' })),
  },
}));
jest.mock('@capacitor/preferences', () => ({
  Preferences: { get: jest.fn(async () => ({ value: null })), set: jest.fn() },
}));

const creator = { uid: 'creator', providerData: [{ providerId: 'phone' }] };
const anon = { uid: 'anon-1', isAnonymous: true, providerData: [] };
const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  Capacitor.isNativePlatform.mockReturnValue(true);
  subscribeMyBets.mockImplementation((_uid, publish) => {
    publish([]);
    return () => {};
  });
});

afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {});
  }
}

test('the Notifications row sits in the account area, right above an unchanged Log out', async () => {
  render(<MyBetsList user={creator} />);
  await settle();
  const row = screen.getByText('Notifications').closest('.push-row');
  const logout = screen.getByRole('button', { name: 'Log out' });
  expect(row.nextElementSibling).toBe(logout);
  expect(logout).toHaveClass('logout-link');
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
});

test('flag off: no row and no plugin calls on My bets', async () => {
  delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  render(<MyBetsList user={creator} />);
  await settle();
  expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  expect(Preferences.get).not.toHaveBeenCalled();
});

test('not on the phone gate', async () => {
  mockIdentity.user = anon;
  render(<MyBets />);
  await settle();
  expect(screen.getByText('Phone gate')).toBeInTheDocument();
  expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
});
