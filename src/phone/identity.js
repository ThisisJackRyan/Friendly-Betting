import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../Config/firebase-config';

const NAME_KEY = 'fb.displayName';
const LOCAL_ID_KEY = 'fb.localId';

let ensuring = null;

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
      .catch(() => localUser());
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
  return () => {
    active = false;
    unsubscribe();
  };
}

export function useIdentity() {
  const [user, setUser] = useState(null);
  useEffect(() => watchIdentity(setUser), []);
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
