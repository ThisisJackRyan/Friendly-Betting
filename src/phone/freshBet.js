// A one-time note from Create to the live tally: this tab just made the bet
// with this code, so the tally may open the share sheet on arrival. The tally
// takes it on its first mount, so a reload, back, or forward never sees it.
// A sibling note says that send was the creator's first bet (only written when
// push opt-in could follow, see pushOptIn.js).
const KEY = 'friendly.freshBet';
const FIRST_KEY = 'friendly.freshBetFirst';

function store() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch (err) {
    return null;
  }
}

export function markFreshBet(code, { first = false } = {}) {
  try {
    const storage = store();
    storage?.setItem(KEY, code);
    if (first) storage?.setItem(FIRST_KEY, code);
    else storage?.removeItem(FIRST_KEY);
  } catch (err) {
    // No storage, no nudge: the invite button is still there.
  }
}

function take(key, code) {
  try {
    const storage = store();
    const fresh = storage?.getItem(key);
    if (fresh == null) return false;
    storage.removeItem(key);
    return Boolean(code) && fresh === code;
  } catch (err) {
    return false;
  }
}

// Clears the note whatever it holds; true only for the bet it names.
export function takeFreshBet(code) {
  return take(KEY, code);
}

// The same for the first-bet note. Fails closed: no note, no first bet.
export function takeFirstBet(code) {
  return take(FIRST_KEY, code);
}
