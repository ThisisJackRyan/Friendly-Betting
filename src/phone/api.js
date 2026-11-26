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
import { app, auth, db } from '../Config/firebase-config';
import { getCollectionName } from '../Config/base';
import { isCalledOff, isFinished, isSettled, votingOpen } from './betStatus';
import { isBetCreator, isCreator } from './creatorSession';
import { makeCode, newBetDoc } from './newBet';
import { proPaywallEnabled } from './proConfig';
import { CREATE_ERROR_COPY, isCreateNetworkError } from './createErrors';
import { buildSettlement } from './settlement';
import { rememberBet } from './notificationStore';
import { apiUrl, requestResultTexts } from './resultTexts';
import { requestBetPush, requestPickPush } from './betPush';
import { timestampMs, UNDO_RULES_WINDOW_MS } from './undoSettle.js';
import { cleanName, mergeVotes, voteFromDoc, withVotes } from './votes';

async function createBetHere(fields) {
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
        tx.set(ref, newBetDoc(fields, code));
      });
      return code;
    } catch (err) {
      lastError = err;
      if (err?.code === 'collision' || err?.message === 'collision') continue;
      throw err;
    }
  }
  throw lastError || new Error(CREATE_ERROR_COPY.failed);
}

// With the paywall on, every new bet (Create and Run it back) goes through
// POST /api/bets, which checks Pro for Run it back and early-access types on
// the server (src/server/createBet.js, docs/PRO.md). Creating is not capped. With it off, nothing changes: the
// client writes bets/{code} itself, as firestore.rules allow, and the route
// is never called.
//
// Either way a save that can't reach the network fails fast with the generic
// save line (CREATE_ERROR_COPY.failed) and a network code (createErrors.js,
// CREATE_NETWORK_CODES): at once when the browser reports offline, and after
// CREATE_TIMEOUT_MS when the write hangs. Offline, a Firestore transaction
// otherwise retries for ~35s and then rejects with "Connection failed.".
//
// A save that timed out may still land. Only a retry of the same bet
// (createKey) waits for it, so the same bet is never made twice: if it
// landed, that's the bet. A create with other fields starts at once and never
// waits on a hung save; if the earlier save lands late anyway (a retry with
// different fields, or no retry at all), it is a separate bet in My bets.
// After CREATE_STALL_CAP_MS from the save's start the stalled save is dropped
// (and its POST /api/bets aborted, paywall on), so a hang can't block later
// creates, the same bet's retry included, until the page is reloaded.
export async function createBet(fields) {
  if (isOffline()) throw createNetworkError('offline');
  const key = createKey(fields);
  const prior = stalledCreate;
  if (prior && prior.key === key) {
    const wait = Math.min(CREATE_TIMEOUT_MS, Math.max(0, prior.dropAt - Date.now()));
    const earlier = await settleWithin(prior.promise, wait);
    if (earlier.pending && Date.now() < prior.dropAt) throw createNetworkError('timeout');
    dropStall(prior);
    if (earlier.ok) return earlier.value;
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const startedAt = Date.now();
  const run = proPaywallEnabled() ? createBetOnServer(fields, controller?.signal) : createBetHere(fields);
  const outcome = await settleWithin(run, CREATE_TIMEOUT_MS);
  if (outcome.pending) {
    const entry = { key, promise: run, dropAt: startedAt + CREATE_STALL_CAP_MS, controller, timer: null };
    entry.timer = setTimeout(() => dropStall(entry), Math.max(0, entry.dropAt - Date.now()));
    stalledCreate = entry;
    throw createNetworkError('timeout');
  }
  if (outcome.ok) return outcome.value;
  const err = outcome.error;
  if (isCreateNetworkError(err) || isOffline()) {
    throw createNetworkError(isCreateNetworkError(err) ? err.code : 'offline', err);
  }
  throw err;
}

// How long a new bet's save may take before Create and Run it back give up
// and offer the retry.
export const CREATE_TIMEOUT_MS = 12000;

// How long after its start a save that timed out is still waited on by the
// same bet's retry. At the cap it is dropped: a hung POST /api/bets is
// aborted (an abort before the token comes back means no request is sent),
// and the next create starts fresh. A Firestore transaction can't be aborted,
// so if it lands after the cap it is a separate bet.
export const CREATE_STALL_CAP_MS = 60000;

// The last save that timed out, while it might still land:
// { key, promise, dropAt, controller, timer }.
let stalledCreate = null;

// Stops waiting on a stalled save; aborts its request if it's still out.
function dropStall(entry) {
  if (!entry) return;
  clearTimeout(entry.timer);
  if (stalledCreate === entry) stalledCreate = null;
  if (Date.now() >= entry.dropAt) entry.controller?.abort();
}

export function __resetCreateForTests() {
  if (stalledCreate) clearTimeout(stalledCreate.timer);
  stalledCreate = null;
}

// The same bet, give or take its close time (Run it back's moves with the
// clock). That holds for Create too: a retry with only closesAt changed is
// still the same bet.
function createKey(fields) {
  const { closesAt, ...rest } = fields || {};
  return JSON.stringify(rest);
}

// { ok: true, value } or { ok: false, error } if the promise settles within
// ms, else { pending: true }; the promise is never left unhandled.
function settleWithin(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ pending: true }), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error) => {
        clearTimeout(timer);
        resolve({ ok: false, error });
      },
    );
  });
}

