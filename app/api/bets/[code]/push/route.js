import { adminAuth, adminDb } from '../../../../../src/server/firebaseAdmin';
import { allowBetPush } from '../../../../../src/server/betPushLimit';
import { deliverBetPush } from '../../../../../src/server/pushEvents';
import { pushEnabled } from '../../../../../src/phone/pushConfig';
import { json, preflight, validCode, withCors } from '../../../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// deliverBetPush waits out a settle's 35s undo window before sending.
export const maxDuration = 60;

// With the flag off the route looks like it does not exist: no CORS, no auth,
// no database, no Messaging (same as /api/push/tokens).
const NOT_FOUND = () => json({ error: 'not-found' }, 404);

export function OPTIONS(request) {
  if (!pushEnabled()) return NOT_FOUND();
  return preflight(request);
}

export async function POST(request, context) {
  const { code } = await context.params;
  if (!validCode(code)) return withCors(request, NOT_FOUND());
  if (!pushEnabled()) return NOT_FOUND();
  return withCors(request, await send(request, code));
}

// Only the bet's creator (the only uid the rules let settle or call off) can
// trigger the push, with a Firebase ID token. The bet doc is read and the
// creator checked before any vote read or the undo wait. No body is read; the
// server picks the recipients. Never logs or echoes the ID token or the uid.
async function send(request, code) {
  const header = request.headers.get('authorization') || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken) return json({ error: 'unauthorized' }, 401);
  try {
    let uid;
    try {
      ({ uid } = await adminAuth().verifyIdToken(idToken));
    } catch (err) {
      if (err?.code === 'admin-not-configured') throw err;
      return json({ error: 'unauthorized' }, 401);
    }
    if (!uid) return json({ error: 'unauthorized' }, 401);
    if (!allowBetPush(uid)) return json({ error: 'rate-limited' }, 429);
    const db = adminDb();
    const snap = await db.doc(`bets/${code}`).get();
    if (!snap.exists) return json({ sent: 0, failed: 0, skipped: 'not-found' });
    if (snap.data()?.createdByID !== uid) return json({ error: 'forbidden' }, 403);
    const { sent = 0, failed = 0, skipped } = await deliverBetPush({ db, code });
    return json(skipped ? { sent, failed, skipped } : { sent, failed });
  } catch (err) {
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`push failed for bet ${code}: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
