import { isSettled } from './betStatus';
import { isBetCreator } from './creatorSession';
import { creatorName } from './identity';
import { DEFAULT_CLOSES, parseCloses, questionOf, typeLabelOf } from './model';

// "Run it back": the creator of a bet settled with a winner starts the same
// bet again. Never a called-off bet, never a voter (making a bet needs the
// phone-verified creator), and never a bet with nothing to copy.
export function canRunItBack(user, bet) {
  return isSettled(bet) && isBetCreator(user, bet)
    && Boolean(questionOf(bet)) && (bet.options || []).length >= 2;
}

// The new bet's fields for saveBet(null, fields): the question, stake, type
// and sides of the old one, the close time Create starts a new bet with, and
// the creator the way Create sets it. Only these keys, so nothing from the
// old bet's result (status, winnerId, votes, settlement, codes, times, result
// texts) comes along. createBet adds the code, open status and empty votes.
export function rematchFields(bet, creator, code) {
  const fields = {
    schemaVersion: 2,
    type: bet.type,
    typeLabel: typeLabelOf(bet),
    question: questionOf(bet),
    stake: String(bet.stake || '').trim(),
    closesAt: parseCloses(DEFAULT_CLOSES),
    options: (bet.options || []).map((option) => ({ id: option.id, label: option.label })),
    line: bet.line ?? null,
    rematchOf: { code: bet.code || code },
    createdByID: creator.uid,
    createdByName: creatorName(creator),
  };
  if (creator.email) fields.createdByEmail = creator.email;
  return fields;
}
