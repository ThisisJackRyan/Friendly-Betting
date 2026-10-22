import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Preview checks must never send texts or change prod data.
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com)/, (route) => route.abort());
});

// The words on each rendered line of a one-text-node paragraph.
const wordsPerLine = (element) => {
  const text = element.firstChild;
  const lines = new Map();
  let from = 0;
  for (const word of text.textContent.trim().split(/\s+/)) {
    const start = text.textContent.indexOf(word, from);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + word.length);
    const top = Math.round(range.getClientRects()[0].top);
    lines.set(top, [...(lines.get(top) || []), word]);
    from = start + word.length;
  }
  return [...lines.values()].map((line) => line.join(' '));
};

for (const width of [393, 360]) {
  test(`the phone step intro wraps into balanced lines at ${width} wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/new');
    await page.getByRole('button', { name: /Money Line/ }).click();
    await page.getByLabel(/Question/).fill('Who takes the win?');
    await page.getByLabel('Option A').fill('Bears');
    await page.getByLabel('Option B').fill('Packers');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.create-pane.is-leaving')).toHaveCount(0);
    const intro = page.locator('.page-intro .intro-copy', { hasText: 'Verify your number' });
    await expect(intro).toHaveCSS('text-wrap', 'balance');
    const lines = await intro.evaluate(wordsPerLine);
    expect(lines).toHaveLength(2);
    expect(lines.at(-1).split(' ').length).toBeGreaterThan(1);
  });
}
