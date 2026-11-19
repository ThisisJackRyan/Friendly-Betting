// In-memory, per-instance throttle for POST /api/bets/{code}/push, keyed by
// the verified uid. Normal use is one POST per settle or call-off, so this is
// well above that. Nothing is written to Firestore and nothing is logged.
export const BET_PUSH_LIMIT = 10;
export const BET_PUSH_WINDOW_MS = 10 * 60 * 1000;

const hits = new Map();

function sweep(now) {
  hits.forEach((times, key) => {
    if (!times.some((t) => now - t < BET_PUSH_WINDOW_MS)) hits.delete(key);
  });
}

// True when this uid may post now (and counts the post); false when over.
export function allowBetPush(uid, now = Date.now()) {
  if (hits.size > 1000) sweep(now);
  const recent = (hits.get(uid) || []).filter((t) => now - t < BET_PUSH_WINDOW_MS);
  if (recent.length >= BET_PUSH_LIMIT) {
    hits.set(uid, recent);
    return false;
  }
  recent.push(now);
  hits.set(uid, recent);
  return true;
}

// Tests only.
export function resetBetPushLimit() {
  hits.clear();
}
