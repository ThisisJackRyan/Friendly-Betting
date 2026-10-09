// Every invite text a creator sends from the app: Text friends on Create and
// Text the crew on the live tally. Plain GSM-7 text (straight quotes, no
// emoji or dashes) so each invite stays one cheap SMS segment, with the link
// alone on the last line so phones turn it into a preview. Sides and vote
// counts stay out of the text; the link shows them.
export const INVITE_COPY = {
  create: {
    title: 'New bet: {title}',
    stake: 'Stakes: {stake}',
    link: 'Pick your side: {link}',
  },
  tally: {
    title: 'Votes are coming in on {title}',
    stake: 'Stakes: {stake}',
    link: 'Get your pick in: {link}',
  },
};

function fill(template, values) {
  return template.replace(/\{(title|stake|link)\}/g, (_match, key) => values[key]);
}

function buildInvite(copy, { title, stake, url }) {
  const values = {
    title: String(title || '').trim(),
    stake: String(stake || '').trim(),
    link: url,
  };
  const lines = [fill(copy.title, values)];
  if (values.stake) lines.push(fill(copy.stake, values));
  lines.push(fill(copy.link, values));
  return lines.join('\n');
}

// Text friends, right after a bet is created.
export function formatInvite({ title, stake, url }) {
  return buildInvite(INVITE_COPY.create, { title, stake, url });
}

// Text the crew, re-sharing a bet that is still taking picks.
export function formatTallyInvite({ title, stake, url }) {
  return buildInvite(INVITE_COPY.tally, { title, stake, url });
}
