import { cancelNativePhoneCode, nativePhoneErrorCode, sendNativePhoneCode } from './nativePhone';
import { PERSON_CHECK_CANCELLED, SEND_CODE_ERROR, phoneError } from '../phone/creatorSession';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const callbacks = {};
const removers = [];
jest.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: { addListener: jest.fn(), signInWithPhoneNumber: jest.fn() },
}));

let errorLog;
beforeEach(() => {
  jest.useFakeTimers();
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  removers.length = 0;
  FirebaseAuthentication.addListener.mockImplementation(async (event, callback) => {
    callbacks[event] = callback;
    const remove = jest.fn(async () => {});
    removers.push(remove);
    return { remove };
  });
  FirebaseAuthentication.signInWithPhoneNumber.mockResolvedValue();
});
afterEach(() => { cancelNativePhoneCode(); jest.useRealTimers(); errorLog.mockRestore(); });
const logged = () => errorLog.mock.calls.map((args) => args.join(' ')).join('\n');
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

const TOO_MANY = 'We have blocked all requests from this device due to unusual activity. Try again later.';

test('native verification failure releases listeners and derives a code from the iOS message', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/too-many-requests', message: TOO_MANY });
  await ready();
  // The iOS plugin sends only localizedDescription, no code.
  callbacks.phoneVerificationFailed({ message: TOO_MANY });
  await check;
  expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  expect(logged()).toContain('[Friendly] Native phone send failed: auth/too-many-requests');
  expect(logged()).not.toContain('5551234567');
});

test('a code on the event wins over the message', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/quota-exceeded' });
  await ready();
  callbacks.phoneVerificationFailed({ message: TOO_MANY, code: 'auth/quota-exceeded' });
  await check;
});

test('closing the reCAPTCHA sheet is the same silent reset as on the web', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });
  await ready();
  callbacks.phoneVerificationFailed({ message: 'The interaction was cancelled by the user.' });
  await check;
});

test('an unconfigured plugin is tagged and logged with a setup hint', async () => {
  FirebaseAuthentication.signInWithPhoneNumber.mockRejectedValue(new Error(
    "Phone sign-in provider is not enabled. Make sure to add the provider to the 'providers' list in the Capacitor configuration.",
  ));
  const pending = sendNativePhoneCode('+15551234567');
  await expect(pending).rejects.toMatchObject({ code: 'native/not-configured' });
  expect(logged()).toContain('[Friendly] Native phone send failed: native/not-configured');
  expect(logged()).toContain('GoogleService-Info.plist');
  expect(logged()).not.toContain('5551234567');
  expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
});

test('an unimplemented plugin is tagged as not configured', async () => {
  FirebaseAuthentication.signInWithPhoneNumber.mockRejectedValue(
    Object.assign(new Error('"FirebaseAuthentication" plugin is not implemented on ios'), { code: 'UNIMPLEMENTED' }),
  );
  await expect(sendNativePhoneCode('+15551234567')).rejects.toMatchObject({ code: 'native/not-configured' });
});

test('other send rejections keep their own code', async () => {
  FirebaseAuthentication.signInWithPhoneNumber.mockRejectedValue(
    Object.assign(new Error('Something else'), { code: 'auth/internal-error' }),
  );
  await expect(sendNativePhoneCode('+15551234567')).rejects.toMatchObject({ code: 'auth/internal-error' });
});

test.each([
  [TOO_MANY, 'auth/too-many-requests'],
  ['The format of the phone number provided is incorrect. Please enter the phone number in a format that can be parsed into E.164 format.', 'auth/invalid-phone-number'],
  ['Network error (such as timeout, interrupted connection or unreachable host) has occurred.', 'auth/network-request-failed'],
  ['The quota for this operation has been exceeded.', 'auth/quota-exceeded'],
  ['The reCAPTCHA response token provided is either invalid, expired or already', 'auth/captcha-check-failed'],
  ['The interaction was cancelled by the user.', PERSON_CHECK_CANCELLED],
  ['The given sign-in provider is disabled for this Firebase project. Enable it in the Firebase console.', 'auth/operation-not-allowed'],
  ['This app is not authorized to use Firebase Authentication with the provided API key.', 'auth/app-not-authorized'],
  ['An internal error has occurred, print and inspect the error details for more information.', 'auth/internal-error'],
  ['An internal error has occurred within the SFSafariViewController or WKWebView.', 'auth/web-internal-error'],
  ['There seems to be a problem with your project\'s Firebase phone number authentication set-up, please make sure to follow the instructions found at https://firebase.google.com/docs/auth/ios/phone-auth', 'auth/missing-app-token'],
  ['If app delegate swizzling is disabled, remote notifications received by UIApplicationDelegate need to be forwarded', 'auth/notification-not-forwarded'],
  ['The reCAPTCHA SDK is not linked to your app.', 'auth/recaptcha-sdk-not-linked'],
  ['An invalid API Key was supplied in the request.', 'auth/invalid-api-key'],
  ['Something nobody has seen before.', ''],
  [undefined, ''],
])('classifies %p as %p', (message, code) => {
  expect(nativePhoneErrorCode(message)).toBe(code);
});

test('classified codes reuse existing copy and unknown ones fall back', () => {
  expect(phoneError({ code: nativePhoneErrorCode(TOO_MANY) }, SEND_CODE_ERROR).message).toBe('Too many tries. Wait a moment.');
  expect(phoneError({ code: 'native/not-configured' }, SEND_CODE_ERROR).message).toBe(SEND_CODE_ERROR);
  expect(phoneError({ code: nativePhoneErrorCode('Something new') || undefined }, SEND_CODE_ERROR).message).toBe(SEND_CODE_ERROR);
});

test('a lost native callback times out instead of trapping the creator', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/timeout' });
  await ready();
  jest.advanceTimersByTime(120000);
  await check;
  expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  expect(logged()).toContain('[Friendly] Native phone send failed: auth/timeout');
  expect(logged()).not.toContain('5551234567');
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
