import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from '../Config/firebase-config';
import { getCollectionName } from '../Config/base';
import { isCalledOff, isFinished, isSettled, votingOpen } from './betStatus';
import { isBetCreator, isCreator } from './creatorSession';
import { buildSettlement } from './settlement';
import { rememberBet } from './notificationStore';
import { apiUrl, requestResultTexts } from './resultTexts';
import { timestampMs, UNDO_RULES_WINDOW_MS } from './undoSettle';
import { cleanName, mergeVotes, voteFromDoc, withVotes } from './votes';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function makeCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export async function createBet(fields) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode();
    const ref = doc(db, 'bets', code);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) {
          const collision = new Error('collision');
          collision.code = 'collision';
          throw collision;
        }
        tx.set(ref, {
          ...fields,
          schemaVersion: 2,
          code,
          status: 'open',
          winnerId: null,
          votes: [],
          createdAt: Date.now(),
        });
      });
      return code;
    } catch (err) {
      lastError = err;
      if (err?.code === 'collision' || err?.message === 'collision') continue;
      throw err;
    }
  }
  throw lastError || new Error('Could not create a bet. Try again.');
}

export async function saveBet(existingCode, fields) {
  if (existingCode) {
    const ref = doc(db, 'bets', existingCode);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('This bet is gone.');
      const bet = snap.data();
      if (!isCreator(auth?.currentUser) || auth.currentUser.uid !== bet.createdByID) {
        throw new Error('Only the creator can edit this bet.');
      }
      if (isFinished(bet)) throw new Error('This one’s settled. Start a fresh bet.');
      tx.update(ref, fields);
    });
    return existingCode;
  }
  return createBet(fields);
}

// Each voter's pick is its own doc at bets/{code}/votes/{uid}; older picks
// are still in the bet's `votes` array (docs/VOTE-SECURITY.md). Readers get
// both merged into `votes` (withVotes). Rules from before per-voter docs deny
// any read or write of the subcollection, so a denied read means no docs and
// a denied write falls back to the array.
const PERMISSION_DENIED = ['permission-denied', 'firestore/permission-denied'];

function isDenied(err) {
  return PERMISSION_DENIED.includes(err?.code);
}

// Set once this session learns the live rules have no per-voter docs, so
// every later vote-doc read and write is skipped (no more console 403s) and
// picks go straight to the array. It covers every bet, as the rules do. Two
// signals only, both impossible under rules with per-voter docs: a denied
// read of vote docs (those rules let anyone read them), or a denied vote-doc
// write whose array fallback then succeeded (those rules refuse the array
// write for anything they refuse as a doc). A denied write whose fallback
// also fails (the bet closed meanwhile) teaches nothing. A session open
// across the rules deploy keeps the array until a reload; the array still
// takes first picks then (docs/VOTE-SECURITY.md).
let voteDocsDenied = false;

function noteVoteDocsDenied() {
  voteDocsDenied = true;
}

// Tests only.
export function __resetVoteRulesForTests() {
  voteDocsDenied = false;
}

function votesRef(code) {
  return collection(db, 'bets', code, 'votes');
}

function voteRef(code, voterId) {
  return doc(db, 'bets', code, 'votes', voterId);
}

// A pick saving offline has no server time yet; the estimate keeps its place.
function voteDocsOf(snap) {
  return snap.docs
    .map((item) => voteFromDoc(item.id, item.data({ serverTimestamps: 'estimate' })))
    .filter(Boolean);
}

// The bet's vote docs, read once. Denied (rules without per-voter docs): none.
export async function readVoteDocs(code) {
  if (voteDocsDenied) return [];
  try {
    return voteDocsOf(await getDocs(votesRef(code)));
  } catch (err) {
    if (!isDenied(err)) throw err;
    noteVoteDocsDenied();
    return [];
  }
}

// Calls `onDocs` with the bet's vote docs on every change. A failed listen
// (denied by rules without per-voter docs, or dropped) counts as no new docs.
// Once denied this session, no listener is opened at all.
function subscribeVoteDocs(code, onDocs) {
  if (voteDocsDenied) {
    onDocs(null);
    return () => {};
  }
  return onSnapshot(
    votesRef(code),
    (snap) => onDocs(voteDocsOf(snap)),
    (err) => {
      if (isDenied(err)) noteVoteDocsDenied();
      onDocs(null);
    },
  );
}

