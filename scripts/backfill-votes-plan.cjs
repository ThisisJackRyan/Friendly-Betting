// What scripts/backfill-votes.mjs does to one bet, as a pure function so
// jest can check it (scripts/backfill-votes.test.js). See docs/VOTE-SECURITY.md.
//
// Each voter in the bet's legacy `votes` array gets their own doc at
// bets/{code}/votes/{uid}, unless they already have one (a doc always wins).
// Like mergeVotes (src/phone/votes.js), a voter listed twice counts once, at
// their last entry. Names are trimmed and capped at NAME_MAX in UTF-16 units,
// as the rules check. Entries with no voterId (or no string optionId) can't
// become a doc; a bet holding one never has its array cleared.

const NAME_MAX = 30;

function cleanName(name) {
  let out = '';
  for (const char of String(name || '').trim()) {
    if (out.length + char.length > NAME_MAX) break;
    out += char;
  }
  return out.trim();
}

// bet: the bet doc's data. existingIds: uids that already have a vote doc.
// clearArray: phase 2 only, empty the legacy array once every voter has a doc.
// Returns { creates: [{ id, voterId, name, optionId, atMs }], clear, skipped }.
function planBackfill(bet, existingIds = new Set(), { clearArray = false } = {}) {
  const list = Array.isArray(bet?.votes) ? bet.votes : [];
  const skipped = { noVoterId: 0, badOptionId: 0, hasDoc: 0, duplicate: 0 };
  const last = new Map();
  list.forEach((vote, index) => {
    if (!vote || typeof vote.voterId !== 'string' || !vote.voterId || vote.voterId.includes('/')) {
      skipped.noVoterId += 1;
      return;
    }
    if (last.has(vote.voterId)) skipped.duplicate += 1;
    last.set(vote.voterId, { vote, index });
  });
  const base = typeof bet?.createdAt === 'number' ? bet.createdAt : 0;
  const creates = [];
  last.forEach(({ vote, index }, voterId) => {
    if (existingIds.has(voterId)) {
      skipped.hasDoc += 1;
      return;
    }
    if (typeof vote.optionId !== 'string' || !vote.optionId) {
      skipped.badOptionId += 1;
      return;
    }
    creates.push({
      id: voterId,
      voterId,
      name: cleanName(vote.name),
      optionId: vote.optionId,
      // An entry with no time keeps its place: the bet's creation plus its index.
      atMs: typeof vote.at === 'number' ? vote.at : base + index,
    });
  });
  const clear = Boolean(clearArray) && list.length > 0
    && skipped.noVoterId === 0 && skipped.badOptionId === 0;
  return { creates, clear, skipped };
}

module.exports = { NAME_MAX, cleanName, planBackfill };
