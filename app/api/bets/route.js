import { adminAuth, adminDb } from '../../../src/server/firebaseAdmin';
import { createBetForCreator } from '../../../src/server/createBet';
import { json, preflight, withCors } from '../../../src/server/http';
import { proPaywallEnabled } from '../../../src/phone/proConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'POST, OPTIONS';
const NOT_FOUND = () => json({ error: 'not-found' }, 404);

// Only with the paywall on (NEXT_PUBLIC_PRO_PAYWALL=1, the app's own flag).
// With it off the app writes bets/{code} itself and this route is a 404.
export function OPTIONS(request) {
  if (!proPaywallEnabled()) return NOT_FOUND();
  return preflight(request, METHODS);
}

export async function POST(request) {
  if (!proPaywallEnabled()) return NOT_FOUND();
  return withCors(request, await create(request), METHODS);
}

const FORBIDDEN = ['forbidden', 'pro-required'];

// A phone-verified creator makes a bet, with the Pro checks in
// src/server/createBet.js. The creator uid always comes from the token.
async function create(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return json({ error: 'unauthorized' }, 401);
  try {
    let claims;
    try {
      claims = await adminAuth().verifyIdToken(token);
    } catch (err) {
      if (err?.code === 'admin-not-configured') throw err;
      return json({ error: 'unauthorized' }, 401);
    }
    const body = await request.json().catch(() => null);
    const result = await createBetForCreator({
      db: adminDb(),
      uid: claims.uid,
      phoneNumber: claims.phone_number,
      fields: body?.fields,
    });
    return json(result);
  } catch (err) {
    if (FORBIDDEN.includes(err?.code)) return json({ error: err.code }, 403);
    if (err?.code === 'invalid-bet') return json({ error: 'invalid-bet' }, 400);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`create failed: ${err?.code || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
