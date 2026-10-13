let cancelPending = null;

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
        else finish(new Error('Couldn’t send a code. Try again.'));
      });
      if (finished) return;
      await listen('phoneVerificationFailed', ({ message, code }) => finish(Object.assign(new Error(message || 'Couldn’t send a code. Try again.'), { code })));
      if (finished) return;
      // Explicit code entry keeps the same creator-only OTP UI on both platforms.
      await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber, timeout: 0, skipNativeAuth: true });
    };
    start().catch((error) => finish(error));
  });
}
