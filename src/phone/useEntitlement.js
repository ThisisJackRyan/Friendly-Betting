import { useEffect, useSyncExternalStore } from 'react';
import { useIdentity } from './identity';
import { subscribeEntitlement } from './entitlementApi';
import { badgeFor, isProEntitlement } from './entitlement';
import { setProEntitlement } from '../ads/pro';

// One shared listener on entitlements/{uid} for the signed-in user, however
// many components ask. EntitlementSync mounts it at the app root, so the ad
// service's isPro() is right on every screen. Clients can only read their
// own entitlement, so nothing here knows anyone else's plan.

const SIGNED_OUT = { uid: '', entitlement: null, loading: false };
const STARTING = { uid: '', entitlement: null, loading: true };

let state = STARTING;
let current = null; // { uid, users, stop }
const listeners = new Set();

function publish(next) {
  state = next;
  setProEntitlement(next.entitlement);
  listeners.forEach((listener) => listener());
}

function acquire(uid) {
  if (current && current.uid !== uid) {
    current.stop?.();
    current = null;
  }
  if (!current) {
    const mine = { uid, users: 0, stop: null };
    current = mine;
    // Same user again (a remount): keep what we knew until the snapshot.
    if (state.uid !== uid) publish({ uid, entitlement: null, loading: true });
    mine.stop = subscribeEntitlement(uid, (entitlement, err) => {
      if (current !== mine) return;
      // A failed read keeps the last known plan rather than dropping it.
      if (err) publish({ ...state, uid, loading: false });
      else publish({ uid, entitlement: entitlement || null, loading: false });
    });
  }
  const mine = current;
  mine.users += 1;
  return () => {
    mine.users -= 1;
    if (mine.users > 0 || current !== mine) return;
    mine.stop?.();
    current = null;
  };
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => state;
const serverSnapshot = () => STARTING;

// Reads the shared state without starting a listener.
export function useEntitlementState() {
  const { uid, entitlement, loading } = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { uid, entitlement, isPro: isProEntitlement(entitlement, Date.now()), loading };
}

// The badge for `viewerUid`'s own name, only when the loaded entitlement is theirs.
export function useProBadge(viewerUid) {
  const { uid, entitlement } = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!viewerUid || uid !== viewerUid) return null;
  return badgeFor(entitlement, Date.now());
}

// Listens to the signed-in user's entitlement and returns
// { entitlement, isPro, loading }. Device-only (local) users have none.
export function useEntitlement() {
  const user = useIdentity();
  const uid = user && !user.isLocal ? user.uid : '';
  const known = Boolean(user);
  useEffect(() => {
    if (uid) return acquire(uid);
    if (known && state.uid) publish(SIGNED_OUT);
    return undefined;
  }, [uid, known]);
  const { entitlement, isPro, loading } = useEntitlementState();
  return { entitlement, isPro, loading };
}

// Tests only.
export function __resetEntitlementForTests() {
  current?.stop?.();
  current = null;
  state = STARTING;
  setProEntitlement(null);
  listeners.forEach((listener) => listener());
}
