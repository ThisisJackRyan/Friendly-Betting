import { createHash } from 'crypto';
import { RESULT_TEXT_COPY } from '../phone/resultTextCopy';
import { normalizeE164 } from '../phone/resultTexts';
import { isCalledOff, isFinished, isSettled } from '../phone/betStatus';
import { optionVoteLabel, questionOf } from '../phone/model';
import { PROD_ORIGIN } from '../platform/runtime';

// Numbers live outside the public bet doc, so they can never reach the tally,
// share card, OG image, or any client read. Admin SDK only; rules deny all.
export const DEFAULT_ORIGIN = PROD_ORIGIN;
const SEGMENT = 160;
export const MAX_NUMBERS_PER_BET = 50;

const GSM7_BASIC = new Set(
  Array.from(
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
      '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
  ),
);
const GSM7_EXTENSION = new Set(Array.from('^{}\\[~]|€'));

function failure(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

export function numbersPath(code) {
  return `privateResultTexts/${code}/numbers`;
}

export function numberId(e164) {
  return createHash('sha256').update(e164).digest('hex');
}

function isGsm7(char) {
  return GSM7_BASIC.has(char) || GSM7_EXTENSION.has(char);
}

export function toGsm7(text) {
  const mapped = String(text || '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ');
  let out = '';
  for (const char of mapped) {
    if (isGsm7(char)) {
      out += char;
      continue;
    }
    // Transliterate accents GSM-7 lacks (á -> a); drop whatever is left (emoji).
    for (const base of char.normalize('NFD').replace(/[̀-ͯ]/g, '')) {
      if (isGsm7(base)) out += base;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function gsm7Septets(text) {
  let count = 0;
  for (const char of String(text || '')) count += GSM7_EXTENSION.has(char) ? 2 : 1;
  return count;
}

function fill(template, values) {
  return template.replace(/\{(title|side|link)\}/g, (_match, key) => values[key]);
}

function winningSide(bet) {
  if (bet.settlement?.optionLabel) return bet.settlement.optionLabel;
  const option = (bet.options || []).find((item) => item.id === bet.winnerId);
  return option ? optionVoteLabel(bet, option) : '';
}

export function buildResultSms({ bet, won, calledOff, code, origin = DEFAULT_ORIGIN }) {
  const template = calledOff
    ? RESULT_TEXT_COPY.sms.calledOff
    : won
      ? RESULT_TEXT_COPY.sms.won
      : RESULT_TEXT_COPY.sms.lost;
  const title = toGsm7(bet.settlement?.question || questionOf(bet));
  const side = toGsm7(winningSide(bet));
  const link = `${origin}/t/${code}`;
  const full = fill(template, { title, side, link });
  if (gsm7Septets(full) <= SEGMENT) return full;
  // One segment is cheaper and arrives as one bubble, so shorten the title
  // first. If a very long side label still won't fit with an empty title, send
  // the full text as a multi-part SMS rather than drop the result.
  for (let length = title.length - 1; length >= 0; length -= 1) {
    const short = `${title.slice(0, length).trimEnd()}...`;
    const body = fill(template, { title: short, side, link });
    if (gsm7Septets(body) <= SEGMENT) return body;
  }
  return full;
}

export function voterWon(bet, voterId, storedOptionId) {
  const recipient = (bet.settlement?.recipients || []).find((item) => item.voterId === voterId);
  if (recipient) return Boolean(recipient.won);
  const vote = (bet.votes || []).find((item) => item.voterId === voterId);
  return (vote?.optionId || storedOptionId) === bet.winnerId;
}

export async function saveVoterNumber({ db, code, uid, phone, now = Date.now() }) {
  const e164 = normalizeE164(phone);
  // The UI is US-only; anything else here is a crafted request.
  if (!e164 || !e164.startsWith('+1')) throw failure('invalid-phone');
  // Keyed by a hash of the number: saving it twice keeps one doc. One number
  // per voter, so a new number replaces theirs; the same number from another
  // voter is overwritten (last voter wins).
  const id = numberId(e164);
  const numbers = db.collection(numbersPath(code));
  await db.runTransaction(async (tx) => {
    // Read the bet in the transaction so a concurrent settle forces a retry
    // that fails with 'closed' rather than leaving a number behind after delivery.
    const snap = await tx.get(db.doc(`bets/${code}`));
    if (!snap.exists) throw failure('not-found');
    const bet = snap.data();
    if (isFinished(bet)) throw failure('closed');
    // The side comes from the voter's recorded pick, never from the request.
    const vote = (bet.votes || []).find((item) => item.voterId === uid);
    if (!uid || !vote) throw failure('no-vote');
    const listed = await tx.get(numbers);
    const replaced = listed.docs.filter((item) => item.id !== id && item.data().voterId === uid);
    const others = listed.docs.filter((item) => item.id !== id && item.data().voterId !== uid);
    if (others.length >= MAX_NUMBERS_PER_BET) throw failure('too-many');
    replaced.forEach((item) => tx.delete(item.ref));
    tx.set(db.doc(`${numbersPath(code)}/${id}`), {
      e164,
      voterId: uid,
      optionId: vote.optionId,
      createdAt: now,
    });
  });
}

// The single hook the settle path calls. Safe to run any number of times.
export async function deliverResultTexts({ db, code, sendSms, origin = DEFAULT_ORIGIN }) {
  const snap = await db.doc(`bets/${code}`).get();
  const bet = snap.exists ? snap.data() : null;
  const calledOff = isCalledOff(bet);
  if (!bet || (!isSettled(bet) && !calledOff)) return { sent: 0, skipped: 'not-settled' };
  const listed = await db.collection(numbersPath(code)).get();
  let sent = 0;
  let failed = 0;
  for (const item of listed.docs) {
    // Claim by delete: only the transaction that removes the doc sends, so a
    // number is texted at most once and is gone before the text goes out.
    const claimed = await db.runTransaction(async (tx) => {
      const current = await tx.get(item.ref);
      if (!current.exists) return null;
      tx.delete(item.ref);
      return current.data();
    });
    if (!claimed?.e164) continue;
    const body = buildResultSms({
      bet,
      won: !calledOff && voterWon(bet, claimed.voterId, claimed.optionId),
      calledOff,
      code,
      origin,
    });
    try {
      await sendSms(claimed.e164, body);
      sent += 1;
    } catch (err) {
      failed += 1;
      // Never log the number.
      console.warn(`result text failed for bet ${code}: ${err?.code || 'error'}`);
    }
  }
  return { sent, failed };
}
