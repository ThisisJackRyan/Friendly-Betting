// The one place that decides whether a bet is open, closed, settled or called
// off. The phone screens, the api client and the result-text server all read
// a bet's state through these, so a called-off bet behaves the same whether it
// carries `calledOff: true` or `status: 'called-off'`. Legacy bets have no
// status field and count as open.

// Called off: nobody won. Either marker counts, whatever else the doc says.
export function isCalledOff(bet) {
  return bet?.calledOff === true || bet?.status === 'called-off';
}

// Settled with a winner. A called-off bet is never settled, even if its
// settle write also named a winnerId.
export function isSettled(bet) {
  return bet?.status === 'closed' && Boolean(bet.winnerId) && !isCalledOff(bet);
}

// Closed for good: closed by the creator (with or without a winner yet) or
// called off. Ignores closesAt, so a creator can still edit a bet whose
// pick window ran out.
export function isFinished(bet) {
  return bet?.status === 'closed' || isCalledOff(bet);
}

// No more picks: finished, or past its close time.
export function isClosed(bet, now = Date.now()) {
  if (!bet) return true;
  if (isFinished(bet)) return true;
  return Boolean(bet.closesAt && bet.closesAt <= now);
}

export function votingOpen(bet, now = Date.now()) {
  return !isClosed(bet, now);
}

// The pill on My Bets, /t/ and /b/.
export function statusLabel(bet, now = Date.now()) {
  if (!bet) return '';
  if (isSettled(bet)) return 'Settled';
  if (isClosed(bet, now)) return 'Closed';
  return 'Open';
}
