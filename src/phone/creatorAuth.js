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
let solvedToken = '';
let consumedToken = '';

function unavailable() {
  const err = new Error('Phone sign-in is unavailable.');
  err.code = 'auth/unavailable';
  return err;
}

function emptyNode(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function releasePhoneCheck() {
  if (verifier) {
    try {
      verifier.clear();
    } catch (err) {
      // The widget may already be gone.
    }
  }
  emptyNode(verifierNode);
  verifier = null;
  verifierNode = null;
  solvedToken = '';
  consumedToken = '';
}

export function resetPhoneAuthForTests() {
  releasePhoneCheck();
}

function rememberSolvedToken(token) {
  const next = String(token || '').trim();
  if (!next || next === consumedToken) return;
  solvedToken = next;
}

function readSolvedToken(container) {
  if (solvedToken && solvedToken !== consumedToken) return solvedToken;
  if (!container || typeof container.querySelectorAll !== 'function') return '';
  const fields = container.querySelectorAll('textarea');
  for (let i = 0; i < fields.length; i += 1) {
    const value = String(fields[i].value || '').trim();
    if (value && value !== consumedToken) return value;
  }
  return '';
}

// Firebase calls _reset after verifyPhoneNumber returns. That reloads the
// checkbox iframe, and iOS reloads the page with it, so the solved check is
// gone before the code step can use it. A passed token does not need that.
function tokenVerifier(token) {
  return {
    type: 'recaptcha',
    verify() {
      return Promise.resolve(token);
    },
    _reset() {},
  };
}

function phoneVerifier(container) {
  if (verifier && verifierNode === container) return verifier;
  if (verifier) {
    try {
      verifier.clear();
    } catch (err) {
      // Replace a verifier bound to a previous container.
    }
    emptyNode(verifierNode);
  }
  emptyNode(container);
  // A fresh params object every time. Firebase writes the site key onto it.
  verifier = new RecaptchaVerifier(auth, container, {
    size: 'normal',
    theme: 'light',
    callback: rememberSolvedToken,
    'expired-callback': () => {
      solvedToken = '';
    },
  });
  verifierNode = container;
  return verifier;
}

export function mountPhoneCheck(container) {
  if (!auth || !container) return Promise.resolve();
  return phoneVerifier(container).render();
}

export async function sendPhoneCode(e164, container) {
  if (!auth || !container) throw unavailable();
  const provider = new PhoneAuthProvider(auth);
  const token = readSolvedToken(container);
  if (token) {
    const verificationId = await provider.verifyPhoneNumber(e164, tokenVerifier(token));
    consumedToken = token;
    if (solvedToken === token) solvedToken = '';
    return verificationId;
  }
  const appVerifier = phoneVerifier(container);
  if (consumedToken) {
    try {
      appVerifier._reset();
    } catch (err) {
      // The old response cannot be sent again. A new check can.
    }
    consumedToken = '';
    solvedToken = '';
  }
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
