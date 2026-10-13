// A one-time note from Create to the live tally: this tab just made the bet
// with this code, so the tally may open the share sheet on arrival. The tally
// takes it on its first mount, so a reload, back, or forward never sees it.
const KEY = 'friendly.freshBet';

function store() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch (err) {
    return null;
  }
}

export function markFreshBet(code) {
  try {
    store()?.setItem(KEY, code);
  } catch (err) {
    // No storage, no nudge: the invite button is still there.
  }
}

// Clears the note whatever it holds; true only for the bet it names.
export function takeFreshBet(code) {
  try {
    const storage = store();
    const fresh = storage?.getItem(KEY);
    if (fresh == null) return false;
    storage.removeItem(KEY);
    return Boolean(code) && fresh === code;
  } catch (err) {
    return false;
  }
}
