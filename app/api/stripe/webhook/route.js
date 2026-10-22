import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../../../../src/server/firebaseAdmin';
import { json } from '../../../../src/server/http';
import { handleStripeEvent } from '../../../../src/server/stripeBilling';
import { stripeClient, stripeWebProConfig } from '../../../../src/server/stripeConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND = () => json({ error: 'not-found' }, 404);

export function GET() {
  return stripeWebProConfig() ? json({ error: 'method-not-allowed' }, 405) : NOT_FOUND();
}

export function OPTIONS() {
  return stripeWebProConfig() ? new Response(null, { status: 204, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }) : NOT_FOUND();
}

// Stripe's webhook (docs/STRIPE-WEB-PRO.md). The raw body is checked against
// the Stripe-Signature header before anything is read or written; a bad
// signature is a 400 that writes nothing. Logs event types and error codes
// only.
export async function POST(request) {
  const config = stripeWebProConfig();
  if (!config) return NOT_FOUND();
  const signature = request.headers.get('stripe-signature') || '';
  const payload = await request.text();
  let stripe;
  let event;
  try {
    stripe = stripeClient(config);
  } catch (err) {
    console.error(`stripe webhook failed: ${err?.code || 'error'}`);
    return json({ error: 'server' }, 500);
  }
  try {
    if (!signature) throw new Error('no signature');
    event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
  } catch {
    console.warn('stripe webhook: signature check failed');
    return json({ error: 'invalid-signature' }, 400);
  }
  try {
    await handleStripeEvent({
      db: adminDb(),
      stripe,
      event,
      since: FieldValue.serverTimestamp(),
      toTimestamp: (ms) => Timestamp.fromMillis(ms),
    });
    return json({ received: true });
  } catch (err) {
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`stripe webhook failed: ${event.type} ${err?.code || err?.type || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
