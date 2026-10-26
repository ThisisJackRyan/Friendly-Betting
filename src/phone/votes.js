import { timestampMs } from './undoSettle';

// Votes live in two places while the move to per-voter docs rolls out
// (docs/VOTE-SECURITY.md): the legacy `votes` array on bets/{code}, and one
// doc per voter at bets/{code}/votes/{uid}. Every bet the app and the server
// read gets both merged into `bet.votes` by withVotes, so screens and routes
// read one list and never see the two sources apart.

// The longest name a voter can put on a pick. firestore.rules checks the same.
export const NAME_MAX = 30;

// Trimmed and cut to NAME_MAX, then trimmed again in case the cut left a
// space at the end. Length is in UTF-16 units, as the rules' size() and the
// inputs' maxLength count it (an emoji is 2), and an emoji is never split.
export function cleanName(name) {
  let out = '';
  for (const char of String(name || '').trim()) {
    if (out.length + char.length > NAME_MAX) break;
    out += char;
  }
  return out.trim();
}

// A vote's time in ms: a number in the legacy array, a Timestamp in a vote
// doc (or its { seconds, nanoseconds } form), or a Date. Anything else is null.
export function voteAtMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  return timestampMs(value);
}

// One vote doc's data as the same shape the legacy array holds.
export function voteFromDoc(id, data) {
  if (!data) return null;
  return {
    voterId: data.voterId || id,
    name: typeof data.name === 'string' ? data.name : '',
    optionId: data.optionId,
    at: voteAtMs(data.at),
  };
}

// The one list every reader uses: the legacy array plus the vote docs, one
// entry per voter. A voter listed twice in the array counts once, at their
// last entry (a recast moved a voter to the end). A voter with both a doc and
// an array entry keeps the later of the two, so a side switch made from an
// older build after their doc was written isn't lost; the doc wins a tie, or
// when either time is missing (a doc still waiting on its server time is the
// newest). Ordered by when each pick was cast, so a voter who switches sides
// moves to the end, as before. Entries with no voterId (very old bets) are
// kept as they are.
export function mergeVotes(legacy, docs) {
  const list = Array.isArray(legacy) ? legacy.filter(Boolean) : [];
  const own = (Array.isArray(docs) ? docs : []).filter((vote) => vote?.voterId);
  const ids = list.map((vote) => vote.voterId).filter(Boolean);
  if (!own.length && new Set(ids).size === ids.length) return list;
  const lastAt = new Map();
  list.forEach((vote, index) => {
    if (vote.voterId) lastAt.set(vote.voterId, index);
  });
  // Each voter's doc, unless their array entry is newer.
  const newest = own.filter((vote) => {
    const index = lastAt.get(vote.voterId);
    if (index === undefined) return true;
    const docAt = voteAtMs(vote.at);
    const arrayAt = voteAtMs(list[index].at);
    return docAt == null || arrayAt == null || arrayAt <= docAt;
  });
  const docIds = new Set(newest.map((vote) => vote.voterId));
  const kept = list.filter((vote, index) => !vote.voterId
    || (!docIds.has(vote.voterId) && lastAt.get(vote.voterId) === index));
  // A stable sort: entries with no time keep their place ahead of timed ones.
  return [...kept, ...newest]
    .map((vote, index) => ({ vote, index, at: voteAtMs(vote.at) ?? -1 }))
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map((item) => item.vote);
}

// The bet with its merged votes. `docs` are voteFromDoc entries.
export function withVotes(bet, docs) {
  if (!bet) return bet;
  return { ...bet, votes: mergeVotes(bet.votes, docs) };
}
