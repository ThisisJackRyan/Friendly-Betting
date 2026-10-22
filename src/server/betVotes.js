import { voteFromDoc, withVotes } from '../phone/votes';

// Server reads of a bet's votes (Admin SDK). Votes are the bet's legacy
// `votes` array plus one doc per voter at bets/{code}/votes/{uid}, merged the
// way the app merges them (src/phone/votes.js, docs/VOTE-SECURITY.md).
export function votesPath(code) {
  return `bets/${code}/votes`;
}

export function voteDocsOf(listed) {
  return listed.docs.map((item) => voteFromDoc(item.id, item.data())).filter(Boolean);
}

// The bet with merged votes, or null. Pass `tx` to read in a transaction.
export async function readBetWithVotes(db, code, tx = null) {
  const betRef = db.doc(`bets/${code}`);
  const votes = db.collection(votesPath(code));
  const snap = tx ? await tx.get(betRef) : await betRef.get();
  if (!snap.exists) return null;
  const listed = tx ? await tx.get(votes) : await votes.get();
  return withVotes(snap.data(), voteDocsOf(listed));
}
