const mockVerifyPhoneNumber = jest.fn();
const mockCredential = jest.fn((verificationId, code) => ({ verificationId, code }));
const mockLinkWithCredential = jest.fn();
const mockSignInWithCredential = jest.fn();
const mockRecaptchaClear = jest.fn();
const mockAuthState = { currentUser: null };

jest.mock('firebase/auth', () => {
  function PhoneAuthProvider() {
    this.verifyPhoneNumber = mockVerifyPhoneNumber;
  }
  PhoneAuthProvider.credential = (verificationId, code) => mockCredential(verificationId, code);
  return {
    PhoneAuthProvider,
    RecaptchaVerifier: jest.fn(() => ({ clear: mockRecaptchaClear })),
    linkWithCredential: (...args) => mockLinkWithCredential(...args),
    signInWithCredential: (...args) => mockSignInWithCredential(...args),
  };
});

jest.mock('../Config/firebase-config', () => ({
  auth: mockAuthState,
}));

const { RecaptchaVerifier } = require('firebase/auth');
const { resetPhoneAuthForTests, sendPhoneCode, verifyPhoneCode } = require('./creatorAuth');

beforeEach(() => {
  mockVerifyPhoneNumber.mockReset();
  mockCredential.mockClear();
  mockLinkWithCredential.mockReset();
  mockSignInWithCredential.mockReset();
  mockRecaptchaClear.mockReset();
  RecaptchaVerifier.mockClear();
  mockAuthState.currentUser = null;
  resetPhoneAuthForTests();
});

test('send uses an invisible reCAPTCHA and returns a verification id', async () => {
  const container = document.createElement('div');
  mockVerifyPhoneNumber.mockResolvedValue('vid-1');
  await expect(sendPhoneCode('+15551234567', container)).resolves.toBe('vid-1');
  expect(RecaptchaVerifier).toHaveBeenCalledWith(
    mockAuthState,
    container,
    { size: 'invisible' },
  );
  expect(mockVerifyPhoneNumber).toHaveBeenCalledWith('+15551234567', expect.any(Object));
});

test('an anonymous creator is upgraded with linkWithCredential', async () => {
  const anon = { uid: 'anon-1', isAnonymous: true };
  mockAuthState.currentUser = anon;
  mockLinkWithCredential.mockResolvedValue({
    user: { uid: 'anon-1', providerData: [{ providerId: 'phone' }] },
  });

  const user = await verifyPhoneCode('vid-1', '123456');

  expect(mockCredential).toHaveBeenCalledWith('vid-1', '123456');
  expect(mockLinkWithCredential).toHaveBeenCalledWith(anon, {
    verificationId: 'vid-1',
    code: '123456',
  });
  expect(mockSignInWithCredential).not.toHaveBeenCalled();
  expect(user.uid).toBe('anon-1');
});

test('a phone already in use signs into that account', async () => {
  const anon = { uid: 'anon-1', isAnonymous: true };
  const credential = { verificationId: 'vid-1', code: '123456' };
  mockAuthState.currentUser = anon;
  mockCredential.mockReturnValue(credential);
  const taken = new Error('taken');
  taken.code = 'auth/credential-already-in-use';
  taken.credential = credential;
  mockLinkWithCredential.mockRejectedValue(taken);
  mockSignInWithCredential.mockResolvedValue({
    user: { uid: 'creator-9', phoneNumber: '+15551234567' },
  });

  const user = await verifyPhoneCode('vid-1', '123456');

  expect(mockLinkWithCredential).toHaveBeenCalledWith(anon, credential);
  expect(mockSignInWithCredential).toHaveBeenCalledWith(mockAuthState, credential);
  expect(user.uid).toBe('creator-9');
});

test('with no session, verify signs in with the phone credential', async () => {
  mockAuthState.currentUser = null;
  mockSignInWithCredential.mockResolvedValue({ user: { uid: 'creator-2' } });
  const user = await verifyPhoneCode('vid-2', '000000');
  expect(mockLinkWithCredential).not.toHaveBeenCalled();
  expect(mockSignInWithCredential).toHaveBeenCalled();
  expect(user.uid).toBe('creator-2');
});
