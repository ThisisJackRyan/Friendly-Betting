import { isProEntitlement } from '../phone/entitlement';

// Pro members never see ads. The ad service asks synchronously, so this reads
// a cache that the entitlement listener (src/phone/useEntitlement.js) keeps
// current. Expiry is checked on every call.
let entitlement = null;
let markKnown;
let known;

function resetKnown() {
  known = new Promise((resolve) => { markKnown = resolve; });
}
resetKnown();

export function setProEntitlement(next) {
  entitlement = next || null;
}

export function isPro() {
  return isProEntitlement(entitlement, Date.now());
}

// The listener calls this once the signed-in user's entitlement has loaded,
// or once auth says nobody is signed in, so isPro() is no longer a guess.
export function noteProKnown() {
  markKnown();
}

// Resolves once isPro() is known, or after waitMs, whichever comes first.
// Never rejects.
export function whenProKnown(waitMs) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, waitMs); });
  return Promise.race([known, timeout]).finally(() => clearTimeout(timer));
}

// Tests only.
export function __resetProForTests() {
  entitlement = null;
  resetKnown();
}
