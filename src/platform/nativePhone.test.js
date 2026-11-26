import {
  cancelNativePhoneCode, nativeErrorFrom, nativePhoneErrorCode, redactDetail, sendNativePhoneCode,
} from './nativePhone';
import { PERSON_CHECK_CANCELLED } from '../phone/creatorSession';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const callbacks = {};
const removers = [];
jest.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: { addListener: jest.fn(), signInWithPhoneNumber: jest.fn() },
}));

let errorSpy;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
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
afterEach(() => { cancelNativePhoneCode(); jest.useRealTimers(); errorSpy.mockRestore(); });
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
  await expect(pending).rejects.toMatchObject({ detail: BLOCKED });
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
  ['The operation couldn\u2019t be completed. (FirebaseAuthenticationPlugin.RuntimeError error 1.)', 'auth/native-plugin-error-1'],
  ["The operation couldn't be completed. (FirebaseAuthenticationPlugin.RuntimeError error 1.)", 'auth/native-plugin-error-1'],
  ["Phone sign-in provider is not enabled. Make sure to add the provider to the 'providers' list in the Capacitor configuration.", 'auth/native-provider-not-enabled'],
  ['Could not locate configuration file: GoogleService-Info.plist', 'auth/native-not-configured'],
  ['No default Firebase app has been configured.', 'auth/native-not-configured'],
  ['Something nobody planned for.', 'auth/native-send-failed'],
  ['', 'auth/native-send-failed'],
  [undefined, 'auth/native-send-failed'],
])('nativePhoneErrorCode(%p) is %p', (message, code) => {
  expect(nativePhoneErrorCode(message)).toBe(code);
});

test('a lost native callback times out instead of trapping the creator', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/timeout', detail: 'timed out after 120s' });
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

const RUNTIME_CURLY = 'The operation couldn’t be completed. (FirebaseAuthenticationPlugin.RuntimeError error 1.)';
const RUNTIME_STRAIGHT = "The operation couldn't be completed. (FirebaseAuthenticationPlugin.RuntimeError error 1.)";
const PROVIDER_OFF = "Phone sign-in provider is not enabled. Make sure to add the provider to the 'providers' list in the Capacitor configuration.";

async function sendRejecting(rejection) {
  FirebaseAuthentication.signInWithPhoneNumber.mockRejectedValue(rejection);
  const pending = sendNativePhoneCode('+15551234567');
  const settled = pending.then(() => { throw new Error('resolved'); }, (err) => err);
  await ready();
  return settled;
}

test.each([RUNTIME_CURLY, RUNTIME_STRAIGHT])('a plugin RuntimeError rejection (%p) gets a code and detail', async (message) => {
  const err = await sendRejecting({ message });
  expect(err.code).toBe('auth/native-plugin-error-1');
  expect(err.detail).toContain('RuntimeError error 1');
  expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(true);
});

test('a provider-not-enabled rejection maps to its own code', async () => {
  const err = await sendRejecting(new Error(PROVIDER_OFF));
  expect(err.code).toBe('auth/native-provider-not-enabled');
  expect(err.detail).toContain('sign-in provider is not enabled');
});

test('a Capacitor UNIMPLEMENTED rejection maps to a native code', async () => {
  const err = await sendRejecting({ code: 'UNIMPLEMENTED', message: 'not implemented on ios' });
  expect(err.code).toBe('auth/native-unimplemented');
  expect(err.detail).toContain('not implemented on ios');
});

test('a synchronous throw from signInWithPhoneNumber still rejects with a code and detail', async () => {
  FirebaseAuthentication.signInWithPhoneNumber.mockImplementation(() => { throw new Error('boom'); });
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/native-send-failed', detail: 'boom' });
  await ready();
  await check;
});

test('one redacted console.error per failure, never the phone number', async () => {
  const err = await sendRejecting({ message: 'Could not text +15551234567 right now', data: { domain: 'FIRAuthErrorDomain', code: 17999, phone: '+15551234567' } });
  expect(err.detail).not.toContain('5551234567');
  expect(err.message).not.toContain('5551234567');
  expect(err.detail).toContain('[redacted]');
  expect(err.detail).toContain('domain=FIRAuthErrorDomain');
  expect(errorSpy).toHaveBeenCalledTimes(1);
  expect(errorSpy.mock.calls[0][0]).toBe('[phone-auth] native send failed');
  const logged = JSON.stringify(errorSpy.mock.calls[0]);
  expect(logged).not.toContain('5551234567');
  expect(logged).not.toContain('555123');
  expect(errorSpy.mock.calls[0][1]).toMatchObject({ code: 'auth/native-send-failed' });
});

test('cancelling and a closed person check do not log', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/cancelled' });
  cancelNativePhoneCode();
  await check;
  const next = sendNativePhoneCode('+15551234567');
  const closed = expect(next).rejects.toMatchObject({ code: PERSON_CHECK_CANCELLED });
  await ready();
  callbacks.phoneVerificationFailed({ message: 'The interaction was cancelled by the user.' });
  await closed;
  expect(errorSpy).not.toHaveBeenCalled();
});

test('a code-sent event without an ID carries a detail', async () => {
  const pending = sendNativePhoneCode('+15551234567');
  const check = expect(pending).rejects.toMatchObject({ code: 'auth/missing-verification-id', detail: expect.any(String) });
  await ready();
  callbacks.phoneCodeSent({});
  await check;
  expect(errorSpy).toHaveBeenCalledTimes(1);
});

test.each([
  [undefined, 'auth/native-send-failed'],
  ['plain string', 'auth/native-send-failed'],
  [{ code: 'auth/quota-exceeded', message: 'x' }, 'auth/quota-exceeded'],
  [{ code: 'UNAVAILABLE', message: 'not available' }, 'auth/native-unavailable'],
  [{ code: 'auth/', message: RUNTIME_STRAIGHT }, 'auth/native-plugin-error-1'],
])('nativeErrorFrom(%p) has code %p', (raw, code) => {
  const err = nativeErrorFrom(raw);
  expect(err).toBeInstanceOf(Error);
  expect(err.code).toBe(code);
  expect(typeof err.detail).toBe('string');
  expect(err.message).toBeTruthy();
});

describe('redactDetail', () => {
  test.each([
    ['call +1 (555) 123-4567 now', 'call [redacted] now'],
    ['number 5551234567', 'number [redacted]'],
    ['dots 555.123.4567', 'dots [redacted]'],
    ['code 123456 stays', 'code 123456 stays'],
    ['  lots\n of\t space  ', 'lots of space'],
    [undefined, ''],
  ])('%p -> %p', (input, output) => {
    expect(redactDetail(input)).toBe(output);
  });

  test('truncates to 160 with three dots', () => {
    const out = redactDetail('a'.repeat(400));
    expect(out).toHaveLength(160);
    expect(out.endsWith('...')).toBe(true);
    expect(redactDetail('a'.repeat(160))).toBe('a'.repeat(160));
  });
});
