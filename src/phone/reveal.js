import { isCalledOff } from './betStatus';
import { settlementOf } from './settlement';

// Every on-screen string for the settled reveal on /b/ and /t/.
export const REVEAL_COPY = {
  eyebrow: (side) => `${side} won`,
  won: (names) => `${names} won.`,
  bragging: 'Bragging rights, secured.',
  solo: 'Called it solo. Bragging rights, secured.',
  nobody: 'Nobody called it.',
  nobodySub: 'Not one of you saw that coming.',
  youWon: 'You called it.',
  youWonWith: (names) => `${names} won. Bragging rights, secured.`,
  youSolo: 'Solo win. Bragging rights, secured.',
  youLost: 'Not your day. Get ’em next time.',
  calledOff: 'This bet was called off.',
  calledOffSub: 'Nobody won this one.',
  stake: (stake) => `Stakes: ${stake}`,
  startBet: 'Start a bet',
  others: (count) => (count === 1 ? '1 other' : `${count} others`),
  // TODO_UX: every winner skipped their name. Placeholder until UX signs off.
  friends: (count) => (count === 1 ? 'TODO_UX: 1 friend' : `TODO_UX: ${count} friends`),
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
  const recipient = viewerId ? result.recipients.find((item) => item.voterId === viewerId) : null;

  if (recipient?.won) {
    const others = winners.filter((winner) => winner.voterId !== viewerId);
    if (!others.length) return { ...base, kind: 'you-solo', headline: REVEAL_COPY.youWon, subline: REVEAL_COPY.youSolo };
    const named = winnerPhrase(others) || REVEAL_COPY.others(others.length);
    const names = others.length === 1 ? `You & ${named}` : `You, ${named}`;
    return { ...base, kind: 'you-won', headline: REVEAL_COPY.youWon, subline: REVEAL_COPY.youWonWith(names) };
  }

  if (!winners.length) return { ...base, kind: 'nobody', headline: REVEAL_COPY.nobody, subline: REVEAL_COPY.nobodySub };

  const names = winnerPhrase(winners) || REVEAL_COPY.friends(winners.length);
  const headline = REVEAL_COPY.won(names);
  if (recipient) return { ...base, kind: 'you-lost', headline, subline: REVEAL_COPY.youLost, startBet: true };
  const subline = winners.length === 1 ? REVEAL_COPY.solo : REVEAL_COPY.bragging;
  return { ...base, kind: 'winners', headline, subline };
}
