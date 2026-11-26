import { createHash } from 'crypto';
import { formatCalledOffText, formatSettledText } from '../phone/closedCopy';
import { normalizeE164 } from '../phone/resultTexts';
import { isCalledOff, isFinished, isSettled } from '../phone/betStatus';
import { questionOf } from '../phone/model';
import { winningSide } from '../phone/settlement';
import { settledAtMs, undoHoldMs } from '../phone/undoSettle.js';
import { PROD_ORIGIN } from '../platform/runtime';
import { readBetWithVotes } from './betVotes';

// Numbers live outside the public bet doc, so they can never reach the tally,
// share card, OG image, or any client read. Admin SDK only; rules deny all.
export const DEFAULT_ORIGIN = PROD_ORIGIN;
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

// One text for everyone on the bet, winners and losers alike: the settled
// or called-off template (src/phone/closedCopy.js) with the question, side
// and stakes made GSM-7. No shortening to one 160-septet segment: the
// multi-line template and its link already fill most of one, and phones show
// a multi-part text as one bubble, so the question goes out whole.
export function buildResultSms({ bet, calledOff, code, origin = DEFAULT_ORIGIN }) {
  const question = bet.settlement?.question || questionOf(bet);
  const url = `${origin}/t/${code}`;
  if (calledOff) return formatCalledOffText({ question, url, clean: toGsm7 });
  // The snapshot fills an empty stake with "Bragging rights"; only a stake
  // the creator set goes in the text.
  const stake = String(bet.stake || '').trim() ? (bet.settlement?.stake || bet.stake) : '';
  return formatSettledText({
    question, side: winningSide(bet), stake, url, clean: toGsm7,
  });
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
    // Its vote docs are read in it too, so a changed pick retries as well.
    const bet = await readBetWithVotes(db, code, tx);
    if (!bet) throw failure('not-found');
    if (isFinished(bet)) throw failure('closed');
    // The side comes from the voter's recorded pick (array or vote doc),
    // never from the request.
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

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// The bet with its votes merged (array and vote docs), or null.
function readBet(db, code) {
  return readBetWithVotes(db, code);
}

// Runs in flight on this server instance, by bet code and settledAt.
const inFlight = new Set();

// The single hook the settle and call-off paths call. Safe to run any number
// of times. A settle can be undone for a short while (src/phone/undoSettle.js),
// so this waits that out and re-reads the bet: an undone bet is open again and
// texts nobody. If it was settled again meanwhile, that settle's own call
// sends. Call-offs have no undo and send right away. While one run for a
// settle is waiting or sending, another for the same settle returns at once;
// across instances the claim-by-delete below still sends each number once.
export async function deliverResultTexts({
  db, code, sendSms, origin = DEFAULT_ORIGIN, now = Date.now, wait = sleep,
}) {
  const bet = await readBet(db, code);
  const key = `${code}:${settledAtMs(bet) ?? ''}`;
  if (inFlight.has(key)) return { sent: 0, skipped: 'in-flight' };
  inFlight.add(key);
  try {
    return await deliver({ db, code, sendSms, origin, now, wait, bet });
  } finally {
    inFlight.delete(key);
  }
}

async function deliver({
  db, code, sendSms, origin, now, wait, bet: firstRead,
}) {
  let bet = firstRead;
  const hold = undoHoldMs(bet, now());
  if (hold > 0) {
    await wait(hold);
    bet = await readBet(db, code);
    if (undoHoldMs(bet, now()) > 0) return { sent: 0, skipped: 'undo-window' };
  }
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
    const body = buildResultSms({ bet, calledOff, code, origin });
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