// A create that couldn't reach the network: the generic save line, never
// "You are offline." or the raw cause's message.
function createNetworkError(code, cause) {
  const err = new Error(CREATE_ERROR_COPY.failed);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

// Fails closed: a 503 (no Admin credentials) is an error, never a fallback
// to the client write, which would skip the server's Pro checks. The error's
// code is the route's (pro-required, not-configured, ...); its message is the
// generic save fallback. Create and Run it back pick the line for a coded
// error with createSaveError (createErrors.js).
//
// signal aborts the request when a stalled save is dropped at
// CREATE_STALL_CAP_MS; aborted before the token comes back, nothing is sent.
async function createBetOnServer(fields, signal) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in.');
  let token;
  try {
    token = await user.getIdToken();
  } catch (cause) {
    if (cause?.code === 'auth/network-request-failed' || isOffline()) throw createNetworkError('offline', cause);
    throw cause;
  }
  if (signal?.aborted) throw createNetworkError('timeout');
  let res;
  try {
    res = await fetch(apiUrl('/api/bets'), {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields }),
    });
  } catch (cause) {
    throw createNetworkError('offline', cause);
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok && typeof body?.code === 'string' && body.code) return body.code;
  if (!res.ok && isOffline()) throw createNetworkError('offline');
  const err = new Error(CREATE_ERROR_COPY.failed);
  err.code = (!res.ok && body?.error) || 'create-failed';
  throw err;
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
// picks go straight to the array. Fresh reads (settle, undo, call off,
// delete) still go out, and one that succeeds clears it. It covers every bet, as the rules do. Two
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
// `fresh` always reads, even once denied this session, and a read that
// succeeds clears the flag: settle, undo, call off and delete must not miss
// picks a session open across the rules deploy can't see otherwise.
export async function readVoteDocs(code, { fresh = false } = {}) {
  if (voteDocsDenied && !fresh) return [];
  try {
    const votes = voteDocsOf(await getDocs(votesRef(code)));
    if (fresh) voteDocsDenied = false;
    return votes;
  } catch (err) {
    if (!isDenied(err)) throw err;
    noteVoteDocsDenied();
    return [];
  }
}

