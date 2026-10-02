import {
  adjacentCreateStep,
  canSettleBet,
  codeSentCopy,
  createStepOrder,
  CREATE_STEP,
  formatUsNational,
  isCreator,
  maskPhone,
  toE164Us,
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

test('US numbers default to +1 and codes mask the tail', () => {
  expect(toE164Us('5551234567')).toBe('+15551234567');
  expect(toE164Us('(555) 123-4567')).toBe('+15551234567');
  expect(toE164Us('15551234567')).toBe('+15551234567');
  expect(toE164Us('555')).toBe('');
  expect(formatUsNational('5551234567')).toBe('(555) 123-4567');
  expect(maskPhone('+15551234567')).toBe('•••4567');
  expect(codeSentCopy('+15551234567')).toBe('Code sent to •••4567.');
});

test('settle requires the phone creator who owns the bet', () => {
  const open = { status: 'open', createdByID: 'creator-1' };
  expect(canSettleBet(phoneUser, open)).toBe(true);
  expect(canSettleBet({ ...phoneUser, uid: 'someone-else' }, open)).toBe(false);
  expect(canSettleBet(anonUser, { ...open, createdByID: 'anon-1' })).toBe(false);
  expect(canSettleBet(phoneUser, { ...open, status: 'closed' })).toBe(false);
  expect(canSettleBet(null, open)).toBe(false);
});
