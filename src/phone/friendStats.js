import { isCalledOff, isSettled } from './betStatus';
import { settlementOf } from './settlement';

// Head to head on My bets: every friend who picked on the creator's own bets,
// with their record. Built only from the bets subscribeMyBets already loaded,
// so it costs no extra reads. A friend is keyed by voterId and shown under the
// latest name they gave; a voter who never gave a name can't be told apart
// from any other, so they are left out, as are votes with no voterId and the
// creator's own pick.
//
// A win is what the reveal calls a win: the settlement's recipient entry
// (snapshotted when the bet settled), or for an old bet with no snapshot, a
// pick on the winning option. Called-off bets are never a win or a loss.
export function outcomeFor(bet, vote, result = settlementOf(bet)) {
  if (isCalledOff(bet)) return 'called-off';
  if (!isSettled(bet)) return 'open';
  const recipient = result?.recipients.find((item) => item.voterId === vote.voterId);
  const won = recipient ? recipient.won : vote.optionId === bet.winnerId;
  return won ? 'win' : 'loss';
}

// One vote per voter per bet, the last one recorded, as buildSettlement does.
function votesOf(bet) {
  const votes = Array.isArray(bet?.votes) ? bet.votes : [];
  return new Map(votes.filter((vote) => vote?.voterId).map((vote) => [vote.voterId, vote])).values();
}

export function friendStats(bets, creatorId) {
  const ordered = (Array.isArray(bets) ? bets : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const friends = new Map();
  ordered.forEach((bet) => {
    const result = settlementOf(bet);
    for (const vote of votesOf(bet)) {
      if (vote.voterId === creatorId) continue;
      let friend = friends.get(vote.voterId);
      if (!friend) {
        friend = { voterId: vote.voterId, name: '', betsTogether: 0, wins: 0, losses: 0, open: 0, calledOff: 0, bets: [] };
        friends.set(vote.voterId, friend);
      }
      // Bets are newest first, so the first name seen is the latest.
      const name = String(vote.name || '').trim();
      if (!friend.name && name) friend.name = name;
      const outcome = outcomeFor(bet, vote, result);
      friend.betsTogether += 1;
      if (outcome === 'win') friend.wins += 1;
      else if (outcome === 'loss') friend.losses += 1;
      else if (outcome === 'open') friend.open += 1;
      else friend.calledOff += 1;
      friend.bets.push({ bet, outcome, optionId: vote.optionId });
    }
  });
  return [...friends.values()]
    .filter((friend) => friend.name)
    .sort((a, b) => b.betsTogether - a.betsTogether || a.name.localeCompare(b.name) || a.voterId.localeCompare(b.voterId));
}
