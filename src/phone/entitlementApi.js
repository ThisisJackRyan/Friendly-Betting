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

// Preview and dev builds log a denied read, so a preview against the live
// rules shows why there is no plan. Next sets NEXT_PUBLIC_VERCEL_ENV to
// 'preview' or 'development' on Vercel and NODE_ENV to 'development' under
// `next dev`; Vite sets NODE_ENV from the mode ('development' for
// `mobile:dev`, 'production' for `mobile:build`) and defines the Vercel env as
// empty. Production builds stay quiet.
export function logsDeniedReads() {
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV;
  return env === 'preview' || env === 'development' || process.env.NODE_ENV === 'development';
}

// Only the error code: never the uid, the doc path or the error itself.
function noteDenied(err) {
  if (logsDeniedReads()) console.info('Entitlement read denied; treated as no plan.', err.code);
}

// onChange(entitlement | null) on every snapshot, onChange(undefined, err) on
// any other error.
export function subscribeEntitlement(uid, onChange) {
  return onSnapshot(
    doc(db, 'entitlements', uid),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    (err) => {
      if (!noEntitlement(err)) {
        onChange(undefined, err);
        return;
      }
      noteDenied(err);
      onChange(null);
    },
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
// Always asks the server, even after a denied read this session.
export async function fetchEntitlement(uid) {
  try {
    const snap = await withTimeout(getDocFromServer(doc(db, 'entitlements', uid)));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    if (!noEntitlement(err)) throw err;
    noteDenied(err);
    return null;
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