export function subscribeMyBets(uid, onChange) {
  const betsQuery = query(collection(db, 'bets'), where('createdByID', '==', uid));
  // One vote listener per bet in the list, opened and closed with the list.
  const voteDocs = new Map();
  const voteStops = new Map();
  let rows = null;
  let stopped = false;
  const emit = () => {
    if (rows && !stopped) onChange(rows.map((bet) => withVotes(bet, voteDocs.get(bet.id))));
  };
  const stopBets = onSnapshot(
    betsQuery,
    (snap) => {
      rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const ids = new Set(rows.map((bet) => bet.id));
      voteStops.forEach((stop, id) => {
        if (ids.has(id)) return;
        stop();
        voteStops.delete(id);
        voteDocs.delete(id);
      });
      rows.forEach((bet) => {
        if (voteStops.has(bet.id)) return;
        voteStops.set(bet.id, subscribeVoteDocs(bet.id, (docs) => {
          if (!docs) return;
          voteDocs.set(bet.id, docs);
          emit();
        }));
      });
      emit();
    },
    (err) => onChange(null, err),
  );
  return () => {
    stopped = true;
    stopBets();
    voteStops.forEach((stop) => stop());
    voteStops.clear();
  };
}

// The bet doc and its vote docs, merged. Nothing is reported until both have
// answered once (a failed vote listen counts as an answer), so the tally
// never flashes the array alone.
export function subscribeBet(code, onChange) {
  let bet;
  let meta;
  let docs = null;
  let failed = false;
  const emit = () => {
    if (failed || bet === undefined || docs === null) return;
    if (!bet) onChange(null, undefined, meta);
    else onChange(withVotes(bet, docs), undefined, meta);
  };
  const stopBet = onSnapshot(
    doc(db, 'bets', code),
    (snap) => {
      // fromCache tells a server-confirmed delete from an offline cache miss.
      meta = { fromCache: Boolean(snap.metadata?.fromCache) };
      bet = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      emit();
    },
    (err) => {
      failed = true;
      onChange(undefined, err);
    },
  );
  const stopVotes = subscribeVoteDocs(code, (next) => {
    docs = next || docs || [];
    emit();
  });
  return () => {
    stopBet();
    stopVotes();
  };
}

export async function hydrateBet(bet, readDoc = getDoc) {
  if (!bet) return null;
  if (bet.schemaVersion === 2 && Array.isArray(bet.options)) return bet;
  if (!bet.betID || !bet.type) {
    return { ...bet, options: bet.options || [], votes: bet.votes || [] };
  }
  const collectionName = getCollectionName(bet.type);
  if (!collectionName) {
    return { ...bet, options: bet.options || [], votes: bet.votes || [] };
  }
  const snap = await readDoc(doc(db, collectionName, bet.betID));
  const extra = snap.exists() ? snap.data() : {};
  let options = [];
  if (bet.type === 'Money Line') {
    options = [
      { id: 'a', label: extra.contestant1 || 'Option A' },
      { id: 'b', label: extra.contestant2 || 'Option B' },
    ];
  } else if (bet.type === 'Over Under') {
    options = [
      { id: 'over', label: 'Over' },
      { id: 'under', label: 'Under' },
    ];
  } else if (bet.type === 'Prop') {
    options = (extra.options || []).filter(Boolean).map((label, index) => ({
      id: `p${index}`,
      label: String(label),
    }));
  }
  return {
    ...extra,
    ...bet,
    question: bet.question || bet.bet || extra.bet || '',
    options,
    votes: Array.isArray(bet.votes) ? bet.votes : [],
    line: extra.line ?? bet.line ?? null,
  };
}

// The checks every pick runs inside its transaction, before writing.
async function readOpenBet(tx, code) {
  const snap = await tx.get(doc(db, 'bets', code));
  if (!snap.exists()) throw new Error('This bet is gone.');
  const data = snap.data();
  // The rules refuse closed and called-off bets too; this says so first.
  if (!votingOpen(data)) throw new Error('This bet is closed.');
  return data;
}

// readOpenBet, plus a signed-in voter and one of the bet's sides.
async function readPickBet(tx, code, pick) {
  const data = await readOpenBet(tx, code);
  if (!pick.voterId) throw new Error('Still connecting. Try your pick again.');
  const full = await hydrateBet(data, (legacyRef) => tx.get(legacyRef));
  if (!full.options.some((option) => option.id === pick.optionId)) {
    throw new Error('Pick one of this bet’s sides.');
  }
  return data;
}

