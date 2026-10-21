const mockVerifyPhoneNumber = jest.fn();
const mockCredential = jest.fn((verificationId, code) => ({ verificationId, code }));
const mockCredentialFromError = jest.fn(() => null);
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
  PhoneAuthProvider.credentialFromError = (err) => mockCredentialFromError(err);
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

jest.mock('../platform/runtime', () => ({ isNativeApp: jest.fn(() => false) }));

jest.mock('../platform/nativePhone', () => ({
  cancelNativePhoneCode: jest.fn(),
  sendNativePhoneCode: jest.fn(),
}));

const { RecaptchaVerifier } = require('firebase/auth');
const { isNativeApp } = require('../platform/runtime');
const { cancelNativePhoneCode, sendNativePhoneCode } = require('../platform/nativePhone');
const {
  mountPhoneCheck,
  releasePhoneCheck,
  resetPhoneAuthForTests,
  sendPhoneCode,
  signOutCreator,
  verifyPhoneCode,
  SPENT_CODE,
} = require('./creatorAuth');
const { PERSON_CHECK_CANCELLED, VERIFY_CODE_ERROR, phoneError } = require('./creatorSession');

const bodyNodes = [];

beforeEach(() => {
  mockVerifyPhoneNumber.mockReset();
  mockCredential.mockClear();
  mockCredentialFromError.mockReset();
  mockCredentialFromError.mockReturnValue(null);
  mockLinkWithCredential.mockReset();
  mockSignInWithCredential.mockReset();
  mockSignOut.mockReset();
  mockRecaptchaClear.mockReset();
  mockRecaptchaRender.mockClear();
  RecaptchaVerifier.mockClear();
  mockSendResult.mockReset();
  mockVerifiers.length = 0;
  mockAuthState.currentUser = null;
  isNativeApp.mockReturnValue(false);
  sendNativePhoneCode.mockReset();
  cancelNativePhoneCode.mockClear();
  resetPhoneAuthForTests();
  mockRecaptchaClear.mockClear();
});

afterEach(() => {
  resetPhoneAuthForTests();
  bodyNodes.splice(0).forEach((node) => node.remove());
  jest.useRealTimers();
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

test('on native, send uses the native verifier and never builds a reCAPTCHA', async () => {
  isNativeApp.mockReturnValue(true);
  sendNativePhoneCode.mockResolvedValue('native-vid');
  await expect(mountPhoneCheck(document.createElement('div'))).resolves.toBeUndefined();
  await expect(sendPhoneCode('+15555550100', null)).resolves.toBe('native-vid');
  expect(sendNativePhoneCode).toHaveBeenCalledWith('+15555550100');
  expect(RecaptchaVerifier).not.toHaveBeenCalled();
  expect(mockVerifyPhoneNumber).not.toHaveBeenCalled();
  releasePhoneCheck();
  expect(cancelNativePhoneCode).toHaveBeenCalled();
});

test('on web, send uses the reCAPTCHA path and not the native verifier', async () => {
  mockVerifyPhoneNumber.mockImplementation(sendLikeFirebase);
  mockSendResult.mockResolvedValue('web-vid');
  const slot = document.createElement('div');
  await expect(sendPhoneCode('+15555550100', slot)).resolves.toBe('web-vid');
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  expect(sendNativePhoneCode).not.toHaveBeenCalled();
});

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

// Google's challenge: a bframe iframe in a wrapper on <body>.
function showChallenge() {
  const wrapper = document.createElement('div');
  wrapper.style.visibility = 'visible';
  const frame = document.createElement('iframe');
  frame.src = 'https://www.google.com/recaptcha/api2/bframe?k=x';
  wrapper.appendChild(frame);
  document.body.appendChild(wrapper);
  bodyNodes.push(wrapper);
  return wrapper;
}

// Starts a send whose person check waits until the test gives it a token.
async function pendingSend(slot) {
  jest.useFakeTimers();
  mockVerifyPhoneNumber.mockImplementation(sendLikeFirebase);
  await mountPhoneCheck(slot);
  let giveToken;
  mockVerifiers[0].verify.mockReturnValueOnce(new Promise((resolve) => {
    giveToken = resolve;
  }));
  const state = { settled: false };
  const sent = sendPhoneCode('+15551234567', slot);
  sent.then(
    () => { state.settled = true; },
    () => { state.settled = true; },
  );
  return { sent, state, giveToken: (token) => giveToken(token) };
}

function expectRebuilt(slot) {
  const firstNode = RecaptchaVerifier.mock.calls[0][1];
  expect(mockVerifiers[0]._reset).toHaveBeenCalledTimes(1);
  expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
  expect(firstNode.parentNode).toBeNull();
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
  const secondNode = RecaptchaVerifier.mock.calls[1][1];
  expect(secondNode).not.toBe(firstNode);
  expect(secondNode.parentNode).toBe(slot);
  expect(slot.children).toHaveLength(1);
  expect(mockRecaptchaRender).toHaveBeenCalledTimes(2);
  expect(mockSendResult).not.toHaveBeenCalled();
}

test('closing the challenge cancels the check after a grace and rebuilds it', async () => {
  const slot = document.createElement('div');
  const { sent, state } = await pendingSend(slot);
  const challenge = showChallenge();
  await jest.advanceTimersByTimeAsync(250);
  challenge.style.visibility = 'hidden';
  await jest.advanceTimersByTimeAsync(250);
  await jest.advanceTimersByTimeAsync(1499);
  expect(state.settled).toBe(false);
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(1);
  await expect(sent).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });
  expectRebuilt(slot);
  expect(jest.getTimerCount()).toBe(0);
});

