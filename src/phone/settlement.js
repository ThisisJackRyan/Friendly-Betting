import { isCalledOff, isSettled } from './betStatus';
import { formatCalledOffText, formatSettledText } from './closedCopy';
import { optionVoteLabel, questionOf } from './model';
import { settledAtMs } from './undoSettle.js';

// Snapshot the result in the same transaction that closes the bet. A later
// profile or copy change must not change who won or what was at stake.
export function buildSettlement(bet, winnerId) {
  const option = (bet.options || []).find((item) => item.id === winnerId);
  if (!option) throw new Error('Pick one of this bet’s sides.');
  const votes = Array.from(
    new Map((bet.votes || []).filter((vote) => vote.voterId).map((vote) => [vote.voterId, vote])).values(),
  );
  return {
    version: 1,
    question: questionOf(bet),
    stake: String(bet.stake || '').trim() || 'Bragging rights',
    optionId: option.id,
    optionLabel: optionVoteLabel(bet, option),
    winners: votes
      .filter((vote) => vote.optionId === winnerId)
      .map((vote) => ({ voterId: vote.voterId, name: String(vote.name || '').trim() })),
    recipients: votes.map((vote) => ({ voterId: vote.voterId, won: vote.optionId === winnerId })),
  };
}

// Null until settled with a winner, and always null for a called-off bet.
export function settlementOf(bet) {
  if (!isSettled(bet)) return null;
  if (bet.settlement?.version === 1) return bet.settlement;
  // Old settled links still show a result, without pretending they sent a ping.
  try {
    return buildSettlement(bet, bet.winnerId);
  } catch {
    return null;
  }
}

export function winnerNames(result) {
  const names = result.winners.map((winner) => String(winner.name || '').trim()).filter(Boolean);
  const unnamed = result.winners.length - names.length;
  if (unnamed) names.push(unnamed === 1 ? 'a friend' : `${unnamed} friends`);
  if (!names.length) return '';
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export function resultHeadline(result) {
  const names = winnerNames(result);
  if (!names) return result.recipients.length ? 'Nobody called it' : `${result.optionLabel} takes it`;
  // Only call it a pot when the creator explicitly described it as one.
  const pot = /^\$[\d,]+(?:\.\d{1,2})? pot$/i.test(result.stake);
  return `${names} won${pot ? ` the ${result.stake}` : ''}`;
}

export function resultOneLiner(result) {
  return result.winners.length ? 'Bragging rights, secured.' : 'The plot twist wins this round.';
}

// The winning side's label as the creator wrote it: the snapshot's, or for
// an older settle without one, the winning option's. '' when unknown.
export function winningSide(bet) {
  if (bet?.settlement?.optionLabel) return bet.settlement.optionLabel;
  const option = (bet?.options || []).find((item) => item.id === bet?.winnerId);
  return option ? optionVoteLabel(bet, option) : '';
}

// The stake to show in a result text: the snapshot's, unless the creator
// set none. The snapshot fills an empty stake with "Bragging rights", so
// "no stakes" is read from the bet itself (as the reveal does).
export function sharedStake(bet, result) {
  return String(bet?.stake || '').trim() ? result.stake : '';
}

// The text for Share the result. Called off and settled get their closed
// templates (closedCopy.js); a closed bet with no readable result keeps the
// short picks-closed line.
export function formatResultMessage(bet, url) {
  if (isCalledOff(bet)) return formatCalledOffText({ question: questionOf(bet), url });
  const result = settlementOf(bet);
  if (!result) return `Friendly Bets: Picks are closed.\n${questionOf(bet)}\nResult to come: ${url}`;
  return formatSettledText({
    question: result.question,
    side: result.optionLabel,
    stake: sharedStake(bet, result),
    url,
  });
}

export function notificationFor(bet, voterId) {
  // Only new settlements have a durable notify event and timestamp.
  // settledAt is a server Timestamp now, a number on older settles.
  const at = settledAtMs(bet);
  if (!bet?.settlement || !at) return null;
  const result = settlementOf(bet);
  const recipient = result?.recipients.find((item) => item.voterId === voterId);
  if (!recipient) return null;
  return {
    id: `${bet.code || bet.id}:${at}`,
    code: bet.code || bet.id,
    at,
    won: recipient.won,
    title: recipient.won ? 'You called it.' : 'This one’s settled.',
    question: result.question,
    outcome: resultHeadline(result),
    stake: result.stake,
    oneLiner: recipient.won ? 'Bragging rights, secured.' : 'Good game. More friendly bets ahead.',
  };
}