// The voter's pick goes in their own doc, bets/{code}/votes/{uid}, which only
// they can write. A new side moves them to the end of the list, as before.
// Rules from before per-voter docs deny that write, so a denied one is made
// the old way, in the bet's `votes` array; once the session knows that
// (voteDocsDenied), picks skip the doc and go there directly.
export async function castVote(code, vote) {
  const pick = { voterId: vote.voterId, name: cleanName(vote.name), optionId: vote.optionId };
  if (voteDocsDenied) {
    await castLegacyVote(code, pick);
    rememberBet(pick.voterId, code);
    return;
  }
  try {
    await runTransaction(db, async (tx) => {
      await readPickBet(tx, code, pick);
      tx.set(voteRef(code, pick.voterId), { ...pick, at: serverTimestamp() });
    });
  } catch (err) {
    if (!isDenied(err)) throw err;
    await castLegacyVote(code, pick);
    noteVoteDocsDenied();
  }
  rememberBet(pick.voterId, code);
}

// castVote's write for rules without per-voter docs: the voter's entry in the
// bet's `votes` array, replaced and moved to the end.
async function castLegacyVote(code, pick) {
  const ref = doc(db, 'bets', code);
  await runTransaction(db, async (tx) => {
    const data = await readPickBet(tx, code, pick);
    const votes = Array.isArray(data.votes) ? data.votes : [];
    const next = votes.filter((item) => item.voterId !== pick.voterId);
    next.push({ ...pick, at: Date.now() });
    tx.update(ref, { votes: next });
  });
}

// Changes only the name on a voter's own pick: same side, same place in the
// list, same time. A pick still only in the bet's `votes` array, or newer
// there than the voter's doc (mergeVotes keeps the later one), is copied to
// the voter's own doc with the new name (taking the time of the copy). Rules
// from before per-voter docs deny that, so a denied rename is made in the
// array, the old way, and so is every rename once the session knows the rules
// deny vote docs (voteDocsDenied). Its promise can answer late; VoteScreen
// also takes the live snapshot as the confirmation.
export async function renameVote(code, voterId, name) {
  const trimmed = cleanName(name);
  if (voteDocsDenied) {
    await renameLegacyVote(code, voterId, trimmed);
    return;
  }
  try {
    await runTransaction(db, async (tx) => {
      const data = await readOpenBet(tx, code);
      if (!voterId) throw new Error('Your pick isn’t in yet.');
      const ref = voteRef(code, voterId);
      // A denied read of the voter's own doc is a sure sign of the old rules.
      const own = await tx.get(ref).catch((err) => {
        if (isDenied(err)) noteVoteDocsDenied();
        throw err;
      });
      const doc = own.exists() ? voteFromDoc(voterId, own.data()) : null;
      const mine = mergeVotes(data.votes, doc ? [doc] : []).filter((item) => item.voterId === voterId).pop();
      if (!mine) throw new Error('Your pick isn’t in yet.');
      if (mine === doc) {
        tx.update(ref, { name: trimmed });
        return;
      }
      tx.set(ref, { voterId, name: trimmed, optionId: mine.optionId, at: serverTimestamp() });
    });
  } catch (err) {
    if (!isDenied(err)) throw err;
    await renameLegacyVote(code, voterId, trimmed);
    noteVoteDocsDenied();
  }
}

async function renameLegacyVote(code, voterId, trimmed) {
  const ref = doc(db, 'bets', code);
  await runTransaction(db, async (tx) => {
    const data = await readOpenBet(tx, code);
    const votes = Array.isArray(data.votes) ? data.votes : [];
    if (!voterId || !votes.some((item) => item.voterId === voterId)) {
      throw new Error('Your pick isn’t in yet.');
    }
    tx.update(ref, {
      votes: votes.map((item) => (item.voterId === voterId ? { ...item, name: trimmed } : item)),
    });
  });
}

export async function settleBet(code, winnerId) {
  const ref = doc(db, 'bets', code);
  const settled = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This bet is gone.');
    const bet = { ...snap.data(), id: code, code };
    if (!isBetCreator(auth?.currentUser, bet)) {
      throw new Error('Only the creator can settle this bet.');
    }
    if (isCalledOff(bet)) throw new Error('This bet is closed.');
    if (isSettled(bet)) {
      if (bet.winnerId === winnerId) return bet;
      throw new Error('This one’s already settled. The result is locked.');
    }
    // Every pick, array and vote docs. The docs are read in each attempt; a
    // pick doc landing between that read and the commit is not in the
    // snapshot (docs/VOTE-SECURITY.md).
    const full = withVotes(await hydrateBet(bet, (legacyRef) => tx.get(legacyRef)), await readVoteDocs(code));
    const update = {
      status: 'closed',
      winnerId,
      settlement: buildSettlement(full, winnerId),
    };
    // Server time: the rules measure the undo window from it.
    tx.update(ref, { ...update, settledAt: serverTimestamp() });
    // Until the snapshot brings the server time, settledAt reads null.
    return { ...full, ...update, settledAt: null };
  });
  // Fire-and-forget: the server waits out the undo window, re-reads the bet
  // and texts each saved number once.
  requestResultTexts(code);
  return settled;
}

