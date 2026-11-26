import { useEffect, useState } from 'react';
import { onAuthStateChanged, onIdTokenChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../Config/firebase-config';

const NAME_KEY = 'fb.displayName';
const LOCAL_ID_KEY = 'fb.localId';

let ensuring = null;

// Watchers to tell when the signed-in user changes in place. Linking a phone
// to the anonymous user keeps its uid, so onAuthStateChanged stays quiet and
// the user object just gains a phone provider.
const refreshers = new Set();

// Call after the current user changed in place (a phone linked to it), so
// every useIdentity re-reads it. The phone sign-in calls this on success.
export function refreshIdentity(user) {
  if (!user) return;
  refreshers.forEach((notify) => notify(user));
}

function localUser() {
  let uid = '';
  try {
    uid = localStorage.getItem(LOCAL_ID_KEY) || '';
    if (!uid) {
      uid = crypto.randomUUID();
      localStorage.setItem(LOCAL_ID_KEY, uid);
    }
  } catch (err) {
    uid = 'local-friend';
  }
  return { uid, isLocal: true };
}

function ensureSignedIn() {
  if (!auth) return Promise.resolve(localUser());
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!ensuring) {
    ensuring = signInAnonymously(auth)
      .then((cred) => cred.user)
      .catch(() => localUser())
      .finally(() => {
        ensuring = null;
      });
  }
  return ensuring;
}

export function watchIdentity(onChange) {
  let active = true;
  if (!auth) {
    ensureSignedIn().then((next) => {
      if (active) onChange(next);
    });
    return () => {
      active = false;
    };
  }
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!active) return;
    if (user) {
      onChange(user);
      return;
    }
    ensureSignedIn().then((next) => {
      if (active) onChange(next);
    });
  });
  // A token change also follows an in-place link. Sign-out stays with the
  // auth state listener above. Some test mocks of firebase/auth omit it.
  const unsubscribeToken = typeof onIdTokenChanged === 'function'
    ? onIdTokenChanged(auth, (user) => {
      if (active && user) onChange(user);
    })
    : () => {};
  const refresh = (user) => {
    if (active && auth.currentUser === user) onChange(user);
  };
  refreshers.add(refresh);
  return () => {
    active = false;
    refreshers.delete(refresh);
    unsubscribeToken();
    unsubscribe();
  };
}

// The user is held in a fresh wrapper each time, so a user upgraded in place
// (the same object, now with a phone provider) still re-renders, and checks
// like isCreator(user) run again.
export function useIdentity() {
  const [state, setState] = useState({ user: null });
  useEffect(() => watchIdentity((user) => setState({ user })), []);
  return state.user;
}

// The Firebase user auth already has, without ever signing anyone in:
// undefined until auth has restored its session, then the user or null.
export function useSignedInUser() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    if (!auth) {
      setUser(null);
      return undefined;
    }
    return onAuthStateChanged(auth, (next) => setUser(next || null));
  }, []);
  return user;
}

export function savedName() {
  try {
    return (localStorage.getItem(NAME_KEY) || '').trim();
  } catch (err) {
    return '';
  }
}

export function rememberName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(NAME_KEY, trimmed);
  } catch (err) {
    // Private mode can block storage; the bet still sends.
  }
}

export function creatorName(user) {
  const saved = savedName();
  if (saved) return saved;
  if (user?.displayName) return user.displayName;
  if (user?.email) return user.email.split('@')[0];
  return 'Friend';
}