test('a token right after the challenge hides is a normal send', async () => {
  const slot = document.createElement('div');
  mockSendResult.mockResolvedValueOnce('vid-1');
  const { sent, giveToken } = await pendingSend(slot);
  const challenge = showChallenge();
  await jest.advanceTimersByTimeAsync(250);
  challenge.style.visibility = 'hidden';
  await jest.advanceTimersByTimeAsync(1000);
  giveToken('token');

  await expect(sent).resolves.toBe('vid-1');
  await jest.advanceTimersByTimeAsync(5000);
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  expect(mockRecaptchaClear).not.toHaveBeenCalled();
  expect(mockVerifiers[0]._reset).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('no challenge and no token for 30s cancels the check', async () => {
  const slot = document.createElement('div');
  const { sent, state } = await pendingSend(slot);
  await jest.advanceTimersByTimeAsync(29900);
  expect(state.settled).toBe(false);

  await jest.advanceTimersByTimeAsync(100);
  await expect(sent).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });
  expectRebuilt(slot);
});

test('an open challenge is only cut off after 3 minutes', async () => {
  const slot = document.createElement('div');
  const { sent, state } = await pendingSend(slot);
  showChallenge();
  await jest.advanceTimersByTimeAsync(250);
  await jest.advanceTimersByTimeAsync(60000);
  expect(state.settled).toBe(false);
  await jest.advanceTimersByTimeAsync(180000 - 60001);
  expect(state.settled).toBe(false);

  await jest.advanceTimersByTimeAsync(1);
  await expect(sent).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });
  expectRebuilt(slot);
});

test('an expired token during the check cancels it and rebuilds', async () => {
  const slot = document.createElement('div');
  const { sent } = await pendingSend(slot);
  RecaptchaVerifier.mock.calls[0][2]['expired-callback']();

  await expect(sent).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });
  expectRebuilt(slot);
  expect(jest.getTimerCount()).toBe(0);
});

test('an expired token between sends replaces the verifier next time', async () => {
  const slot = document.createElement('div');
  mockVerifyPhoneNumber.mockImplementation(sendLikeFirebase);
  mockSendResult.mockResolvedValueOnce('vid-1');
  await mountPhoneCheck(slot);
  RecaptchaVerifier.mock.calls[0][2]['expired-callback']();

  await expect(sendPhoneCode('+15551234567', slot)).resolves.toBe('vid-1');
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
  expect(mockVerifiers[0].verify).not.toHaveBeenCalled();
  expect(mockVerifiers[1].verify).toHaveBeenCalledTimes(1);
});

test('late results from a cancelled verifier are ignored', async () => {
  const slot = document.createElement('div');
  const { sent, giveToken } = await pendingSend(slot);
  const oldParams = RecaptchaVerifier.mock.calls[0][2];
  await jest.advanceTimersByTimeAsync(30000);
  await expect(sent).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });

  giveToken('late-token');
  oldParams['error-callback']();
  oldParams['expired-callback']();
  await jest.advanceTimersByTimeAsync(5000);

  expect(mockSendResult).not.toHaveBeenCalled();
  expect(mockVerifiers[0]._reset).toHaveBeenCalledTimes(1);
  expect(mockVerifiers[1].verify).not.toHaveBeenCalled();
  expect(mockVerifiers[1]._reset).not.toHaveBeenCalled();
  expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);

  // The new verifier was not marked broken, so the next send keeps it.
  mockSendResult.mockResolvedValueOnce('vid-2');
  await expect(sendPhoneCode('+15551234567', slot)).resolves.toBe('vid-2');
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
});

