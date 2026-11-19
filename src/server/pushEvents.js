import { isCalledOff, isFinished, isSettled } from '../phone/betStatus';
import { optionVoteLabel, questionOf } from '../phone/model';
import { PUSH_NOTIFICATION_COPY } from '../phone/pushCopy';
import { PUSH_CHANNEL_ID, pushEnabled } from '../phone/pushConfig';
import { settlementOf } from '../phone/settlement';
import { settledAtMs, undoHoldMs } from '../phone/undoSettle';
import { cleanName, voteAtMs } from '../phone/votes';
import { readBetWithVotes } from './betVotes';
import { sendToUser } from './pushSend';

// Settle and call-off push (docs/PUSH.md). The app fire-and-forgets
// POST /api/bets/{code}/push after its settle or call-off commit; this
// re-reads the bet and picks the recipients itself. Never logs a token, uid,
// phone, name or device id: at most the bet code and an error code.

export function sendsPath(eventId) {
  return `privatePushSends/${eventId}`;
}

// An event older than this sends nobody. The app posts right after its own
// commit (a settle runs for about 35s more), so this only stops a stray POST
// from pinging voters about a bet settled long ago (for example one settled
// before the flag was on).
export const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

// Same options for every bet push: one notification per bet on the lock
// screen (Android tag and collapse key, iOS apns-collapse-id and thread-id),
// in the app's Android channel.
export function betPushOptions(code) {
  return { collapseKey: code, threadId: code, channelId: PUSH_CHANNEL_ID, code };
}

// settle:{code}:{settledAtMs} or calloff:{code}:{settledAtMs}. A new settle
// after an undo has a new settledAt, so it is a new event. Null when the bet
// has no event to send.
export function pushEventId(bet, code) {
  const at = settledAtMs(bet);
  if (at == null) return null;
  if (isCalledOff(bet)) return `calloff:${code}:${at}`;
  if (isSettled(bet)) return `settle:${code}:${at}`;
  return null;
}

// Whoever closed the bet. Settle and call-off are creator-only today; a
// settledBy uid, if a later build writes one, is skipped too.
function actorsOf(bet) {
  return new Set([bet?.createdByID, bet?.settledBy, bet?.settledByID].filter((uid) => typeof uid === 'string' && uid));
}

function unique(uids) {
  return Array.from(new Set(uids.filter((uid) => typeof uid === 'string' && uid)));
}

// Uids with a recorded pick in the live votes (the legacy array plus the
// vote docs, merged by readBetWithVotes).
function liveVoters(bet) {
  return new Set((bet.votes || []).filter((vote) => vote?.optionId).map((vote) => vote.voterId));
}

// Settle: the settlement snapshot's recipients, kept only if they also have a
// pick in the live votes. The creator's client writes the snapshot and the
// rules do not check what is inside it, so a uid that never voted is dropped.
// A later live voter missing from the snapshot is not added. Call-off:
// everyone with a pick in the live votes (there is no snapshot). Never the
// creator or the settler.
export function pushRecipients(bet) {
  const actors = actorsOf(bet);
  const voters = liveVoters(bet || {});
  let uids = [];
  if (isCalledOff(bet)) {
    uids = Array.from(voters);
  } else if (isSettled(bet)) {
    uids = (settlementOf(bet)?.recipients || []).map((item) => item?.voterId).filter((uid) => voters.has(uid));
  }
  return unique(uids).filter((uid) => !actors.has(uid));
}

function winningSide(bet) {
  const result = settlementOf(bet);
  if (result?.optionLabel) return result.optionLabel;
  const option = (bet.options || []).find((item) => item.id === bet.winnerId);
  return option ? optionVoteLabel(bet, option) : '';
}

