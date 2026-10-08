import { PERSON_CHECK_CANCELLED } from '../phone/creatorSession';

let cancelPending = null;

const NOT_CONFIGURED = 'native/not-configured';

// The iOS plugin only forwards error.localizedDescription, so map FirebaseAuth's
// iOS messages back to the codes the shared error copy understands. More
// specific phrases come first ("internal error" appears in two of them).
const IOS_ERROR_MESSAGES = [
  ['blocked all requests from this device', 'auth/too-many-requests'],
  ['format of the phone number', 'auth/invalid-phone-number'],
  ['network error', 'auth/network-request-failed'],
  ['quota for this operation', 'auth/quota-exceeded'],
  ['recaptcha response token', 'auth/captcha-check-failed'],
  ['interaction was cancelled by the user', PERSON_CHECK_CANCELLED],
  ['sign-in provider is disabled', 'auth/operation-not-allowed'],
  ['not authorized to use firebase authentication', 'auth/app-not-authorized'],
  ['sfsafariviewcontroller or wkwebview', 'auth/web-internal-error'],
  ['an internal error has occurred', 'auth/internal-error'],
  ['phone number authentication set-up', 'auth/missing-app-token'],
  ['app delegate swizzling is disabled', 'auth/notification-not-forwarded'],
  ['recaptcha sdk is not linked', 'auth/recaptcha-sdk-not-linked'],
  ['invalid api key', 'auth/invalid-api-key'],
];

export function nativePhoneErrorCode(message) {
  const text = String(message || '').toLowerCase();
  const match = IOS_ERROR_MESSAGES.find(([phrase]) => text.includes(phrase));
  return match ? match[1] : '';
}

// signInWithPhoneNumber rejects before any SMS when the plugin never set up
// Firebase (missing GoogleService-Info.plist, stale capacitor.config.json).
function sendError(error) {
  const message = String(error?.message || '');
  if (/provider is not enabled|not implemented/i.test(message)) {
    return Object.assign(new Error(message), { code: NOT_CONFIGURED, cause: error });
  }
  return error;
}

// Never log the phone number; the code and Firebase's message are enough.
function logFailure(error) {
  console.error(`[Friendly] Native phone send failed: ${error?.code || 'unknown'} – ${error?.message || ''}`);
  if (error?.code === NOT_CONFIGURED) {
    console.error('[Friendly] GoogleService-Info.plist must be in the App target (Copy Bundle Resources), then run `npx cap sync ios`.');
  }
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
    const fail = (error) => {
      if (finished) return;
      logFailure(error);
      finish(error);
    };
    const cancel = () => finish(Object.assign(new Error('Phone verification was cancelled.'), { code: 'auth/cancelled' }));
    cancelPending = cancel;
    const timer = setTimeout(() => fail(Object.assign(new Error('The code took too long. Try sending it again.'), { code: 'auth/timeout' })), 120000);
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
        else fail(new Error('Couldn’t send a code. Try again.'));
      });
      if (finished) return;
      await listen('phoneVerificationFailed', ({ message, code } = {}) => {
        const error = new Error(message || 'Couldn’t send a code. Try again.');
        error.code = code || nativePhoneErrorCode(message) || undefined;
        fail(error);
      });
      if (finished) return;
      // Explicit code entry keeps the same creator-only OTP UI on both platforms.
      await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber, timeout: 0, skipNativeAuth: true });
    };
    start().catch((error) => fail(sendError(error)));
  });
}