test('after a cancel the next send uses the rebuilt verifier', async () => {
  const slot = document.createElement('div');
  const { sent } = await pendingSend(slot);
  RecaptchaVerifier.mock.calls[0][2]['expired-callback']();
  await expect(sent).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });

  mockSendResult.mockResolvedValueOnce('vid-2');
  await expect(sendPhoneCode('+15551234567', slot)).resolves.toBe('vid-2');
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
  expect(mockVerifiers[1].verify).toHaveBeenCalledTimes(1);
  expect(mockVerifiers[1]._reset).toHaveBeenCalledTimes(1);
  expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
  expect(slot.children).toHaveLength(1);
});

test('leaving during a check settles it and leaves no timers', async () => {
  const slot = document.createElement('div');
  const { sent } = await pendingSend(slot);
  showChallenge();
  await jest.advanceTimersByTimeAsync(250);
  expect(jest.getTimerCount()).toBeGreaterThan(0);

  releasePhoneCheck();
  await expect(sent).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });
  expect(jest.getTimerCount()).toBe(0);
  expect(mockVerifiers[0]._reset).toHaveBeenCalledTimes(1);
  expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
  expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
  expect(slot.children).toHaveLength(0);
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

// Like Firebase: a failed link spends the code and returns a one-time proof.
function takenError(code) {
  const err = new Error('taken');
  err.code = code;
  err.customData = {
    _tokenResponse: { phoneNumber: '+15551234567', temporaryProof: 'proof-1' },
  };
  return err;
}

const proofCredential = { phoneNumber: '+15551234567', temporaryProof: 'proof-1' };

test('a phone already in use signs into that account with the proof', async () => {
  const anon = { uid: 'anon-1', isAnonymous: true };
  const credential = { verificationId: 'vid-1', code: '123456' };
  mockAuthState.currentUser = anon;
  mockCredential.mockReturnValue(credential);
  const taken = takenError('auth/credential-already-in-use');
  mockCredentialFromError.mockReturnValue(proofCredential);
  mockLinkWithCredential.mockRejectedValue(taken);
  mockSignInWithCredential.mockResolvedValue({
    user: { uid: 'creator-9', phoneNumber: '+15551234567' },
  });

  const user = await verifyPhoneCode('vid-1', '123456');

  expect(mockLinkWithCredential).toHaveBeenCalledWith(anon, credential);
  expect(mockCredentialFromError).toHaveBeenCalledWith(taken);
  expect(mockSignInWithCredential).toHaveBeenCalledWith(mockAuthState, proofCredential);
  expect(user.uid).toBe('creator-9');
});

test('an account-exists error signs in with the temporaryProof, not the spent code', async () => {
  mockAuthState.currentUser = { uid: 'anon-1', isAnonymous: true };
  const taken = takenError('auth/account-exists-with-different-credential');
  mockCredentialFromError.mockImplementation((err) => {
    const response = err.customData?._tokenResponse;
    return response ? { ...response } : null;
  });
  mockLinkWithCredential.mockRejectedValue(taken);
  mockSignInWithCredential.mockResolvedValue({ user: { uid: 'creator-9' } });

  const user = await verifyPhoneCode('vid-1', '123456');

  expect(mockSignInWithCredential).toHaveBeenCalledTimes(1);
  expect(mockSignInWithCredential).toHaveBeenCalledWith(mockAuthState, proofCredential);
  expect(user.uid).toBe('creator-9');
});

test.each([
  'auth/credential-already-in-use',
  'auth/account-exists-with-different-credential',
])('after a failed %s link the original credential is never reused', async (code) => {
  mockAuthState.currentUser = { uid: 'anon-1', isAnonymous: true };
  mockLinkWithCredential.mockRejectedValue(takenError(code));
  mockCredentialFromError.mockReturnValue(proofCredential);
  mockSignInWithCredential.mockResolvedValue({ user: { uid: 'creator-9' } });

  await verifyPhoneCode('vid-1', '123456');

  mockSignInWithCredential.mock.calls.forEach(([, credential]) => {
    expect(credential).not.toEqual(expect.objectContaining({ verificationId: 'vid-1' }));
    expect(credential).not.toEqual(expect.objectContaining({ code: '123456' }));
  });
});

test('an in-use link with no recoverable credential asks for a new code', async () => {
  mockAuthState.currentUser = { uid: 'anon-1', isAnonymous: true };
  const taken = new Error('taken');
  taken.code = 'auth/credential-already-in-use';
  // A legacy err.credential is ignored: only credentialFromError's proof counts.
  taken.credential = { verificationId: 'vid-1', code: '123456' };
  mockLinkWithCredential.mockRejectedValue(taken);
  mockCredentialFromError.mockReturnValue(null);

  const err = await verifyPhoneCode('vid-1', '123456').catch((error) => error);
  expect(err.code).toBe(SPENT_CODE);
  expect(err.cause).toBe(taken);
  expect(phoneError(err, VERIFY_CODE_ERROR).message).toBe('Send a new code.');
  expect(mockSignInWithCredential).not.toHaveBeenCalled();
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
