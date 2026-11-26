// Any run of 7 or more digits, in any script, with up to 3 non-letter,
// non-digit characters (spaces, dashes, slashes, commas, NBSP...) between
// consecutive digits, could be a phone number, so it never reaches a log or
// the UI. A letter between digit groups breaks the run.
const LONG_DIGITS = /\+?\p{Nd}(?:[^\p{L}\p{Nd}]{0,3}\p{Nd}){6,}/gu;

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
