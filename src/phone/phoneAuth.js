import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithCredential,
  signInWithCredential,
} from 'firebase/auth';
import { auth } from '../Config/firebase-config';
import { upgradeWithPhoneCredential } from './phoneCredential';

let verifier = null;

function clearVerifier() {
  if (!verifier) return;
  const current = verifier;
  verifier = null;
  try {
    current.clear();
  } catch (err) {
    // The widget may already have been removed with the screen.
  }
}

export async function sendPhoneCode(e164, container) {
  if (!auth) throw new Error('Auth is unavailable.');
  if (!container) throw new Error('Couldn\u2019t confirm this device. Try again.');
  clearVerifier();
  verifier = new RecaptchaVerifier(auth, container, { size: 'invisible' });
  const provider = new PhoneAuthProvider(auth);
  return provider.verifyPhoneNumber(e164, verifier);
}

export async function confirmPhoneCode(verificationId, code) {
  if (!auth) throw new Error('Auth is unavailable.');
  const credential = PhoneAuthProvider.credential(verificationId, code);
  return upgradeWithPhoneCredential(auth.currentUser, credential, {
    auth,
    linkWithCredential,
    signInWithCredential,
    credentialFromError: (error) => PhoneAuthProvider.credentialFromError(error),
  });
}
