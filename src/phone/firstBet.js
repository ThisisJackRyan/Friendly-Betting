import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../Config/firebase-config';

// True when the creator's only bet is `code`, the one just sent: the push
// opt-in asks after the first bet only (pushOptIn.js). Two docs are enough to
// know. Create calls it only with push on in the native app; a rejection or a
// slow answer means no sheet (checkFirstBet fails closed). Its own module, not
// api.js, so nothing that stubs api.js has to know about it.
export async function isOnlyBetBy(uid, code) {
  const snap = await getDocs(query(collection(db, 'bets'), where('createdByID', '==', uid), limit(2)));
  return snap.docs.length === 1 && snap.docs[0].id === code;
}
