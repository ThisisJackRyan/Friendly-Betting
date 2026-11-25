/**
 * @jest-environment node
 */
// macOS (case-insensitive APFS) can resolve an extensionless import to the
// wrong file when two files in one folder differ only by letter case once
// the extension is dropped. Vite tries .js before .jsx, so './UndoSettle'
// once picked up undoSettle.js on a Mac and broke `npm run mobile:build`.
// Linux CI never sees it, so this test guards the tree instead.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
// The folders the web (Next) and app (Vite) builds read source from.
const SOURCE_DIRS = ['src', 'app', 'mobile', 'pages'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist-mobile', '.git']);
const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs)$/;

// Known groups that may share a case-folded basename (repo-relative paths,
// any order). Every import of these must name the extension.
const ALLOWED = [
  ['src/phone/UndoSettle.jsx', 'src/phone/undoSettle.js'],
];

const walk = (dir, out) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && CODE_EXT.test(entry.name)) out.push(full);
  }
  return out;
};

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const files = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir), []));

const collisionGroups = () => {
  const groups = new Map();
  for (const file of files) {
    const r = rel(file);
    const key = `${path.posix.dirname(r)}/${path.posix.basename(r).replace(CODE_EXT, '').toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  // Only distinct spellings of one stem (Foo vs foo) are a Mac-only hazard.
  return [...groups.values()].filter(
    (members) => new Set(members.map((r) => path.posix.basename(r).replace(CODE_EXT, ''))).size > 1,
  );
};

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

test('no two source files in one folder differ only by letter case (outside the allowlist)', () => {
  const unexpected = collisionGroups().filter(
    (members) => !ALLOWED.some((pair) => sameSet(pair, members)),
  );
  expect(unexpected).toEqual([]);
});

test('every allowlisted pair still exists (drop stale entries)', () => {
  for (const pair of ALLOWED) {
    for (const file of pair) expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
  }
});

test('allowlisted case-colliding files are only imported with an explicit extension', () => {
  const stems = [...new Set(ALLOWED.flat().map((f) => path.posix.basename(f).replace(CODE_EXT, '').toLowerCase()))];
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Any quoted specifier (import, export from, require, import(), jest.mock)
  // whose last segment is the bare stem, e.g. './UndoSettle' or '../phone/undoSettle'.
  const bare = new RegExp(`['"\`][^'"\`\\s]*/(?:${stems.map(escape).join('|')})['"\`]`, 'gi');
  const offenders = [];
  for (const file of files) {
    if (file === __filename) continue; // its comments quote the bad forms
    const text = fs.readFileSync(file, 'utf8');
    const hits = text.match(bare);
    if (hits) offenders.push(`${rel(file)}: ${hits.join(', ')}`);
  }
  expect(offenders).toEqual([]);
});
