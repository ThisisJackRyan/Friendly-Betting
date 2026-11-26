// Any run of 7 or more digits, with spaces, dashes, dots, parens or a plus
// between them, could be a phone number, so it never reaches a log or the UI.
const LONG_DIGITS = /\+?\d(?:[\s().+-]*\d){6,}/g;

export const DETAIL_MAX = 160;

export function redactDigits(text) {
  if (text === undefined || text === null) return '';
  return String(text).replace(LONG_DIGITS, '[redacted]').replace(/\s+/g, ' ').trim();
}

export function redactDetail(text, max = DETAIL_MAX) {
  const clean = redactDigits(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trimEnd()}...`;
}
