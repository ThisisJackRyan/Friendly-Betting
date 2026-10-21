/** @jest-environment node */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const FLAGS = [
  'NEXT_PUBLIC_RESULT_TEXTS',
  'NEXT_PUBLIC_ADS_ENABLED',
  'NEXT_PUBLIC_PRO_PAYWALL',
  'NEXT_PUBLIC_PRO_EARLY_TYPES',
  'NEXT_PUBLIC_PRO_MOCK_PURCHASE',
];

// Jest can't import the ESM config directly, so evaluate it in a real Node process.
function defined(env) {
  const config = path.join(__dirname, 'vite.config.mjs');
  const script = `
    const { default: config } = await import(${JSON.stringify(`file://${config}`)});
    const resolved = typeof config === 'function' ? await config({ mode: 'production', command: 'build' }) : config;
    process.stdout.write(JSON.stringify(resolved.define));
  `;
  const base = { ...process.env };
  FLAGS.forEach((flag) => delete base[flag]);
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...base, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

// Every flag off, with `on` set to "1". NEXT_PUBLIC_VERCEL_ENV is always empty in the app.
function expected(...on) {
  return {
    ...Object.fromEntries(FLAGS.map((flag) => [`process.env.${flag}`, on.includes(flag) ? '"1"' : '""'])),
    'process.env.NEXT_PUBLIC_VERCEL_ENV': '""',
  };
}

// Off in the native app until store IAP is wired (docs/PRO.md).
const NATIVE_OFF = ['NEXT_PUBLIC_PRO_PAYWALL'];

test.each(FLAGS.filter((flag) => !NATIVE_OFF.includes(flag)))('the mobile build turns %s on from the build env', (flag) => {
  expect(defined({ [flag]: '1' })).toEqual(expected(flag));
});

test('the mobile build keeps the Pro paywall off even when the build env sets it', () => {
  expect(defined({ NEXT_PUBLIC_PRO_PAYWALL: '1' })).toEqual(expected());
  expect(defined(Object.fromEntries(FLAGS.map((flag) => [flag, '1'])))).toEqual(
    expected(...FLAGS.filter((flag) => !NATIVE_OFF.includes(flag))),
  );
});

test('the mobile build leaves every flag off by default and exposes nothing else', () => {
  expect(defined({})).toEqual(expected());
});

test('the mobile build keeps NEXT_PUBLIC_VERCEL_ENV empty even from a preview build env', () => {
  expect(defined({ NEXT_PUBLIC_VERCEL_ENV: 'preview' })).toEqual(expected());
});
