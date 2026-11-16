import { adminAuth, adminDb } from '../../../../src/server/firebaseAdmin';
import { json } from '../../../../src/server/http';
import { authorizeMember, bearerToken, createPortal } from '../../../../src/server/stripeBilling';
import { stripeClient, stripeWebProConfig } from '../../../../src/server/stripeConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Caps a stuck Stripe or Firestore call (docs/STRIPE-WEB-PRO.md).
export const maxDuration = 30;

const NOT_FOUND = () => json({ error: 'not-found' }, 404);

// Web only and same-origin, like the checkout route. Every method is a 404
// with the flag off.
export function GET() {
  return stripeWebProConfig() ? json({ error: 'method-not-allowed' }, 405) : NOT_FOUND();
}

export function OPTIONS() {
  return stripeWebProConfig() ? new Response(null, { status: 204, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }) : NOT_FOUND();
}

// Opens the Stripe customer portal (cancel, card, invoices) for the signed-in
// member's own Stripe customer, from entitlements/{uid}. The uid always comes
// from the verified ID token.
export async function POST(request) {
  const config = stripeWebProConfig();
  if (!config) return NOT_FOUND();
  const token = bearerToken(request);
  if (!token) return json({ error: 'unauthorized' }, 401);
  try {
    const member = await authorizeMember({ token, auth: adminAuth(), config });
    if (!member.ok) return json({ error: member.error }, member.status);
    const { url } = await createPortal({ db: adminDb(), stripe: stripeClient(config), config, uid: member.uid });
    return json({ url });
  } catch (err) {
    if (err?.code === 'no-customer') return json({ error: 'no-customer' }, 404);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`stripe portal failed: ${err?.code || err?.type || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
