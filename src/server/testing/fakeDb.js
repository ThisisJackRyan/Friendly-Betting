// Test-only in-memory Firestore stand-in for the Admin SDK surface the server
// modules use. Transactions are optimistic like Firestore: if a doc read in
// the transaction (or a query's result set) changed before commit, the callback runs again.
// Queries work on a collection or a collection group, in or out of a transaction.
// `failCollectionGroup: { votes: err }` makes every collectionGroup('votes')
// query reject with err (a missing index).
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

export function fakeDb(initial = {}, { failCollectionGroup = {} } = {}) {
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
  // A shallow update with dotted field paths ('settlement.winners'), like Firestore's update().
  const applyUpdate = (path, fields) => {
    if (!store.has(path)) throw Object.assign(new Error('no doc to update'), { code: 'not-found' });
    const next = clone(store.get(path).data);
    Object.entries(clone(fields)).forEach(([key, value]) => {
      const parts = key.split('.');
      let target = next;
      parts.slice(0, -1).forEach((part) => {
        if (!target[part] || typeof target[part] !== 'object') target[part] = {};
        target = target[part];
      });
      target[parts.at(-1)] = value;
    });
    put(path, next);
  };
  // source: { path, candidates() } for a collection, or { candidates(), fail }
  // for a collection group. where(...).orderBy(...).limit(n): one field per
  // orderBy. A doc without the orderBy field is left out, like Firestore.
  function query(source, filters = [], order = null, max = null) {
    const keys = () => {
      if (source.fail) throw source.fail;
      let found = source.candidates().filter((key) => filters.every((filter) => matches(store.get(key)?.data, filter)));
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
      path: source.path,
      query: true,
      keys,
      where: (field, op, value) => {
        if (!TESTS[op]) throw new Error(`fakeDb: unsupported op ${op}`);
        return query(source, [...filters, [field, op, value]], order, max);
      },
      orderBy: (field, dir = 'asc') => query(source, filters, [field, dir], max),
      limit: (n) => query(source, filters, order, n),
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
      update: async (fields) => {
        writes.push(['update', path]);
        applyUpdate(path, fields);
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
    collection: (path) => query({ path, candidates: () => children(path) }),
    // Every collection named `id`, at any depth.
    collectionGroup: (id) => query({
      candidates: () => Array.from(store.keys()).filter((key) => {
        const parts = key.split('/');
        return parts.length % 2 === 0 && parts.at(-2) === id;
      }),
      fail: failCollectionGroup[id] || null,
    }),
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
          update: (target, fields) => ops.push(['update', target.path, clone(fields)]),
          delete: (target) => ops.push(['delete', target.path]),
        };
        const result = await run(tx);
        if (reads.some(([current, seen]) => current() !== seen)) continue;
        ops.forEach(([op, path, data]) => {
          writes.push([op, path]);
          if (op === 'set') put(path, data);
          else if (op === 'update') applyUpdate(path, data);
          else store.delete(path);
        });
        return result;
      }
      throw new Error('contention');
    },
  };
}
