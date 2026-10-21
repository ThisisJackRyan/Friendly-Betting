/** @jest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Pro is the only plan: no Founder copy may ship. Legacy entitlement docs
// with plan 'founder' are still read (entitlement.js), always in lower case,
// so any 'Founder' in shipped code is copy.
const ROOT = join(__dirname, '..', '..');
const DIRS = ['src', 'app', 'mobile'];
const SKIP = new Set(['node_modules', 'e2e', 'ios', 'android', 'dist']);
const REMOVED = ['Founder', 'Get Founder', 'spots left', 'Founder spots are gone.', 'one-time payment'];

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sources(path);
    if (!/\.(jsx?|mjs|css|html)$/.test(entry.name) || /\.test\.jsx?$/.test(entry.name)) return [];
    return [path];
  });
}

const files = DIRS.flatMap((dir) => sources(join(ROOT, dir)));

test('scans the shipped sources', () => {
  expect(files.map((file) => relative(ROOT, file))).toEqual(
    expect.arrayContaining(['src/phone/ProSheet.jsx', 'src/phone/proConfig.js', 'src/phone/ProBadge.jsx']),
  );
});

test.each(REMOVED)('no %j anywhere in shipped code', (text) => {
  const hits = files.filter((file) => readFileSync(file, 'utf8').includes(text)).map((file) => relative(ROOT, file));
  expect(hits).toEqual([]);
});
