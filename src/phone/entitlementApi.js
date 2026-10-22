import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../Config/firebase-config';
import { apiUrl } from './resultTexts';

// The only client reads for Pro (docs/PRO.md). The rules let a member read
// their own entitlements/{uid}; nothing here writes. Jest mocks this module for every test (src/setupTests.js).

// Every read here is of the signed-in user's own entitlements/{uid}. Rules
// without the entitlements block (the live rules until it is deployed) deny
// that read with permission-denied: there is nothing they may read, so it
// means no entitlement, the same as a missing doc. Every other error (offline,
// a timeout) is still an error.
const noEntitlement = (err) => err?.code === 'permission-denied';

// onChange(entitlement | null) on every snapshot, onChange(undefined, err) on
// any other error.
export function subscribeEntitlement(uid, onChange) {
  return onSnapshot(
    doc(db, 'entitlements', uid),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    (err) => (noEntitlement(err) ? onChange(null) : onChange(undefined, err)),
  );
}

// A hung read or purchase gives up after this long, so the Pro sheet is
// never stuck on it.
const TIMEOUT_MS = 20000;

function withTimeout(promise, controller) {
  let timer;
  const expired = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      const err = new Error('Timed out.');
      err.code = 'timeout';
      reject(err);
    }, TIMEOUT_MS);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

// One fresh read of the user's own entitlement (Restore purchase), from the
// server rather than the cache. null when there is none, or none readable.
export async function fetchEntitlement(uid) {
  try {
    const snap = await withTimeout(getDocFromServer(doc(db, 'entitlements', uid)));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    if (noEntitlement(err)) return null;
    throw err;
  }
}

// Preview only: asks the mock purchase route to grant `plan` ('pro') to the
// signed-in user. The new entitlement arrives through subscribeEntitlement.
export function requestMockPurchase(plan) {
  const controller = new AbortController();
  return withTimeout(postMockPurchase(plan, controller.signal), controller);
}

async function postMockPurchase(plan, signal) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in.');
  const token = await user.getIdToken();
  const res = await fetch(apiUrl('/api/pro/mock-purchase'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body;
  const err = new Error('Could not finish that purchase.');
  err.code = body?.error || 'purchase-failed';
  throw err;
}
