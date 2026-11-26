import { cancelNativePhoneCode, nativePhoneErrorCode, sendNativePhoneCode } from './nativePhone';
import { PERSON_CHECK_CANCELLED } from '../phone/creatorSession';
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

const BLOCKED = 'We have blocked all requests from this device due to unusual activity. Try again later.';

test('native verification failure releases listeners and derives a code from the message', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/too-many-requests', message: BLOCKED });
  await ready();
  // Plugin 8.5.2 sends only the message, never a code.
  callbacks.phoneVerificationFailed({ message: BLOCKED });
  await check;
  expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
});

test('an explicit code in the failure payload wins over the message', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/quota-exceeded', message: BLOCKED });
  await ready();
  callbacks.phoneVerificationFailed({ message: BLOCKED, code: 'auth/quota-exceeded' });
  await check;
});

test('a code-sent event without a verification ID rejects with a code', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/missing-verification-id' });
  await ready();
  callbacks.phoneCodeSent({});
  await check;
});

test.each([
  [BLOCKED, 'auth/too-many-requests'],
  ['The quota for this operation has been exceeded.', 'auth/quota-exceeded'],
  ['The sms quota for the project has been exceeded.', 'auth/quota-exceeded'],
  ['The format of the phone number provided is incorrect. Please enter the phone number in a format that can be parsed into E.164 format. E.164 phone numbers are written in the format [+][country code][subscriber number including area code].', 'auth/invalid-phone-number'],
  ['TOO_SHORT', 'auth/invalid-phone-number'],
  ['TOO_LONG', 'auth/invalid-phone-number'],
  ['Invalid format.', 'auth/invalid-phone-number'],
  ['To send verification codes, provide a phone number for the recipient.', 'auth/missing-phone-number'],
  ['Network error (such as timeout, interrupted connection or unreachable host) has occurred.', 'auth/network-request-failed'],
  ['The reCAPTCHA response token provided is either invalid, expired, already spent or doesn\'t match the domain.', 'auth/captcha-check-failed'],
  ['The reCAPTCHA verification token is invalid or has expired.', 'auth/captcha-check-failed'],
  ['The interaction was cancelled by the user.', PERSON_CHECK_CANCELLED],
  ['The APNs device token provided is either incorrect or does not match the private certificate uploaded to the Firebase Console.', 'auth/invalid-app-credential'],
  ['The phone verification request is missing an APNs Device token. Firebase Auth automatically detects APNs Device Tokens, however, if method swizzling is disabled, the APNs token must be set via the APNSToken property on FIRAuth or by calling setAPNSToken:type on FIRAuth.', 'auth/missing-app-credential'],
  ['Firebase could not retrieve the silent push notification and therefore could not verify your app. Ensure that you configured your app correctly to receive push notifications.', 'auth/app-not-verified'],
  ['There seems to be a problem with your project\'s Firebase phone number authentication set-up, please make sure to follow the instructions found at https://firebase.google.com/docs/auth/ios/phone-auth', 'auth/missing-app-token'],
  ['This app is not authorized to use Firebase Authentication. Please verify that the correct package name, SHA-1, and SHA-256 are configured in the Firebase Console.', 'auth/app-not-authorized'],
  ['The given sign-in provider is disabled for this Firebase project. Enable it in the Firebase console, under the sign-in method tab of the Auth section.', 'auth/operation-not-allowed'],
  ['SMS unable to be sent until this region enabled by the app developer.', 'auth/operation-not-allowed'],
  ['BILLING_NOT_ENABLED','auth/billing-not-enabled'],
  ['An internal error has occurred, print and inspect the error details for more information.', 'auth/internal-error'],
  ['Something nobody planned for.', 'auth/native-send-failed'],
  ['', 'auth/native-send-failed'],
  [undefined, 'auth/native-send-failed'],
])('nativePhoneErrorCode(%p) is %p', (message, code) => {
  expect(nativePhoneErrorCode(message)).toBe(code);
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
