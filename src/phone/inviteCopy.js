// The one invite text a creator sends from the app, from the live tally right
// after Create and from Text the crew later. The templates are plain GSM-7
// (straight quotes, no dashes) so the fixed wording never forces UCS-2; the
// question and stakes go out as entered. The link sits alone on the last line
// so phones turn it into a preview. Sides and vote counts stay out of the
// text; the link shows them.
export const INVITE_COPY = {
  heading: 'New bet:',
  stakes: 'Stakes:',
  link: 'Pick your side:',
};

// Trimmed, with every run of whitespace (newlines too) as one space.
export function oneLine(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function formatInvite({ title, stake, url }) {
  const question = oneLine(title);
  const stakes = oneLine(stake);
  const blocks = [`${INVITE_COPY.heading}\n${question}`];
  if (stakes) blocks.push(`${INVITE_COPY.stakes}\n${stakes}`);
  blocks.push(`${INVITE_COPY.link}\n${String(url || '').trim()}`);
  return blocks.join('\n\n');
}
