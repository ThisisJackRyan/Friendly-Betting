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

function unavailable() {
  const err = new Error('Phone sign-in is unavailable.');
  err.code = 'auth/unavailable';
  return err;
}

export function releasePhoneCheck() {
  if (verifier) {
    try {
      verifier.clear();
    } catch (err) {
      // The widget may already be gone.
    }
  }
  verifier = null;
  verifierNode = null;
}

export function resetPhoneAuthForTests() {
  releasePhoneCheck();
}

function phoneVerifier(container) {
  if (verifier && verifierNode === container) return verifier;
  if (verifier) {
    try {
      verifier.clear();
    } catch (err) {
      // Replace a verifier bound to a previous container.
    }
  }
  // A fresh params object every time. Firebase writes the site key onto it.
  verifier = new RecaptchaVerifier(auth, container, { size: 'normal', theme: 'light' });
  verifierNode = container;
  return verifier;
}

export function mountPhoneCheck(container) {
  if (!auth || !container) return Promise.resolve();
  return phoneVerifier(container).render();
}

export async function sendPhoneCode(e164, container) {
  if (!auth || !container) throw unavailable();
  const appVerifier = phoneVerifier(container);
  const provider = new PhoneAuthProvider(auth);
  // Leave the widget mounted if this throws. Clearing it removes the challenge
  // a person still needs to finish.
  return provider.verifyPhoneNumber(e164, appVerifier);
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
