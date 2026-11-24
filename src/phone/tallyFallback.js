// A one-time note from Create's tally handoff: the walk back never landed, so
// the tally replaced the last step entry and the spent `#step-N` entries are
// still behind it. Back from the tally then lands on one of them, and Create,
// mounting there with this note for its pathname, goes Home instead of opening
// a fresh Create. A handoff that lands normally clears it, so it never reaches
// an unrelated refresh.
const KEY = 'friendly.tallyFallback';

function store() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch (err) {
    return null;
  }
}

export function markTallyFallback(pathname) {
  try {
    store()?.setItem(KEY, pathname);
  } catch (err) {
    // No storage: back from the tally opens a fresh Create, as before.
  }
}

export function clearTallyFallback() {
  try {
    store()?.removeItem(KEY);
  } catch (err) {
    // Nothing to clear.
  }
}

// Clears the note whatever it holds; true only for the pathname it names.
export function takeTallyFallback(pathname) {
  try {
    const storage = store();
    const noted = storage?.getItem(KEY);
    if (noted == null) return false;
    storage.removeItem(KEY);
    return noted === pathname;
  } catch (err) {
    return false;
  }
}
