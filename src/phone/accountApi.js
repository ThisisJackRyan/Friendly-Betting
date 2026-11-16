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
// (sign in again, then retry) or the server's error code.
export async function deleteAccount() {
  const user = auth?.currentUser;
  if (!user) throw failure('unauthorized');
  let token;
  try {
    // Always a new token: after "Sign in again" it carries the new sign-in time.
    token = await user.getIdToken(true);
  } catch (cause) {
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

export function markDeleteAccountResume(now = Date.now()) {
  try {
    session()?.setItem(RESUME_KEY, String(now));
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

// True once, for a recent note.
export function takeDeleteAccountResume(now = Date.now()) {
  try {
    const store = session();
    const value = store?.getItem(RESUME_KEY);
    if (value == null) return false;
    store.removeItem(RESUME_KEY);
    const at = Number(value);
    return Number.isFinite(at) && now - at >= 0 && now - at <= RESUME_MS;
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
