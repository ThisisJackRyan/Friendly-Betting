import { isCalledOff } from './betStatus';
import { settlementOf } from './settlement';

// The winners' line, by what was at stake. It ends every winning subline on
// the reveal and on the Share as image card.
export const STAKE_LINES = {
  bragging: 'Bragging rights, secured.',
  coffee: 'Coffee\u2019s on everyone else.',
  lunch: 'Lunch is on everyone else.',
  drinks: 'Drinks are on everyone else.',
  custom: 'Time for everyone else to pay up.',
};

const STAKE_KINDS = { 'bragging rights': 'bragging', coffee: 'coffee', lunch: 'lunch', drinks: 'drinks' };

// A stake is stored as the text the creator picked or typed: a Create chip
// saves its label ("Bragging rights", "Coffee"), and the settlement snapshot
// fills an empty one with "Bragging rights". Case, spacing and a closing
// period or "!" don't change which it is; anything else is a custom stake.
export function stakeKind(stake) {
  const key = String(stake || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '');
  if (!key) return 'bragging';
  return STAKE_KINDS[key] || 'custom';
}

export const stakeLine = (stake) => STAKE_LINES[stakeKind(stake)];

// Every on-screen string for the settled reveal on /b/ and /t/. A winning
// subline takes its stake line (stakeLine) after the fixed start.
export const REVEAL_COPY = {
  eyebrow: (side) => `${side} won`,
  won: (names) => `${names} won.`,
  solo: (line) => `Called it solo. ${line}`,
  nobody: 'Nobody called it.',
  nobodySub: 'Not one of you saw that coming.',
  youWon: 'You called it.',
  youWonWith: (names, line) => `${names} won. ${line}`,
  youSolo: (line) => `Solo win. ${line}`,
  youLost: 'Not your day. Get ’em next time.',
  calledOff: 'This bet was called off.',
  calledOffSub: 'Nobody won this one.',
  stake: (stake) => `Stakes: ${stake}`,
  startBet: 'Start a bet',
  others: (count) => (count === 1 ? '1 other' : `${count} others`),
  // Every winner skipped their name.
  friends: (count) => (count === 1 ? 'One friend called it.' : `${count} friends called it.`),
};

// Names shown before "& N others".
const NAMED = 2;

function joinNames(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} & ${parts.at(-1)}`;
}

// "Jack", "Jack & Maya", "Jack, Maya & Sam", "Jack, Maya & 3 others",
// "Jack & 1 other". Unnamed winners only ever count toward the others.
export function winnerPhrase(winners) {
  const names = winners.map((winner) => String(winner.name || '').trim()).filter(Boolean);
  if (!winners.length || !names.length) return '';
  if (names.length === winners.length && winners.length <= 3) return joinNames(names);
  const shown = names.slice(0, NAMED);
  return joinNames([...shown, REVEAL_COPY.others(winners.length - shown.length)]);
}

// What a settled bet says to this viewer, or null while it is not settled.
// Old settled bets without a stored settlement get one derived from their
// votes (settlementOf); nothing here writes. `legacy` means the winners can't
// be known (a count-only bet), so the screen keeps the plain result card.
export function buildReveal({ bet, viewerId }) {
  if (!bet) return null;
  const rawStake = String(bet.stake || '').trim();
  if (isCalledOff(bet)) {
    return {
      kind: 'called-off',
      eyebrow: '',
      headline: REVEAL_COPY.calledOff,
      subline: REVEAL_COPY.calledOffSub,
      stake: rawStake,
      startBet: false,
    };
  }
  const result = settlementOf(bet);
  if (!result) return null;
  // The snapshot fills an empty stake with "Bragging rights"; only show a
  // stake the creator actually set.
  const stake = rawStake ? result.stake : '';
  const base = { eyebrow: result.optionLabel ? REVEAL_COPY.eyebrow(result.optionLabel) : '', stake, startBet: false };
  const countOnly = !result.recipients.length && !(bet.votes || []).length
    && (Number(bet.over) > 0 || Number(bet.under) > 0);
  if (countOnly) return { ...base, kind: 'legacy', headline: '', subline: '' };

  const winners = result.winners;
  const line = stakeLine(result.stake);
  const recipient = viewerId ? result.recipients.find((item) => item.voterId === viewerId) : null;

  if (recipient?.won) {
    const others = winners.filter((winner) => winner.voterId !== viewerId);
    if (!others.length) return { ...base, kind: 'you-solo', headline: REVEAL_COPY.youWon, subline: REVEAL_COPY.youSolo(line) };
    const named = winnerPhrase(others) || REVEAL_COPY.others(others.length);
    const names = others.length === 1 ? `You & ${named}` : `You, ${named}`;
    return { ...base, kind: 'you-won', headline: REVEAL_COPY.youWon, subline: REVEAL_COPY.youWonWith(names, line) };
  }

  if (!winners.length) return { ...base, kind: 'nobody', headline: REVEAL_COPY.nobody, subline: REVEAL_COPY.nobodySub };

  const names = winnerPhrase(winners);
  const headline = names ? REVEAL_COPY.won(names) : REVEAL_COPY.friends(winners.length);
  if (recipient) return { ...base, kind: 'you-lost', headline, subline: REVEAL_COPY.youLost, startBet: true };
  // "Called it solo" only follows a name; a lone unnamed winner gets the
  // plain stake line.
  const subline = names && winners.length === 1 ? REVEAL_COPY.solo(line) : line;
  return { ...base, kind: 'winners', headline, subline };
}
