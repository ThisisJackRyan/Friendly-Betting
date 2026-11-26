import { PERSON_CHECK_CANCELLED } from '../phone/creatorSession';

let cancelPending = null;

// @capacitor-firebase/authentication only forwards the native error message on
// phoneVerificationFailed (iOS localizedDescription, Android getMessage), never a
// code. Match key phrases from the Firebase iOS and Android SDK messages to the
// web-style codes phoneError() understands. First match wins. On iOS the
// server's detail text can replace the SDK message when the backend sends one.
const NATIVE_PHONE_ERRORS = [
  [/blocked all requests from this device|unusual activity|too many/i, 'auth/too-many-requests'],
  [/quota/i, 'auth/quota-exceeded'],
  [/format of the phone number|invalid phone number|^(too_short|too_long)$|invalid format/i, 'auth/invalid-phone-number'],
  [/provide a phone number|missing phone number/i, 'auth/missing-phone-number'],
  [/network error/i, 'auth/network-request-failed'],
  [/recaptcha response token|token is invalid or has expired/i, 'auth/captcha-check-failed'],
  [/interaction was cancelled by the user/i, PERSON_CHECK_CANCELLED],
  [/apns device token provided is either incorrect/i, 'auth/invalid-app-credential'],
  [/missing an apns device token/i, 'auth/missing-app-credential'],
  [/silent push notification/i, 'auth/app-not-verified'],
  [/phone number authentication set-up/i, 'auth/missing-app-token'],
  [/not authorized to use firebase authentication/i, 'auth/app-not-authorized'],
  [/sign-in provider is disabled/i, 'auth/operation-not-allowed'],
  [/sms unable to be sent|region enabled/i, 'auth/operation-not-allowed'],
  [/billing/i, 'auth/billing-not-enabled'],
  [/internal error/i, 'auth/internal-error'],
];

export function nativePhoneErrorCode(message) {
  const text = String(message || '');
  const match = NATIVE_PHONE_ERRORS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : 'auth/native-send-failed';
}

export function cancelNativePhoneCode() {
  cancelPending?.();
}

// Use the native verifier only to obtain the SMS verification ID. The existing
// Firebase JS credential-linking flow owns identity, Firestore and sign-out on
// both platforms, so an anonymous participant keeps their picks after signing in.
export function sendNativePhoneCode(phoneNumber) {
  cancelNativePhoneCode();
  return new Promise((resolve, reject) => {
    let finished = false;
    const handles = [];
    const finish = (error, id) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      handles.forEach((handle) => handle.remove().catch(() => {}));
      if (cancelPending === cancel) cancelPending = null;
      if (error) reject(error);
      else resolve(id);
    };
    const cancel = () => finish(Object.assign(new Error('Phone verification was cancelled.'), { code: 'auth/cancelled' }));
    cancelPending = cancel;
    const timer = setTimeout(() => finish(Object.assign(new Error('The code took too long. Try sending it again.'), { code: 'auth/timeout' })), 120000);
    const start = async () => {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const listen = async (event, callback) => {
        const handle = await FirebaseAuthentication.addListener(event, callback);
        if (finished) await handle.remove();
        else handles.push(handle);
      };
      if (finished) return;
      await listen('phoneCodeSent', ({ verificationId }) => {
        if (verificationId) finish(null, verificationId);
        else finish(Object.assign(new Error('Couldn’t send a code. Try again.'), { code: 'auth/missing-verification-id' }));
      });
      if (finished) return;
      await listen('phoneVerificationFailed', ({ message, code } = {}) => finish(Object.assign(
        new Error(message || 'Couldn’t send a code. Try again.'),
        { code: code || nativePhoneErrorCode(message) },
      )));
      if (finished) return;
      // Explicit code entry keeps the same creator-only OTP UI on both platforms.
      await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber, timeout: 0, skipNativeAuth: true });
    };
    start().catch((error) => finish(error));
  });
}
