import { makeCode, newBetDoc } from '../phone/newBet';
import { EARLY_ACCESS_TYPES, proEarlyTypesEnabled } from '../phone/proConfig';
import { hasProEntitlement } from './proEntitlement';

// The server create for bets/{code}, used only with the paywall on
// (POST /api/bets, docs/PRO.md "Server-side Pro checks"). The Admin SDK
// bypasses firestore.rules, so this checks everything the create rule does,
// and then Pro for the Pro features only:
//
//   - a rematch (fields carry rematchOf) needs Pro: 'pro-required'
//   - an early-access type needs NEXT_PUBLIC_PRO_EARLY_TYPES=1 and Pro:
//     'pro-required'
//
// Creating bets is not capped: without Pro a creator makes as many bets as
// they like (with ads).
//
// Pro is isProEntitlement on entitlements/{uid}: expiry and legacy founder
// plans count the same way the app counts them.

function failure(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// Keys only a settle, call off or undo may write (the create rule refuses them).
const RESULT_KEYS = ['settledAt', 'settlement', 'calledOff'];
const ATTEMPTS = 5;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// The creator's fields, checked like the create rule: in the caller's own
// name (a different createdByID is refused; a missing one is filled in), no
// result keys. status, winnerId, votes, code and createdAt come from
// newBetDoc, whatever the fields say.
export function creatorFields(fields, uid) {
  if (!isPlainObject(fields)) throw failure('invalid-bet');
  if ('createdByID' in fields && fields.createdByID !== uid) throw failure('forbidden');
  const clean = { ...fields, createdByID: uid };
  RESULT_KEYS.forEach((key) => delete clean[key]);
  return clean;
}

export function isRematch(fields) {
  return fields.rematchOf !== undefined && fields.rematchOf !== null;
}

export function isEarlyType(type, earlyTypes = EARLY_ACCESS_TYPES) {
  return typeof type === 'string' && earlyTypes.some((early) => early?.id === type);
}

// Creates the bet in one transaction with the Pro check and the code
// collision check. Returns { code }.
export async function createBetForCreator({
  db,
  uid,
  phoneNumber,
  fields,
  now = Date.now(),
  earlyTypes = EARLY_ACCESS_TYPES,
  earlyTypesOn = proEarlyTypesEnabled(),
  newCode = makeCode,
}) {
  if (!uid || !phoneNumber) throw failure('forbidden');
  const clean = creatorFields(fields, uid);
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const code = newCode();
    const betRef = db.doc(`bets/${code}`);
    const created = await db.runTransaction(async (tx) => {
      const pro = await hasProEntitlement({ db, uid, tx, now });
      if (isRematch(clean) && !pro) throw failure('pro-required');
      if (isEarlyType(clean.type, earlyTypes) && !(earlyTypesOn && pro)) throw failure('pro-required');
      const snap = await tx.get(betRef);
      if (snap.exists) return null;
      tx.set(betRef, newBetDoc(clean, code, now));
      return code;
    });
    if (created) return { code: created };
  }
  throw failure('collision');
}
