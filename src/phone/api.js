import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { auth, db } from '../Config/firebase-config';
import { getCollectionName } from '../Config/base';
import { isCreator } from './creatorSession';
import { buildSettlement } from './settlement';
import { rememberBet } from './notificationStore';
import { requestResultTexts } from './resultTexts';

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
      if (bet.status === 'closed') throw new Error('This one’s settled. Start a fresh bet.');
      tx.update(ref, fields);
    });
    return existingCode;
  }
  return createBet(fields);
}

export function subscribeMyBets(uid, onChange) {
  const betsQuery = query(collection(db, 'bets'), where('createdByID', '==', uid));
  return onSnapshot(
    betsQuery,
    (snap) => {
      const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onChange(rows);
    },
    (err) => onChange(null, err),
  );
}

export function subscribeBet(code, onChange) {
  return onSnapshot(
    doc(db, 'bets', code),
    (snap) => {
      if (!snap.exists()) onChange(null);
      else onChange({ id: snap.id, ...snap.data() });
    },
    (err) => onChange(undefined, err),
  );
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

export async function castVote(code, vote) {
  const ref = doc(db, 'bets', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This bet is gone.');
    const data = snap.data();
    if (data.status === 'closed') throw new Error('This bet is closed.');
    if (data.closesAt && data.closesAt <= Date.now()) throw new Error('This bet is closed.');
    if (!vote.voterId) throw new Error('Still connecting. Try your pick again.');
    const full = await hydrateBet(data, (legacyRef) => tx.get(legacyRef));
    if (!full.options.some((option) => option.id === vote.optionId)) {
      throw new Error('Pick one of this bet’s sides.');
    }
    const votes = Array.isArray(data.votes) ? data.votes : [];
    const next = votes.filter((item) => item.voterId !== vote.voterId);
    next.push({
      voterId: vote.voterId,
      name: (vote.name || '').trim(),
      optionId: vote.optionId,
      at: Date.now(),
    });
    tx.update(ref, { votes: next });
  });
  rememberBet(vote.voterId, code);
}

export async function settleBet(code, winnerId) {
  const ref = doc(db, 'bets', code);
  const settled = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This bet is gone.');
    const bet = { ...snap.data(), id: code, code };
    if (!isCreator(auth?.currentUser) || auth.currentUser.uid !== bet.createdByID) {
      throw new Error('Only the creator can settle this bet.');
    }
    if (bet.status === 'closed' && bet.winnerId) {
      if (bet.winnerId === winnerId) return bet;
      throw new Error('This one’s already settled. The result is locked.');
    }
    const full = await hydrateBet(bet, (legacyRef) => tx.get(legacyRef));
    const update = {
      status: 'closed',
      winnerId,
      settledAt: Date.now(),
      settlement: buildSettlement(full, winnerId),
    };
    tx.update(ref, update);
    return { ...full, ...update };
  });
  // Fire-and-forget: the server re-reads the bet and texts each saved number once.
  requestResultTexts(code);
  return settled;
}
