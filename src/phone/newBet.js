// How a new bet doc is built, shared by the client create (createBet in
// api.js) and the server create route (src/server/createBet.js), so both
// write the same shape. No Firebase imports.

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

// The doc for bets/{code}: the creator's fields, then the keys every new bet
// starts with (open, no winner, no votes), which the fields can't override.
export function newBetDoc(fields, code, createdAt = Date.now()) {
  return {
    ...fields,
    schemaVersion: 2,
    code,
    status: 'open',
    winnerId: null,
    votes: [],
    createdAt,
  };
}
