// The one invite text a creator sends from the app, from the live tally right
// after Create and from Text the crew later. Plain GSM-7 text (straight
// quotes, no emoji or dashes) so each invite stays one cheap SMS segment, with
// the link alone on the last line so phones turn it into a preview. Sides and
// vote counts stay out of the text; the link shows them.
export const INVITE_COPY = {
  title: 'New bet: {title}',
  stake: 'Stakes: {stake}',
  link: 'Pick your side: {link}',
};

function fill(template, values) {
  return template.replace(/\{(title|stake|link)\}/g, (_match, key) => values[key]);
}

export function formatInvite({ title, stake, url }) {
  const values = {
    title: String(title || '').trim(),
    stake: String(stake || '').trim(),
    link: url,
  };
  const lines = [fill(INVITE_COPY.title, values)];
  if (values.stake) lines.push(fill(INVITE_COPY.stake, values));
  lines.push(fill(INVITE_COPY.link, values));
  return lines.join('\n');
}
