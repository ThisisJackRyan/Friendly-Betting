import { pushEnabled } from './pushConfig';
import { apiUrl } from './resultTexts';

async function post(code) {
  const { auth } = await import('../Config/firebase-config');
  const user = auth?.currentUser;
  if (!user || typeof user.getIdToken !== 'function') return;
  const token = await user.getIdToken();
  if (!token) return;
  await fetch(apiUrl(`/api/bets/${encodeURIComponent(code)}/push`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// After a settle or call-off commits, ask the server to push the result to the
// voters (docs/PUSH.md). Fire-and-forget like requestResultTexts: the server
// re-reads the bet, waits out a settle's undo window and picks the
// recipients, so the body is empty. The route only acts for the bet's
// creator, so this sends the current user's Firebase ID token; with no user
// or no token nothing is posted. Settling never waits on this, never fails
// because of it, and with push off nothing is posted at all. Never logs the
// token or the uid.
export function requestBetPush(code) {
  if (!pushEnabled()) return;
  try {
    post(code).catch(() => {});
  } catch (err) {
    // Push is a bonus. Settling never fails because of it.
  }
}
