import { numbersPath } from './resultTexts';

function failure(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// Deletes bets/{code} and every saved result-text number for it. Only the
// phone-verified creator (uid == createdByID) may delete; a bet with no
// createdByID can't be deleted by anyone. Votes are embedded in the bet doc,
// so they go with it. Legacy detail docs (MoneyLineBets/OverUnderBets/PropBets)
// hold no votes or numbers and are left alone.
//
// One transaction: the numbers and the bet go together or not at all, so a
// failure can never leave numbers behind a deleted bet. saveVoterNumber reads
// the bet in its own transaction, so a number saved concurrently either lands
// in our read (and is deleted) or retries and fails with 'not-found'.
// A bet that's already gone is a success with nothing to do.
export async function deleteBet({ db, code, uid, phoneNumber }) {
  if (!uid || !phoneNumber) throw failure('forbidden');
  const betRef = db.doc(`bets/${code}`);
  const numbers = db.collection(numbersPath(code));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(betRef);
    if (!snap.exists) return { deleted: true };
    const bet = snap.data();
    if (!bet.createdByID || bet.createdByID !== uid) throw failure('forbidden');
    const listed = await tx.get(numbers);
    listed.docs.forEach((item) => tx.delete(item.ref));
    tx.delete(db.doc(`privateResultTexts/${code}`));
    tx.delete(betRef);
    return { deleted: true };
  });
}
