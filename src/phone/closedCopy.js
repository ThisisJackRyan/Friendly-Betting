import { oneLine } from './inviteCopy.js';

// Every user-facing string for a bet once it is settled, called off, or has
// its picks in: the settle and called-off texts (the app's Share the result
// and the server's result SMS) and the /b/ and /t/ link preview card and
// og tags.

// Text templates. Plain GSM-7 (straight quotes, no dashes, no middle dot, no
// ellipsis character) so the fixed wording never forces UCS-2. Same rules as
// the invite text (inviteCopy.js): real newlines, user text trimmed with its
// whitespace collapsed, no trailing newline, the link alone on the last line.
export const CLOSED_TEXT_COPY = {
  settled: 'Bet settled:',
  winningPick: 'Winning pick:',
  stakes: 'Stakes:',
  settledLink: 'See who called it:',
  calledOff: 'Bet called off:',
  nobodyWon: 'Nobody won this one.',
  calledOffLink: 'See the bet:',
};

// The ?s= value a closed link carries, so iMessage and other unfurlers fetch a
// fresh preview instead of the cached open one. Routing ignores it; the card
// always follows the bet's own status.
export const LINK_STATUS = { settled: 'settled', calledOff: 'off', closed: 'closed' };

// The url with ?s={status} added (or &s= after an existing query), before any
// #fragment.
export function withStatus(url, status) {
  const raw = String(url || '').trim();
  if (!status) return raw;
  const hashAt = raw.indexOf('#');
  const base = hashAt === -1 ? raw : raw.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : raw.slice(hashAt);
  return `${base}${base.includes('?') ? '&' : '?'}s=${encodeURIComponent(status)}${hash}`;
}

// `clean` turns user text into one trimmed line; the server passes its GSM-7
// sanitizer. An empty or whitespace-only stake drops the Stakes block.
export function formatSettledText({ question, side, stake, url, clean = oneLine }) {
  const blocks = [
    `${CLOSED_TEXT_COPY.settled}\n${clean(question)}`,
    `${CLOSED_TEXT_COPY.winningPick}\n${clean(side)}`,
  ];
  const stakes = clean(stake);
  if (stakes) blocks.push(`${CLOSED_TEXT_COPY.stakes}\n${stakes}`);
  blocks.push(`${CLOSED_TEXT_COPY.settledLink}\n${withStatus(url, LINK_STATUS.settled)}`);
  return blocks.join('\n\n');
}

export function formatCalledOffText({ question, url, clean = oneLine }) {
  return [
    `${CLOSED_TEXT_COPY.calledOff}\n${clean(question)}`,
    CLOSED_TEXT_COPY.nobodyWon,
    `${CLOSED_TEXT_COPY.calledOffLink}\n${withStatus(url, LINK_STATUS.calledOff)}`,
  ].join('\n\n');
}

// The link preview for a closed bet: the card lines and the og title and
// description. Open bets keep PREVIEW_DESCRIPTION and the question card
// (src/server/betPreview.js, src/server/previewCard.js).
export const CLOSED_CARD_COPY = {
  settled: {
    hero: (side) => `${side} won.`,
    heroSuffix: ' won.',
    note: '',
    description: 'See who called it on Friendly Bets.',
  },
  calledOff: {
    hero: () => 'Called off.',
    note: 'Nobody won this one.',
    description: 'Nobody won this one.',
  },
  closed: {
    hero: () => 'Picks are in.',
    note: 'Waiting on the result.',
    description: 'Waiting on the result.',
  },
};

// "{hero} {question}", the og:title for a closed bet.
export function closedTitle(hero, question) {
  return `${hero} ${oneLine(question)}`.trim();
}
