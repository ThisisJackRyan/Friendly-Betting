import { MAX_PUSH_DEVICES, validDeviceId, validPushPlatform, validPushToken } from '../phone/pushConfig';

// Push tokens (docs/PUSH.md), Admin SDK only. Layout:
//   privatePushTokens/{uid}                     rate window for that uid
//   privatePushTokens/{uid}/devices/{deviceId}  { token, platform, createdAt, updatedAt }
// Clients never read or write these (firestore.rules denies them). Never log
// or return a token, a uid or a phone number.

// Register and unregister calls per uid in one window. An app registers on
// opt-in and on auth changes, so this is far above normal use.
export const PUSH_RATE_LIMIT = 20;
export const PUSH_RATE_WINDOW_MS = 10 * 60 * 1000;

export const PUSH_ROOT = 'privatePushTokens';

export const devicesPath = (uid) => `${PUSH_ROOT}/${uid}/devices`;

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// Counts this call against the uid's window inside the transaction. Throws
// rate-limited (and writes nothing) once the window is full.
function chargeRate(tx, rootRef, root, now) {
  const fresh = !root || typeof root.windowStart !== 'number' || now - root.windowStart >= PUSH_RATE_WINDOW_MS;
  const count = fresh ? 0 : Number(root.count) || 0;
  if (count >= PUSH_RATE_LIMIT) throw fail('rate-limited');
  tx.set(rootRef, { windowStart: fresh ? now : root.windowStart, count: count + 1 });
}

export function validRegistration(body) {
  return Boolean(body) && validDeviceId(body.deviceId) && validPushToken(body.token) && validPushPlatform(body.platform);
}

// Saves (or refreshes) one device's token. The same deviceId only updates it.
// The same token under another deviceId of this uid is dropped (a reinstall).
// Past MAX_PUSH_DEVICES, the oldest updatedAt goes.
export async function saveDeviceToken({ db, uid, deviceId, token, platform, now = Date.now() }) {
  if (!uid) throw fail('unauthorized');
  if (!validRegistration({ deviceId, token, platform })) throw fail('invalid');
  const rootRef = db.doc(`${PUSH_ROOT}/${uid}`);
  const deviceRef = db.doc(`${devicesPath(uid)}/${deviceId}`);
  return db.runTransaction(async (tx) => {
    const rootSnap = await tx.get(rootRef);
    const devices = await tx.get(db.collection(devicesPath(uid)));
    chargeRate(tx, rootRef, rootSnap.exists ? rootSnap.data() : null, now);

    const others = [];
    let existing = null;
    devices.docs.forEach((snap) => {
      const data = snap.data() || {};
      if (snap.id === deviceId) existing = data;
      else if (data.token === token) tx.delete(snap.ref);
      else others.push({ ref: snap.ref, updatedAt: Number(data.updatedAt) || 0 });
    });
    others.sort((a, b) => a.updatedAt - b.updatedAt);
    const evict = Math.max(0, others.length + 1 - MAX_PUSH_DEVICES);
    others.slice(0, evict).forEach(({ ref }) => tx.delete(ref));

    tx.set(deviceRef, {
      token,
      platform,
      createdAt: typeof existing?.createdAt === 'number' ? existing.createdAt : now,
      updatedAt: now,
    });
    return { created: !existing, evicted: evict };
  });
}

// Removes one device. A missing doc is fine (idempotent).
export async function removeDeviceToken({ db, uid, deviceId, now = Date.now() }) {
  if (!uid) throw fail('unauthorized');
  if (!validDeviceId(deviceId)) throw fail('invalid');
  const rootRef = db.doc(`${PUSH_ROOT}/${uid}`);
  const deviceRef = db.doc(`${devicesPath(uid)}/${deviceId}`);
  return db.runTransaction(async (tx) => {
    const rootSnap = await tx.get(rootRef);
    const deviceSnap = await tx.get(deviceRef);
    chargeRate(tx, rootRef, rootSnap.exists ? rootSnap.data() : null, now);
    if (deviceSnap.exists) tx.delete(deviceRef);
    return { removed: deviceSnap.exists };
  });
}
