import { adminAuth, adminDb } from '../../../../../../src/server/firebaseAdmin';
import { allowBetPush } from '../../../../../../src/server/betPushLimit';
import { readBetWithVotes } from '../../../../../../src/server/betVotes';
import { deliverPickPush, recordedPick } from '../../../../../../src/server/pushEvents';
import { pushEnabled } from '../../../../../../src/phone/pushConfig';
import { json, preflight, validCode, withCors } from '../../../../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// With the flag off the route looks like it does not exist: no CORS, no auth,
// no database, no Messaging (same as /api/bets/{code}/push).
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

// A friend's first pick tells the bet's creator. The caller proves who they
// are with a Firebase ID token (anonymous counts) and must have a recorded
// pick on this bet; the creator's own pick sends nothing. No body is read:
// the side and the name come from the live votes, and the creator is the only
// recipient. Never logs or echoes the ID token or the uid.
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
    const bet = await readBetWithVotes(db, code);
    if (!bet) return json({ sent: 0, failed: 0, skipped: 'not-found' });
    if (bet.createdByID === uid) return json({ sent: 0, failed: 0, skipped: 'self' });
    if (!recordedPick(bet, uid)) return json({ error: 'forbidden' }, 403);
    const { sent = 0, failed = 0, skipped } = await deliverPickPush({ db, code, actorUid: uid, bet });
    return json(skipped ? { sent, failed, skipped } : { sent, failed });
  } catch (err) {
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`pick push failed for bet ${code}: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
