import { adminAuth, adminDb } from '../../../../../src/server/firebaseAdmin';
import { saveVoterNumber } from '../../../../../src/server/resultTexts';
import { json, preflight, validCode, withCors } from '../../../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONFLICTS = new Set(['closed', 'no-vote', 'too-many']);

export function OPTIONS(request) {
  return preflight(request);
}

export async function POST(request, context) {
  return withCors(request, await save(request, context));
}

// Saves a voter's number for one result text. Never echoes or logs the number.
async function save(request, { params }) {
  const { code } = await params;
  if (!validCode(code)) return json({ error: 'not-found' }, 404);
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return json({ error: 'unauthorized' }, 401);
  try {
    let uid;
    try {
      ({ uid } = await adminAuth().verifyIdToken(token));
    } catch (err) {
      if (err?.code === 'admin-not-configured') throw err;
      return json({ error: 'unauthorized' }, 401);
    }
    const body = await request.json().catch(() => ({}));
    await saveVoterNumber({ db: adminDb(), code, uid, phone: body?.phone });
    return json({ ok: true });
  } catch (err) {
    if (err?.code === 'invalid-phone') return json({ error: 'invalid-phone' }, 400);
    if (err?.code === 'not-found') return json({ error: 'not-found' }, 404);
    if (CONFLICTS.has(err?.code)) return json({ error: err.code }, 409);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`result text save failed for bet ${code}: ${err?.code || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
