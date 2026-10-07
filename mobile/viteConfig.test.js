/** @jest-environment node */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Jest can't import the ESM config directly, so evaluate it in a real Node process.
function defined(env) {
  const config = path.join(__dirname, 'vite.config.mjs');
  const script = `
    const { default: config } = await import(${JSON.stringify(`file://${config}`)});
    const resolved = typeof config === 'function' ? await config({ mode: 'production', command: 'build' }) : config;
    process.stdout.write(JSON.stringify(resolved.define));
  `;
  const base = { ...process.env };
  delete base.NEXT_PUBLIC_RESULT_TEXTS;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...base, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

test('the mobile build turns the result texts flag on from the build env', () => {
  expect(defined({ NEXT_PUBLIC_RESULT_TEXTS: '1' })).toEqual({ 'process.env.NEXT_PUBLIC_RESULT_TEXTS': '"1"' });
});

test('the mobile build leaves the flag off by default and exposes nothing else', () => {
  expect(defined({})).toEqual({ 'process.env.NEXT_PUBLIC_RESULT_TEXTS': '""' });
});
