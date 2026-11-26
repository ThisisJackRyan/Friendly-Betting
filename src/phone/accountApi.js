import { Capacitor, registerPlugin } from '@capacitor/core';
import { auth } from '../Config/firebase-config';
import { apiUrl } from './resultTexts';

// Delete account (My bets). The server route does all the deleting
// (docs/DEVELOPMENT.md); the client sends a fresh ID token and, once the
// route answers 200, clears what this device kept about the member.

export const REQUIRES_RECENT_LOGIN = 'requires-recent-login';
// Set before "Sign in again" so My bets reopens the confirm after sign-in.
export const RESUME_KEY = 'fb.deleteAccountResume';
// A resume note older than this is ignored.
const RESUME_MS = 10 * 60 * 1000;

function failure(code, cause) {
  const err = new Error('Could not delete the account.');
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Resolves on success. Rejects with code 'offline', 'requires-recent-login'
// (sign in again, then retry) or the server's error code. An Auth user that
// is already gone counts as success: an earlier attempt deleted the account
// and its response was lost. 'auth/user-token-expired' stays an error, since
// it can also mean a revoked or disabled session.
export async function deleteAccount() {
  const user = auth?.currentUser;
  if (!user) throw failure('unauthorized');
  let token;
  try {
    // Always a new token: after "Sign in again" it carries the new sign-in time.
    token = await user.getIdToken(true);
  } catch (cause) {
    if (cause?.code === 'auth/user-not-found') return;
    if (cause?.code === 'auth/network-request-failed' || isOffline()) throw failure('offline', cause);
    throw failure(cause?.code || 'token-failed', cause);
  }
  let res;
  try {
    res = await fetch(apiUrl('/api/account'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (cause) {
    throw failure('offline', cause);
  }
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  if (body?.error === REQUIRES_RECENT_LOGIN) throw failure(REQUIRES_RECENT_LOGIN);
  if (isOffline()) throw failure('offline');
  throw failure(body?.error || 'delete-failed');
}

function session() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function local() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// The note names the member, so it only reopens the confirm for the same
// account (the same phone number signs back in to the same uid).
export function markDeleteAccountResume(uid, now = Date.now()) {
  if (!uid) return;
  try {
    session()?.setItem(RESUME_KEY, JSON.stringify({ uid, at: now }));
  } catch {
    // No storage: they land on My bets and tap Delete account again.
  }
}

export function clearDeleteAccountResume() {
  try {
    session()?.removeItem(RESUME_KEY);
  } catch {
    // Nothing to clear.
  }
}

// True while a recent note left by this member is waiting, without taking it:
// My bets uses it to send them on to the Delete account page, which takes it.
export function hasDeleteAccountResume(uid, now = Date.now()) {
  if (!uid) return false;
  try {
    const value = session()?.getItem(RESUME_KEY);
    if (value == null) return false;
    const note = JSON.parse(value);
    const at = Number(note?.at);
    return note?.uid === uid && Number.isFinite(at) && now - at >= 0 && now - at <= RESUME_MS;
  } catch {
    return false;
  }
}

// True once, for a recent note left by this member. Any note is removed.
export function takeDeleteAccountResume(uid, now = Date.now()) {
  if (!uid) return false;
  try {
    const store = session();
    const value = store?.getItem(RESUME_KEY);
    if (value == null) return false;
    store.removeItem(RESUME_KEY);
    const note = JSON.parse(value);
    const at = Number(note?.at);
    return note?.uid === uid && Number.isFinite(at) && now - at >= 0 && now - at <= RESUME_MS;
  } catch {
    return false;
  }
}

// The push stack's Capacitor Preferences, only where the native plugin is there.
function preferences() {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    if (Capacitor.Plugins?.Preferences) return Capacitor.Plugins.Preferences;
    return Capacitor.isPluginAvailable('Preferences') ? registerPlugin('Preferences') : null;
  } catch {
    return null;
  }
}

// Best effort, after the server said the account is gone. Never throws.
export async function clearLocalAccountData(uid) {
  const store = local();
  const removeLocal = (key) => {
    try {
      store?.removeItem(key);
    } catch {
      // Keep going.
    }
  };
  ['fb.displayName', 'fb.localId', 'fb.ads.caps.v1'].forEach(removeLocal);
  if (uid) removeLocal(`fb.results.${uid}`);
  try {
    const keys = [];
    for (let i = 0; i < (store?.length || 0); i += 1) keys.push(store.key(i));
    keys.filter((key) => key && key.startsWith('fb.resultText.')).forEach(removeLocal);
  } catch {
    // Keep going.
  }
  ['friendly.freshBet', 'friendly.freshBetFirst', RESUME_KEY].forEach((key) => {
    try {
      session()?.removeItem(key);
    } catch {
      // Keep going.
    }
  });
  const prefs = preferences();
  if (!prefs) return;
  const keys = ['fb.pushDeviceId', ...(uid ? [`fb.pushAsked.${uid}`, `fb.pushPref.${uid}`] : [])];
  await Promise.all(keys.map((key) => Promise.resolve().then(() => prefs.remove({ key })).catch(() => {})));
}
