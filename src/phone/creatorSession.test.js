import {
  adjacentCreateStep,
  AUTH_COPY,
  canSettleBet,
  codeSentCopy,
  createStepOrder,
  CREATE_STEP,
  formatUsNational,
  isCreator,
  maskPhone,
  phoneError,
  SEND_CODE_ERROR,
  toE164Us,
  VERIFY_CODE_ERROR,
} from './creatorSession';

const phoneUser = {
  uid: 'creator-1',
  phoneNumber: '+15551234567',
  providerData: [{ providerId: 'phone' }],
};

const anonUser = {
  uid: 'anon-1',
  isAnonymous: true,
  providerData: [{ providerId: 'anonymous' }],
};

test('isCreator is a linked phone provider', () => {
  expect(isCreator(null)).toBe(false);
  expect(isCreator({ uid: 'local', isLocal: true, providerData: [{ providerId: 'phone' }] })).toBe(false);
  expect(isCreator(anonUser)).toBe(false);
  expect(isCreator({ uid: 'mail', providerData: [{ providerId: 'password' }] })).toBe(false);
  expect(isCreator(phoneUser)).toBe(true);
});

test('create slide order inserts phone and code unless a phone session exists', () => {
  expect(createStepOrder(null)).toEqual([
    CREATE_STEP.type,
    CREATE_STEP.details,
    CREATE_STEP.stake,
    CREATE_STEP.phone,
    CREATE_STEP.code,
    CREATE_STEP.share,
  ]);
  expect(createStepOrder(anonUser)).toEqual(createStepOrder(null));
  expect(createStepOrder(phoneUser)).toEqual([
    CREATE_STEP.type,
    CREATE_STEP.details,
    CREATE_STEP.stake,
    CREATE_STEP.share,
  ]);
  expect(adjacentCreateStep(CREATE_STEP.stake, phoneUser, 1)).toBe(CREATE_STEP.share);
  expect(adjacentCreateStep(CREATE_STEP.stake, anonUser, 1)).toBe(CREATE_STEP.phone);
  expect(adjacentCreateStep(CREATE_STEP.phone, anonUser, 1)).toBe(CREATE_STEP.code);
  expect(adjacentCreateStep(CREATE_STEP.code, anonUser, 1)).toBe(CREATE_STEP.share);
  expect(adjacentCreateStep(CREATE_STEP.share, phoneUser, -1)).toBe(CREATE_STEP.stake);
  expect(adjacentCreateStep(CREATE_STEP.code, phoneUser, 1)).toBe(CREATE_STEP.share);
});

test('the phone sample is an ordinary example, and a typed test number still parses', () => {
  expect(AUTH_COPY.phonePlaceholder).toBe('(555) 555-0100');
  const sample = [
    AUTH_COPY.phonePlaceholder,
    AUTH_COPY.textLine,
    AUTH_COPY.bettorLine,
    AUTH_COPY.send,
  ].join('\n');
  expect(sample).not.toContain('555-555-5555');
  expect(sample).not.toContain('5555555555');
  expect(toE164Us('5555555555')).toBe('+15555555555');
  expect(formatUsNational('5555555555')).toBe('(555) 555-5555');
});

test('US numbers default to +1 and codes mask the tail', () => {
  expect(toE164Us('5551234567')).toBe('+15551234567');
  expect(toE164Us('(555) 123-4567')).toBe('+15551234567');
  expect(toE164Us('15551234567')).toBe('+15551234567');
  expect(toE164Us('555')).toBe('');
  expect(formatUsNational('5551234567')).toBe('(555) 123-4567');
  expect(maskPhone('+15551234567')).toBe('•••4567');
  expect(codeSentCopy('+15551234567')).toBe('Code sent to •••4567.');
});

test('mapped Firebase codes keep their friendly copy and hide the code', () => {
  const mapped = {
    'auth/invalid-phone-number': 'That number doesn\u2019t look right.',
    'auth/missing-phone-number': 'Enter a phone number.',
    'auth/too-many-requests': 'Too many tries. Wait a moment.',
    'auth/invalid-verification-code': 'That code doesn\u2019t match.',
    'auth/code-expired': 'That code expired. Resend it.',
    'auth/invalid-verification-id': 'Send a new code.',
    'auth/captcha-check-failed': 'Couldn\u2019t confirm you\u2019re a person. Try again.',
    'auth/quota-exceeded': 'Texting is paused. Try again later.',
    'auth/network-request-failed': 'You\u2019re offline. Try again.',
  };
  Object.entries(mapped).forEach(([code, copy]) => {
    expect(phoneError({
      code,
      message: `Firebase: A longer server explanation. (${code}).`,
    }, SEND_CODE_ERROR)).toEqual({ message: copy, code: '' });
  });
});

test('billing-not-enabled keeps its sentence and the muted raw code', () => {
  const message = 'Firebase: Billing account not configured. (auth/billing-not-enabled).';
  const expected = {
    message: 'Texting isn\u2019t set up yet.',
    code: 'auth/billing-not-enabled',
  };
  expect(phoneError({
    code: 'auth/billing-not-enabled',
    message,
  }, SEND_CODE_ERROR)).toEqual(expected);
  expect(phoneError({
    code: '  auth/billing-not-enabled  ',
    message,
  }, VERIFY_CODE_ERROR)).toEqual(expected);
});

test('an unmapped send failure uses the short line and the raw code', () => {
  expect(SEND_CODE_ERROR).toBe('Couldn\u2019t send a code. Try again.');
  const err = {
    code: 'auth/operation-not-allowed',
    message: 'Firebase: The given sign-in provider is disabled for this Firebase project. (auth/operation-not-allowed).',
  };
  expect(phoneError(err, SEND_CODE_ERROR)).toEqual({
    message: 'Couldn\u2019t send a code. Try again.',
    code: 'auth/operation-not-allowed',
  });
});

test('an unmapped verify failure uses the verify line and the raw code', () => {
  expect(VERIFY_CODE_ERROR).toBe('Couldn\u2019t verify that code. Try again.');
  const err = {
    code: 'auth/missing-client-identifier',
    message: 'Firebase: Error (auth/missing-client-identifier).',
  };
  expect(phoneError(err, VERIFY_CODE_ERROR)).toEqual({
    message: 'Couldn\u2019t verify that code. Try again.',
    code: 'auth/missing-client-identifier',
  });
});

test('a failure without a Firebase code keeps the human line and omits a code', () => {
  expect(phoneError(new Error('socket hang up'), SEND_CODE_ERROR)).toEqual({
    message: SEND_CODE_ERROR,
    code: '',
  });
  expect(phoneError(null, VERIFY_CODE_ERROR)).toEqual({
    message: VERIFY_CODE_ERROR,
    code: '',
  });
});

test('settle requires the phone creator who owns the bet', () => {
  const open = { status: 'open', createdByID: 'creator-1' };
  expect(canSettleBet(phoneUser, open)).toBe(true);
  expect(canSettleBet({ ...phoneUser, uid: 'someone-else' }, open)).toBe(false);
  expect(canSettleBet(anonUser, { ...open, createdByID: 'anon-1' })).toBe(false);
  expect(canSettleBet(phoneUser, { ...open, status: 'closed', winnerId: 'a' })).toBe(false);
  expect(canSettleBet(phoneUser, { ...open, status: 'closed', winnerId: null })).toBe(true);
  expect(canSettleBet(null, open)).toBe(false);
});
