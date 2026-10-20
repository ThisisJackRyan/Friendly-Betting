import { PRO_PERIOD_DAYS, founderOffer } from '../phone/proConfig';

// The mock purchase (docs/PRO.md). Preview and local only: it grants Pro with
// no payment, so it must never answer in production.

export const PLANS = ['pro', 'founder'];
export const FOUNDERS_DOC = 'meta/founders';
const DAY_MS = 24 * 60 * 60 * 1000;

function failure(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// On only with PRO_MOCK_PURCHASE=1, and never on a production deploy. Vercel
// runs previews with NODE_ENV=production, so VERCEL_ENV decides there; off
// Vercel (local dev, tests) NODE_ENV must not be production.
export function mockPurchaseAllowed(env = process.env) {
  if (env.PRO_MOCK_PURCHASE !== '1') return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development';
  return env.NODE_ENV !== 'production';
}

export function validPlan(plan) {
  return PLANS.includes(plan);
}

// Writes entitlements/{uid} in one transaction. A founder takes the next
// number from meta/founders, so two buyers can never share one, and nobody
// gets one past the last spot. A founder already owns everything: buying
// again changes nothing. `since` and `toTimestamp` come from the Admin SDK
// (FieldValue.serverTimestamp, Timestamp.fromMillis) so tests can stub them.
export async function grantMockEntitlement({ db, uid, plan, now = Date.now(), since, toTimestamp = (ms) => ms }) {
  if (!validPlan(plan)) throw failure('invalid-plan');
  const entitlementRef = db.doc(`entitlements/${uid}`);
  const foundersRef = db.doc(FOUNDERS_DOC);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(entitlementRef);
    const founders = await tx.get(foundersRef);
    const current = existing.exists ? existing.data() : null;
    if (current?.plan === 'founder') {
      return { plan: 'founder', founderNumber: current.founderNumber ?? null, unchanged: true };
    }
    if (plan === 'pro') {
      const expiresAt = now + PRO_PERIOD_DAYS * DAY_MS;
      tx.set(entitlementRef, { plan: 'pro', source: 'mock', since, expiresAt: toTimestamp(expiresAt) });
      return { plan: 'pro', expiresAt };
    }
    const taken = Math.max(0, Math.floor(Number(founders.exists ? founders.data()?.count : 0) || 0));
    if (founderOffer(taken).soldOut) throw failure('sold-out');
    const founderNumber = taken + 1;
    tx.set(foundersRef, { count: founderNumber });
    tx.set(entitlementRef, { plan: 'founder', source: 'mock', since, founderNumber, expiresAt: null });
    return { plan: 'founder', founderNumber, founderCount: founderNumber };
  });
}
