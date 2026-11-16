import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '../../../../src/server/firebaseAdmin';
import { json } from '../../../../src/server/http';
import { authorizeMember, bearerToken, dismissGraceEndedNotice, graceEndedNoticeState } from '../../../../src/server/stripeBilling';
import { stripeWebProConfig } from '../../../../src/server/stripeConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Caps a stuck Firestore call (docs/STRIPE-WEB-PRO.md).
export const maxDuration = 30;

const NOT_FOUND = () => json({ error: 'not-found' }, 404);

// Web only and same-origin, like the other Stripe routes. Every method is a
// 404 with the flag off.
export function GET() {
  return stripeWebProConfig() ? json({ error: 'method-not-allowed' }, 405) : NOT_FOUND();
}

export function OPTIONS() {
  return stripeWebProConfig() ? new Response(null, { status: 204, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }) : NOT_FOUND();
}

// The My bets "Pro ended" banner's dismissal, per account
// (stripeNoticeDismissals/{uid}, server only). { action: 'dismiss' }
// dismisses the banner showing now; anything else reads whether it was
// dismissed. Answers { dismissed }. The uid always comes from the verified ID
// token; nothing else from the body is used.
export async function POST(request) {
  const config = stripeWebProConfig();
  if (!config) return NOT_FOUND();
  const token = bearerToken(request);
  if (!token) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  try {
    const member = await authorizeMember({ token, auth: adminAuth(), config });
    if (!member.ok) return json({ error: member.error }, member.status);
    const db = adminDb();
    if (body?.action === 'dismiss') {
      return json(await dismissGraceEndedNotice({ db, uid: member.uid, since: FieldValue.serverTimestamp() }));
    }
    return json(await graceEndedNoticeState({ db, uid: member.uid }));
  } catch (err) {
    if (err?.code === 'no-notice') return json({ error: 'no-notice' }, 409);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`billing notice failed: ${err?.code || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
