import { adminAuth, adminDb } from '../../../../src/server/firebaseAdmin';
import { json, preflight, withCors } from '../../../../src/server/http';
import { pushEnabled, validDeviceId } from '../../../../src/phone/pushConfig';
import { removeDeviceToken, saveDeviceToken, validRegistration } from '../../../../src/server/pushTokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'POST, DELETE, OPTIONS';
// With the flag off the route looks like it does not exist: no CORS, no auth.
const NOT_FOUND = () => json({ error: 'not-found' }, 404);

export function OPTIONS(request) {
  if (!pushEnabled()) return NOT_FOUND();
  return preflight(request, METHODS);
}

export async function POST(request) {
  if (!pushEnabled()) return NOT_FOUND();
  return withCors(request, await handle(request, 'register'), METHODS);
}

export async function DELETE(request) {
  if (!pushEnabled()) return NOT_FOUND();
  return withCors(request, await handle(request, 'unregister'), METHODS);
}

// Registers or removes one device's push token (docs/PUSH.md). The uid comes
// from the verified ID token, never the body. Never echoes or logs the push
// token, the ID token or the uid.
async function handle(request, op) {
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
    const body = await request.json().catch(() => null);
    if (op === 'register') {
      if (!validRegistration(body)) return json({ error: 'invalid' }, 400);
      await saveDeviceToken({ db: adminDb(), uid, deviceId: body.deviceId, token: body.token, platform: body.platform });
    } else {
      if (!validDeviceId(body?.deviceId)) return json({ error: 'invalid' }, 400);
      await removeDeviceToken({ db: adminDb(), uid, deviceId: body.deviceId });
    }
    return json({ ok: true });
  } catch (err) {
    if (err?.code === 'rate-limited') return json({ error: 'rate-limited' }, 429);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    console.error(`push token ${op} failed: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
