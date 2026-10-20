import { isProEntitlement } from '../phone/entitlement';

// Pro members never see ads. The ad service asks synchronously, so this reads
// a cache that the entitlement listener (src/phone/useEntitlement.js) keeps
// current. Expiry is checked on every call.
let entitlement = null;

export function setProEntitlement(next) {
  entitlement = next || null;
}

export function isPro() {
  return isProEntitlement(entitlement, Date.now());
}
