import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '../../../src/server/firebaseAdmin';
import { authorizeAccountDeletion, deleteAccount } from '../../../src/server/deleteAccount';
import { createStripeClient } from '../../../src/server/deleteAccountStripe';
import { json, preflight, withCors } from '../../../src/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const METHODS = 'DELETE, OPTIONS';

export function OPTIONS(request) {
  return preflight(request, METHODS);
}

export async function DELETE(request) {
  return withCors(request, await remove(request), METHODS);
}

// A phone-verified member deletes their account (docs/DEVELOPMENT.md). The
// uid always comes from the verified ID token. Logs carry error codes only.
async function remove(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return json({ error: 'unauthorized' }, 401);
  try {
    const auth = adminAuth();
    const member = await authorizeAccountDeletion({ token, auth });
    if (!member.ok) return json({ error: member.error }, member.status);
    const result = await deleteAccount({
      db: adminDb(),
      auth,
      uid: member.uid,
      phoneNumber: member.phoneNumber,
      stripe: createStripeClient(),
      at: FieldValue.serverTimestamp(),
    });
    return json(result);
  } catch (err) {
    if (err?.code === 'forbidden') return json({ error: 'forbidden' }, 403);
    if (err?.code === 'admin-not-configured') return json({ error: 'not-configured' }, 503);
    if (err?.code === 'stripe-failed') {
      console.error('account delete stopped: stripe-failed');
      return json({ error: 'billing-unavailable' }, 503);
    }
    console.error(`account delete failed: ${err?.code ?? 'error'}`);
    return json({ error: 'server' }, 500);
  }
}
