import { PERSON_CHECK_CANCELLED, SEND_CODE_ERROR } from '../phone/creatorSession';
import { redactDetail, redactDigits } from '../phone/redactDetail';

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
  // Plugin-side failures, mostly when Firebase was never configured natively.
  // iOS sends "The operation couldn't be completed. (...RuntimeError error 1.)".
  [/FirebaseAuthenticationPlugin\.RuntimeError error 1/i, 'auth/native-plugin-error-1'],
  [/sign-in provider is not enabled/i, 'auth/native-provider-not-enabled'],
  [/GoogleService-Info|firebase was not configured|no default firebase ?app/i, 'auth/native-not-configured'],
];

const NATIVE_SEND_FAILED = 'auth/native-send-failed';
const CAPACITOR_CODES = new Set(['UNIMPLEMENTED', 'UNAVAILABLE']);

export { redactDetail };

export function nativePhoneErrorCode(message) {
  const text = String(message || '');
  const match = NATIVE_PHONE_ERRORS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : NATIVE_SEND_FAILED;
}

function rawMessage(raw) {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw.message === 'string') return raw.message;
  if (raw && typeof raw.errorMessage === 'string') return raw.errorMessage;
  return '';
}

function rawCode(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return typeof raw.code === 'string' ? raw.code.trim() : '';
}

// "domain=... code=... keys=a,b" from a CapacitorException's data, an NSError
// domain or userInfo. Values pass through redactDetail later.
function rawExtras(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const data = raw.data && typeof raw.data === 'object' ? raw.data : null;
  const userInfo = raw.userInfo && typeof raw.userInfo === 'object' ? raw.userInfo : null;
  const parts = [];
  const domain = raw.domain || data?.domain;
  if (domain && typeof domain !== 'object') parts.push(`domain=${domain}`);
  const code = raw.code && !String(raw.code).startsWith('auth/') ? raw.code : data?.code;
  if (code !== undefined && code !== null && code !== '' && typeof code !== 'object') parts.push(`code=${code}`);
  const keys = [...new Set([...Object.keys(data || {}), ...Object.keys(userInfo || {})])];
  if (keys.length) parts.push(`keys=${keys.slice(0, 8).join(',')}`);
  return parts.join(' ');
}

// Normalizes anything the plugin, Capacitor or the import can throw into an
// Error with a code phoneError() reads and a redacted raw detail.
export function nativeErrorFrom(raw, fallbackCode = NATIVE_SEND_FAILED, options = {}) {
  const original = rawMessage(raw);
  const given = rawCode(raw);
  let code;
  if (options.code) code = options.code;
  else if (given.startsWith('auth/') && given.length > 'auth/'.length) code = given;
  else if (CAPACITOR_CODES.has(given.toUpperCase())) code = `auth/native-${given.toLowerCase()}`;
  else {
    code = nativePhoneErrorCode(original);
    if (code === NATIVE_SEND_FAILED && fallbackCode) code = fallbackCode;
  }
  const message = redactDigits(original) || redactDigits(options.message) || SEND_CODE_ERROR;
  const detail = redactDetail(options.detail !== undefined
    ? options.detail
    : [original, rawExtras(raw)].filter(Boolean).join(' '));
  return Object.assign(new Error(message), { code, detail });
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
      if (error) {
        if (error.code !== 'auth/cancelled' && error.code !== PERSON_CHECK_CANCELLED) {
          // One line per failure, all redacted. Never the number or any id.
          console.error('[phone-auth] native send failed', {
            code: error.code,
            message: redactDetail(error.message),
            detail: redactDetail(error.detail),
          });
        }
        reject(error);
      } else resolve(id);
    };
    const cancel = () => finish(Object.assign(new Error('Phone verification was cancelled.'), { code: 'auth/cancelled' }));
    cancelPending = cancel;
    const timer = setTimeout(() => finish(nativeErrorFrom(null, 'auth/timeout', {
      code: 'auth/timeout',
      message: 'The code took too long. Try sending it again.',
      detail: 'timed out after 120s',
    })), 120000);
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
        else {
          finish(nativeErrorFrom(null, 'auth/missing-verification-id', {
            code: 'auth/missing-verification-id',
            detail: 'phoneCodeSent without verificationId',
          }));
        }
      });
      if (finished) return;
      // An explicit code in the payload wins over the message.
      await listen('phoneVerificationFailed', (payload = {}) => {
        const given = typeof payload?.code === 'string' ? payload.code.trim() : '';
        finish(nativeErrorFrom(payload, NATIVE_SEND_FAILED, given ? { code: given } : {}));
      });
      if (finished) return;
      // Explicit code entry keeps the same creator-only OTP UI on both platforms.
      await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber, timeout: 0, skipNativeAuth: true });
    };
    // Plugin rejections (no code on iOS), sync throws and a failed import.
    start().catch((error) => finish(nativeErrorFrom(error)));
  });
}
