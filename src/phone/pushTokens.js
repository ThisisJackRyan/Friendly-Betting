import { Capacitor } from '@capacitor/core';
import { pushEnabled } from './pushConfig';
import { apiUrl } from './resultTexts';

// Push token plumbing (docs/PUSH.md). The opt-in sheet and the Notifications
// row (pushOptIn.js) call it, only after the user says yes. None of it asks
// for notification permission. Every function is a no-op on the web, when NEXT_PUBLIC_PUSH_ENABLED// is not 1, or without a real Firebase user (the local fallback uid cannot
// register). Never log the token, the uid or a phone number.

const DEVICE_ID_KEY = 'fb.pushDeviceId';
const ROUTE = '/api/push/tokens';

let deviceIdPending = null;

export function pushAvailable() {  return pushEnabled() && Capacitor.isNativePlatform();
}

// Only a signed-in Firebase user (anonymous counts) has an ID token. The
// identity module's local fallback never reaches auth.currentUser.
export async function firebaseUser() {  const { auth } = await import('../Config/firebase-config');
  const user = auth?.currentUser;
  if (!user || user.isLocal || typeof user.getIdToken !== 'function') return null;
  return user;
}

async function readOrCreateDeviceId() {
  const { Preferences } = await import('@capacitor/preferences');
  const { value } = await Preferences.get({ key: DEVICE_ID_KEY });
  if (value) return value;
  const id = crypto.randomUUID();
  await Preferences.set({ key: DEVICE_ID_KEY, value: id });
  return id;
}

// A stable id for this install, kept in Preferences. Empty when push is off.
export async function getPushDeviceId() {
  if (!pushAvailable()) return '';
  if (!deviceIdPending) {
    deviceIdPending = readOrCreateDeviceId().catch((err) => {
      deviceIdPending = null;
      throw err;
    });
  }
  return deviceIdPending;
}

// The FCM token. Empty when push is off. Does not ask for permission: the
// caller does that first, in context.
export async function getPushToken() {
  if (!pushAvailable()) return '';
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const { token } = await FirebaseMessaging.getToken();
  return token || '';
}

async function callRoute(method, body) {
  const user = await firebaseUser();
  if (!user) return { ok: false, skipped: 'no-user' };
  const idToken = await user.getIdToken();
  let res;
  try {
    res = await fetch(apiUrl(ROUTE), {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return { ok: false, error: 'network' };
  }
  if (res.ok) return { ok: true };
  const json = await res.json().catch(() => ({}));
  return { ok: false, error: json?.error || `http-${res.status}` };
}

// Registers or refreshes this install's token for the signed-in user. Never
// throws; returns { ok } or { ok: false, skipped | error }.
export async function registerPushToken() {
  if (!pushAvailable()) return { ok: false, skipped: 'disabled' };
  try {
    if (!(await firebaseUser())) return { ok: false, skipped: 'no-user' };
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return { ok: false, skipped: 'disabled' };
    const [deviceId, token] = await Promise.all([getPushDeviceId(), getPushToken()]);
    if (!token) return { ok: false, error: 'no-token' };
    return await callRoute('POST', { deviceId, token, platform });
  } catch (err) {
    return { ok: false, error: 'register-failed' };
  }
}

// Removes this install's token for the signed-in user. Never throws.
export async function unregisterPushToken() {
  if (!pushAvailable()) return { ok: false, skipped: 'disabled' };
  try {
    if (!(await firebaseUser())) return { ok: false, skipped: 'no-user' };
    const deviceId = await getPushDeviceId();
    return await callRoute('DELETE', { deviceId });
  } catch (err) {
    return { ok: false, error: 'unregister-failed' };
  }
}

// Test hook: forget the cached device id lookup.
export function resetPushDeviceIdForTests() {
  deviceIdPending = null;
}
