const PREFIX = 'fb.results.';
const CHANGED = 'friendly-results-changed';
const memory = new Map();
const visitOnly = new Set();

function read(uid) {
  if (visitOnly.has(uid)) return memory.get(uid);
  try {
    const value = JSON.parse(localStorage.getItem(`${PREFIX}${uid}`) || 'null');
    if (value && Array.isArray(value.codes) && Array.isArray(value.read)
      && value.codes.every((code) => typeof code === 'string' && code && !code.includes('/'))
      && value.read.every((id) => typeof id === 'string')) {
      memory.set(uid, value);
      return value;
    }
  } catch {
    // Keep this visit working when browser storage is unavailable.
  }
  return memory.get(uid) || { codes: [], read: [] };
}

function write(uid, value) {
  memory.set(uid, value);
  try {
    localStorage.setItem(`${PREFIX}${uid}`, JSON.stringify(value));
    visitOnly.delete(uid);
  } catch {
    // Reads may still work when storage is full. Do not replace the newer
    // in-memory state with the stale value that could not be updated.
    visitOnly.add(uid);
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function rememberBet(uid, code) {
  if (!uid || !code) return;
  const value = read(uid);
  if (!value.codes.includes(code)) write(uid, { ...value, codes: [...value.codes, code] });
}

export function markResultRead(uid, id) {
  if (!uid || !id) return;
  const value = read(uid);
  if (!value.read.includes(id)) write(uid, { ...value, read: [...value.read, id] });
}

export function watchResults(uid, onChange) {
  const publish = () => onChange(read(uid));
  const onStorage = (event) => {
    if (event.key === `${PREFIX}${uid}` || event.key === null) {
      memory.delete(uid);
      visitOnly.delete(uid);
      publish();
    }
  };
  publish();
  window.addEventListener(CHANGED, publish);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, publish);
    window.removeEventListener('storage', onStorage);
  };
}
