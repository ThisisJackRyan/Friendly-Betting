import { adminAuth, adminDb } from '../../../../src/server/firebaseAdmin';
import { deleteBet } from '../../../../src/server/deleteBet';
import { json, preflight, validCode, withCors } from '../../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'DELETE, OPTIONS';

export function OPTIONS(request) {
  return preflight(request, METHODS);
}

export async function DELETE(request, context) {
  return withCors(request, await remove(request, context), METHODS);
}

// The creator deletes their bet and every saved result-text number for it.
async function remove(request, { params }) {
  const { code } = await params;
  if (!validCode(code)) return json({ error: 'not-found' }, 404);
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
    const result = await deleteBet({ db: adminDb(), code, uid: claims.uid, phoneNumber: claims.phone_number });
    return json(result);
  } catch (err) {
    if (err?.code === 'forbidden') return json({ error: 'forbidden' }, 403);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`delete failed for bet ${code}: ${err?.code || 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
