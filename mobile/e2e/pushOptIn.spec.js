import { test, expect } from '@playwright/test';

// The push opt-in is native only (docs/PUSH.md). This harness is the web
// build, so none of its copy may ever show, whatever NEXT_PUBLIC_PUSH_ENABLED
// is set to: not on Home, Create, My bets (the phone gate) or a vote link.
const PUSH_STRINGS = [
  'Want to know when friends pick?',
  'We’ll ping you when picks come in and when it’s settled.',
  'Turn on notifications',
  'Not now',
  'Notifications',
  'Picks, results, and closing reminders.',
  'Turned off in your phone’s settings.',
  'Open Settings',
];

test.beforeEach(async ({ page }) => {
  // Preview checks must never send texts or change prod data.
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com)/, (route) => route.abort());
});

async function expectNoPushCopy(page) {
  for (const text of PUSH_STRINGS) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.locator('.push-sheet, .push-row')).toHaveCount(0);
}

test('the web never shows the push sheet or the Notifications row', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeVisible();
  await expectNoPushCopy(page);

  await page.goto('/new');
  await expect(page.getByRole('button', { name: /Money Line/ })).toBeVisible();
  await expectNoPushCopy(page);

  await page.goto('/bets');
  await expect(page.getByRole('textbox', { name: 'Phone +1', exact: true })).toBeVisible();
  await expectNoPushCopy(page);

  await page.goto('/b/abc123');
  await page.waitForLoadState('networkidle');
  await expectNoPushCopy(page);

  expect(errors).toEqual([]);
});
