import { adminDb } from '../../../../../src/server/firebaseAdmin';
import { deliverBetPush } from '../../../../../src/server/pushEvents';
import { pushEnabled } from '../../../../../src/phone/pushConfig';
import { json, preflight, validCode, withCors } from '../../../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// deliverBetPush waits out a settle's 35s undo window before sending.
export const maxDuration = 60;

export function OPTIONS(request) {
  return preflight(request);
}

export async function POST(request, context) {
  return withCors(request, await send(context));
}

// No auth, like the result-text send route: no body is read, the server
// picks the recipients, it only acts on a bet settled past its undo window
// or called off, and each event is claimed once.
async function send({ params }) {
  const { code } = await params;
  if (!validCode(code)) return json({ error: 'not-found' }, 404);
  // Flag off: no database, no tokens, no Messaging.
  if (!pushEnabled()) return json({ sent: 0, failed: 0, skipped: 'disabled' });
  try {
    const { sent = 0, failed = 0, skipped } = await deliverBetPush({ db: adminDb(), code });
    return json(skipped ? { sent, failed, skipped } : { sent, failed });
  } catch (err) {
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`push failed for bet ${code}: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
