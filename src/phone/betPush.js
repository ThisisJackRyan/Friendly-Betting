import { pushEnabled } from './pushConfig';
import { apiUrl } from './resultTexts';

// POSTs to one of the bet's push routes with the current Firebase user's ID
// token and no body. No user (signed out, or the local fallback identity that
// has no Firebase account), no getIdToken or no token: nothing is posted.
async function post(code, suffix = '') {
  const { auth } = await import('../Config/firebase-config');
  const user = auth?.currentUser;
  if (!user || user.isLocal || typeof user.getIdToken !== 'function') return;
  const token = await user.getIdToken();
  if (!token) return;
  await fetch(apiUrl(`/api/bets/${encodeURIComponent(code)}/push${suffix}`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function fireAndForget(code, suffix) {
  if (!pushEnabled()) return;
  try {
    post(code, suffix).catch(() => {});
  } catch (err) {
    // Push is a bonus. The write it follows never fails because of it.
  }
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
  fireAndForget(code, '');
}

// After a friend's first pick commits, ask the server to tell the bet's
// creator (docs/PUSH.md). Same fire-and-forget shape as requestBetPush: no
// body (the server reads the side and the name from the live vote), the
// voter's ID token (anonymous counts), nothing posted without one or with
// push off. Voting never waits on this and never fails because of it. Never
// logs the token or the uid.
export function requestPickPush(code) {
  fireAndForget(code, '/pick');
}
