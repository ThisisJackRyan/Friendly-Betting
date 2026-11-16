import { isFinished } from '../phone/betStatus';
import { deleteBet } from './deleteBet';
import { numbersPath } from './resultTexts';
import { OPEN_SUBSCRIPTION_STATUSES } from './deleteAccountStripe';

// In-app account deletion (docs/DEVELOPMENT.md, "Delete account"). The route
// verifies the caller with authorizeAccountDeletion, then deleteAccount runs
// every step in order. Every step is idempotent: a missing doc, a bet that is
// already gone and an Auth user that is already deleted are all success, so a
// retry after a failure is safe.
//
// Never log or return a uid, phone number, token, name or Stripe id from here.

// A token whose sign-in is older than this must sign in again first.
export const RECENT_LOGIN_SECONDS = 10 * 60;

export function tombstonePath(uid) {
  return `accountDeletions/${uid}`;
}

function failure(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

const deny = (status, error) => ({ ok: false, status, error });

// Verifies the Bearer token (revoked tokens fail) and requires a
// phone-verified member who signed in within RECENT_LOGIN_SECONDS.
// { ok: true, uid, phoneNumber } or { ok: false, status, error }.
// A missing Admin config throws (code 'admin-not-configured').
export async function authorizeAccountDeletion({ token, auth, now = Date.now() }) {
  if (!token) return deny(401, 'unauthorized');
  let claims;
  try {
    claims = await auth.verifyIdToken(token, true);
  } catch (err) {
    if (err?.code === 'admin-not-configured') throw err;
    return deny(401, 'unauthorized');
  }
  const provider = claims?.firebase?.sign_in_provider;
  if (!claims?.uid || provider === 'anonymous' || !claims.phone_number) return deny(403, 'forbidden');
  const authTime = Number(claims.auth_time);
  if (!Number.isFinite(authTime) || now / 1000 - authTime > RECENT_LOGIN_SECONDS) {
    return deny(401, 'requires-recent-login');
  }
  return { ok: true, uid: claims.uid, phoneNumber: claims.phone_number };
}

// For the Stripe webhook (#89): true once the account is being or has been
// deleted, so a late event never recreates entitlements/{uid}.
export async function isAccountDeleted(db, uid) {
  if (!uid) return false;
  const snap = await db.doc(tombstonePath(uid)).get();
  return snap.exists;
}

const isMissing = (err) => err?.code === 'auth/user-not-found';

async function writeTombstone(db, uid, at) {
  const ref = db.doc(tombstonePath(uid));
  const snap = await ref.get();
  if (!snap.exists) await ref.set({ at });
}

// Cancels every open subscription the member has, now, then deletes the
// customer. Throws 'stripe-failed' on any Stripe error, before anything else
// is deleted.
async function cancelStripe(stripe, entitlement) {
  const customerId = entitlement?.stripeCustomerId || '';
  const subscriptionId = entitlement?.stripeSubscriptionId || '';
  if (!stripe || (!customerId && !subscriptionId)) return;
  const canceled = new Set();
  if (subscriptionId) {
    const sub = await stripe.retrieveSubscription(subscriptionId);
    if (sub && OPEN_SUBSCRIPTION_STATUSES.has(sub.status)) await stripe.cancelSubscription(subscriptionId);
    canceled.add(subscriptionId);
  }
  if (!customerId) return;
  // The entitlement may be stale: cancel any other open one too.
  const subs = await stripe.listSubscriptions(customerId);
  for (const sub of subs) {
    if (!sub?.id || canceled.has(sub.id) || !OPEN_SUBSCRIPTION_STATUSES.has(sub.status)) continue;
    await stripe.cancelSubscription(sub.id);
    canceled.add(sub.id);
  }
  await stripe.deleteCustomer(customerId);
}

async function deleteOwnedBets(db, uid, phoneNumber) {
  const owned = await db.collection('bets').where('createdByID', '==', uid).get();
  const codes = owned.docs.map((item) => item.id);
  for (const code of codes) {
    await deleteBet({ db, code, uid, phoneNumber });
    // Per-bet push receipts with a known id. No name or number in them.
    await db.doc(`privatePushSends/closing:${code}`).delete();
    await db.doc(`privatePushSends/pickcount:${code}`).delete();
  }
  return codes;
}

// bets/{code}/votes/{uid}: the code, or '' for any other "votes" collection.
function betCodeOf(path) {
  const parts = path.split('/');
  return parts.length === 4 && parts[0] === 'bets' && parts[2] === 'votes' ? parts[1] : '';
}

// One bet the member voted on but did not create. Open: the pick goes.
// Finished (settled or called off): the pick stays, the name is cleared.
async function scrubVote(db, code, uid) {
  const betRef = db.doc(`bets/${code}`);
  const voteRef = db.doc(`bets/${code}/votes/${uid}`);
  await db.runTransaction(async (tx) => {
    const betSnap = await tx.get(betRef);
    const voteSnap = await tx.get(voteRef);
    if (!betSnap.exists) {
      if (voteSnap.exists) tx.delete(voteRef);
      return;
    }
    const bet = betSnap.data();
    // Created by this member after the owned-bets pass: deleteBet's job.
    if (bet.createdByID === uid) return;
    const legacy = Array.isArray(bet.votes) ? bet.votes : [];
    const mine = (vote) => vote?.voterId === uid;
    const updates = {};
    if (isFinished(bet)) {
      if (voteSnap.exists && voteSnap.data()?.name !== '') tx.update(voteRef, { name: '' });
      if (legacy.some((vote) => mine(vote) && vote.name !== '')) {
        updates.votes = legacy.map((vote) => (mine(vote) ? { ...vote, name: '' } : vote));
      }
      const winners = bet.settlement?.winners;
      if (Array.isArray(winners) && winners.some((winner) => mine(winner) && winner.name !== '')) {
        updates['settlement.winners'] = winners.map((winner) => (mine(winner) ? { ...winner, name: '' } : winner));
      }
    } else {
      if (voteSnap.exists) tx.delete(voteRef);
      if (legacy.some(mine)) updates.votes = legacy.filter((vote) => !mine(vote));
    }
    if (Object.keys(updates).length) tx.update(betRef, updates);
  });
}

async function scrubVotes(db, uid, ownedCodes) {
  const owned = new Set(ownedCodes);
  const listed = await db.collectionGroup('votes').where('voterId', '==', uid).get();
  const codes = Array.from(new Set(listed.docs.map((item) => betCodeOf(item.ref.path)).filter(Boolean)));
  for (const code of codes) {
    if (owned.has(code)) continue;
    await scrubVote(db, code, uid);
  }
  return codes.filter((code) => !owned.has(code));
}

// The member's phone number docs on these bets, finished or not.
async function deleteNumbers(db, uid, codes) {
  for (const code of codes) {
    const listed = await db.collection(numbersPath(code)).where('voterId', '==', uid).get();
    for (const item of listed.docs) await item.ref.delete();
  }
}

async function deletePush(db, uid, codes) {
  const devices = await db.collection(`privatePushTokens/${uid}/devices`).get();
  const owners = await db.collection('privatePushDevices').where('uid', '==', uid).get();
  const deviceIds = new Set([...devices.docs.map((item) => item.id), ...owners.docs.map((item) => item.id)]);
  for (const deviceId of deviceIds) {
    // Only an owner doc that still names this member; the device may have
    // moved to someone else since.
    const owner = await db.doc(`privatePushDevices/${deviceId}`).get();
    if (owner.exists && owner.data()?.uid === uid) await owner.ref.delete();
  }
  for (const item of devices.docs) await item.ref.delete();
  await db.doc(`privatePushTokens/${uid}`).delete();
  for (const code of codes) await db.doc(`privatePushSends/pick:${code}:${uid}`).delete();
}

// deleteUser first: if it fails nothing has been revoked, so the member's
// current ID token still passes verifyIdToken(token, true) and a retry
// works without signing in again. Deleting the user already invalidates its
// refresh tokens, so the revoke afterwards is belt and braces and any error
// from it (not-found included) is ignored.
async function deleteAuthUser(auth, uid) {
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  try {
    await auth.revokeRefreshTokens(uid);
  } catch {
    // Best effort; see above.
  }
}

// Order matters (plan section 5): tombstone, Stripe, owned bets, votes on
// other bets, push data, billing docs, and Auth last so a failure anywhere,
// Auth included, can be retried with the same token.
// `stripe` is a createStripeClient() client or null (no Stripe in this deploy).
export async function deleteAccount({ db, auth, uid, phoneNumber, stripe = null, at = Date.now() }) {
  if (!uid || !phoneNumber) throw failure('forbidden');

  await writeTombstone(db, uid, at);

  const entitlementRef = db.doc(`entitlements/${uid}`);
  const entitlement = (await entitlementRef.get()).data() || null;
  await cancelStripe(stripe, entitlement);

  const ownedCodes = await deleteOwnedBets(db, uid, phoneNumber);
  const votedCodes = await scrubVotes(db, uid, ownedCodes);
  await deleteNumbers(db, uid, votedCodes);
  await deletePush(db, uid, [...ownedCodes, ...votedCodes]);

  await db.doc(`stripeNoticeDismissals/${uid}`).delete();
  const customerId = entitlement?.stripeCustomerId;
  if (customerId) {
    const mapping = await db.doc(`stripeCustomers/${customerId}`).get();
    // Only a mapping that points back at this member.
    if (mapping.exists && (!mapping.data()?.uid || mapping.data().uid === uid)) await mapping.ref.delete();
  }
  await entitlementRef.delete();

  await deleteAuthUser(auth, uid);
  return { deleted: true };
}
