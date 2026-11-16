import { timingSafeEqual } from 'crypto';
import { adminDb } from '../../../../src/server/firebaseAdmin';
import { deliverClosingSoon } from '../../../../src/server/pushEvents';
import { pushEnabled } from '../../../../src/phone/pushConfig';
import { json } from '../../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One run reads and sends for up to CLOSING_PUSH_MAX_BETS bets, one at a time.
export const maxDuration = 60;

// Closing-soon reminder cron (docs/PUSH.md), called by Vercel Cron every 15
// minutes (vercel.json). Not a browser or app route, so no CORS. With the flag
// off it looks like it does not exist: no auth check, no database, no
// Messaging.
const NOT_FOUND = () => json({ error: 'not-found' }, 404);

// Vercel sends Authorization: Bearer ${CRON_SECRET} when that env var is set.
// No secret set means nobody is allowed. Never logs the secret or the header.
function authorized(request) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret.trim()) return false;
  const given = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request) {
  if (!pushEnabled()) return NOT_FOUND();
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  try {
    const result = await deliverClosingSoon({ db: adminDb() });
    return json(result);
  } catch (err) {
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`closing push run failed: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