// Calls `onDocs(docs, { fromCache, hasPendingWrites })` with the bet's vote
// docs on every change. A failed listen (denied by rules without per-voter
// docs, or dropped) counts as no new docs: onDocs(null). Once denied this session, no
// listener is opened at all. `includeMetadataChanges` also reports a cache to
// server flip with the same docs (subscribeBet needs it to learn the docs are
// confirmed; it skips the repeat itself).
function subscribeVoteDocs(code, onDocs, { includeMetadataChanges = false } = {}) {
  if (voteDocsDenied) {
    onDocs(null);
    return () => {};
  }
  return onSnapshot(
    votesRef(code),
    ...(includeMetadataChanges ? [{ includeMetadataChanges: true }] : []),
    (snap) => onDocs(voteDocsOf(snap), {
      fromCache: Boolean(snap.metadata?.fromCache),
      hasPendingWrites: Boolean(snap.metadata?.hasPendingWrites),
    }),
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

// Deep equality for bet doc data. Firestore values with their own isEqual
// (Timestamp, GeoPoint, DocumentReference) compare with it.
function sameBetData(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (typeof a.isEqual === 'function') return a.constructor === b.constructor && a.isEqual(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameBetData(a[key], b[key]));
}

// Bet codes the server has confirmed exist this session (a server snapshot
// without pending writes, or a fresh read). Lets a later subscribeBet trust a
// fresh read that finds the bet missing: it was deleted, not just created
// offline and not yet on the server.
const serverSeenBets = new Set();

// Tests only.
export function __resetLiveBetsForTests() {
  serverSeenBets.clear();
}

// How long subscribeBet may sit on cache-only snapshots (of the bet or its
// vote docs) before it reads what is still unconfirmed once on its own.
export const STALE_BET_FRESH_READ_MS = 3000;

// The backup read of a bet's vote docs. It uses Firestore Lite, not the full
// SDK: the full SDK's getDocs also goes through Watch
// (@firebase/firestore dist/index.esm.js:1176,
// __PRIVATE_firestoreClientGetDocumentsViaSnapshotListener), so it would stall
// with the listener. Lite's getDocs is one RunQuery RPC
// (dist/lite/common-B8fiiKst.esm.js:6695 calls __PRIVATE_invokeRunQueryRpc,
// :4315), sent as a single fetch POST (FetchConnection, :1470-1483). Lite's
// getFirestore(app) is its own component on the same app and reads the
// app's auth-internal provider (dist/lite/index.browser.esm.js:1119), so the
// read is made as the signed-in user. Imported on demand: only a stalled
// listener loads it. Resolves to the docs, or null if the read failed; a
// denied read means rules without per-voter docs (noteVoteDocsDenied).
async function readVoteDocsLite(code) {
  try {
    const lite = await import('firebase/firestore/lite');
    const snap = await lite.getDocs(lite.collection(lite.getFirestore(app), 'bets', code, 'votes'));
    // Lite snapshots have no pending writes, so `at` is always the server
    // Timestamp, which voteFromDoc reads with toMillis.
    return snap.docs.map((item) => voteFromDoc(item.id, item.data())).filter(Boolean);
  } catch (err) {
    if (isDenied(err)) noteVoteDocsDenied();
    return null;
  }
}

// The bet doc, read once inside a read-only transaction (tx.get is a
// BatchGetDocuments RPC, not Watch). Null if the read failed.
async function readBetOnce(betRef) {
  try {
    // Read only: no writes, so the commit carries nothing.
    return await runTransaction(db, (tx) => tx.get(betRef));
  } catch {
    return null;
  }
}

// The bet doc and its vote docs, merged. Nothing is reported until both have
// answered once (a failed vote listen counts as an answer), so the tally
// never flashes the array alone. meta.fromCache is false once the bet doc is
// confirmed by the server (a server snapshot or the fresh read below).
// meta.hasPendingWrites is true when the snapshot behind the report carries
// this device's own unsent writes.
//
// Once the bet doc is confirmed, later cache snapshots of it are ignored: the
// memory cache can serve an older copy another listener holds, and must not
// overwrite server data. Only the next server snapshot changes it. A cache
// snapshot with pending writes is still reported: it is this device's own
// write (while Watch is stalled, it is the only snapshot that shows it). It
// does not count as a server confirmation. The vote docs work the same way.
// A confirmation with the same data is reported once, with the same object
// as before, so screens can tell the bet is confirmed without re-rendering.
//
// If either listener's first snapshot comes from the cache, then after
// STALE_BET_FRESH_READ_MS whatever the server has still not confirmed is read
// once: the bet doc in a transaction, the vote docs with Firestore Lite
// (readVoteDocsLite; skipped once the rules are known to deny them). On iOS
// the Listen (Watch) stream can stall while plain RPCs still work, so a
// reopened tally would show stale picks. getDocFromServer and getDocs also go
// through Watch in the full JS SDK. The reads are merged and reported once.
// A fresh read that finds the bet missing only counts as gone when the server
// confirmed the bet existed earlier this session (serverSeenBets).
export function subscribeBet(code, onChange) {
  let bet;
  let docs = null;
  // Confirmed by the server: a server snapshot or a fresh read.
  let betServer = false;
  let votesServer = false;
  let failed = false;
  let stopped = false;
  let freshTimer = null;
  let backupArmed = false;
  // The last report: { value, fromCache }.
  let sent = null;
  const clearFreshTimer = () => {
    if (freshTimer) clearTimeout(freshTimer);
    freshTimer = null;
  };
  // Reports the merged bet. With no data change, only a change of fromCache
  // is reported, with the same value as the last report. `pending`: the
  // snapshot behind this report has pending writes.
  const emit = (changed, pending = false) => {
    if (failed || bet === undefined || docs === null) return;
    const meta = pending ? { fromCache: !betServer, hasPendingWrites: true } : { fromCache: !betServer };
    if (!changed && sent) {
      if (sent.fromCache === meta.fromCache) return;
      sent = { value: sent.value, fromCache: meta.fromCache };
      onChange(sent.value, undefined, meta);
      return;
    }
    const value = bet ? withVotes(bet, docs) : null;
    sent = { value, fromCache: meta.fromCache };
    onChange(value, undefined, meta);
  };
  const settled = () => betServer && (votesServer || voteDocsDenied);
  const betRef = doc(db, 'bets', code);
  const readFresh = async () => {
    freshTimer = null;
    const needVotes = !votesServer && !voteDocsDenied;
    if (betServer && !needVotes) return;
    const [snap, freshDocs] = await Promise.all([
      betServer ? null : readBetOnce(betRef),
      needVotes ? readVoteDocsLite(code) : null,
    ]);
    if (stopped || failed) return;
    let changed = false;
    // A missing doc here is not proof the bet is gone (a bet created
    // offline is not on the server yet): leave that to the listener, which
    // reports a server-confirmed miss, unless the server confirmed the bet
    // existed earlier this session. A failed read (null) proves nothing. A
    // server snapshot that came in meanwhile wins over the read.
    if (!betServer && snap?.exists?.()) {
      const next = { id: code, ...snap.data() };
      betServer = true;
      serverSeenBets.add(code);
      if (!bet || !sameBetData(bet, next)) {
        bet = next;
        changed = true;
      }
    } else if (!betServer && snap && serverSeenBets.has(code)) {
      // Gone, the same as a server snapshot of a missing doc.
      betServer = true;
      serverSeenBets.delete(code);
      if (bet !== null) {
        bet = null;
        changed = true;
      }
    }
    if (!votesServer && freshDocs) {
      votesServer = true;
      if (docs === null || !sameBetData(docs, freshDocs)) {
        docs = freshDocs;
        changed = true;
      }
    }
    emit(changed);
  };
  const armBackup = () => {
    if (backupArmed || stopped) return;
    backupArmed = true;
    freshTimer = setTimeout(readFresh, STALE_BET_FRESH_READ_MS);
  };
  const stopBet = onSnapshot(
    betRef,
    // fromCache tells a server-confirmed delete from an offline cache miss.
    // Without includeMetadataChanges, a doc that is still missing when the
    // server answers never fires again (only fromCache flips), so a first-load
    // cache miss would never learn the bet is really gone.
    { includeMetadataChanges: true },
    (snap) => {
      const fromCache = Boolean(snap.metadata?.fromCache);
      const pending = Boolean(snap.metadata?.hasPendingWrites);
      if (fromCache) {
        // Older than (or the same as) what the server already confirmed,
        // unless it carries this device's own pending write.
        if (!betServer) armBackup();
        else if (!pending) return;
      } else {
        betServer = true;
        if (settled()) clearFreshTimer();
      }
      const next = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      if (!fromCache && !pending) {
        if (next) serverSeenBets.add(code);
        else serverSeenBets.delete(code);
      }
      // Metadata-only snapshots (fromCache, hasPendingWrites) on a loaded bet
      // carry the same data: skip them so screens don't re-render. A missing
      // bet is reported again only when fromCache changes.
      const changed = bet === undefined || (next ? !bet || !sameBetData(bet, next) : bet !== null);
      if (changed) bet = next;
      emit(changed, pending);
    },
    (err) => {
      failed = true;
      clearFreshTimer();
      onChange(undefined, err);
    },
  );
  const stopVotes = subscribeVoteDocs(code, (next, info) => {
    if (!next) {
      // Denied or dropped: whatever docs we had (none at first) stand.
      if (docs !== null) return;
      docs = [];
      emit(true);
      return;
    }
    const pending = Boolean(info?.hasPendingWrites);
    if (info?.fromCache) {
      // As for the bet doc: a pending write still counts.
      if (!votesServer) armBackup();
      else if (!pending) return;
    } else {
      votesServer = true;
      if (settled()) clearFreshTimer();
    }
    // Metadata-only snapshots carry the same docs: skip them.
    if (docs !== null && sameBetData(docs, next)) return;
    docs = next;
    emit(true, pending);
  }, { includeMetadataChanges: true });
  return () => {
    stopped = true;
    clearFreshTimer();
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
// (voteDocsDenied), picks skip the doc and go there directly. A friend's first
// pick (no recorded pick before this write, in the array or their doc) asks
// the server to tell the creator, after the commit; a side change does not.
export async function castVote(code, vote) {
  const pick = { voterId: vote.voterId, name: cleanName(vote.name), optionId: vote.optionId };
  if (voteDocsDenied) {
    const first = await castLegacyVote(code, pick);
    rememberBet(pick.voterId, code);
    if (first) notifyAfterFirstPick(code);
    return;
  }
  let first = false;
  try {
    await runTransaction(db, async (tx) => {
      const data = await readPickBet(tx, code, pick);
      // A denied read of the voter's own doc is a sure sign of the old rules;
      // the catch below takes the array path.
      const own = await tx.get(voteRef(code, pick.voterId));
      const prior = own.exists() ? voteFromDoc(pick.voterId, own.data()) : null;
      first = isFirstPick(data, mergeVotes(data.votes, prior ? [prior] : []), pick.voterId);
      tx.set(voteRef(code, pick.voterId), { ...pick, at: serverTimestamp() });
    });
  } catch (err) {
    if (!isDenied(err)) throw err;
    first = await castLegacyVote(code, pick);
    noteVoteDocsDenied();
  }
  rememberBet(pick.voterId, code);
  if (first) notifyAfterFirstPick(code);
}

// True when this write is a friend's first pick: no recorded pick (a truthy
// optionId) for them in the live votes before it, and they are not the
// creator (the server skips the creator too).
function isFirstPick(data, votes, voterId) {
  if (!voterId || data?.createdByID === voterId) return false;
  return !(votes || []).some((item) => item?.voterId === voterId && item.optionId);
}

// castVote's write for rules without per-voter docs: the voter's entry in the
// bet's `votes` array, replaced and moved to the end. Resolves to whether it
// was the voter's first pick (see isFirstPick).
async function castLegacyVote(code, pick) {
  const ref = doc(db, 'bets', code);
  let first = false;
  await runTransaction(db, async (tx) => {
    const data = await readPickBet(tx, code, pick);
    const votes = Array.isArray(data.votes) ? data.votes : [];
    first = isFirstPick(data, votes, pick.voterId);
    const next = votes.filter((item) => item.voterId !== pick.voterId);
    next.push({ ...pick, at: Date.now() });
    tx.update(ref, { votes: next });
  });
  return first;
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

// Result texts and push, each behind its own flag and each fire-and-forget.
// requestBetPush never throws; the catch makes sure a push problem can never
// reach the settle or call-off either way.
function notifyAfterClose(code) {
  requestResultTexts(code);
  try {
    requestBetPush(code);
  } catch (err) {
    // Push is a bonus.
  }
}

// The first-pick push, fire-and-forget. requestPickPush never throws; the
// catch makes sure a push problem can never reach the pick either way.
function notifyAfterFirstPick(code) {
  try {
    requestPickPush(code);
  } catch (err) {
    // Push is a bonus.
  }
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
    // Every pick, array and vote docs. The docs are read fresh in each
    // attempt; a pick doc landing between that read and the commit is not in
    // the snapshot (docs/VOTE-SECURITY.md).
    const full = withVotes(
      await hydrateBet(bet, (legacyRef) => tx.get(legacyRef)),
      await readVoteDocs(code, { fresh: true }),
    );
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
  // and texts each saved number once, and pushes the result to the voters.
  // Neither can fail or slow the settle.
  notifyAfterClose(code);
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
    const full = withVotes(
      await hydrateBet(bet, (legacyRef) => tx.get(legacyRef)),
      await readVoteDocs(code, { fresh: true }),
    );
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
// texts and push go out right away.
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
    const full = withVotes(
      await hydrateBet(bet, (legacyRef) => tx.get(legacyRef)),
      await readVoteDocs(code, { fresh: true }),
    );
    tx.update(ref, { status: 'closed', calledOff: true, settledAt: serverTimestamp() });
    return { ...full, status: 'closed', calledOff: true, settledAt: null };
  });
  notifyAfterClose(code);
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
// query, so the vote docs are listed with a plain read (not a transactional
// one, and fresh even once denied this session) in the transaction callback,
// after the bet is read and right before the commit, instead of ahead of a
// separate batch. That narrows the gap in which a new pick could be left
// behind but doesn't close it: a pick committed between the listing and the
// commit stays (once the bet is gone, the rules refuse new vote docs; the
// server route's Admin transaction has no such gap). A bet that changed
// meanwhile (an older build's pick in the array) retries with a fresh list.
// A bet that's already gone is done. A transaction only answers once the
// server has the delete, so My bets puts the bet back if this throws.
async function deleteBetHere(code) {
  const ref = doc(db, 'bets', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const votes = await readVoteDocs(code, { fresh: true });
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
