import { pushEnabled } from './pushConfig';
import { apiUrl } from './resultTexts';

// After a settle or call-off commits, ask the server to push the result to the
// voters (docs/PUSH.md). Fire-and-forget like requestResultTexts: the server
// re-reads the bet, waits out a settle's undo window and picks the
// recipients, so the body is empty. Settling never waits on this, never fails
// because of it, and with push off nothing is posted at all. Any device can
// trigger it (a web settle still pings the voters' phones).
export function requestBetPush(code) {
  if (!pushEnabled()) return;
  try {
    const sent = fetch(apiUrl(`/api/bets/${encodeURIComponent(code)}/push`), { method: 'POST' });
    if (sent && typeof sent.catch === 'function') sent.catch(() => {});
  } catch (err) {
    // Push is a bonus. Settling never fails because of it.
  }
}
