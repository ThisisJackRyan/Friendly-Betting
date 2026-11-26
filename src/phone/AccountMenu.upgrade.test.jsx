import { act, render, screen } from '@testing-library/react';

// Regression: right after a fresh phone sign-in on My bets the header Account
// icon stayed hidden until a reload. The phone is linked to the anonymous user
// in place: same uid and the same user object, now with a phone provider. So
// onAuthStateChanged never fires again, and useIdentity kept the old render.
// Real identity and creatorAuth here; only firebase/auth is faked.

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => false), getPlatform: jest.fn(() => 'web') },
}));
jest.mock('./pushOptIn', () => ({ unregisterBeforeSignOut: jest.fn(() => Promise.resolve()) }));
jest.mock('../platform/nativePhone', () => ({
  cancelNativePhoneCode: jest.fn(),
  sendNativePhoneCode: jest.fn(),
}));

const mockAuth = { currentUser: null, stateListener: null, tokenListener: null };
jest.mock('../Config/firebase-config', () => ({ auth: mockAuth, db: null }));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.stateListener = onChange;
    return () => {};
  }),
  onIdTokenChanged: jest.fn((_auth, onChange) => {
    mockAuth.tokenListener = onChange;
    return () => {};
  }),
  signInAnonymously: jest.fn(),
  signInWithCredential: jest.fn(),
  signOut: jest.fn(),
  // Like Firebase: links in place, keeps the uid, and does not call the auth
  // state listeners (only the ID token ones, which this fake leaves to the test).
  linkWithCredential: jest.fn(async (user) => {
    user.isAnonymous = false;
    user.providerData = [{ providerId: 'phone' }];
    user.phoneNumber = '+15555550100';
    return { user };
  }),
  PhoneAuthProvider: Object.assign(function PhoneAuthProvider() {}, {
    credential: jest.fn(() => ({ providerId: 'phone' })),
    credentialFromError: jest.fn(() => null),
  }),
  RecaptchaVerifier: jest.fn(),
}));

const AccountMenu = require('./AccountMenu').default;
const { verifyPhoneCode } = require('./creatorAuth');

const icon = () => screen.queryByRole('button', { name: 'Account' });

function signedInAnonymously() {
  const anon = { uid: 'anon-1', isAnonymous: true, providerData: [] };
  mockAuth.currentUser = anon;
  render(<AccountMenu />);
  act(() => mockAuth.stateListener(anon));
  return anon;
}

beforeEach(() => {
  mockAuth.currentUser = null;
  mockAuth.stateListener = null;
  mockAuth.tokenListener = null;
});

test('the icon shows as soon as the phone sign-in links to the anonymous user, without a reload', async () => {
  const anon = signedInAnonymously();
  expect(icon()).toBeNull();

  let user;
  await act(async () => {
    user = await verifyPhoneCode('verification-id', '123456');
  });

  // Upgraded in place: no new auth state, no token event fired.
  expect(user).toBe(anon);
  expect(icon()).toBeInTheDocument();
});

test('an ID token change after an in-place upgrade also shows the icon', () => {
  const anon = signedInAnonymously();
  expect(icon()).toBeNull();

  anon.isAnonymous = false;
  anon.providerData = [{ providerId: 'phone' }];
  act(() => mockAuth.tokenListener(anon));

  expect(icon()).toBeInTheDocument();
});
