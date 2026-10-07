import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithCredential,
  signInWithCredential,
  signOut,
} from 'firebase/auth';
import { auth } from '../Config/firebase-config';

const ALREADY_IN_USE = new Set([
  'auth/credential-already-in-use',
  'auth/email-already-in-use',
  'auth/account-exists-with-different-credential',
]);

let verifier = null;
let verifierNode = null;
let verifierSlot = null;
let verifierBroken = false;
let failPendingCheck = null;

function unavailable() {
  const err = new Error('Phone sign-in is unavailable.');
  err.code = 'auth/unavailable';
  return err;
}

function checkFailed() {
  const err = new Error('The person check could not finish.');
  err.code = 'auth/captcha-check-failed';
  return err;
}

function disposeVerifier() {
  if (verifier) {
    try {
      verifier.clear();
    } catch (err) {
      // The widget may already be gone.
    }
  }
  if (verifierNode && verifierNode.parentNode) verifierNode.parentNode.removeChild(verifierNode);
  verifier = null;
  verifierNode = null;
  verifierSlot = null;
  verifierBroken = false;
  failPendingCheck = null;
}

export function releasePhoneCheck() {
  disposeVerifier();
}

export function resetPhoneAuthForTests() {
  releasePhoneCheck();
}

// Invisible reCAPTCHA renders straight into its container and clear() leaves
// it there, so every verifier gets a fresh child of the slot.
function phoneVerifier(slot) {
  if (verifier && verifierSlot === slot && !verifierBroken) return verifier;
  disposeVerifier();
  const node = document.createElement('div');
  slot.appendChild(node);
  // A fresh params object every time. Firebase writes the site key onto it.
  const next = new RecaptchaVerifier(auth, node, {
    size: 'invisible',
    badge: 'inline',
    'error-callback': () => {
      if (verifier !== next) return;
      if (failPendingCheck) failPendingCheck();
      else verifierBroken = true;
    },
  });
  verifier = next;
  verifierNode = node;
  verifierSlot = slot;
  return next;
}

// verify() only ever resolves. A grecaptcha error (offline, blocked) arrives
// on error-callback instead, so race it in as a failed check.
function checkedVerifier(appVerifier) {
  return {
    type: 'recaptcha',
    verify() {
      return new Promise((resolve, reject) => {
        failPendingCheck = () => reject(checkFailed());
        appVerifier.verify().then(resolve, reject);
      }).finally(() => {
        failPendingCheck = null;
      });
    },
    _reset() {
      appVerifier._reset();
    },
  };
}

export function mountPhoneCheck(container) {
  if (!auth || !container) return Promise.resolve();
  return phoneVerifier(container).render();
}

export async function sendPhoneCode(e164, container) {
  if (!auth || !container) throw unavailable();
  const provider = new PhoneAuthProvider(auth);
  const appVerifier = phoneVerifier(container);
  try {
    return await provider.verifyPhoneNumber(e164, checkedVerifier(appVerifier));
  } catch (err) {
    // Only a failed send replaces the check. The next send renders a new one.
    if (verifier === appVerifier) disposeVerifier();
    throw err;
  }
}

async function signInWithPhone(credential) {
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export function signOutCreator() {
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

export async function verifyPhoneCode(verificationId, code) {
  if (!auth) throw unavailable();
  const credential = PhoneAuthProvider.credential(verificationId, code);
  const current = auth.currentUser;
  if (!current) return signInWithPhone(credential);

  try {
    const result = await linkWithCredential(current, credential);
    return result.user;
  } catch (err) {
    if (ALREADY_IN_USE.has(err?.code)) {
      return signInWithPhone(err.credential || credential);
    }
    throw err;
  }
}
