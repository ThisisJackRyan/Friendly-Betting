import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithCredential,
  signInWithCredential,
  signOut,
} from 'firebase/auth';
import { auth } from '../Config/firebase-config';
import { PERSON_CHECK_CANCELLED } from './creatorSession';

const ALREADY_IN_USE = new Set([
  'auth/credential-already-in-use',
  'auth/email-already-in-use',
  'auth/account-exists-with-different-credential',
]);

let verifier = null;
let verifierNode = null;
let verifierSlot = null;
let verifierBroken = false;
let pendingCheck = null;

// How often to look for Google's challenge popup. It has no close event.
const CHALLENGE_POLL_MS = 250;
// A solved challenge hides just before its token arrives, so wait before calling it closed.
const CLOSE_GRACE_MS = 1500;
// An invisible check with no popup normally returns in a second or two.
const NO_CHALLENGE_MS = 30000;
// Hard cap while the popup is open, in case close detection misses. Covers multi-round challenges.
const CHALLENGE_MAX_MS = 180000;

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

function checkCancelled() {
  const err = new Error('The person check was closed.');
  err.code = PERSON_CHECK_CANCELLED;
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
}

export function releasePhoneCheck() {
  if (pendingCheck) pendingCheck.cancel(false);
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
      if (pendingCheck) pendingCheck.fail();
      else verifierBroken = true;
    },
    'expired-callback': () => {
      if (verifier !== next) return;
      if (pendingCheck) pendingCheck.cancel(true);
      else verifierBroken = true;
    },
  });
  verifier = next;
  verifierNode = node;
  verifierSlot = slot;
  return next;
}

// Google's challenge iframe sits in a wrapper on <body> that is hidden
// whenever the challenge is closed or solved.
function challengeVisible() {
  const frames = document.querySelectorAll('iframe[src*="/recaptcha/"][src*="bframe"]');
  return Array.from(frames).some((frame) => {
    let wrapper = frame;
    while (wrapper.parentElement && wrapper.parentElement !== document.body) {
      wrapper = wrapper.parentElement;
    }
    if (wrapper.parentElement !== document.body) return false;
    return window.getComputedStyle(wrapper).visibility !== 'hidden';
  });
}

// Calls onGone if the challenge is closed, never shows, or stays open too long.
// Returns a stop function.
function watchChallenge(onGone) {
  let seen = false;
  let grace = null;
  let cap = null;
  const idle = setTimeout(onGone, NO_CHALLENGE_MS);
  const poll = setInterval(() => {
    if (challengeVisible()) {
      if (!seen) {
        seen = true;
        clearTimeout(idle);
        cap = setTimeout(onGone, CHALLENGE_MAX_MS);
      }
      clearTimeout(grace);
      grace = null;
    } else if (seen && !grace) {
      grace = setTimeout(onGone, CLOSE_GRACE_MS);
    }
  }, CHALLENGE_POLL_MS);
  return () => {
    clearInterval(poll);
    clearTimeout(idle);
    clearTimeout(grace);
    clearTimeout(cap);
  };
}

// Closes any open challenge and swaps in a fresh verifier in the same slot.
function replaceVerifier(appVerifier, rebuild) {
  try {
    appVerifier._reset();
  } catch (err) {
    // The widget may already be gone.
  }
  if (verifier !== appVerifier) return;
  const slot = verifierSlot;
  disposeVerifier();
  if (!rebuild) return;
  try {
    phoneVerifier(slot).render().catch(() => {});
  } catch (err) {
    // Send renders it again.
  }
}

// verify() only ever resolves, and only on a token. A grecaptcha error
// (offline, blocked) arrives on error-callback, so race it in as a failed
// check. A closed or stalled challenge cancels the check instead.
function checkedVerifier(appVerifier) {
  return {
    type: 'recaptcha',
    verify() {
      return new Promise((resolve, reject) => {
        let stopWatch = () => {};
        let settled = false;
        const settle = (finish) => (value) => {
          if (settled) return;
          settled = true;
          stopWatch();
          if (pendingCheck === check) pendingCheck = null;
          finish(value);
        };
        const check = {
          fail: settle(() => reject(checkFailed())),
          cancel: settle((rebuild) => {
            replaceVerifier(appVerifier, rebuild);
            reject(checkCancelled());
          }),
        };
        pendingCheck = check;
        stopWatch = watchChallenge(() => check.cancel(true));
        try {
          appVerifier.verify().then(settle(resolve), settle(reject));
        } catch (err) {
          settle(reject)(err);
        }
      });
    },
    _reset() {
      // A cancelled verifier was already reset and cleared.
      if (verifier === appVerifier) appVerifier._reset();
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
