const mockVerifyPhoneNumber = jest.fn();
const mockCredential = jest.fn((verificationId, code) => ({ verificationId, code }));
const mockLinkWithCredential = jest.fn();
const mockSignInWithCredential = jest.fn();
const mockSignOut = jest.fn();
const mockRecaptchaClear = jest.fn();
const mockRecaptchaRender = jest.fn(() => Promise.resolve(1));
const mockAuthState = { currentUser: null };

jest.mock('firebase/auth', () => {
  function PhoneAuthProvider() {
    this.verifyPhoneNumber = mockVerifyPhoneNumber;
  }
  PhoneAuthProvider.credential = (verificationId, code) => mockCredential(verificationId, code);
  return {
    PhoneAuthProvider,
    RecaptchaVerifier: jest.fn(() => ({
      clear: mockRecaptchaClear,
      render: mockRecaptchaRender,
    })),
    linkWithCredential: (...args) => mockLinkWithCredential(...args),
    signInWithCredential: (...args) => mockSignInWithCredential(...args),
    signOut: (...args) => mockSignOut(...args),
  };
});

jest.mock('../Config/firebase-config', () => ({
  auth: mockAuthState,
}));

const { RecaptchaVerifier } = require('firebase/auth');
const {
  mountPhoneCheck,
  releasePhoneCheck,
  resetPhoneAuthForTests,
  sendPhoneCode,
  signOutCreator,
  verifyPhoneCode,
} = require('./creatorAuth');

beforeEach(() => {
  mockVerifyPhoneNumber.mockReset();
  mockCredential.mockClear();
  mockLinkWithCredential.mockReset();
  mockSignInWithCredential.mockReset();
  mockSignOut.mockReset();
  mockRecaptchaClear.mockReset();
  mockRecaptchaRender.mockClear();
  RecaptchaVerifier.mockClear();
  mockAuthState.currentUser = null;
  resetPhoneAuthForTests();
  mockRecaptchaClear.mockClear();
});

test('send renders a visible person check and returns a verification id', async () => {
  const container = document.createElement('div');
  mockVerifyPhoneNumber.mockResolvedValue('vid-1');
  await expect(mountPhoneCheck(container)).resolves.toBe(1);
  await expect(sendPhoneCode('+15551234567', container)).resolves.toBe('vid-1');
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  expect(RecaptchaVerifier).toHaveBeenCalledWith(
    mockAuthState,
    container,
    expect.objectContaining({ size: 'normal', theme: 'light' }),
  );
  expect(RecaptchaVerifier.mock.calls[0][2].size).not.toBe('invisible');
  expect(typeof RecaptchaVerifier.mock.calls[0][2].callback).toBe('function');
  expect(mockRecaptchaRender).toHaveBeenCalledTimes(1);
  expect(mockVerifyPhoneNumber).toHaveBeenCalledWith('+15551234567', expect.any(Object));
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
});

test('a failed person check keeps the verifier so the challenge can stay', async () => {
  const container = document.createElement('div');
  const err = new Error('The reCAPTCHA response token provided is either invalid, expired, already used.');
  err.code = 'auth/captcha-check-failed';
  mockVerifyPhoneNumber.mockRejectedValueOnce(err);

  await expect(sendPhoneCode('+15551234567', container)).rejects.toBe(err);
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);

  mockVerifyPhoneNumber.mockResolvedValueOnce('vid-2');
  await expect(sendPhoneCode('+15551234567', container)).resolves.toBe('vid-2');
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
});

test('a solved check is sent as that token without clearing the widget', async () => {
  const container = document.createElement('div');
  const area = document.createElement('textarea');
  area.name = 'g-recaptcha-response';
  area.value = 'solved-token';
  container.appendChild(area);
  mockVerifyPhoneNumber.mockResolvedValue('vid-solved');

  await expect(sendPhoneCode('+15551234567', container)).resolves.toBe('vid-solved');

  expect(RecaptchaVerifier).not.toHaveBeenCalled();
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
  const passed = mockVerifyPhoneNumber.mock.calls[0][1];
  await expect(passed.verify()).resolves.toBe('solved-token');
  expect(passed.type).toBe('recaptcha');
  passed._reset();
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
  expect(area.value).toBe('solved-token');
  expect(container.querySelector('textarea')).toBe(area);
});

test('a failed solved check does not clear the widget or replace the verifier', async () => {
  const container = document.createElement('div');
  await mountPhoneCheck(container);
  const params = RecaptchaVerifier.mock.calls[0][2];
  params.callback('solved-token');
  const err = new Error('captcha');
  err.code = 'auth/captcha-check-failed';
  mockVerifyPhoneNumber.mockRejectedValueOnce(err);

  await expect(sendPhoneCode('+15551234567', container)).rejects.toBe(err);

  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
  const passed = mockVerifyPhoneNumber.mock.calls[0][1];
  await expect(passed.verify()).resolves.toBe('solved-token');
  passed._reset();
  expect(mockRecaptchaClear).not.toHaveBeenCalled();

  mockVerifyPhoneNumber.mockResolvedValueOnce('vid-2');
  await expect(sendPhoneCode('+15551234567', container)).resolves.toBe('vid-2');
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
  await expect(mockVerifyPhoneNumber.mock.calls[1][1].verify()).resolves.toBe('solved-token');
});

test('leaving the phone flow is what clears the widget', async () => {
  const container = document.createElement('div');
  await mountPhoneCheck(container);
  releasePhoneCheck();
  expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
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

test('log out only calls signOut', async () => {
  mockSignOut.mockResolvedValue();
  await signOutCreator();
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockSignOut).toHaveBeenCalledWith(mockAuthState);
  expect(mockLinkWithCredential).not.toHaveBeenCalled();
  expect(mockSignInWithCredential).not.toHaveBeenCalled();
});

test('an expired code does not sign the creator out', async () => {
  mockAuthState.currentUser = { uid: 'anon-1', isAnonymous: true };
  const expired = new Error('expired');
  expired.code = 'auth/code-expired';
  mockLinkWithCredential.mockRejectedValue(expired);
  await expect(verifyPhoneCode('vid-1', '111111')).rejects.toBe(expired);
  expect(mockSignOut).not.toHaveBeenCalled();
});
