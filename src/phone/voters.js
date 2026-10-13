// TODO_UX: send these to UX for final lines
export const VOTER_LIST_COPY = {
  friends: (count) => (count === 1 ? '1 friend' : `${count} friends`),
  more: (count) => `+${count} more`,
  pickedBy: (list) => `Picked by ${list}`,
};

// Names shown before the "+N more" control.
export const VOTER_PREVIEW = 5;

// Who picked each side, read from the embedded votes. Legacy bets that only
// kept over/under counts have no votes, so every side comes back empty.
export function votersByOption(bet) {
  const votes = Array.isArray(bet?.votes) ? bet.votes : [];
  const sides = {};
  votes.forEach((vote) => {
    if (!vote?.optionId) return;
    const side = (sides[vote.optionId] ||= { names: [], unnamed: 0 });
    const name = typeof vote.name === 'string' ? vote.name.trim() : '';
    if (name) side.names.push(name);
    else side.unnamed += 1;
  });
  return sides;
}

function joinList(parts) {
  try {
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(parts);
  } catch {
    return parts.join(', ');
  }
}

// "Picked by Jake, Maya, and 2 more" for the names a reader can see.
export function voterListLabel(shown, hidden, unnamed) {
  const parts = [...shown];
  if (hidden) parts.push(`${hidden} more`);
  if (unnamed) parts.push(VOTER_LIST_COPY.friends(unnamed));
  return VOTER_LIST_COPY.pickedBy(joinList(parts));
}
