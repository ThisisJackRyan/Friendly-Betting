import { adminAuth, adminDb } from '../../../../src/server/firebaseAdmin';
import { json } from '../../../../src/server/http';
import { authorizeMember, bearerToken, createCheckout } from '../../../../src/server/stripeBilling';
import { stripeClient, stripeWebProConfig } from '../../../../src/server/stripeConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND = () => json({ error: 'not-found' }, 404);
const CONFLICTS = new Set(['already-pro', 'already-subscribed']);

// Web only and same-origin (docs/STRIPE-WEB-PRO.md): no CORS, so the native
// app can never start a Checkout. Every method is a 404 with the flag off.
export function GET() {
  return stripeWebProConfig() ? json({ error: 'method-not-allowed' }, 405) : NOT_FOUND();
}

export function OPTIONS() {
  return stripeWebProConfig() ? new Response(null, { status: 204, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }) : NOT_FOUND();
}

// Starts a $3/mo Pro Checkout for the signed-in phone member. The uid always
// comes from the verified ID token, never the body.
export async function POST(request) {
  const config = stripeWebProConfig();
  if (!config) return NOT_FOUND();
  const token = bearerToken(request);
  if (!token) return json({ error: 'unauthorized' }, 401);
  try {
    const member = await authorizeMember({ token, auth: adminAuth(), config });
    if (!member.ok) return json({ error: member.error }, member.status);
    const { url } = await createCheckout({ db: adminDb(), stripe: stripeClient(config), config, uid: member.uid });
    return json({ url });
  } catch (err) {
    if (CONFLICTS.has(err?.code)) return json({ error: err.code }, 409);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`stripe checkout failed: ${err?.code || err?.type || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
