import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '../../../../src/server/firebaseAdmin';
import { json, preflight, withCors } from '../../../../src/server/http';
import { grantMockEntitlement, mockPurchaseAllowed, validPlan } from '../../../../src/server/proPurchase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND = () => json({ error: 'not-found' }, 404);

export function OPTIONS(request) {
  if (!mockPurchaseAllowed()) return NOT_FOUND();
  return preflight(request);
}

export async function POST(request) {
  if (!mockPurchaseAllowed()) return NOT_FOUND();
  return withCors(request, await purchase(request));
}

// Preview only (docs/PRO.md): grants the caller Pro or a founder spot with no
// payment. The uid always comes from the verified ID token, never the body.
async function purchase(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return json({ error: 'unauthorized' }, 401);
  try {
    let uid;
    try {
      ({ uid } = await adminAuth().verifyIdToken(token));
    } catch (err) {
      if (err?.code === 'admin-not-configured') throw err;
      return json({ error: 'unauthorized' }, 401);
    }
    const body = await request.json().catch(() => ({}));
    const plan = body?.plan;
    if (!validPlan(plan)) return json({ error: 'invalid-plan' }, 400);
    const result = await grantMockEntitlement({
      db: adminDb(),
      uid,
      plan,
      since: FieldValue.serverTimestamp(),
      toTimestamp: (ms) => Timestamp.fromMillis(ms),
    });
    return json({ ok: true, ...result });
  } catch (err) {
    if (err?.code === 'sold-out') return json({ error: 'sold-out' }, 409);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`mock purchase failed: ${err?.code || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
