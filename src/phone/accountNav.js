// The Delete account page (pushed from the Account sheet on My bets).
export const DELETE_ACCOUNT_PATH = '/account/delete';

// True while the page's entry was pushed from My bets, so Back can pop it.
// In memory only: a reload or a deep link starts without it.
let fromBets = false;

export function openDeleteAccountPage(router) {
  fromBets = true;
  router.push(DELETE_ACCOUNT_PATH);
}

export function cameFromBets() {
  return fromBets;
}

export function forgetCameFromBets() {
  fromBets = false;
}

// Back and Never mind: pop back to My bets when that is the entry behind,
// otherwise put My bets in this entry's place.
export function backToBets(router, fromMyBets) {
  forgetCameFromBets();
  if (fromMyBets && typeof window !== 'undefined' && window.history.length > 1) router.back();
  else router.replace('/bets');
}

// Tests only.
export function __resetAccountNavForTests() {
  fromBets = false;
}
