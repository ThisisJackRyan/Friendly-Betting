import { adminDb } from '../../../../../../src/server/firebaseAdmin';
import { deliverResultTexts } from '../../../../../../src/server/resultTexts';
import { sendResultSms } from '../../../../../../src/server/sms';
import { json, validCode } from '../../../../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// No auth: it only acts on settled bets and each number is claimed once.
export async function POST(_request, { params }) {
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
