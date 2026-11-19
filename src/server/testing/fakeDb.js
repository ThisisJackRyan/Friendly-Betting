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
  // A query's matching docs: a collection, optionally filtered with
  // where(field, '==', value) and capped with limit(n).
  const matches = (target) => {
    const keys = children(target.path).filter((key) =>
      (target.filters || []).every(([field, value]) => store.get(key)?.data?.[field] === value));
    return target.max === undefined ? keys : keys.slice(0, target.max);
  };
  // A query's "version" is its membership plus each member's version.
  const queryVersion = (target) => matches(target).map((key) => `${key}@${version(key)}`).join(',');
  function query(path, filters = [], max = undefined) {
    const target = { path, query: true, filters, max };
    return {
      ...target,
      where: (field, op, value) => {
        if (op !== '==') throw new Error(`fakeDb supports only ==, not ${op}`);
        return query(path, [...filters, [field, value]], max);
      },
      limit: (n) => query(path, filters, n),
      get: async () => ({ docs: matches(target).map(snap) }),
    };
  }
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
            return target.query ? { docs: matches(target).map(snap) } : snap(target.path);
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
