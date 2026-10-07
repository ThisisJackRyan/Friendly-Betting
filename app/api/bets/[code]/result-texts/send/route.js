import { adminDb } from '../../../../../../src/server/firebaseAdmin';
import { deliverResultTexts } from '../../../../../../src/server/resultTexts';
import { sendResultSms } from '../../../../../../src/server/sms';
import { json, preflight, validCode, withCors } from '../../../../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return preflight(request);
}

export async function POST(request, context) {
  return withCors(request, await send(context));
}

// No auth: it only acts on settled bets and each number is claimed once.
async function send({ params }) {
  const { code } = await params;
  if (!validCode(code)) return json({ error: 'not-found' }, 404);
  try {
    const { sent = 0, failed = 0 } = await deliverResultTexts({ db: adminDb(), code, sendSms: sendResultSms });
    return json({ sent, failed });
  } catch (err) {
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`result texts failed for bet ${code}: ${err?.code || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
