import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../Config/firebase-config';
import { getCollectionName } from '../Config/base';
import { settleBlock } from './creator';

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
    await updateDoc(doc(db, 'bets', existingCode), fields);
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

export async function hydrateBet(bet) {
  if (!bet) return null;
  if (bet.schemaVersion === 2 && Array.isArray(bet.options)) return bet;
  if (!bet.betID || !bet.type) {
    return { ...bet, options: bet.options || [], votes: bet.votes || [] };
  }
  const collectionName = getCollectionName(bet.type);
  if (!collectionName) {
    return { ...bet, options: bet.options || [], votes: bet.votes || [] };
  }
  const snap = await getDoc(doc(db, collectionName, bet.betID));
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
}

export async function settleBet(code, winnerId) {
  const user = auth?.currentUser || null;
  const ref = doc(db, 'bets', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This bet is gone.');
    const data = snap.data();
    const block = settleBlock(user, data);
    if (block) throw new Error(block);
    tx.update(ref, {
      status: 'closed',
      winnerId: winnerId || null,
      settledAt: Date.now(),
    });
  });
}
