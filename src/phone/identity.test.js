const mockSignInAnonymously = jest.fn();
const mockAuth = { currentUser: null };

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listener = onChange;
    return () => {};
  }),
  signInAnonymously: (...args) => mockSignInAnonymously(...args),
}));

jest.mock('../Config/firebase-config', () => ({
  auth: mockAuth,
}));

const { watchIdentity } = require('./identity');

beforeEach(() => {
  mockAuth.currentUser = null;
  mockAuth.listener = null;
  mockSignInAnonymously.mockReset();
});

test('after sign-out a new anonymous session replaces the creator', async () => {
  let resolveSignIn;
  mockSignInAnonymously.mockImplementation(() => new Promise((resolve) => {
    resolveSignIn = resolve;
  }));

  const seen = [];
  watchIdentity((user) => {
    seen.push(user.uid);
  });

  mockAuth.listener(null);
  const anon = {
    uid: 'anon-1',
    isAnonymous: true,
    providerData: [{ providerId: 'anonymous' }],
  };
  resolveSignIn({ user: anon });
  await new Promise((resolve) => { setTimeout(resolve, 0); });

  mockAuth.currentUser = null;
  mockAuth.listener(null);

  expect(mockSignInAnonymously).toHaveBeenCalledTimes(2);
  expect(seen).toEqual(['anon-1']);
});
