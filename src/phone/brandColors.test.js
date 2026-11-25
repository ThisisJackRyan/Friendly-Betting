import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_ACCENT } from './brandColors';

test('BRAND_ACCENT matches --accent in the :root block of phone.css', () => {
  const css = readFileSync(join(__dirname, 'phone.css'), 'utf8');
  const root = css.match(/:root\s*{([^}]*)}/);
  expect(root).not.toBeNull();
  const accent = root[1].match(/--accent:\s*([^;]+);/);
  expect(accent).not.toBeNull();
  expect(accent[1].trim().toLowerCase()).toBe(BRAND_ACCENT.toLowerCase());
});
