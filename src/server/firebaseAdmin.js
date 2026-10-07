import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Server only. Never import this from client code. Initialised lazily inside
// request handlers so `next build` never needs the service account.
const APP_NAME = 'friendly-admin';

function notConfigured(message) {
  const err = new Error(message);
  err.code = 'admin-not-configured';
  return err;
}

function serviceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw notConfigured('FIREBASE_SERVICE_ACCOUNT is not set.');
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  try {
    return JSON.parse(json);
  } catch (err) {
    throw notConfigured('FIREBASE_SERVICE_ACCOUNT is not valid service-account JSON (or base64 of it).');
  }
}

function adminApp() {
  if (getApps().some((app) => app.name === APP_NAME)) return getApp(APP_NAME);
  return initializeApp({ credential: cert(serviceAccount()) }, APP_NAME);
}

export function adminDb() {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}
