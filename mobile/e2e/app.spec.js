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

test('browser back walks the create steps and keeps the draft', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'Start a bet', exact: true }).click();
  await expect(page).toHaveURL(/\/new$/);
  await page.getByRole('button', { name: /Money Line/ }).click();
  await expect(page).toHaveURL(/\/new#step-2$/);
  await page.getByLabel(/Question/).fill('Who takes the win?');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/new#step-3$/);
  await page.getByLabel('Stake', { exact: true }).fill('$20 pot');

  // The same history back the iOS swipe and Android back button use.
  await page.goBack();
  await expect(page).toHaveURL(/\/new#step-2$/);
  await expect(page.getByLabel(/Question/)).toHaveValue('Who takes the win?');
  await page.goForward();
  await expect(page.getByLabel('Stake', { exact: true })).toHaveValue('$20 pot');

  // On-screen back is a history back too, down to the type picker, then home.
  await page.locator('.create-pane:not(.is-leaving)').getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/new#step-2$/);
  await page.locator('.create-pane:not(.is-leaving)').getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole('button', { name: /Money Line/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);
  await expect(page.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeVisible();

  // A refresh on a step hash starts Create over cleanly.
  await page.goto('/new/prop#step-3');
  await expect(page).toHaveURL(/\/new\/prop$/);
  await expect(page.getByLabel(/Option 1/)).toBeVisible();
  expect(errors).toEqual([]);
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
      // Kept in sessionStorage so a settle survives page.goto within the test.
      let bet = JSON.parse(sessionStorage.getItem('crew-bet') || 'null') || ${JSON.stringify(bet)};
      const listeners = new Set();
      export const subscribeBet = (code, cb) => { listeners.add(cb); cb(bet); return () => listeners.delete(cb); };
      export const subscribeMyBets = (uid, cb) => { cb([bet]); return () => {}; };
      export const hydrateBet = async b => b;
      export const createBet = async () => 'crew123';
      export const saveBet = async () => 'crew123';
      export const castVote = async () => {};
      export const deleteBet = async () => {};
      export const settleBet = async (code, winnerId) => {
        bet = { ...bet, status: 'closed', winnerId, settledAt: 123, settlement: buildSettlement(bet, winnerId) };
        sessionStorage.setItem('crew-bet', JSON.stringify(bet));
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
    await expect(page.getByRole('region', { name: 'Settled result' })).toContainText(ping);
    // Nothing floats over the settled screen; Results lives in the header now.
    await expect(page.locator('.results-trigger, .result-toast')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `${winner} won the $20 pot`, exact: true })).toBeInViewport({ ratio: 1 });
    const header = await page.locator('.tally-screen > .nav-row').boundingBox();
    await expect.poll(async () => (await page.getByRole('region', { name: 'Settled result' }).boundingBox()).y).toBeGreaterThanOrEqual(header.y + header.height + 8);
    await page.screenshot({ path: testInfo.outputPath('settled.png'), animations: 'disabled', scale: 'css' });
    await page.getByRole('button', { name: 'Share the result', exact: true }).click();
    expect(await page.evaluate(() => window.sharedResult)).toContain(`FRIENDLY · Closed · ${winner} won the $20 pot`);

    // The vote link's header carries Results, with the unread count and the participant line.
    await page.goto('/b/crew123');
    const results = page.locator('.vote-header').getByRole('button', { name: 'Results 1 new' });
    await results.click();
    const inbox = page.getByRole('dialog', { name: 'The final word' });
    await expect(inbox).toContainText(ping);
    await expect(inbox.getByRole('link', { name: new RegExp(ping) })).toHaveAttribute('href', '/b/crew123');
    await page.keyboard.press('Escape');
    await expect(inbox).toHaveCount(0);
    await expect(page.locator('.vote-header').getByRole('button', { name: /^Results/ })).toBeFocused();
  });
}
