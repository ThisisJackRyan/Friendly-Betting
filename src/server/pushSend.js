import { adminDb, adminMessaging } from './firebaseAdmin';
import { pushEnabled } from '../phone/pushConfig';
import { devicesPath } from './pushTokens';
import { validCode } from './http';

// Server-side push to every registered device of one uid (docs/PUSH.md).
// Settle and call-off send through pushEvents.js. The caller supplies the
// title, body and data; this module has no user-facing copy. Never logs a
// token, a uid or a phone number: at most an FCM error code (and a bet code
// if the caller passes one).

// FCM says these tokens will never work again, so their device docs go.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// FCM data values must be strings.
function stringData(data) {
  if (!data || typeof data !== 'object') return undefined;
  const entries = Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// channelId puts the Android notification in that channel (PUSH_CHANNEL_ID)
// instead of FCM's default one.
export function buildMessage(token, payload = {}, { collapseKey, threadId, channelId } = {}) {
  const message = { token };
  const notification = {};
  if (payload.title) notification.title = String(payload.title);
  if (payload.body) notification.body = String(payload.body);
  if (Object.keys(notification).length) message.notification = notification;
  const data = stringData(payload.data);
  if (data) message.data = data;
  if (collapseKey) {
    // collapseKey replaces a pending message; the tag replaces a shown one.
    message.android = { collapseKey: String(collapseKey), notification: { tag: String(collapseKey) } };
  }
  if (channelId) {
    message.android = message.android || {};
    message.android.notification = { ...message.android.notification, channelId: String(channelId) };
  }
  if (collapseKey || threadId) {
    message.apns = {};
    if (collapseKey) message.apns.headers = { 'apns-collapse-id': String(collapseKey) };
    if (threadId) message.apns.payload = { aps: { threadId: String(threadId) } };
  }
  return message;
}

// Deletes the device doc only if it still holds the dead token, so a fresh
// registration that raced the send is kept.
function removeDeadDevice(db, ref, token) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.token !== token) return false;
    tx.delete(ref);
    return true;
  });
}

// The admin getters only set up the Admin SDK, so anything they throw is a
// setup failure (no or bad service account, app not initialised). A caller
// such as settle must never break on that, so sendToUser skips instead. Only
// these known codes are logged; anything else logs as setup-error.
const SETUP_ERROR_CODES = new Set(['admin-not-configured', 'app/invalid-credential', 'app/no-app', 'app/invalid-app-options', 'app/duplicate-app']);

function setupErrorCode(err) {
  return typeof err?.code === 'string' && SETUP_ERROR_CODES.has(err.code) ? err.code : 'setup-error';
}

// payload: { title, body, data }. options: { collapseKey, threadId, channelId, code }.
// Returns counts only: { sent, failed, removed } (plus skipped when it did nothing,
// including skipped: 'admin-not-configured' when the Admin SDK is not set up).
export async function sendToUser(uid, payload = {}, options = {}) {
  if (!pushEnabled()) return { sent: 0, failed: 0, removed: 0, skipped: 'disabled' };
  if (!uid || typeof uid !== 'string') return { sent: 0, failed: 0, removed: 0, skipped: 'no-user' };
  const { collapseKey, threadId, channelId, code } = options;
  const where = validCode(code) ? ` for bet ${code}` : '';
  let db;
  let messaging;
  try {
    db = options.db || adminDb();
    messaging = options.messaging || adminMessaging();
  } catch (err) {
    console.warn(`push send skipped${where}: ${setupErrorCode(err)}`);
    return { sent: 0, failed: 0, removed: 0, skipped: 'admin-not-configured' };
  }
  let docs;
  try {
    ({ docs } = await db.collection(devicesPath(uid)).get());
  } catch (err) {
    // A bad credential often only shows up on the first call. Skip, never throw.
    const setup = SETUP_ERROR_CODES.has(err?.code);
    console.warn(`push send skipped${where}: ${setup ? err.code : 'read-failed'}`);
    return { sent: 0, failed: 0, removed: 0, skipped: setup ? 'admin-not-configured' : 'read-failed' };
  }
  const devices = docs
    .map((snap) => ({ ref: snap.ref, token: snap.data()?.token }))
    .filter((device) => typeof device.token === 'string' && device.token);
  if (!devices.length) return { sent: 0, failed: 0, removed: 0, skipped: 'no-devices' };

  const messages = devices.map((device) => buildMessage(device.token, payload, { collapseKey, threadId, channelId }));
  let responses;
  try {
    ({ responses } = await messaging.sendEach(messages));
  } catch (err) {
    console.error(`push send failed${where}: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    return { sent: 0, failed: devices.length, removed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const dead = [];
  const errorCodes = new Set();
  responses.forEach((response, i) => {
    if (response?.success) {
      sent += 1;
      return;
    }
    failed += 1;
    const errorCode = typeof response?.error?.code === 'string' ? response.error.code : 'error';
    errorCodes.add(errorCode);
    if (DEAD_TOKEN_CODES.has(errorCode)) dead.push(devices[i]);
  });

  let removed = 0;
  await Promise.all(
    dead.map(({ ref, token }) =>
      removeDeadDevice(db, ref, token)
        .then((gone) => {
          if (gone) removed += 1;
        })
        .catch(() => {}),
    ),
  );
  if (failed) console.warn(`push send${where}: ${failed} failed (${[...errorCodes].join(', ')}), ${removed} removed`);
  return { sent, failed, removed };
}
