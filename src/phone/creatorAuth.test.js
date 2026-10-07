const mockVerifyPhoneNumber = jest.fn();
const mockCredential = jest.fn((verificationId, code) => ({ verificationId, code }));
const mockLinkWithCredential = jest.fn();
const mockSignInWithCredential = jest.fn();
const mockSignOut = jest.fn();
const mockRecaptchaClear = jest.fn();
const mockRecaptchaRender = jest.fn(() => Promise.resolve(1));
const mockSendResult = jest.fn();
const mockVerifiers = [];
const mockAuthState = { currentUser: null };

jest.mock('firebase/auth', () => {
  function PhoneAuthProvider() {
    this.verifyPhoneNumber = mockVerifyPhoneNumber;
  }
  PhoneAuthProvider.credential = (verificationId, code) => mockCredential(verificationId, code);
  return {
    PhoneAuthProvider,
    RecaptchaVerifier: jest.fn((auth, container, params) => {
      const made = {
        type: 'recaptcha',
        container,
        params,
        clear: mockRecaptchaClear,
        render: mockRecaptchaRender,
        verify: jest.fn(() => Promise.resolve('token')),
        _reset: jest.fn(),
      };
      mockVerifiers.push(made);
      return made;
    }),
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
  mockSendResult.mockReset();
  mockVerifiers.length = 0;
  mockAuthState.currentUser = null;
  resetPhoneAuthForTests();
  mockRecaptchaClear.mockClear();
});

// Like Firebase: run the verifier, then reset it after the request.
async function sendLikeFirebase(e164, appVerifier) {
  try {
    await appVerifier.verify();
    expect(appVerifier.type).toBe('recaptcha');
    return await mockSendResult(e164);
  } finally {
    appVerifier._reset();
  }
}

test('the person check is invisible, inline, and in a child of the slot', async () => {
  const slot = document.createElement('div');
  await expect(mountPhoneCheck(slot)).resolves.toBe(1);
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  const [authArg, node, params] = RecaptchaVerifier.mock.calls[0];
  expect(authArg).toBe(mockAuthState);
  expect(node).not.toBe(slot);
  expect(node.parentNode).toBe(slot);
  expect(params).toEqual(expect.objectContaining({ size: 'invisible', badge: 'inline' }));
  expect(typeof params['error-callback']).toBe('function');
  expect(mockRecaptchaRender).toHaveBeenCalledTimes(1);
});

test('mount, send, and resend share one verifier', async () => {
  const slot = document.createElement('div');
  mockVerifyPhoneNumber.mockImplementation(sendLikeFirebase);
  mockSendResult.mockResolvedValueOnce('vid-1').mockResolvedValueOnce('vid-2');

  await mountPhoneCheck(slot);
  await expect(sendPhoneCode('+15551234567', slot)).resolves.toBe('vid-1');
  await expect(sendPhoneCode('+15551234567', slot)).resolves.toBe('vid-2');

  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  expect(mockVerifiers[0].verify).toHaveBeenCalledTimes(2);
  expect(mockVerifiers[0]._reset).toHaveBeenCalledTimes(2);
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
  expect(slot.children).toHaveLength(1);
});

test.each(['auth/captcha-check-failed', 'auth/billing-not-enabled'])(
  'a %s send rethrows that error and replaces the verifier next time',
  async (code) => {
    const slot = document.createElement('div');
    const err = new Error(code);
    err.code = code;
    mockVerifyPhoneNumber.mockImplementation(sendLikeFirebase);
    mockSendResult.mockRejectedValueOnce(err).mockResolvedValueOnce('vid-2');

    await mountPhoneCheck(slot);
    const firstNode = RecaptchaVerifier.mock.calls[0][1];
    await expect(sendPhoneCode('+15551234567', slot)).rejects.toBe(err);
    expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
    expect(firstNode.parentNode).toBeNull();
    expect(slot.children).toHaveLength(0);

    await expect(sendPhoneCode('+15551234567', slot)).resolves.toBe('vid-2');
    expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
    const secondNode = RecaptchaVerifier.mock.calls[1][1];
    expect(secondNode).not.toBe(firstNode);
    expect(secondNode.parentNode).toBe(slot);
    expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
  },
);

test('a grecaptcha error during the check fails the send and replaces the verifier', async () => {
  const slot = document.createElement('div');
  mockVerifyPhoneNumber.mockImplementation(sendLikeFirebase);
  await mountPhoneCheck(slot);
  mockVerifiers[0].verify.mockReturnValueOnce(new Promise(() => {}));

  const sent = sendPhoneCode('+15551234567', slot);
  await Promise.resolve();
  RecaptchaVerifier.mock.calls[0][2]['error-callback']();

  await expect(sent).rejects.toMatchObject({ code: 'auth/captcha-check-failed' });
  expect(mockSendResult).not.toHaveBeenCalled();
  expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);

  mockSendResult.mockResolvedValueOnce('vid-2');
  await expect(sendPhoneCode('+15551234567', slot)).resolves.toBe('vid-2');
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
  expect(slot.children).toHaveLength(1);
});

test('leaving the phone flow is what clears the widget', async () => {
  const slot = document.createElement('div');
  await mountPhoneCheck(slot);
  releasePhoneCheck();
  expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
  expect(slot.children).toHaveLength(0);
  await mountPhoneCheck(slot);
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
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