// The creator takes a settle back within the undo window (undoSettle.js):
// the bet is open again with no winner, settledAt or settlement, and the
// rules check the window against the server settledAt. Returns the open bet.
export async function undoSettle(code) {
  const ref = doc(db, 'bets', code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This bet is gone.');
    const bet = { ...snap.data(), id: code, code };
    if (!isBetCreator(auth?.currentUser, bet)) {
      throw new Error('Only the creator can settle this bet.');
    }
    const settledAt = timestampMs(bet.settledAt);
    if (!isSettled(bet) || settledAt == null || Date.now() >= settledAt + UNDO_RULES_WINDOW_MS) {
      throw new Error('Too late to undo.');
    }
    const full = withVotes(await hydrateBet(bet, (legacyRef) => tx.get(legacyRef)), await readVoteDocs(code));
    tx.update(ref, {
      status: 'open',
      winnerId: null,
      settledAt: deleteField(),
      settlement: deleteField(),
      calledOff: deleteField(),
    });
    const { settledAt: _at, settlement: _settlement, calledOff: _off, ...rest } = full;
    return { ...rest, status: 'open', winnerId: null };
  });
}

// The creator calls off an open bet: closed, nobody won, no undo. Called-off
// texts go out right away.
export async function callOffBet(code) {
  const ref = doc(db, 'bets', code);
  const calledOff = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This bet is gone.');
    const bet = { ...snap.data(), id: code, code };
    if (!isBetCreator(auth?.currentUser, bet)) {
      throw new Error('Only the creator can call off this bet.');
    }
    if (isCalledOff(bet)) return bet;
    if (isSettled(bet)) throw new Error('This one’s already settled. The result is locked.');
    if (isFinished(bet)) throw new Error('This bet is closed.');
    const full = withVotes(await hydrateBet(bet, (legacyRef) => tx.get(legacyRef)), await readVoteDocs(code));
    tx.update(ref, { status: 'closed', calledOff: true, settledAt: serverTimestamp() });
    return { ...full, status: 'closed', calledOff: true, settledAt: null };
  });
  requestResultTexts(code);
  return calledOff;
}

// The creator deletes their bet. The server route also deletes the vote docs
// and the voters' saved result-text numbers, which no client can touch.
// Without Admin credentials the route answers 503 and no numbers can have
// been saved through it, so the bet doc and its vote docs are deleted here
// (deleteBetHere). Any other failure throws and nothing is deleted
// client-side.
// Errors from a dropped network (the fetch itself failed, or the browser
// reports offline) carry code 'offline' so the screen can say so.
function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function offlineError(cause) {
  const err = new Error('You are offline.');
  err.code = 'offline';
  err.cause = cause;
  return err;
}

// The bet doc and its vote docs in one transaction (the rules allow only the
// creator, and vote docs only along with the bet). A client transaction can't
// query, so the vote docs are listed inside it, after the bet is read and
// right before the commit, instead of ahead of a separate batch: the gap in
// which a new pick could be left behind shrinks to the commit itself (once
// the bet is gone, the rules refuse new vote docs), and a bet that changed
// meanwhile (an older build's pick in the array) retries with a fresh list.
// A bet that's already gone is done. A transaction only answers once the
// server has the delete, so My bets never drops the bet on this device alone.
async function deleteBetHere(code) {
  const ref = doc(db, 'bets', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const votes = await readVoteDocs(code);
    votes.forEach((vote) => tx.delete(voteRef(code, vote.voterId)));
    tx.delete(ref);
  });
}

export async function deleteBet(code) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in.');
  let token;
  try {
    token = await user.getIdToken();
  } catch (cause) {
    if (cause?.code === 'auth/network-request-failed' || isOffline()) throw offlineError(cause);
    throw cause;
  }
  let res;
  try {
    res = await fetch(apiUrl(`/api/bets/${encodeURIComponent(code)}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (cause) {
    throw offlineError(cause);
  }
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  if (res.status === 503 && body?.error === 'not-configured') {
    try {
      await deleteBetHere(code);
    } catch (cause) {
      if (isOffline()) throw offlineError(cause);
      throw cause;
    }
    return;
  }
  if (isOffline()) throw offlineError();
  const err = new Error('Could not delete this bet.');
  err.code = body?.error || 'delete-failed';
  throw err;
}
