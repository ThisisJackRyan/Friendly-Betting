import { isProEntitlement } from '../phone/entitlement';

// Server only: reads entitlements/{uid} with the Admin SDK and answers with
// the same isProEntitlement the app uses (docs/PRO.md), so expiry and legacy
// founder plans count the same way on both sides. A missing doc is not Pro.
// Pass `tx` to read inside a transaction.
export async function readEntitlement({ db, uid, tx }) {
  if (!uid) return null;
  const ref = db.doc(`entitlements/${uid}`);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return snap.exists ? snap.data() ?? null : null;
}

export async function hasProEntitlement({ db, uid, tx, now = Date.now() }) {
  return isProEntitlement(await readEntitlement({ db, uid, tx }), now);
}