// Title is the bet question; data opens /b/{code}. No phone, token or name.
export function buildBetPush(bet, code) {
  const calledOff = isCalledOff(bet);
  const title = String(bet.settlement?.question || questionOf(bet));
  const body = calledOff ? PUSH_NOTIFICATION_COPY.calledOff : PUSH_NOTIFICATION_COPY.settled(winningSide(bet));
  return {
    title,
    body,
    data: { code: String(code), route: `/b/${code}`, event: calledOff ? 'calloff' : 'settle' },
  };
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Runs in flight on this server instance, by bet code and settledAt, so a
// double POST does not start two 35s waits. Across instances the claim below
// still sends each event once.
const inFlight = new Set();

// A sendToUser skip that means it never got to try, so a retry may work.
const RETRYABLE_SKIPS = new Set(['admin-not-configured', 'read-failed']);

// The one hook the push route calls. Safe to run any number of times.
// A settle can be undone for 35s (src/phone/undoSettle.js): this waits that
// out and re-reads the bet, so an undone settle notifies nobody and leaves
// no claim. A call-off has no undo and sends right away.
export async function deliverBetPush({ db, code, now = Date.now, wait = sleep, send = sendToUser }) {
  if (!pushEnabled()) return { sent: 0, failed: 0, skipped: 'disabled' };
  const bet = await readBetWithVotes(db, code);
  if (!bet) return { sent: 0, failed: 0, skipped: 'not-found' };
  const key = `${code}:${settledAtMs(bet) ?? ''}`;
  if (inFlight.has(key)) return { sent: 0, failed: 0, skipped: 'in-flight' };
  inFlight.add(key);
  try {
    return await deliver({ db, code, now, wait, send, bet });
  } finally {
    inFlight.delete(key);
  }
}

async function deliver({ db, code, now, wait, send, bet: firstRead }) {
  let bet = firstRead;
  const hold = undoHoldMs(bet, now());
  if (hold > 0) {
    await wait(hold);
    bet = await readBetWithVotes(db, code);
    if (undoHoldMs(bet, now()) > 0) return { sent: 0, failed: 0, skipped: 'undo-window' };
  }
  if (!bet || (!isSettled(bet) && !isCalledOff(bet))) return { sent: 0, failed: 0, skipped: 'not-settled' };
  const eventId = pushEventId(bet, code);
  if (!eventId) return { sent: 0, failed: 0, skipped: 'no-event' };
  // A settle with no winning side would read " won. See who called it."
  if (!isCalledOff(bet) && !winningSide(bet)) return { sent: 0, failed: 0, skipped: 'no-winner' };
  if (now() - settledAtMs(bet) > MAX_EVENT_AGE_MS) return { sent: 0, failed: 0, skipped: 'stale' };
  const recipients = pushRecipients(bet);
  if (!recipients.length) return { sent: 0, failed: 0, skipped: 'no-recipients' };

  // Claim the event before any send; another run that already claimed it wins.
  const claimRef = db.doc(sendsPath(eventId));
  const claimed = await db.runTransaction(async (tx) => {
    const current = await tx.get(claimRef);
    if (current.exists) return false;
    tx.set(claimRef, { code, at: now() });
    return true;
  });
  if (!claimed) return { sent: 0, failed: 0, skipped: 'already-sent' };

  const payload = buildBetPush(bet, code);
  const options = betPushOptions(code);
  let sent = 0;
  let failed = 0;
  let retryable = false;
  for (const uid of recipients) {
    try {
      const result = await send(uid, payload, options);
      sent += result?.sent || 0;
      failed += result?.failed || 0;
      if (RETRYABLE_SKIPS.has(result?.skipped)) retryable = true;
    } catch (err) {
      failed += 1;
      console.warn(`push failed for bet ${code}: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    }
  }
  // Nothing reached a device and something failed: drop the claim so a retry
  // can send. Recipients with no registered device are not a failure.
  if (!sent && (failed || retryable)) {
    try {
      await claimRef.delete();
    } catch (err) {
      console.warn(`push claim not released for bet ${code}: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    }
  }
  return { sent, failed };
}

// First-pick push (docs/PUSH.md). After a friend's first pick commits, their
// client fire-and-forgets POST /api/bets/{code}/push/pick; the route checks
// the ID token and calls deliverPickPush with the verified uid. The server
// reads the vote itself: the side and the name come from the live votes,
// never from the request. Only the bet's creator is sent to.

// pick:{code}:{voterUid}. One per voter per bet, ever, so only the first pick
// sends; a side change or a re-pick finds the claim and sends nothing.
export function pickEventId(code, voterUid) {
  return `pick:${code}:${voterUid}`;
}

// Per-bet cap on pick pushes. Anyone with a bet link can sign in as many
// fresh anonymous uids as Firebase allows and pick once with each, and every
// one of those first picks would buzz the creator. At most
// PICK_PUSH_BET_LIMIT pick pushes per bet in any rolling
// PICK_PUSH_BET_WINDOW_MS. The send times live in
// privatePushSends/pickcount:{code} as { code, sends: [ms, ...] }, counted in
// the same transaction as the voter's claim.
export const PICK_PUSH_BET_LIMIT = 10;
export const PICK_PUSH_BET_WINDOW_MS = 10 * 60 * 1000;

export function pickCountId(code) {
  return `pickcount:${code}`;
}

// The send times still inside the window, oldest first.
function recentSends(data, nowMs) {
  const sends = Array.isArray(data?.sends) ? data.sends : [];
  return sends.filter((ms) => typeof ms === 'number' && nowMs - ms < PICK_PUSH_BET_WINDOW_MS);
}

// Notification bodies are one line: no control characters (newlines, tabs,
// C1 controls), runs of whitespace collapsed. Only for the push body; the
// stored vote name is untouched.
function singleLineName(name) {
  return cleanName(name).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
}

// The actor's recorded pick (a truthy optionId) in the merged live votes, or
// null. readBetWithVotes keeps one entry per voter; the last one wins anyway.
export function recordedPick(bet, uid) {
  if (!uid) return null;
  const mine = (bet?.votes || []).filter((vote) => vote?.voterId === uid && vote.optionId);
  return mine.length ? mine[mine.length - 1] : null;
}

function pickedSide(bet, vote) {
  const option = (bet?.options || []).find((item) => item?.id === vote?.optionId);
  return option ? String(optionVoteLabel(bet, option) || '') : '';
}

// Title is the bet question; data opens /b/{code}. The voter's cleaned name,
// on one line, goes in the body only (that is the copy); never a phone, token
// or uid, and never the name in data.
export function buildPickPush(bet, code, vote) {
  const side = pickedSide(bet, vote);
  const name = singleLineName(vote?.name);
  return {
    title: String(questionOf(bet)),
    body: name ? PUSH_NOTIFICATION_COPY.firstPickNamed(name, side) : PUSH_NOTIFICATION_COPY.firstPickUnnamed(side),
    data: { code: String(code), route: `/b/${code}`, event: 'pick' },
  };
}

// The one hook the pick route calls. Safe to run any number of times: the
// claim makes each voter's first pick send at most once. The route already
// read the bet (with its votes) to check the actor; pass it as `bet` to skip
// a second read.
export async function deliverPickPush({ db, code, actorUid, bet: given, now = Date.now, send = sendToUser }) {
  if (!pushEnabled()) return { sent: 0, failed: 0, skipped: 'disabled' };
  const bet = given || await readBetWithVotes(db, code);
  if (!bet) return { sent: 0, failed: 0, skipped: 'not-found' };
  const creator = bet.createdByID;
  if (typeof creator !== 'string' || !creator) return { sent: 0, failed: 0, skipped: 'no-recipients' };
  // Never about the creator's own pick.
  if (actorUid === creator) return { sent: 0, failed: 0, skipped: 'self' };
  const vote = recordedPick(bet, actorUid);
  if (!vote) return { sent: 0, failed: 0, skipped: 'no-pick' };
  // A pick with no side label would read "A friend picked ."
  if (!pickedSide(bet, vote)) return { sent: 0, failed: 0, skipped: 'no-side' };
  // A pick recorded long ago is not news. A vote with no time yet (just
  // written) still sends; the claim is the main guard.
  const at = voteAtMs(vote.at);
  if (at != null && now() - at > MAX_EVENT_AGE_MS) return { sent: 0, failed: 0, skipped: 'stale' };

  // Votes are only written while the bet is open, so this is a POST that
  // landed after a settle or call-off. No claim: a settle can be undone, and a
  // later POST on the reopened bet may still send.
  if (isFinished(bet)) return { sent: 0, failed: 0, skipped: 'not-open' };

  // Claim before the send; another run that already claimed it wins. The
  // per-bet count is checked and bumped in the same transaction. Past the cap
  // the claim is still written (that voter never sends, even after the window
  // resets) but the count is not.
  const claimRef = db.doc(sendsPath(pickEventId(code, actorUid)));
  const countRef = db.doc(sendsPath(pickCountId(code)));
  const stamp = now();
  const outcome = await db.runTransaction(async (tx) => {
    const current = await tx.get(claimRef);
    const count = await tx.get(countRef);
    if (current.exists) return 'already-sent';
    const recent = recentSends(count.exists ? count.data() : null, stamp);
    tx.set(claimRef, { code, at: stamp });
    if (recent.length >= PICK_PUSH_BET_LIMIT) return 'bet-capped';
    tx.set(countRef, { code, sends: [...recent, stamp] });
    return 'claimed';
  });
  if (outcome !== 'claimed') return { sent: 0, failed: 0, skipped: outcome };

  let sent = 0;
  let failed = 0;
  let retryable = false;
  try {
    const result = await send(creator, buildPickPush(bet, code, vote), betPushOptions(code));
    sent = result?.sent || 0;
    failed = result?.failed || 0;
    retryable = RETRYABLE_SKIPS.has(result?.skipped);
  } catch (err) {
    failed = 1;
    console.warn(`pick push failed for bet ${code}: ${typeof err?.code === 'string' ? err.code : 'error'}`);
  }
  // Nothing reached a device and something failed: drop the claim and this
  // send's slot in the count so a retry can send. A creator with no
  // registered device (push off in the app) is not a failure, so the claim
  // and the slot stay.
  if (!sent && (failed || retryable)) {
    try {
      await db.runTransaction(async (tx) => {
        const count = await tx.get(countRef);
        tx.delete(claimRef);
        if (!count.exists) return;
        const sends = Array.isArray(count.data()?.sends) ? count.data().sends : [];
        const index = sends.indexOf(stamp);
        if (index < 0) return;
        tx.set(countRef, { code, sends: [...sends.slice(0, index), ...sends.slice(index + 1)] });
      });
    } catch (err) {
      console.warn(`pick push claim not released for bet ${code}: ${typeof err?.code === 'string' ? err.code : 'error'}`);
    }
  }
  return { sent, failed };
}
