import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../Config/firebase-config';
import { apiUrl } from './resultTexts';

// The only client reads for Pro (docs/PRO.md). The rules let a member read
// their own entitlements/{uid}; nothing here writes. Jest mocks this module for every test (src/setupTests.js).

// onChange(entitlement | null) on every snapshot, onChange(undefined, err) on error.
export function subscribeEntitlement(uid, onChange) {
  return onSnapshot(
    doc(db, 'entitlements', uid),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    (err) => onChange(undefined, err),
  );
}

// One fresh read of the user's own entitlement (Restore purchase), from the
// server rather than the cache. null when there is none.
export async function fetchEntitlement(uid) {
  const snap = await getDocFromServer(doc(db, 'entitlements', uid));
  return snap.exists() ? snap.data() : null;
}

// Preview only: asks the mock purchase route to grant `plan` ('pro') to the
// signed-in user. The new entitlement arrives through subscribeEntitlement.
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
