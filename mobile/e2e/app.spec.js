import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Preview checks must never send texts or change prod data.
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com)/, (route) => route.abort());
});

test('shared mobile home, create slides, stake and creator gate', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('home.png'), animations: 'disabled', scale: 'css' });
  await page.getByRole('link', { name: 'Start a bet', exact: true }).click();
  await expect(page).toHaveURL(/\/new$/);
  await page.getByRole('button', { name: /Money Line/ }).click();
  await expect(page.getByLabel('Option A')).toBeVisible();
  await page.getByLabel(/Question/).fill('Who takes the win?');
  await page.getByLabel('Option A').fill('Bears');
  await page.getByLabel('Option B').fill('Packers');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
  await expect(page.locator('.create-pane.is-leaving')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('stake.png'), animations: 'disabled', scale: 'css' });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Phone +1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /send code/i })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('direct routes retain all bet types, My bets and missing-link recovery', async ({ page }) => {
  for (const [type, label] of [['money-line', /Option A/], ['over-under', /Line/], ['prop', /Question/]]) {
    await page.goto(`/new/${type}`);
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await page.goto('/bets');
  await expect(page.getByRole('textbox', { name: 'Phone +1', exact: true })).toBeVisible();
  await page.goto('/missing');
  await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
});

async function mockCrew(page) {
  const bet = {
    id: 'crew123', code: 'crew123', schemaVersion: 2, type: 'money-line',
    question: 'Who takes the win?', stake: '$20 pot', status: 'open',
    createdByID: 'jack', createdByName: 'Jack',
    options: [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Packers' }],
    votes: [{ voterId: 'jack', name: 'Jack', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }],
  };
  await page.route('**/src/phone/identity.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const user = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
      export const useIdentity = () => user;
      export const savedName = () => 'Jack';
      export const rememberName = () => {};
      export const creatorName = () => 'Jack';`,
  }));
  await page.route('**/src/phone/api.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `import { buildSettlement } from ${JSON.stringify(new URL('./settlement.js', route.request().url()).href)};
      let bet = ${JSON.stringify(bet)};
      const listeners = new Set();
      export const subscribeBet = (code, cb) => { listeners.add(cb); cb(bet); return () => listeners.delete(cb); };
      export const subscribeMyBets = (uid, cb) => { cb([bet]); return () => {}; };
      export const hydrateBet = async b => b;
      export const createBet = async () => 'crew123';
      export const saveBet = async () => 'crew123';
      export const castVote = async () => {};
      export const settleBet = async (code, winnerId) => {
        bet = { ...bet, status: 'closed', winnerId, settledAt: 123, settlement: buildSettlement(bet, winnerId) };
        listeners.forEach(cb => cb(bet)); return bet;
      };`,
  }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ text }) => { window.sharedResult = text; } });
  });
}

for (const [side, winner, ping] of [['Bears', 'Jack', 'You called it.'], ['Packers', 'Sam', 'This one’s settled.']]) {
  test(`settle in the app: ${winner} wins, with the right participant ping`, async ({ page }, testInfo) => {
    page.on('pageerror', (error) => console.error('App preview error:', error.message));
    await mockCrew(page);
    await page.goto('/t/crew123');
    await page.getByRole('button', { name: 'Close & settle', exact: true }).click();
    await page.getByRole('button', { name: side, exact: true }).click();
    await expect(page.getByRole('region', { name: 'Result preview' })).toContainText(`${winner} won the $20 pot`);
    await page.getByRole('button', { name: 'Settle & notify', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Settled result' })).toContainText(`${winner} won the $20 pot`);
    await expect(page.locator('.result-toast')).toContainText(ping);
    await page.getByRole('button', { name: 'Dismiss result notification' }).click();
    await expect(page.getByRole('heading', { name: `${winner} won the $20 pot`, exact: true })).toBeInViewport({ ratio: 1 });
    const header = await page.locator('.tally-screen > .nav-row').boundingBox();
    await expect.poll(async () => (await page.getByRole('region', { name: 'Settled result' }).boundingBox()).y).toBeGreaterThanOrEqual(header.y + header.height + 8);
    await page.screenshot({ path: testInfo.outputPath('settled.png'), animations: 'disabled', scale: 'css' });
    await page.getByRole('button', { name: 'Share the result', exact: true }).click();
    expect(await page.evaluate(() => window.sharedResult)).toContain(`FRIENDLY · Closed · ${winner} won the $20 pot`);
  });
}
