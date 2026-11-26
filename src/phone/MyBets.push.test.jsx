import { act, render, screen } from '@testing-library/react';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Preferences } from '@capacitor/preferences';
import userEvent from '@testing-library/user-event';
import { within } from '@testing-library/react';
import MyBets, { MyBetsList } from './MyBets';
import AccountMenu from './AccountMenu';
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

test('My bets has no Notifications row of its own', async () => {
  render(<MyBetsList user={creator} />);
  await settle();
  expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
});

test('a member’s Account sheet: Notifications first, unchanged, then Log out, then Delete account', async () => {
  mockIdentity.user = creator;
  render(<AccountMenu />);
  await userEvent.click(screen.getByRole('button', { name: 'Account' }));
  await settle();
  const sheet = screen.getByRole('dialog', { name: 'Account' });
  const row = within(sheet).getByText('Notifications').closest('.push-row');
  expect(row.parentElement.firstElementChild).toBe(row);
  expect(within(row).getByRole('switch', { name: 'Notifications' })).toBeInTheDocument();
  const logout = within(sheet).getByRole('button', { name: 'Log out' });
  expect(row.nextElementSibling).toBe(logout);
  expect(logout.parentElement.nextElementSibling).toBe(within(sheet).getByRole('button', { name: 'Delete account' }));
  expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
});

test('an anonymous app user with push on gets the icon; their sheet is the title and Notifications only', async () => {
  mockIdentity.user = anon;
  render(<AccountMenu />);
  await userEvent.click(screen.getByRole('button', { name: 'Account' }));
  await settle();
  const sheet = screen.getByRole('dialog', { name: 'Account' });
  expect(within(sheet).getByRole('heading', { name: 'Account' })).toBeInTheDocument();
  expect(within(sheet).getByRole('switch', { name: 'Notifications' })).toBeInTheDocument();
  expect(within(sheet).queryAllByRole('button')).toHaveLength(0);
  expect(within(sheet).queryByText(/Signed in as/)).toBeNull();
  expect(Preferences.get).toHaveBeenCalledWith({ key: 'fb.pushPref.anon-1' });
});

test('flag off: an anonymous app user gets no Account icon and no plugin calls', async () => {
  delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  mockIdentity.user = anon;
  render(<AccountMenu />);
  await settle();
  expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
  expect(Preferences.get).not.toHaveBeenCalled();
});

test('flag off: the sheet has no Notifications row and no plugin calls', async () => {
  delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  mockIdentity.user = creator;
  render(<AccountMenu />);
  await userEvent.click(screen.getByRole('button', { name: 'Account' }));
  await settle();
  const sheet = screen.getByRole('dialog', { name: 'Account' });
  expect(within(sheet).queryByText('Notifications')).not.toBeInTheDocument();
  expect(within(sheet).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
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
