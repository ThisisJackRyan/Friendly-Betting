// Test-only in-memory Firestore stand-in for the Admin SDK surface the server
// modules use. Transactions are optimistic like Firestore: if a doc read in
// the transaction (or a query's result set) changed before commit, the callback runs again.
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

export function fakeDb(initial = {}) {
  const store = new Map();
  const writes = [];
  let clock = 0;
  const version = (path) => store.get(path)?.version ?? 0;
  const put = (path, data) => store.set(path, { data: clone(data), version: (clock += 1) });
  Object.entries(initial).forEach(([path, data]) => put(path, data));

  const snap = (path) => {
    const entry = store.get(path);
    return { id: path.split('/').pop(), ref: ref(path), exists: Boolean(entry), data: () => clone(entry?.data) };
  };
  const children = (path) =>
    Array.from(store.keys()).filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'));
  // Field filters like Firestore's: a missing or null field never matches an
  // inequality, and a range only matches values of the same type.
  const TESTS = {
    '==': (actual, value) => actual === value,
    '<': (actual, value) => actual < value,
    '<=': (actual, value) => actual <= value,
    '>': (actual, value) => actual > value,
    '>=': (actual, value) => actual >= value,
  };
  const matches = (data, [field, op, value]) => {
    const actual = data?.[field];
    if (op === '==') return actual !== undefined && actual === value;
    return actual !== undefined && actual !== null && typeof actual === typeof value && TESTS[op](actual, value);
  };
  // collection(path).where(...).orderBy(...).limit(n): one field per orderBy.
  // A doc without the orderBy field is left out, like Firestore.
  function query(path, filters = [], order = null, max = null) {
    const keys = () => {
      let found = children(path).filter((key) => filters.every((filter) => matches(store.get(key)?.data, filter)));
      if (order) {
        const [field, dir] = order;
        const sign = dir === 'desc' ? -1 : 1;
        found = found
          .filter((key) => store.get(key)?.data?.[field] != null)
          .sort((a, b) => {
            const x = store.get(a).data[field];
            const y = store.get(b).data[field];
            return x === y ? 0 : (x < y ? -sign : sign);
          });
      }
      return max == null ? found : found.slice(0, max);
    };
    return {
      path,
      query: true,
      keys,
      where: (field, op, value) => {
        if (!TESTS[op]) throw new Error(`fakeDb: unsupported op ${op}`);
        return query(path, [...filters, [field, op, value]], order, max);
      },
      orderBy: (field, dir = 'asc') => query(path, filters, [field, dir], max),
      limit: (n) => query(path, filters, order, n),
      get: async () => ({ docs: keys().map(snap) }),
    };
  }
  // A query's "version" is its membership plus each member's version.
  const queryVersion = (target) => target.keys().map((key) => `${key}@${version(key)}`).join(',');
  function ref(path) {
    return {
      path,
      get: async () => snap(path),
      set: async (data) => {
        writes.push(['set', path]);
        put(path, data);
      },
      delete: async () => {
        writes.push(['delete', path]);
        store.delete(path);
      },
    };
  }

  return {
    store,
    writes,
    data: (path) => clone(store.get(path)?.data),
    paths: (prefix) => Array.from(store.keys()).filter((key) => key.startsWith(prefix)),
    doc: ref,
    collection: (path) => query(path),
    runTransaction: async (run) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const reads = [];
        const ops = [];
        const tx = {
          get: async (target) => {
            const current = target.query ? () => queryVersion(target) : () => version(target.path);
            reads.push([current, current()]);
            await Promise.resolve();
            return target.query ? { docs: target.keys().map(snap) } : snap(target.path);
          },
          set: (target, data) => ops.push(['set', target.path, clone(data)]),
          delete: (target) => ops.push(['delete', target.path]),
        };
        const result = await run(tx);
        if (reads.some(([current, seen]) => current() !== seen)) continue;
        ops.forEach(([op, path, data]) => {
          writes.push([op, path]);
          if (op === 'set') put(path, data);
          else store.delete(path);
        });
        return result;
      }
      throw new Error('contention');
    },
  };
}
