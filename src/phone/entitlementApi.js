import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../Config/firebase-config';
import { apiUrl } from './resultTexts';

// The only client reads for Pro (docs/PRO.md). The rules let a member read
// their own entitlements/{uid} and anyone read meta/founders; nothing here
// writes. Jest mocks this module for every test (src/setupTests.js).

// onChange(entitlement | null) on every snapshot, onChange(undefined, err) on error.
export function subscribeEntitlement(uid, onChange) {
  return onSnapshot(
    doc(db, 'entitlements', uid),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    (err) => onChange(undefined, err),
  );
}

// How many founder spots are taken. 0 before the first one.
export async function fetchFounderCount() {
  const snap = await getDoc(doc(db, 'meta', 'founders'));
  const count = snap.exists() ? Number(snap.data()?.count) : 0;
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

// Preview only: asks the mock purchase route to grant `plan` to the signed-in
// user. The new entitlement arrives through subscribeEntitlement.
export async function requestMockPurchase(plan) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in.');
  const token = await user.getIdToken();
  const res = await fetch(apiUrl('/api/pro/mock-purchase'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body;
  const err = new Error('Could not finish that purchase.');
  err.code = body?.error || 'purchase-failed';
  throw err;
}
