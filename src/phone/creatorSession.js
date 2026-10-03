export const PHONE_PROVIDER = 'phone';

export const CREATE_STEP = {
  type: 1,
  details: 2,
  stake: 3,
  phone: 4,
  code: 5,
  share: 6,
};

const CREATE_ORDER = [
  CREATE_STEP.type,
  CREATE_STEP.details,
  CREATE_STEP.stake,
  CREATE_STEP.phone,
  CREATE_STEP.code,
  CREATE_STEP.share,
];

export const AUTH_COPY = {
  phoneTitle: 'Phone',
  codeTitle: 'Code',
  textLine: 'We\u2019ll text a code.',
  bettorLine: 'Friends still vote with one tap \u2014 no account.',
  send: 'Send code',
  sending: 'Sending\u2026',
  verify: 'Verify',
  verifying: 'Verifying\u2026',
  resend: 'Resend',
  change: 'Change number',
};

const PHONE_ERRORS = {
  'auth/invalid-phone-number': 'That number doesn\u2019t look right.',
  'auth/missing-phone-number': 'Enter a phone number.',
  'auth/too-many-requests': 'Too many tries. Wait a moment.',
  'auth/invalid-verification-code': 'That code doesn\u2019t match.',
  'auth/code-expired': 'That code expired. Resend it.',
  'auth/invalid-verification-id': 'Send a new code.',
  'auth/captcha-check-failed': 'Couldn\u2019t confirm you\u2019re a person. Try again.',
  'auth/quota-exceeded': 'Texting is paused. Try again later.',
  'auth/network-request-failed': 'You\u2019re offline. Try again.',
  'auth/billing-not-enabled': 'Texting isn\u2019t set up yet.',
};

export const SEND_CODE_ERROR = 'Couldn\u2019t send a code. Try again.';
export const VERIFY_CODE_ERROR = 'Couldn\u2019t verify that code. Try again.';

export function isCreator(user) {
  if (!user || user.isLocal) return false;
  return (user.providerData || []).some((provider) => provider?.providerId === PHONE_PROVIDER);
}

export function nationalDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export function formatUsNational(value) {
  const digits = nationalDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function toE164Us(value) {
  const digits = nationalDigits(value);
  if (digits.length !== 10) return '';
  return `+1${digits}`;
}

export function maskPhone(e164) {
  const tail = String(e164 || '').replace(/\D/g, '').slice(-4);
  return `\u2022\u2022\u2022${tail}`;
}

export function codeSentCopy(e164) {
  return `Code sent to ${maskPhone(e164)}.`;
}

export function phoneError(err, fallback) {
  const code = typeof err?.code === 'string' ? err.code.trim() : '';
  if (code && PHONE_ERRORS[code]) {
    // Billing is a project setup miss, so the raw code stays under the sentence.
    const showCode = code === 'auth/billing-not-enabled';
    return { message: PHONE_ERRORS[code], code: showCode ? code : '' };
  }
  return { message: fallback, code };
}

export function createStepOrder(user) {
  if (isCreator(user)) {
    return [
      CREATE_STEP.type,
      CREATE_STEP.details,
      CREATE_STEP.stake,
      CREATE_STEP.share,
    ];
  }
  return CREATE_ORDER.slice();
}

export function adjacentCreateStep(current, user, direction) {
  const order = createStepOrder(user);
  const index = order.indexOf(current);
  if (index === -1) {
    if (direction > 0 && (current === CREATE_STEP.phone || current === CREATE_STEP.code)) {
      return CREATE_STEP.share;
    }
    if (direction < 0 && current === CREATE_STEP.share) return CREATE_STEP.stake;
    if (direction < 0 && current === CREATE_STEP.phone) return CREATE_STEP.stake;
    return null;
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= order.length) return null;
  return order[nextIndex];
}

export function canSettleBet(user, bet) {
  if (!isCreator(user) || !bet) return false;
  if (bet.status === 'closed') return false;
  return Boolean(user.uid && user.uid === bet.createdByID);
}
