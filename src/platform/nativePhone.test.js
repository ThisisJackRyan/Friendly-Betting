import { cancelNativePhoneCode, sendNativePhoneCode } from './nativePhone';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const callbacks = {};
const removers = [];
jest.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: { addListener: jest.fn(), signInWithPhoneNumber: jest.fn() },
}));

beforeEach(() => {
  jest.useFakeTimers();
  removers.length = 0;
  FirebaseAuthentication.addListener.mockImplementation(async (event, callback) => {
    callbacks[event] = callback;
    const remove = jest.fn(async () => {});
    removers.push(remove);
    return { remove };
  });
  FirebaseAuthentication.signInWithPhoneNumber.mockResolvedValue();
});
afterEach(() => { cancelNativePhoneCode(); jest.useRealTimers(); });
const ready = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('registers before sending and returns an ID for the shared Firebase credential flow', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  await ready();
  expect(FirebaseAuthentication.signInWithPhoneNumber).toHaveBeenCalledWith({
    phoneNumber: '+15551234567', timeout: 0, skipNativeAuth: true,
  });
  callbacks.phoneCodeSent({ verificationId: 'native-id' });
  await expect(pending).resolves.toBe('native-id');
  expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('native verification failure releases listeners and preserves the Firebase error', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/too-many-requests' });
  await ready();
  callbacks.phoneVerificationFailed({ message: 'Too many requests', code: 'auth/too-many-requests' });
  await check;
  expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
});

test('a lost native callback times out instead of trapping the creator', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/timeout' });
  await ready();
  jest.advanceTimersByTime(120000);
  await check;
  expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
});

test('leaving the flow before the plugin loads cancels without sending an SMS', async () => {
  FirebaseAuthentication.signInWithPhoneNumber.mockClear();
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/cancelled' });
  cancelNativePhoneCode();
  await check;
  await ready();
  expect(FirebaseAuthentication.signInWithPhoneNumber).not.toHaveBeenCalled();
});
