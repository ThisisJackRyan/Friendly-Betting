import { act, render } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import EntitlementSync from './EntitlementSync';
import { subscribeEntitlement } from './entitlementApi';
import { __resetEntitlementForTests } from './useEntitlement';
import { isPro, whenProKnown } from '../ads/pro';

// EntitlementSync is mounted at the root of every page, including the vote
// page and not-found. It must never sign anyone in itself: it only listens
// for a user that auth already has.
const mockAuth = { currentUser: null, listeners: new Set() };

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listeners.add(onChange);
    return () => mockAuth.listeners.delete(onChange);
  }),
  signInAnonymously: jest.fn(),
  signInWithCredential: jest.fn(),
  signInWithPhoneNumber: jest.fn(),
  signInWithPopup: jest.fn(),
  signInWithRedirect: jest.fn(),
}));

jest.mock('../Config/firebase-config', () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
}));

const signIns = () => Object.entries(firebaseAuth)
  .filter(([name, fn]) => name.startsWith('signIn') && typeof fn === 'function')
  .reduce((sum, [, fn]) => sum + fn.mock.calls.length, 0);
const authSays = (user) => act(async () => { mockAuth.listeners.forEach((listener) => listener(user)); });
const known = () => Promise.race([whenProKnown(1e9).then(() => true), new Promise((resolve) => { setTimeout(() => resolve(false), 0); })]);

beforeEach(() => {
  mockAuth.listeners.clear();
  __resetEntitlementForTests();
  subscribeEntitlement.mockReset().mockImplementation((_uid, onChange) => {
    onChange({ plan: 'pro', source: 'mock', expiresAt: null });
    return () => {};
  });
  Object.values(firebaseAuth).forEach((fn) => fn.mockClear?.());
});

test('nobody signed in: never calls any sign-in and starts no listener', async () => {
  render(<EntitlementSync />);
  expect(firebaseAuth.onAuthStateChanged).toHaveBeenCalledTimes(1);
  await authSays(null);
  expect(signIns()).toBe(0);
  expect(subscribeEntitlement).not.toHaveBeenCalled();
  expect(isPro()).toBe(false);
  // Signed out is an answer: ads may start.
  await expect(known()).resolves.toBe(true);
});

test('an existing user: listens to their entitlement, still without signing in', async () => {
  render(<EntitlementSync />);
  expect(await known()).toBe(false);
  await authSays({ uid: 'jack', providerData: [{ providerId: 'phone' }] });
  expect(signIns()).toBe(0);
  expect(subscribeEntitlement).toHaveBeenCalledWith('jack', expect.any(Function));
  expect(isPro()).toBe(true);
  await expect(known()).resolves.toBe(true);
});
