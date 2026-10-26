import { isSettled } from './betStatus';
import { isBetCreator } from './creatorSession';

// The creator can take a settle back for 30s (docs/UNDO-CALL-OFF.md).
// firestore.rules allows the undo write up to 35s after the server settledAt,
// so a tap near the end of the countdown still lands. The result-text server
// waits out the longer one before texting.
export const UNDO_WINDOW_MS = 30 * 1000;
export const UNDO_RULES_WINDOW_MS = 35 * 1000;

// A Firestore Timestamp (client or Admin SDK), or its plain { seconds,
// nanoseconds } form, in ms. Anything else (a number, null) is null.
export function timestampMs(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  return null;
}

// settledAt in ms. Settles write a server Timestamp; older builds wrote
// Date.now(), and tests and fixtures use plain numbers.
export function settledAtMs(bet) {
  const value = bet?.settledAt;
  if (typeof value === 'number') return value;
  return timestampMs(value);
}

// How long the creator's Undo stays up, in ms (0 = gone). Measured from the
// server settledAt, clamped so the client clock can never show more than
// 30s. `localAt` is when this screen's own settle saved: it covers the
// moment before the server time arrives, and caps the window if the clocks
// disagree. A number settledAt is an older settle the rules can't undo.
export function undoRemainingMs(bet, { now = Date.now(), localAt = null } = {}) {
  if (!isSettled(bet)) return 0;
  const server = timestampMs(bet.settledAt);
  if (server == null && !(bet.settledAt == null && localAt)) return 0;
  const ends = [server, localAt].filter((at) => at != null).map((at) => at + UNDO_WINDOW_MS);
  return Math.max(0, Math.min(UNDO_WINDOW_MS, Math.min(...ends) - now));
}

export function canUndoSettle(user, bet, options) {
  return isBetCreator(user, bet) && undoRemainingMs(bet, options) > 0;
}

// How long the result-text server holds off: until the rules' undo window
// on this settle has passed. 0 for a call-off or an older settle.
export function undoHoldMs(bet, now = Date.now()) {
  if (!isSettled(bet)) return 0;
  const server = timestampMs(bet.settledAt);
  if (server == null) return 0;
  return Math.max(0, server + UNDO_RULES_WINDOW_MS - now);
}
