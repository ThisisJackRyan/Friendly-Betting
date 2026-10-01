import { isCreator, settleBlock } from './creator';
import {
  maskPhone,
  nationalFromInput,
  phoneFieldValue,
  toE164,
} from './phoneNumber';
import { shouldSignIntoExisting, upgradeWithPhoneCredential } from './phoneCredential';

const phoneUser = {
  uid: 'creator',
  phoneNumber: '+14155551212',
  providerData: [{ providerId: 'phone', phoneNumber: '+14155551212' }],
};

const anonUser = {
  uid: 'anon-1',
  isAnonymous: true,
  providerData: [],
};

test('isCreator is a linked phone provider', () => {
  expect(isCreator(null)).toBe(false);
  expect(isCreator(anonUser)).toBe(false);
  expect(isCreator({ uid: 'local', isLocal: true, providerData: [{ providerId: 'phone' }] })).toBe(false);
  expect(isCreator({ uid: 'a', phoneNumber: '+14155551212', providerData: [] })).toBe(false);
  expect(isCreator(phoneUser)).toBe(true);
});

test('settleBlock allows only the phone uid that created the bet', () => {
  const bet = { createdByID: 'creator', status: 'open' };
  expect(settleBlock(phoneUser, bet)).toBe('');
  expect(settleBlock(anonUser, bet)).toMatch(/phone/i);
  expect(settleBlock(
    { uid: 'someone-else', providerData: [{ providerId: 'phone' }] },
    bet,
  )).toMatch(/creator/i);
  expect(settleBlock(phoneUser, { ...bet, status: 'closed' })).toMatch(/settled/i);
  expect(settleBlock(phoneUser, null)).toMatch(/gone/i);
});

test('formats a US phone with +1 as the default', () => {
  expect(nationalFromInput('+1 (415) 555-1212')).toBe('4155551212');
  expect(nationalFromInput('4155551212')).toBe('4155551212');
  expect(phoneFieldValue('')).toBe('+1 ');
  expect(phoneFieldValue('4155551212')).toBe('+1 (415) 555-1212');
  expect(toE164('4155551212')).toBe('+14155551212');
  expect(toE164('14155551212')).toBe('+14155551212');
  expect(toE164('555')).toBe('');
  expect(maskPhone('+14155551212')).toBe('•••1212');
});

test('upgrade links an anonymous creator so existing bets keep their uid', async () => {
  const credential = { id: 'cred' };
  const link = jest.fn(async () => ({
    user: { uid: 'anon-1', providerData: [{ providerId: 'phone' }] },
  }));
  const signIn = jest.fn();
  const next = await upgradeWithPhoneCredential(anonUser, credential, {
    auth: { id: 'auth' },
    linkWithCredential: link,
    signInWithCredential: signIn,
  });
  expect(link).toHaveBeenCalledWith(anonUser, credential);
  expect(signIn).not.toHaveBeenCalled();
  expect(next.uid).toBe('anon-1');
  expect(shouldSignIntoExisting({ code: 'auth/network-request-failed' })).toBe(false);
});

test('upgrade signs into the existing phone account when the number is taken', async () => {
  const credential = { id: 'cred' };
  const taken = Object.assign(new Error('taken'), { code: 'auth/credential-already-in-use' });
  const link = jest.fn(async () => {
    throw taken;
  });
  const signIn = jest.fn(async () => ({ user: { uid: 'phone-user' } }));
  const next = await upgradeWithPhoneCredential(anonUser, credential, {
    auth: { id: 'auth' },
    linkWithCredential: link,
    signInWithCredential: signIn,
    credentialFromError: () => ({ id: 'existing' }),
  });
  expect(shouldSignIntoExisting(taken)).toBe(true);
  expect(signIn).toHaveBeenCalledWith({ id: 'auth' }, { id: 'existing' });
  expect(next.uid).toBe('phone-user');
});

test('upgrade signs in when there is no firebase user to link', async () => {
  const signIn = jest.fn(async () => ({ user: { uid: 'phone-user' } }));
  const link = jest.fn();
  const next = await upgradeWithPhoneCredential(
    { uid: 'local-friend', isLocal: true },
    { id: 'cred' },
    {
      auth: { id: 'auth' },
      linkWithCredential: link,
      signInWithCredential: signIn,
    },
  );
  expect(link).not.toHaveBeenCalled();
  expect(signIn).toHaveBeenCalledWith({ id: 'auth' }, { id: 'cred' });
  expect(next.uid).toBe('phone-user');
});

test('upgrade rethrows when linking fails for another reason', async () => {
  const error = Object.assign(new Error('bad code'), { code: 'auth/invalid-verification-code' });
  const link = jest.fn(async () => {
    throw error;
  });
  const signIn = jest.fn();
  await expect(upgradeWithPhoneCredential(anonUser, { id: 'cred' }, {
    auth: {},
    linkWithCredential: link,
    signInWithCredential: signIn,
  })).rejects.toBe(error);
  expect(signIn).not.toHaveBeenCalled();
});
